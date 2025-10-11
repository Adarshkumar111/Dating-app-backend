import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { uploadToImageKit } from '../utils/imageUtil.js';
import AppSettings from '../models/AppSettings.js';

export async function updateProfile(req, res) {
  try {
    const userId = req.user._id;
    const pending = { ...(req.user.pendingEdits || {}) };

    // Text fields from requirements (collect only provided ones)
    const editableFields = [
      'name','fatherName','motherName','age','dateOfBirth','gender',
      'location','state','district','city','area',
      'education','occupation','about','maritalStatus','disability','countryOfOrigin',
      'languagesKnown','numberOfSiblings','lookingFor'
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
        const base = Array.isArray(req.user.galleryImages) ? req.user.galleryImages : [];
        const pendingBase = Array.isArray(pending.galleryImages) ? pending.galleryImages : base;
        pending.galleryImages = [...pendingBase, ...urls].slice(0, 8);
      }
    }

    // Apply visibility change immediately if provided
    let visibilityChanged = false;
    let visibilityStatus = null;
    if (typeof req.body.isPublic !== 'undefined') {
      // Get global visibility mode from admin settings
      const appSettings = await AppSettings.findOne();
      const globalMode = appSettings?.profileIdVisibilityMode || 'public';
      
      let isPublic = String(req.body.isPublic).toLowerCase() === 'true' || req.body.isPublic === true;
      
      // Enforce admin's global mode
      if (globalMode === 'private') {
        isPublic = false; // Force private when admin sets global to private
      }
      
      // Update directly on user document
      await User.updateOne({ _id: userId }, { $set: { isPublic } });
      visibilityChanged = true;
      visibilityStatus = isPublic ? 'Public' : 'Private';
      
      // Create system notification for admin (not pending edit - just info)
      const Notification = (await import('../models/Notification.js')).default;
      const admins = await User.find({ isAdmin: true }).select('_id');
      if (admins.length > 0) {
        const adminNotifications = admins.map(admin => ({
          userId: admin._id,
          type: 'admin_message',
          title: 'Profile Visibility Changed',
          message: `${req.user.name} changed profile visibility to ${visibilityStatus}`,
          read: false,
          data: { userId: String(userId), action: 'visibility_changed', visibility: visibilityStatus }
        }));
        await Notification.insertMany(adminNotifications);
        
        // Invalidate admin notification cache
        const { invalidateAdminNotificationCache } = await import('../services/redisNotificationService.js');
        await invalidateAdminNotificationCache();
        
        // Emit real-time event to admins
        if (req.io) {
          admins.forEach(admin => {
            req.io.emit(`user:${admin._id}`, {
              kind: 'user:visibility_changed',
              message: `${req.user.name} changed profile visibility to ${visibilityStatus}`,
              userId: String(userId),
              visibility: visibilityStatus
            });
          });
        }
      }
    }

    // Only create pending edits if there are actual changes (not just visibility)
    const hasPendingChanges = Object.keys(pending).length > 0;
    
    if (hasPendingChanges) {
      // Build activity log entry
      const activityLog = { action: 'profile_edit_submitted', timestamp: new Date(), metadata: { changedKeys: Object.keys(pending) } };

      // Single atomic update to avoid parallel save conflicts
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            pendingEdits: pending,
            hasPendingEdits: true
          },
          $push: {
            activityLogs: activityLog
          }
        },
        { new: true }
      );

      // Notify admins in real-time (best-effort)
      try {
        if (req.io) {
          req.io.emit('admin:pendingEdit', {
            userId: updatedUser._id,
            name: updatedUser.name,
            changedKeys: Object.keys(pending)
          });
        }
      } catch {}
    }

    // Build response message
    let msg = 'No changes detected';
    if (visibilityChanged && hasPendingChanges) {
      msg = 'Visibility updated immediately. Other changes submitted for admin approval';
    } else if (visibilityChanged) {
      msg = 'Profile visibility updated successfully';
    } else if (hasPendingChanges) {
      msg = 'Changes submitted for admin approval';
    }
    
    return res.json({ message: msg });
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
