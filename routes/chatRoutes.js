import { Router } from 'express';
import { getChatBetween, sendMessage, deleteMessage, addReaction, uploadMedia, markMessagesAsSeen, markMessagesAsDelivered, blockChat, unblockChat } from '../controllers/chatController.js';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { upload } from '../utils/imageUtil.js';
const router = Router();
router.use(authRequired, approvedOnly);

router.get('/with/:userId', getChatBetween);
router.post('/:chatId/send', sendMessage);
router.post('/:chatId/delete', deleteMessage);
router.post('/:chatId/react', addReaction);
router.post('/:chatId/upload', upload.single('media'), uploadMedia);
router.post('/:chatId/seen', markMessagesAsSeen);
router.post('/:chatId/delivered', markMessagesAsDelivered);
router.post('/:chatId/block', blockChat);
router.post('/:chatId/unblock', unblockChat);

export default router;
