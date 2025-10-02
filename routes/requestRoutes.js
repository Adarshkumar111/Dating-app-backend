import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { requestLimitMiddleware } from '../middleware/limitMiddleware.js';
import { sendRequest, incoming, respond, unfollow } from '../controllers/requestController.js';

const router = Router();
router.use(authRequired, approvedOnly);

const getLimit = (user) => user.isPremium ? 50 : 10;
router.post('/send', requestLimitMiddleware(getLimit), sendRequest);
router.get('/incoming', incoming);
router.post('/respond', respond);
router.post('/unfollow', unfollow);

export default router;
