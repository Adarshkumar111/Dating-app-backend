import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { uploadToImageKit } from '../utils/imageUtil.js';

export async function updateProfile(req, res) {
  try {
    const user = req.user;
    const pending = { ...(user.pendingEdits || {}) };

    // Text fields from requirements (collect only provided ones)
    const editableFields = [
      'name','fatherName','motherName','age','dateOfBirth','location','education','occupation','about','maritalStatus','disability','countryOfOrigin','languagesKnown','numberOfSiblings','lookingFor'
    ];
    editableFields.forEach((f) => {
      if (typeof req.body[f] !== 'undefined') pending[f] = req.body[f];
    });

    // Upload new profile photo if provided (store URL in pending)
    if (req.files?.profilePhoto?.[0]) {
      const url = await uploadToImageKit(req.files.profilePhoto[0], 'matrimonial/profiles');
      pending.profilePhoto = url;
    }

    // Upload gallery images
    if (req.files?.galleryImages) {
      const uploadPromises = req.files.galleryImages.map(file =>
        uploadToImageKit(file, 'matrimonial/gallery')
      );
      const urls = await Promise.all(uploadPromises);
      const replace = String(req.body.replaceGallery || '').toLowerCase() === 'true';
      if (replace) {
        // Replace entire gallery with uploaded URLs in given order
        pending.galleryImages = urls.slice(0, 8);
      } else {
        // Append behavior (legacy)
        const base = Array.isArray(user.galleryImages) ? user.galleryImages : [];
        const pendingBase = Array.isArray(pending.galleryImages) ? pending.galleryImages : base;
        pending.galleryImages = [...pendingBase, ...urls].slice(0, 8);
      }
    }

    user.pendingEdits = pending;
    user.hasPendingEdits = true;
    await user.save();

    return res.json({ message: 'Edits submitted for admin approval' });
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
