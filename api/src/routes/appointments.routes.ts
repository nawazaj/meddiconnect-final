import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { createAppointment, listAppointments, updateAppointment } from '../controllers/appointments.controller';
const router = Router();
router.post('/', verifyToken, checkRole(['patient','admin']), createAppointment);
router.get('/', verifyToken, checkRole(['patient','doctor','admin']), listAppointments);
router.patch('/:id', verifyToken, checkRole(['patient','doctor','admin']), updateAppointment);
export default router;
