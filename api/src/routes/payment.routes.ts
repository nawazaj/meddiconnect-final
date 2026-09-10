import { Router } from 'express';
import { verifyToken, checkRole } from '../middleware/auth';
import { createPayment, updatePayment, listPayments } from '../controllers/payment.controller';
const router = Router();
router.post('/', verifyToken, createPayment);
router.get('/', verifyToken, listPayments);
router.patch('/:id', verifyToken, checkRole(['admin']), updatePayment);
export default router;
