import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { uploadToImageKit } from '../utils/imageUtil.js';

export async function updateProfile(req, res) {
  try {
    const { name, fatherName, motherName, age, location, education, occupation, about } = req.body;
    const user = req.user;

    // Update fields
    if (name) user.name = name;
    if (fatherName) user.fatherName = fatherName;
    if (motherName) user.motherName = motherName;
    if (age) user.age = age;
    if (location) user.location = location;
    if (education) user.education = education;
    if (occupation) user.occupation = occupation;
    if (about) user.about = about;

    // Upload new profile photo if provided
    if (req.files?.profilePhoto?.[0]) {
      const url = await uploadToImageKit(req.files.profilePhoto[0], 'matrimonial/profiles');
      user.profilePhoto = url;
    }

    // Upload gallery images (up to 8)
    if (req.files?.galleryImages) {
      const uploadPromises = req.files.galleryImages.slice(0, 8).map(file =>
        uploadToImageKit(file, 'matrimonial/gallery')
      );
      const urls = await Promise.all(uploadPromises);
      user.galleryImages = [...(user.galleryImages || []), ...urls].slice(0, 8);
    }

    await user.save();
    
    const userObj = user.toObject();
    delete userObj.passwordHash;
    
    return res.json({ message: 'Profile updated successfully', user: userObj });
  } catch (e) {
    console.error('Update profile error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash and save new password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: 'Password changed successfully' });
  } catch (e) {
    console.error('Change password error:', e);
    return res.status(400).json({ message: e.message });
  }
}

export async function deleteGalleryImage(req, res) {
  try {
    const { imageUrl } = req.body;
    const user = req.user;

    user.galleryImages = (user.galleryImages || []).filter(url => url !== imageUrl);
    await user.save();

    return res.json({ message: 'Image deleted successfully', galleryImages: user.galleryImages });
  } catch (e) {
    console.error('Delete image error:', e);
    return res.status(400).json({ message: e.message });
  }
}
