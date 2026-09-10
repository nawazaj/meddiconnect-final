import { Router } from 'express';
import {
  createDoctorReview, getDoctor, getDoctorAvailability, listDoctorReviews,
  listDoctors, listSpecializations, featuredDoctors, doctorsBySpecialty,
  topRatedDoctors, availableDoctors, doctorHospitals, doctorStats,
  doctorSearchSuggestions, doctorSlots
} from '../controllers/doctors.controller';
import { verifyToken, checkRole } from '../middleware/auth';

const router = Router();

// Public discovery APIs used directly by the patient frontend.
router.get('/specializations', listSpecializations);
router.get('/featured', featuredDoctors);
router.get('/top-rated', topRatedDoctors);
router.get('/available', availableDoctors);
router.get('/hospitals', doctorHospitals);
router.get('/stats', doctorStats);
router.get('/search/suggestions', doctorSearchSuggestions);
router.get('/specialization/:specialization', doctorsBySpecialty);
router.get('/', listDoctors);
router.get('/:id/slots', doctorSlots);
router.get('/:id/availability', getDoctorAvailability);
router.get('/:id/reviews', listDoctorReviews);
router.post('/:id/reviews', verifyToken, checkRole(['patient']), createDoctorReview);
router.get('/:id', getDoctor);

export default router;
