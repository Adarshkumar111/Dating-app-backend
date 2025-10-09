import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: function () { return (this.signupStep ?? 0) >= 2 || this.signupComplete === true; } },
  fatherName: String,
  motherName: String,
  age: Number,
  dateOfBirth: Date, // NEW: Date of Birth
  itNumber: String,
  itCardPhoto: String, // file path or URL
  gender: { type: String, enum: ['male', 'female'], required: function () { return (this.signupStep ?? 0) >= 2 || this.signupComplete === true; } },
  maritalStatus: { type: String, enum: ['single', 'never_married', 'divorced', 'widowed'], default: 'single' }, // NEW
  disability: String, // NEW: Any disability
  countryOfOrigin: String, // NEW: Country of Origin
  // Granular location fields for step-3 cascading selection
  state: String,
  district: String,
  city: String,
  area: String,
  location: String, // Current location/city (kept for backward compatibility/summary)
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
  // New: profile visibility. false = private (current behavior), true = public (any approved user can view full profile/photos)
  isPublic: { type: Boolean, default: false },
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
  // Signup wizard progress
  signupStep: { type: Number, default: 0 }, // 0=not started, 1..5 steps completed
  signupComplete: { type: Boolean, default: false },
  // NEW: Activity tracking
  lastActiveAt: { type: Date, default: Date.now }, // any authenticated API usage
  lastLoginAt: { type: Date }, // only when login succeeds
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

// Performance indexes for faster queries
userSchema.index({ gender: 1, status: 1, isAdmin: 1 });
userSchema.index({ age: 1 });
userSchema.index({ education: 1 });
userSchema.index({ occupation: 1 });
userSchema.index({ name: 1 });
userSchema.index({ status: 1, isAdmin: 1 });
userSchema.index({ hasPendingEdits: 1 });
userSchema.index({ isPremium: 1 });
// Enforce unique IT number when present (sparse allows null/undefined on old users)
userSchema.index({ itNumber: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema);
