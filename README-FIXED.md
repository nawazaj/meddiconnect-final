# MediConnect Backend - FIXED / DEMO READY

## Main fixes
- Appointment booking and slot discovery now use the same 30-minute slot model.
- Booking is protected against double-booking with a transaction/row lock.
- Missing demo doctor schedules are automatically repaired with 09:00-18:00 daily availability.
- Seed data now gives every seeded doctor daily 09:00-18:00 availability for reliable demos.
- Appointment responses include doctor/patient metadata useful to the mobile frontend.
- Existing routes/features are preserved.

## Run the API
cd api
npm install
npm run build
npm start

API: http://localhost:5000
Health: http://localhost:5000/health

## AI service
cd ai-service
pip install -r requirements.txt
python main.py

AI: http://localhost:8000

## Database
Run db/schema.sql, then db/seed.sql in PostgreSQL for a fresh demo database.

Set api/.env:
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/mediconnect
JWT_SECRET=change-this-for-local-demo
PORT=5000

For the Expo phone frontend, use the PC LAN address in its .env:
EXPO_PUBLIC_API_URL=http://YOUR_PC_IPV4:5000

Do not use localhost in the phone frontend.
