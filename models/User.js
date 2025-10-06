import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: String,
  motherName: String,
  age: Number,
  dateOfBirth: Date, // NEW: Date of Birth
  itNumber: String,
  itCardPhoto: String, // file path or URL
  gender: { type: String, enum: ['male', 'female'], required: true },
  maritalStatus: { type: String, enum: ['single', 'never_married', 'divorced', 'widowed'], default: 'single' }, // NEW
  disability: String, // NEW: Any disability
  countryOfOrigin: String, // NEW: Country of Origin
  location: String, // Current location/city
  contact: { type: String, required: true, unique: true },
  email: { type: String, index: true },
  passwordHash: { type: String, required: true },
  education: String,
  occupation: String,
  languagesKnown: [String], // NEW: Languages known
  numberOfSiblings: Number, // NEW: Number of siblings
  about: String,
  lookingFor: String, // NEW: What are you looking for in a partner
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
  resetPasswordExpires: Date,
  emailVerified: { type: Boolean, default: false },
  emailOtpHash: String,
  emailOtpExpires: Date,
  // NEW: Activity tracking
  lastActiveAt: { type: Date, default: Date.now },
  activityLogs: [{
    action: String, // 'login', 'profile_view', 'message_sent', etc.
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  // NEW: Profile edit approval
  pendingEdits: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  hasPendingEdits: { type: Boolean, default: false },
  // NEW: Display priority (higher = appears first)
  displayPriority: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
