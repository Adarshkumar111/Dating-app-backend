import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: String,
  motherName: String,
  age: Number,
  itNumber: String,
  itCardPhoto: String, // file path or URL
  gender: { type: String, enum: ['male', 'female'], required: true },
  location: String,
  contact: { type: String, required: true, unique: true },
  email: { type: String },
  passwordHash: { type: String, required: true },
  education: String,
  occupation: String,
  about: String,
  profilePhoto: String, // hidden until connected
  galleryImages: [{ type: String }], // up to 8 images, hidden until connected
  status: { type: String, enum: ['pending', 'approved', 'blocked'], default: 'pending' },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date },
  requestsToday: { type: Number, default: 0 },
  requestsTodayAt: { type: Date, default: new Date() },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rejectedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // users rejected from feed
  isAdmin: { type: Boolean, default: false },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { timestamps: true });

export default mongoose.model('User', userSchema);
