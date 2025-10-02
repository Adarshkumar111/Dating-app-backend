import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

// Generate OTP (6 digits)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function requestPasswordReset(req, res) {
  try {
    const { email, contact } = req.body;
    
    const user = await User.findOne(email ? { email } : { contact });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP and expiry (15 minutes)
    const otp = generateOTP();
    user.resetPasswordToken = await bcrypt.hash(otp, 10);
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // TODO: Send OTP via email/SMS
    // For now, return it in response (ONLY FOR DEVELOPMENT)
    console.log(`Password reset OTP for ${user.contact}: ${otp}`);
    
    return res.json({ 
      message: 'OTP sent successfully', 
      otp: process.env.NODE_ENV === 'development' ? otp : undefined, // Remove in production
      contact: user.contact 
    });
  } catch (e) {
    console.error('Request password reset error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function verifyOTPAndResetPassword(req, res) {
  try {
    const { contact, otp, newPassword } = req.body;

    const user = await User.findOne({ 
      contact,
      resetPasswordExpires: { $gt: Date.now() }
    });

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
