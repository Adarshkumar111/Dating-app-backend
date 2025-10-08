import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['profile_approved', 'profile_rejected', 'system', 'admin_message'], 
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

// Index for faster queries
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
