import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import {
  submitCheckin,
  getPatientCheckins,
  getFlaggedCheckins,
} from '../controllers/checkin.controller';

const router = Router();

router.post('/', verifyToken, checkRole(['patient']), submitCheckin);
router.get('/alerts', verifyToken, checkRole(['doctor']), getFlaggedCheckins);
router.get('/:patientId', verifyToken, getPatientCheckins);

export default router;
