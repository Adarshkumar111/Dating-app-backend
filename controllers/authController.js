import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import PermanentBlock from '../models/PermanentBlock.js';
import AppSettings from '../models/AppSettings.js';
import { env } from '../config/envConfig.js';
import { uploadToImageKit } from '../utils/imageUtil.js';
import { sendEmail } from '../utils/emailUtil.js';

function genOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function signup(req, res) {
  try {
    const { 
      name, fatherName, motherName, age, dateOfBirth, itNumber, gender, 
      maritalStatus, disability, countryOfOrigin, location, 
      contact, email, password, education, occupation, 
      languagesKnown, numberOfSiblings, about, lookingFor 
    } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const normEmail = String(email).trim().toLowerCase();
    // Check permanent block list
    const isBlocked = await PermanentBlock.findOne({
      $or: [
        itNumber ? { itNumber } : null,
        normEmail ? { email: normEmail } : null,
        contact ? { phoneNumber: contact } : null
      ].filter(Boolean)
    });
    if (isBlocked) {
      return res.status(403).json({ message: 'This account is permanently blocked from registering' });
    }
    
    // Check if user already exists (only include provided fields)
    const dupCriteria = [
      contact ? { contact } : null,
      normEmail ? { email: normEmail } : null
    ].filter(Boolean);
    const existingUser = dupCriteria.length > 0
      ? await User.findOne({ $or: dupCriteria })
      : null;
    if (existingUser) {
      return res.status(400).json({ message: 'User with this contact or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Upload images to ImageKit
    let itCardPhotoUrl = '';
    let profilePhotoUrl = '';

    if (req.files?.itCardPhoto?.[0]) {
      itCardPhotoUrl = await uploadToImageKit(req.files.itCardPhoto[0], 'matrimonial/id-cards');
    }

    if (req.files?.profilePhoto?.[0]) {
      profilePhotoUrl = await uploadToImageKit(req.files.profilePhoto[0], 'matrimonial/profiles');
    }

    // Create user (email not yet verified)
    const user = await User.create({
      name, 
      fatherName, 
      motherName, 
      age, 
      dateOfBirth,
      itNumber, 
      gender, 
      maritalStatus,
      disability,
      countryOfOrigin,
      location, 
      contact, 
      email: normEmail, 
      passwordHash, 
      education, 
      occupation, 
      languagesKnown: languagesKnown ? languagesKnown.split(',').map(l => l.trim()).filter(Boolean) : [],
      numberOfSiblings: numberOfSiblings ? parseInt(numberOfSiblings, 10) : undefined,
      about,
      lookingFor,
      itCardPhoto: itCardPhotoUrl,
      profilePhoto: profilePhotoUrl,
      emailVerified: false
    });

    // Generate and store email OTP
    const otp = genOTP();
    user.emailOtpHash = await bcrypt.hash(otp, 10);
    user.emailOtpExpires = Date.now() + 15 * 60 * 1000;
    await user.save();

    // Send OTP via email with timeout to avoid long client waits in production
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'timeout' }), ms))
    ]);

    const emailResult = await withTimeout(
      sendEmail({
        to: user.email,
        subject: 'Verify your email - M Nikah',
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 15 minutes.</p>`
      }),
      6000
    );

    if (!emailResult?.success) {
      console.warn('Email sending failed or timed out:', emailResult?.error || 'timeout');
    }

    return res.json({ 
      message: emailResult?.success 
        ? 'Signup successful. OTP sent to email for verification' 
        : 'Signup successful. Email may be delayed. If not received, use Resend OTP.',
      userId: user._id, 
      status: user.status 
    });
  } catch (e) {
    console.error('Signup error:', e);
    return res.status(400).json({ message: e.message });
  }
}

// ===================== New Multi-Step Signup Flow =====================

function signSignupToken(userId) {
  return jwt.sign({ uid: String(userId), purpose: 'signup' }, env.JWT_SECRET, { expiresIn: '3d' });
}

function getSignupToken(req) {
  return req.headers['x-signup-token'] || req.body.signupToken || req.query.signupToken;
}

function verifySignupToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.purpose !== 'signup') throw new Error('Invalid token purpose');
    return payload;
  } catch {
    return null;
  }
}

export async function signupStep1(req, res) {
  try {
    const { contact, email, itNumber, password, confirmPassword } = req.body;
    if (!contact || !email || !itNumber || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const normEmail = String(email).trim().toLowerCase();

    // Blocklist check
    const isBlocked = await PermanentBlock.findOne({
      $or: [
        { itNumber },
        { email: normEmail },
        { phoneNumber: contact }
      ]
    });
    if (isBlocked) {
      return res.status(403).json({ message: 'This account is permanently blocked from registering' });
    }

    // Uniqueness checks
    const dup = await User.findOne({ $or: [ { contact }, { email: normEmail }, { itNumber } ] });
    if (dup) {
      return res.status(400).json({ message: 'Contact, email, or IT number already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      contact,
      email: normEmail,
      itNumber,
      passwordHash,
      signupStep: 1,
      signupComplete: false,
      status: 'pending',
      emailVerified: false
    });

    const signupToken = signSignupToken(user._id);
    return res.json({ ok: true, userId: user._id, signupToken, nextStep: 2 });
  } catch (e) {
    console.error('signupStep1 error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function getSignupStatus(req, res) {
  const token = getSignupToken(req);
  const payload = token ? verifySignupToken(token) : null;
  if (!payload) return res.status(401).json({ message: 'Invalid signup token' });
  const user = await User.findById(payload.uid).select('signupStep signupComplete email');
  if (!user) return res.status(404).json({ message: 'User not found' });
  const nextStep = user.signupComplete ? null : Math.max(1, (user.signupStep || 1) + 1);
  return res.json({ signupStep: user.signupStep, signupComplete: user.signupComplete, nextStep, email: user.email });
}

export async function signupStep2(req, res) {
  try {
    const token = getSignupToken(req);
    const payload = token ? verifySignupToken(token) : null;
    if (!payload) return res.status(401).json({ message: 'Invalid signup token' });
    const { name, fatherName, motherName, dateOfBirth, gender, maritalStatus, disability, profilePhoto } = req.body;
    const user = await User.findById(payload.uid);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.signupComplete) return res.status(400).json({ message: 'Signup already complete' });

    // Optional upload via multipart (profilePhoto)
    let profilePhotoUrl = user.profilePhoto || '';
    if (req.files?.profilePhoto?.[0]) {
      profilePhotoUrl = await uploadToImageKit(req.files.profilePhoto[0], 'matrimonial/profiles');
    }

    Object.assign(user, {
      name: name || user.name,
      fatherName: fatherName ?? user.fatherName,
      motherName: motherName ?? user.motherName,
      dateOfBirth: dateOfBirth || user.dateOfBirth,
      gender: gender || user.gender,
      maritalStatus: maritalStatus || user.maritalStatus,
      disability: disability ?? user.disability,
      profilePhoto: profilePhotoUrl
    });
    user.signupStep = Math.max(user.signupStep || 1, 2);
    await user.save();
    return res.json({ ok: true, nextStep: 3 });
  } catch (e) {
    console.error('signupStep2 error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function signupStep3(req, res) {
  try {
    const token = getSignupToken(req);
    const payload = token ? verifySignupToken(token) : null;
    if (!payload) return res.status(401).json({ message: 'Invalid signup token' });
    const { countryOfOrigin, state, district, city, area } = req.body;
    const user = await User.findById(payload.uid);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.signupComplete) return res.status(400).json({ message: 'Signup already complete' });
    Object.assign(user, {
      countryOfOrigin: countryOfOrigin ?? user.countryOfOrigin,
      state: state ?? user.state,
      district: district ?? user.district,
      city: city ?? user.city,
      area: area ?? user.area,
      // Keep location as readable summary
      location: city || user.location
    });
    user.signupStep = Math.max(user.signupStep || 1, 3);
    await user.save();
    return res.json({ ok: true, nextStep: 4 });
  } catch (e) {
    console.error('signupStep3 error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function signupStep4(req, res) {
  try {
    const token = getSignupToken(req);
    const payload = token ? verifySignupToken(token) : null;
    if (!payload) return res.status(401).json({ message: 'Invalid signup token' });
    const user = await User.findById(payload.uid);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.signupComplete) return res.status(400).json({ message: 'Signup already complete' });

    // Accept up to 8 images, require at least 1
    const files = req.files?.galleryImages || [];
    if (!files.length && !(user.galleryImages && user.galleryImages.length)) {
      return res.status(400).json({ message: 'At least 1 photo is required' });
    }
    const uploaded = [];
    for (const f of files) {
      const url = await uploadToImageKit(f, 'matrimonial/gallery');
      uploaded.push(url);
    }
    user.galleryImages = [...(user.galleryImages || []), ...uploaded].slice(0, 8);
    user.signupStep = Math.max(user.signupStep || 1, 4);
    await user.save();
    return res.json({ ok: true, nextStep: 5 });
  } catch (e) {
    console.error('signupStep4 error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function signupStep5(req, res) {
  try {
    const token = getSignupToken(req);
    const payload = token ? verifySignupToken(token) : null;
    if (!payload) return res.status(401).json({ message: 'Invalid signup token' });
    const { education, occupation, languagesKnown, numberOfSiblings, about, lookingFor } = req.body;
    const user = await User.findById(payload.uid);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.signupComplete) return res.status(400).json({ message: 'Signup already complete' });

    user.education = education ?? user.education;
    user.occupation = occupation ?? user.occupation;
    user.languagesKnown = Array.isArray(languagesKnown)
      ? languagesKnown
      : (languagesKnown ? String(languagesKnown).split(',').map(s => s.trim()).filter(Boolean) : user.languagesKnown);
    user.numberOfSiblings = (numberOfSiblings !== undefined && numberOfSiblings !== null)
      ? parseInt(numberOfSiblings, 10)
      : user.numberOfSiblings;
    user.about = about ?? user.about;
    user.lookingFor = lookingFor ?? user.lookingFor;

    user.signupStep = Math.max(user.signupStep || 1, 5);
    user.signupComplete = true;

    // Generate and send email OTP now
    if (user.email && !user.emailVerified) {
      const otp = genOTP();
      user.emailOtpHash = await bcrypt.hash(otp, 10);
      user.emailOtpExpires = Date.now() + 15 * 60 * 1000;
      // send email in best-effort (non-blocking race)
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'timeout' }), ms))
      ]);
      const emailResult = await withTimeout(
        sendEmail({ to: user.email, subject: 'Verify your email - M Nikah', html: `<p>Your OTP is <b>${otp}</b>. It expires in 15 minutes.</p>` }),
        6000
      );
      if (!emailResult?.success) {
        console.warn('Email sending (complete) failed or timed out');
      }
    }

    await user.save();
    return res.json({ ok: true, message: 'Signup completed. OTP sent to email (if provided).', verifyEmail: !!user.email });
  } catch (e) {
    console.error('signupStep5 error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const normEmail = String(email || '').trim().toLowerCase();
    if (!normEmail) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email: normEmail });
    if (!user) return res.status(400).json({ message: 'User not found' });
    // Check permanent block list
    const isBlocked = await PermanentBlock.findOne({
      $or: [
        user.itNumber ? { itNumber: user.itNumber } : null,
        user.email ? { email: user.email } : null,
        user.contact ? { phoneNumber: user.contact } : null
      ].filter(Boolean)
    });
    if (isBlocked || user.status === 'blocked') {
      return res.status(403).json({ message: 'Your account is blocked. Contact support.' });
    }
    
    // If signup not completed, return next step information
    if (!user.signupComplete) {
      const nextStep = Math.max(1, (user.signupStep || 0) + 1);
      return res.status(400).json({ message: 'Please complete signup steps', needsSignup: true, nextStep, email: user.email });
    }

    // Check if user has email and it's not verified
    if (user.email && !user.emailVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email first', 
        needsVerification: true,
        email: user.email 
      });
    }
    
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, env.JWT_SECRET, { expiresIn: '7d' });
    // Update last login and last active and log activity
    const now = new Date();
    user.lastLoginAt = now;
    user.lastActiveAt = now;
    user.activityLogs = user.activityLogs || [];
    user.activityLogs.push({ action: 'login', timestamp: now });
    await user.save();
    return res.json({ token, status: user.status, user: { id: user._id, name: user.name, isAdmin: user.isAdmin, isPremium: user.isPremium } });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
}

// Request OTP for login via email
export async function requestLoginOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const normEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normEmail });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const otp = genOTP();
    user.emailOtpHash = await bcrypt.hash(otp, 10);
    user.emailOtpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();
    const emailResult = await sendEmail({ to: email, subject: 'Your login OTP - M Nikah', html: `<p>OTP: <b>${otp}</b> (valid 10 minutes)</p>` });
    return res.json({ 
      message: emailResult.success ? 'OTP sent to email' : 'Email service unavailable'
    });
  } catch (e) {
    console.error('requestLoginOtp error:', e);
    return res.status(400).json({ message: e.message });
  }
}

// Verify OTP and login
export async function verifyLoginOtp(req, res) {
  try {
    const { email, otp } = req.body;
    const normEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normEmail, emailOtpExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP' });
    const ok = await bcrypt.compare(otp, user.emailOtpHash || '');
    if (!ok) return res.status(400).json({ message: 'Invalid OTP' });
    // Clear email OTP fields
    user.emailOtpHash = undefined;
    user.emailOtpExpires = undefined;
    // Mark email verified if not
    if (!user.emailVerified) user.emailVerified = true;
    await user.save();
    const token = jwt.sign({ id: user._id }, env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, status: user.status, user: { id: user._id, name: user.name, isAdmin: user.isAdmin, isPremium: user.isPremium } });
  } catch (e) {
    console.error('verifyLoginOtp error:', e);
    return res.status(400).json({ message: e.message });
  }
}

// Verify email OTP after signup
export async function verifyEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;
    const normEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normEmail, emailOtpExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP' });
    const ok = await bcrypt.compare(otp, user.emailOtpHash || '');
    if (!ok) return res.status(400).json({ message: 'Invalid OTP' });
    user.emailVerified = true;
    user.emailOtpHash = undefined;
    user.emailOtpExpires = undefined;
    await user.save();
    return res.json({ message: 'Email verified successfully' });
  } catch (e) {
    console.error('verifyEmailOtp error:', e);
    return res.status(400).json({ message: e.message });
  }
}

// Resend email verification OTP
export async function resendEmailOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const normEmail = String(email).trim().toLowerCase();
    
    const user = await User.findOne({ email: normEmail });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }
    
    // Generate new OTP
    const otp = genOTP();
    user.emailOtpHash = await bcrypt.hash(otp, 10);
    user.emailOtpExpires = Date.now() + 15 * 60 * 1000;
    await user.save();
    
    // Send OTP via email with timeout
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'timeout' }), ms))
    ]);
    const emailResult = await withTimeout(
      sendEmail({
        to: email,
        subject: 'Verify your email - M Nikah',
        html: `<p>Your new OTP is <b>${otp}</b>. It expires in 15 minutes.</p>`
      }),
      6000
    );
    if (!emailResult?.success) {
      console.warn('Resend email failed or timed out:', emailResult?.error || 'timeout');
    }
    
    return res.json({ 
      message: emailResult?.success ? 'New OTP sent to email' : 'Email may be delayed. Try again shortly.'
    });
  } catch (e) {
    console.error('resendEmailOtp error:', e);
    return res.status(400).json({ message: e.message });
  }
}
