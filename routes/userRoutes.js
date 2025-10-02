import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { me, list, getProfile, rejectUser } from '../controllers/userController.js';

const router = Router();
router.use(authRequired);

router.get('/me', me);
router.get('/list', approvedOnly, list);
router.get('/:id', approvedOnly, getProfile);
router.post('/reject', approvedOnly, rejectUser);

export default router;
