import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/envConfig.js';
import { uploadToImageKit } from '../utils/imageUtil.js';

export async function signup(req, res) {
  try {
    const { name, fatherName, motherName, age, itNumber, gender, location, contact, email, password, education, occupation, about } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ contact }, { email: email || null }] });
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

    // Create user
    const user = await User.create({
      name, fatherName, motherName, age, itNumber, gender, location, contact, email, passwordHash, education, occupation, about,
      itCardPhoto: itCardPhotoUrl,
      profilePhoto: profilePhotoUrl
    });

    return res.json({ message: 'Signup successful. Await admin approval', userId: user._id, status: user.status });
  } catch (e) {
    console.error('Signup error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function login(req, res) {
  try {
    const { contact, email, password } = req.body;
    const user = await User.findOne(email ? { email } : { contact });
    if (!user) return res.status(400).json({ message: 'User not found' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, status: user.status, user: { id: user._id, name: user.name, isAdmin: user.isAdmin, isPremium: user.isPremium } });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
}
