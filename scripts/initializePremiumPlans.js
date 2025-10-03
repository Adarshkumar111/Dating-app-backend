import mongoose from 'mongoose';
import PremiumPlan from '../models/PremiumPlan.js';
import Settings from '../models/Settings.js';

const defaultPlans = [
  {
    name: '1 Month Premium',
    duration: 1,
    price: 9.99,
    discount: 0,
    requestLimit: 50,
    features: [
      'Send up to 50 follow requests per day',
      'Priority customer support',
      'Advanced search filters',
      'See who viewed your profile'
    ]
  },
  {
    name: '3 Month Premium',
    duration: 3,
    price: 24.99,
    discount: 15,
    requestLimit: 75,
    features: [
      'Send up to 75 follow requests per day',
      'Priority customer support',
      'Advanced search filters',
      'See who viewed your profile',
      'Unlimited message storage',
      'Profile boost feature'
    ]
  },
  {
    name: '6 Month Premium',
    duration: 6,
    price: 44.99,
    discount: 25,
    requestLimit: 100,
    features: [
      'Send up to 100 follow requests per day',
      'Priority customer support',
      'Advanced search filters',
      'See who viewed your profile',
      'Unlimited message storage',
      'Profile boost feature',
      'Exclusive premium badge',
      'Early access to new features'
    ]
  }
];

const defaultSettings = [
  {
    key: 'freeUserRequestLimit',
    value: 2,
    description: 'Daily request limit for free users'
  },
  {
    key: 'premiumUserRequestLimit',
    value: 20,
    description: 'Daily request limit for premium users (fallback)'
  }
];

async function initializePremiumPlans() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matrimonial');
    console.log('Connected to MongoDB');

    // Initialize default settings
    for (const setting of defaultSettings) {
      await Settings.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true }
      );
      console.log(`✓ Initialized setting: ${setting.key}`);
    }

    // Initialize default premium plans
    for (const plan of defaultPlans) {
      const existing = await PremiumPlan.findOne({ name: plan.name });
      if (!existing) {
        await PremiumPlan.create(plan);
        console.log(`✓ Created premium plan: ${plan.name}`);
      } else {
        console.log(`- Plan already exists: ${plan.name}`);
      }
    }

    console.log('\n🎉 Premium plans and settings initialized successfully!');
    console.log('\nDefault Plans Created:');
    defaultPlans.forEach(plan => {
      const finalPrice = plan.price - (plan.price * plan.discount / 100);
      console.log(`- ${plan.name}: $${finalPrice} (${plan.duration} month${plan.duration > 1 ? 's' : ''}) - ${plan.requestLimit} requests/day`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error initializing premium plans:', error);
    process.exit(1);
  }
}

initializePremiumPlans();
