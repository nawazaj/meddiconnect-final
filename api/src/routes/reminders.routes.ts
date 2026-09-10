import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import {
  createReminder,
  getPatientReminders,
  markTaken,
} from '../controllers/reminders.controller';

const router = Router();

router.post('/', verifyToken, checkRole(['patient','doctor','admin']), createReminder);
router.get('/:patientId', verifyToken, getPatientReminders);
router.patch('/:id/mark-taken', verifyToken, markTaken);

export default router;
