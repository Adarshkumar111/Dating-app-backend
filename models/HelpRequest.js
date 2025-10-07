import mongoose from 'mongoose';

const helpRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  issueType: { type: String, default: '' },
  issueDescription: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'resolved'], default: 'pending' },
}, { timestamps: true });

helpRequestSchema.index({ createdAt: -1 });
helpRequestSchema.index({ status: 1 });

export default mongoose.model('HelpRequest', helpRequestSchema);
