import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { patientHealthSummary, doctorPatients, doctorSchedule } from '../controllers/health.controller';
const router = Router();
router.get('/patients/:patientId/summary', verifyToken, checkRole(['patient','doctor','admin']), patientHealthSummary);
router.get('/doctor/patients', verifyToken, checkRole(['doctor']), doctorPatients);
router.get('/doctor/schedule', verifyToken, checkRole(['doctor']), doctorSchedule);
router.get('/doctor/:doctorId/schedule', verifyToken, checkRole(['admin']), doctorSchedule);
export default router;
