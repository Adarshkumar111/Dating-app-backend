import { Router } from 'express';
import { authRequired, approvedOnly } from '../middleware/authMiddleware.js';
import { sendHelpRequest, getHelpStatus, respondHelp, listHelpRequests, getHelpRequest, deleteHelpRequest, getHelpRequestStats } from '../controllers/helpController.js';

const router = Router();
router.use(authRequired, approvedOnly);

router.post('/request', sendHelpRequest);
router.get('/status', getHelpStatus);
router.post('/respond', respondHelp);
// Admin endpoints
router.get('/admin/stats', getHelpRequestStats);
router.get('/admin/list', listHelpRequests);
router.get('/admin/:id', getHelpRequest);
router.delete('/admin/:id', deleteHelpRequest);

export default router;
