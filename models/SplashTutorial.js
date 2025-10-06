import mongoose from 'mongoose';

const splashTutorialSchema = new mongoose.Schema({
  type: { type: String, enum: ['splash', 'tutorial'], required: true },
  isActive: { type: Boolean, default: true },
  title: String,
  description: String,
  imageUrl: String,
  order: { type: Number, default: 0 },
  content: String, // For rules/tutorial content
  duration: { type: Number, default: 3000 }, // Duration in milliseconds for splash screen
}, { timestamps: true });

export default mongoose.model('SplashTutorial', splashTutorialSchema);
