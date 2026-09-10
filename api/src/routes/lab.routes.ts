import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { createLabReport, getPatientLabReports } from '../controllers/lab.controller';
const router = Router();
router.post('/', verifyToken, checkRole(['doctor','admin']), createLabReport);
router.get('/:patientId', verifyToken, checkRole(['patient','doctor','admin']), getPatientLabReports);
export default router;
