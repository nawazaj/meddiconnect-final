# MediConnect Backend V4

Demo-ready Node.js/Express + TypeScript + PostgreSQL backend for the MediConnect integrated healthcare platform.

## What is included

- JWT authentication and role-based authorization
- Patient, doctor, pharmacy, blood-bank and admin roles
- 100 mock doctors across multiple specialties
- 250 mock patients
- 30 pharmacies and 360 inventory rows
- 400 medical records
- 400 prescriptions + medicine reminders
- 350 lab reports
- 500 appointments
- 250 medicine orders + payments
- 300 AI check-ins + notifications
- 120 blood donors + 100 blood requests
- 80 emergency cases
- 120 dependents
- 500 medical document metadata records
- Patient-doctor consent records
- Doctor verification workflow
- Doctor discovery/search/availability/reviews
- Pharmacy discovery
- Blood-bank analytics
- Patient health summary
- Doctor patient list and schedule
- Admin analytics
- Health/database status endpoint

All demo accounts use the password `password123`.

## API surface

There are 70+ route handlers across these modules:

```text
/auth
/doctors
/appointments
/records
/prescriptions
/reminders
/pharmacy
/labs
/blood-bank
/checkins
/payments
/notifications
/emergency
/profile
/dashboard
/admin
/discovery
/health-data
/workflow
```

### Doctor discovery

```text
GET /doctors/specializations
GET /doctors/featured
GET /doctors/top-rated
GET /doctors/available
GET /doctors/hospitals
GET /doctors/stats
GET /doctors/search/suggestions?q=card
GET /doctors/specialization/Cardiologist
GET /doctors?search=aisha&specialization=Cardiologist&location=Patna&available=true
GET /doctors/:id
GET /doctors/:id/availability
GET /doctors/:id/slots?days=7
GET /doctors/:id/reviews
POST /doctors/:id/reviews
```

### Discovery

```text
GET /discovery/overview
GET /discovery/pharmacies
GET /discovery/pharmacies/:id
GET /discovery/blood-bank/overview
```

### Health data

```text
GET /health-data/patients/:patientId/summary
GET /health-data/doctor/patients
GET /health-data/doctor/schedule
GET /health-data/doctor/:doctorId/schedule   # admin only
```

### Verification / consent / documents

```text
GET /workflow/doctor-verifications
PATCH /workflow/doctor-verifications/:doctorId
GET /workflow/consents
GET /workflow/consents/:patientId
POST /workflow/consents
GET /workflow/documents
GET /workflow/documents/:patientId
POST /workflow/documents
```

### Other core APIs

```text
POST /auth/signup
POST /auth/login
GET  /profile/me
PUT  /profile/patient
POST /profile/dependents
GET  /profile/dependents

POST /appointments
GET  /appointments
PATCH /appointments/:id

POST /records
GET  /records/:patientId
POST /prescriptions
GET  /prescriptions/:patientId
POST /reminders
GET  /reminders/:patientId
PATCH /reminders/:id/mark-taken

GET  /pharmacy/inventory/search
POST /pharmacy/register
POST /pharmacy/inventory
POST /pharmacy/orders
GET  /pharmacy/orders
PATCH /pharmacy/orders/:id/status

POST /labs
GET  /labs/:patientId

POST /blood-bank/donors
PATCH /blood-bank/donors/:id/availability
POST /blood-bank/requests
GET  /blood-bank/requests
GET  /blood-bank/donors/match/:bloodGroup
PATCH /blood-bank/requests/:id

POST /checkins
GET  /checkins/:patientId
GET  /checkins/alerts

POST /payments
GET  /payments
PATCH /payments/:id

GET  /notifications
PATCH /notifications/:id/read
PATCH /notifications/read-all

POST /emergency
GET  /emergency
PATCH /emergency/:id

GET /dashboard/patient
GET /dashboard/doctor/patients
GET /dashboard/doctors

GET /admin/dashboard
GET /admin/users
```

`GET /api` returns the module and endpoint discovery document for frontend integration.

## Database

The database is PostgreSQL. The repository contains the complete schema and deterministic demo seed data:

```text
db/schema.sql
db/seed.sql
```

There is **no hosted database hidden inside the ZIP**. A Render PostgreSQL instance, if used, remains a separate service. Set its connection string as `DATABASE_URL`.

### Local database

```bash
docker compose up -d postgres
```

### API

```bash
cd api
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

## Environment

Copy `api/.env.example` to `api/.env` and configure:

```env
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=change-this-secret
FRONTEND_URL=http://localhost:3000
AI_SERVICE_URL=http://localhost:8000
```

Never commit real database credentials or JWT secrets.

## Important prototype boundary

The backend has provider-ready abstractions/data for payments, notifications and telemedicine, but real Razorpay/Stripe, Firebase/Twilio and video infrastructure still require external provider integration. The mock dataset and APIs are intended for frontend development, demonstrations and the MediConnect project prototype, not as a production medical system.

## Local setup (PostgreSQL + pgAdmin 4)

1. Create a PostgreSQL database named `mediconnect`.
2. Open pgAdmin Query Tool for that database.
3. Run `db/schema.sql` first. It creates the complete schema and resets the demo database.
4. Run `db/seed.sql` second. It creates the large mock dataset.
5. Copy `api/.env.example` to `api/.env` and set your PostgreSQL password and a strong JWT secret.
6. From `api`, run `npm install`, `npm run build`, then `npm start`.
7. Check `GET http://localhost:5000/health` and `GET http://localhost:5000/api`.

Demo accounts use password `password123`. Do not use seeded credentials or demo data in production. Never commit `.env` files.
