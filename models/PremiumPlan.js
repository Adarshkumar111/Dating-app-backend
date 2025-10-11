import mongoose from 'mongoose';

const premiumPlanSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "1 Month Premium"
  tier: { type: String, enum: ['bronze', 'silver', 'gold', 'diamond'], required: false }, // optional: Bronze/Silver/Gold/Diamond label
  duration: { type: Number, required: true }, // duration in months
  price: { type: Number, required: true }, // price in currency
  discount: { type: Number, default: 0 }, // discount percentage
  requestLimit: { type: Number, required: true }, // requests per day for premium users
  isActive: { type: Boolean, default: true },
  features: [String], // array of feature descriptions
  // Advanced features with enable/disable for Diamond tier
  advancedFeatures: {
    glitteryBackground: { type: Boolean, default: false }, // Transparent glittery GIF background
    topPriority: { type: Boolean, default: false }, // Will be on very top
    viewAllUsers: { type: Boolean, default: false }, // Can see all users
    viewFullProfile: { type: Boolean, default: false }, // Full profile details
    viewAllPhotos: { type: Boolean, default: false }, // All photos visible
    // New: allow premium user to send messages without follow/connection
    canMessageWithoutFollow: { type: Boolean, default: false },
    // Profile field visibility permissions (what diamond user can see on other profiles)
    canViewFields: {
      name: { type: Boolean, default: true },
      age: { type: Boolean, default: true },
      dateOfBirth: { type: Boolean, default: false },
      fatherName: { type: Boolean, default: false },
      motherName: { type: Boolean, default: false },
      itNumber: { type: Boolean, default: false },
      itCardPhoto: { type: Boolean, default: false },
      gender: { type: Boolean, default: true },
      maritalStatus: { type: Boolean, default: true },
      disability: { type: Boolean, default: false },
      countryOfOrigin: { type: Boolean, default: false },
      state: { type: Boolean, default: true },
      district: { type: Boolean, default: true },
      city: { type: Boolean, default: true },
      area: { type: Boolean, default: false },
      contact: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      education: { type: Boolean, default: true },
      occupation: { type: Boolean, default: true },
      languagesKnown: { type: Boolean, default: false },
      numberOfSiblings: { type: Boolean, default: false },
      about: { type: Boolean, default: true },
      lookingFor: { type: Boolean, default: false },
      profilePhoto: { type: Boolean, default: true },
      galleryImages: { type: Boolean, default: false }
    }
  }
}, { timestamps: true });

export default mongoose.model('PremiumPlan', premiumPlanSchema);
