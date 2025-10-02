import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { getNotifications, markAsRead } from '../controllers/notificationController.js';

const router = Router();
router.use(authRequired, approvedOnly);

router.get('/', getNotifications);
router.post('/mark-read', markAsRead);

export default router;
