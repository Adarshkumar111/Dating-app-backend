import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  durationDays: { type: Number, required: true },
  requestLimitPerDay: { type: Number, default: 10 }
}, { timestamps: true });

export default mongoose.model('Plan', planSchema);
