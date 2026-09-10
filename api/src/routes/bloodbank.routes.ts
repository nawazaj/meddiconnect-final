import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  registerDonor,
  createBloodRequest,
  findMatchingDonors,
  listOpenRequests, updateDonorAvailability, updateBloodRequest,
} from '../controllers/bloodbank.controller';

const router = Router();

router.post('/donors', verifyToken, registerDonor);
router.post('/requests', verifyToken, createBloodRequest);
router.get('/requests', verifyToken, listOpenRequests);
router.get('/donors/match/:bloodGroup', verifyToken, findMatchingDonors);
router.patch('/donors/:id/availability', verifyToken, updateDonorAvailability);
router.patch('/requests/:id', verifyToken, updateBloodRequest);

export default router;
