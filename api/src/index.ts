import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes';
import recordsRoutes from './routes/records.routes';
import prescriptionsRoutes from './routes/prescriptions.routes';
import remindersRoutes from './routes/reminders.routes';
import bloodbankRoutes from './routes/bloodbank.routes';
import checkinRoutes from './routes/checkin.routes';
import appointmentsRoutes from './routes/appointments.routes';
import pharmacyRoutes from './routes/pharmacy.routes';
import labRoutes from './routes/lab.routes';
import paymentRoutes from './routes/payment.routes';
import notificationRoutes from './routes/notification.routes';
import emergencyRoutes from './routes/emergency.routes';
import profileRoutes from './routes/profile.routes';
import adminRoutes from './routes/admin.routes';
import dashboardRoutes from './routes/dashboard.routes';
import doctorsRoutes from './routes/doctors.routes';
import { pool } from './config/db';
import { notFoundHandler, errorHandler } from './middleware/error';
import discoveryRoutes from './routes/discovery.routes';
import healthRoutes from './routes/health.routes';
import workflowRoutes from './routes/workflow.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// API discovery endpoint for frontend integration and demos.
app.get('/api', (_req, res) => {
  res.json({
    name: 'MediConnect API',
    version: '2.1.0',
    modules: ['auth','doctors','appointments','records','prescriptions','reminders','pharmacy','labs','blood-bank','checkins','payments','notifications','emergency','profile','dashboard','admin','discovery','health','workflow'],
    doctorDiscovery: {
      specializations: 'GET /doctors/specializations',
      featured: 'GET /doctors/featured',
      available: 'GET /doctors/available',
      topRated: 'GET /doctors/top-rated',
      bySpecialty: 'GET /doctors/specialization/:specialization',
      search: 'GET /doctors?search=&specialization=&location=&available=',
      suggestions: 'GET /doctors/search/suggestions?q=',
      hospitals: 'GET /doctors/hospitals',
      stats: 'GET /doctors/stats',
      profile: 'GET /doctors/:id',
      availability: 'GET /doctors/:id/availability',
      slots: 'GET /doctors/:id/slots?days=7',
      reviews: 'GET /doctors/:id/reviews',
      review: 'POST /doctors/:id/reviews'
    },
    discovery: {
      overview: 'GET /discovery/overview',
      pharmacies: 'GET /discovery/pharmacies',
      pharmacy: 'GET /discovery/pharmacies/:id',
      bloodBankOverview: 'GET /discovery/blood-bank/overview'
    },
    healthData: {
      patientSummary: 'GET /health-data/patients/:patientId/summary',
      doctorPatients: 'GET /health-data/doctor/patients',
      doctorSchedule: 'GET /health-data/doctor/schedule'
    },
    workflow: {
      doctorVerifications: 'GET /workflow/doctor-verifications',
      verifyDoctor: 'PATCH /workflow/doctor-verifications/:doctorId',
      consents: 'GET /workflow/consents',
      updateConsent: 'POST /workflow/consents',
      documents: 'GET /workflow/documents',
      uploadDocumentMetadata: 'POST /workflow/documents'
    }
  });
});

// Health check - hit this first to confirm the server is up
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'mediconnect-api', database: 'connected', timestamp: new Date().toISOString() }); }
  catch { res.status(503).json({ status: 'degraded', service: 'mediconnect-api', database: 'unavailable' }); }
});

app.use('/auth', authRoutes);
app.use('/records', recordsRoutes);
app.use('/prescriptions', prescriptionsRoutes);
app.use('/reminders', remindersRoutes);
app.use('/blood-bank', bloodbankRoutes);
app.use('/checkins', checkinRoutes);
app.use('/appointments', appointmentsRoutes);
app.use('/pharmacy', pharmacyRoutes);
app.use('/labs', labRoutes);
app.use('/payments', paymentRoutes);
app.use('/notifications', notificationRoutes);
app.use('/emergency', emergencyRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/doctors', doctorsRoutes);
app.use('/discovery', discoveryRoutes);
app.use('/health-data', healthRoutes);
app.use('/workflow', workflowRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`🚀 MediConnect API running on http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => { server.close(); await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { server.close(); await pool.end(); process.exit(0); });
