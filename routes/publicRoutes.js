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

export default router;

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
