import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notification.controller';
const router = Router();
router.get('/', verifyToken, listNotifications);
router.patch('/:id/read', verifyToken, markNotificationRead);
router.patch('/read-all', verifyToken, markAllNotificationsRead);
export default router;
