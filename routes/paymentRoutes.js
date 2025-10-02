import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { subscribe } from '../controllers/paymentController.js';

const router = Router();
router.use(authRequired, approvedOnly);

router.post('/subscribe', subscribe);

export default router;
