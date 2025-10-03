import { Router } from 'express';
import PremiumPlan from '../models/PremiumPlan.js';

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
