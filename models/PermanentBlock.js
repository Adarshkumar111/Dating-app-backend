import mongoose from 'mongoose';

const permanentBlockSchema = new mongoose.Schema({
  itNumber: String,
  email: String,
  phoneNumber: String,
  reason: String,
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who blocked
  blockedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Create indexes for fast lookups
permanentBlockSchema.index({ itNumber: 1 });
permanentBlockSchema.index({ email: 1 });
permanentBlockSchema.index({ phoneNumber: 1 });

export default mongoose.model('PermanentBlock', permanentBlockSchema);
