import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { upload } from '../utils/imageUtil.js';
import { getChatByUserId, getMessages, sendMessage, deleteMessage, addReaction, uploadMedia, blockChat, unblockChat } from '../controllers/chatController.js';

const router = Router();
router.use(authRequired, approvedOnly);

// Get or create chat with another user
router.get('/with/:userId', getChatByUserId);

// Chat routes (by chatId)
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/send', sendMessage);
router.post('/:chatId/delete-message', deleteMessage);
router.post('/:chatId/reaction', addReaction);
router.post('/:chatId/upload', upload.single('media'), uploadMedia);
router.post('/:chatId/block', blockChat);
router.post('/:chatId/unblock', unblockChat);

export default router;
