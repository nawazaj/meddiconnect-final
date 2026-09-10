import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { createRecord, getPatientRecords } from '../controllers/records.controller';

const router = Router();

// Only doctors can create records
router.post('/', verifyToken, checkRole(['doctor']), createRecord);

// Patient viewing own records, or doctor viewing a patient's records - both allowed here
router.get('/:patientId', verifyToken, getPatientRecords);

export default router;
