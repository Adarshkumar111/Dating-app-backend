import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { sendEmail } from '../utils/emailUtil.js';

// Generate OTP (6 digits)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function requestPasswordReset(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP and expiry (15 minutes)
    const otp = generateOTP();
    user.resetPasswordToken = await bcrypt.hash(otp, 10);
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // Send OTP via email
    const emailResult = await sendEmail({
      to: email,
      subject: 'Password reset OTP - M Nikah',
      html: `<p>Your OTP for resetting password is <b>${otp}</b>. It expires in 15 minutes.</p>`
    });
    
    return res.json({ 
      message: emailResult.success ? 'OTP sent successfully' : 'Email service unavailable'
    });
  } catch (e) {
    console.error('Request password reset error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function verifyOTPAndResetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, user.resetPasswordToken);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Reset password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: 'Password reset successfully' });
  } catch (e) {
    console.error('Reset password error:', e);
    return res.status(400).json({ message: e.message });
  }
}
