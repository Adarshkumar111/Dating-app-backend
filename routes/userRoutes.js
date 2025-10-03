import { Router } from 'express';
import { me, list, getProfile, rejectUser, getFriends, blockUser, unblockUser, getBlockedUsers, deleteChatsWithUser } from '../controllers/userController.js';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authRequired);

router.get('/me', me);
router.get('/list', approvedOnly, list);
router.get('/friends', approvedOnly, getFriends);
router.get('/blocked', approvedOnly, getBlockedUsers);
router.get('/:id', approvedOnly, getProfile);
router.post('/reject', approvedOnly, rejectUser);
router.post('/block', approvedOnly, blockUser);
router.post('/unblock', approvedOnly, unblockUser);
router.post('/delete-chats', approvedOnly, deleteChatsWithUser);

export default router;
