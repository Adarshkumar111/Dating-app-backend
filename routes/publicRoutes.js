import { Router } from 'express';
import PremiumPlan from '../models/PremiumPlan.js';
import AppSettings from '../models/AppSettings.js';

const router = Router();

// Public endpoint to get active premium plans
router.get('/premium-plans', async (req, res) => {
  try {
    const plans = await PremiumPlan.find({ isActive: true }).sort({ duration: 1 });
    res.json(plans);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Additional public endpoint: enabled filters for clients
router.get('/settings/filters', async (req, res) => {
  try {
    let settings = await AppSettings.findOne();
    if (!settings) {
      settings = new AppSettings();
      await settings.save();
    }
    // Only return enabled filters and necessary display fields
    const { enabledFilters } = settings.toObject();
    res.json({ enabledFilters });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Public endpoint to fetch pre-auth banner (shown before login/signup)
router.get('/preauth-banner', async (req, res) => {
  try {
    let settings = await AppSettings.findOne();
    if (!settings) {
      settings = new AppSettings();
      await settings.save();
    }
    const banner = settings.preAuthBanner || { enabled: false, imageUrl: '', updatedAt: null };
    res.json({ enabled: !!banner.enabled, imageUrl: banner.imageUrl || '', updatedAt: banner.updatedAt || settings.updatedAt });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Public endpoint to fetch onboarding slides (shown after login/signup)
router.get('/onboarding-slides', async (req, res) => {
  try {
    let settings = await AppSettings.findOne();
    if (!settings) {
      settings = new AppSettings();
      await settings.save();
    }
    const ob = settings.onboardingSlides || { enabled: false, images: [], updatedAt: null };
    res.json({ enabled: !!ob.enabled, images: Array.isArray(ob.images) ? ob.images.slice(0,6) : [], updatedAt: ob.updatedAt || settings.updatedAt });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

export default router;
