import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { createEmergency, listEmergencies, updateEmergency } from '../controllers/emergency.controller';
const router = Router();
router.post('/', verifyToken, checkRole(['patient']), createEmergency);
router.get('/', verifyToken, checkRole(['patient','doctor','admin']), listEmergencies);
router.patch('/:id', verifyToken, checkRole(['doctor','admin']), updateEmergency);
export default router;
