import { Router } from 'express';
import { imagekit } from '../utils/imageUtil.js';

const router = Router();

// Get ImageKit authentication parameters for client-side upload
router.get('/auth', (req, res) => {
  try {
    const authParams = imagekit.getAuthenticationParameters();
    res.json(authParams);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get auth params' });
  }
});

export default router;
