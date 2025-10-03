import mongoose from 'mongoose';

const premiumPlanSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "1 Month Premium"
  duration: { type: Number, required: true }, // duration in months
  price: { type: Number, required: true }, // price in currency
  discount: { type: Number, default: 0 }, // discount percentage
  requestLimit: { type: Number, required: true }, // requests per day for premium users
  isActive: { type: Boolean, default: true },
  features: [String] // array of feature descriptions
}, { timestamps: true });

export default mongoose.model('PremiumPlan', premiumPlanSchema);
