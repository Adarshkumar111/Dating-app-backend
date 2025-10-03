import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { createOrderEndpoint, verifyPayment, subscribe } from '../controllers/paymentController.js';

const router = Router();

// Public routes (no auth required)
router.post('/create-order', createOrderEndpoint);

// Authenticated routes
router.use(authRequired, approvedOnly);

router.post('/verify', verifyPayment);
router.post('/subscribe', subscribe);

export default router;
