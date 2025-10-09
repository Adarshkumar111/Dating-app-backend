import mongoose from 'mongoose';

// Extended settings model for all app configurations
const appSettingsSchema = new mongoose.Schema({
  // Request limits
  freeUserRequestLimit: { type: Number, default: 2 },
  premiumUserRequestLimit: { type: Number, default: 20 },
  
  // Shaadi counter
  totalShaadiPerformed: { type: Number, default: 0 },
  
  // Media settings
  maxPhotosPerProfile: { type: Number, default: 9 },
  maxPhotoSizeMB: { type: Number, default: 5 },
  maxChatMediaSizeMB: { type: Number, default: 1 },
  
  // Chat controls
  allowTextChat: { type: Boolean, default: true },
  allowVoiceNotes: { type: Boolean, default: true },
  allowPhotoSharing: { type: Boolean, default: true },
  allowVideoSharing: { type: Boolean, default: true },
  
  // Profile photo blur
  premiumCanSeePhotos: { type: Boolean, default: true },
  
  // Customizable fields (admin can enable/disable signup fields)
  signupFields: {
    fatherName: { type: Boolean, default: true },
    motherName: { type: Boolean, default: true },
    dateOfBirth: { type: Boolean, default: true },
    maritalStatus: { type: Boolean, default: true },
    disability: { type: Boolean, default: true },
    countryOfOrigin: { type: Boolean, default: true },
    education: { type: Boolean, default: true },
    occupation: { type: Boolean, default: true },
    languagesKnown: { type: Boolean, default: true },
    numberOfSiblings: { type: Boolean, default: true },
    lookingFor: { type: Boolean, default: true }
  },
  
  // Filter options (admin can enable/disable filters)
  enabledFilters: {
    location: { type: Boolean, default: true },
    age: { type: Boolean, default: true },
    education: { type: Boolean, default: true },
    occupation: { type: Boolean, default: true },
    maritalStatus: { type: Boolean, default: true },
    nameSearch: { type: Boolean, default: true }
  },
  
  // Profile display fields (what users see on profile cards)
  profileDisplayFields: {
    name: { type: Boolean, default: true },
    age: { type: Boolean, default: true },
    location: { type: Boolean, default: true },
    education: { type: Boolean, default: true },
    occupation: { type: Boolean, default: true },
    about: { type: Boolean, default: true },
    profilePhoto: { type: Boolean, default: true },
    fatherName: { type: Boolean, default: false },
    motherName: { type: Boolean, default: false },
    contact: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
  },
  
  // Auth controls
  auth: {
    loginIdentifier: { type: String, enum: ['email','contact','itNumber'], default: 'email' }
  },
  
  // Email notification settings
  inactivityThresholdDays: { type: Number, default: 7 },
  inactivityEmailTemplate: { type: String, default: '' }
  ,
  // Pre-auth banner shown before login/signup
  preAuthBanner: {
    enabled: { type: Boolean, default: false },
    imageUrl: { type: String, default: '' },
    updatedAt: { type: Date }
  }
  ,
  // Post-auth onboarding slides (after login/signup)
  onboardingSlides: {
    enabled: { type: Boolean, default: false },
    images: { type: [String], default: [] }, // up to 6 URLs
    updatedAt: { type: Date }
  }

}, { timestamps: true });

export default mongoose.model('AppSettings', appSettingsSchema);
