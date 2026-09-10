import { Router } from 'express';
import { platformOverview, listPharmacies, pharmacyDetail, bloodOverview } from '../controllers/discovery.controller';
const router = Router();
router.get('/overview', platformOverview);
router.get('/pharmacies', listPharmacies);
router.get('/pharmacies/:id', pharmacyDetail);
router.get('/blood-bank/overview', bloodOverview);
export default router;
