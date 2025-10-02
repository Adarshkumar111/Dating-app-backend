import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['follow', 'chat', 'photo', 'both'], default: 'follow' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
}, { timestamps: true });

// Compound index to prevent duplicate requests
requestSchema.index({ from: 1, to: 1 }, { unique: true });

export default mongoose.model('Request', requestSchema);
