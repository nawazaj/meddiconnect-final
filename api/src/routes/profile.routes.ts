import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { getMe, updatePatientProfile, addDependent, listDependents } from '../controllers/profile.controller';
const router = Router();
router.get('/me', verifyToken, getMe);
router.put('/patient', verifyToken, checkRole(['patient']), updatePatientProfile);
router.post('/dependents', verifyToken, checkRole(['patient']), addDependent);
router.get('/dependents', verifyToken, checkRole(['patient']), listDependents);
export default router;
