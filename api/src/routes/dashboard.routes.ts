import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { patientDashboard, listDoctors } from '../controllers/dashboard.controller';
import { doctorPatients } from '../controllers/health.controller';
const router = Router();
router.get('/patient', verifyToken, checkRole(['patient']), patientDashboard);
router.get('/doctor/patients', verifyToken, checkRole(['doctor']), doctorPatients);
router.get('/doctors', verifyToken, checkRole(['patient','doctor','admin']), listDoctors);
export default router;
