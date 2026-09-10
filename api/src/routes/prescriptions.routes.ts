import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import {
  createPrescription,
  getPatientPrescriptions,
} from '../controllers/prescriptions.controller';

const router = Router();

router.post('/', verifyToken, checkRole(['doctor']), createPrescription);
router.get('/:patientId', verifyToken, getPatientPrescriptions);

export default router;
