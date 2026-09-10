-- ============================================
-- MediConnect Prototype - PostgreSQL Schema
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Full reset for local/demo initialization. Dropping users with CASCADE removes
-- every dependent table before the schema is recreated.
DROP TABLE IF EXISTS medical_documents, patient_consents, doctor_verifications, dependents,
  emergency_requests, audit_logs, notifications, payments, lab_reports, appointments,
  medicine_order_items, medicine_orders, pharmacy_inventory, pharmacies, ai_checkins,
  blood_requests, blood_donors, medicine_reminders, prescriptions, medical_records,
  doctor_reviews, doctor_availability, doctor_profiles, patient_profiles, users CASCADE;

-- 1. USERS (base table for everyone: patient, doctor, pharmacy, blood_bank, admin)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'pharmacy', 'blood_bank', 'admin')),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. PATIENT PROFILES
CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dob DATE,
    gender VARCHAR(10),
    blood_group VARCHAR(5),
    address TEXT,
    linked_doctor_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. DOCTOR PROFILES
CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    specialization VARCHAR(100),
    hospital_name VARCHAR(150),
    years_experience INT,
    bio TEXT,
    location VARCHAR(150),
    profile_image_url TEXT,
    languages TEXT[] DEFAULT ARRAY['English'],
    consultation_fee NUMERIC(10,2),
    rating NUMERIC(2,1) DEFAULT 4.5 CHECK (rating >= 0 AND rating <= 5),
    review_count INT DEFAULT 0 CHECK (review_count >= 0),
    is_available BOOLEAN DEFAULT TRUE,
    next_available_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Doctor weekly schedule and patient-facing availability
CREATE TABLE doctor_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    consultation_types TEXT[] DEFAULT ARRAY['in_person','video'],
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(doctor_id, day_of_week, start_time, end_time)
);

-- Verified patient reviews used for doctor cards and profiles
CREATE TABLE doctor_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    appointment_id UUID,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(patient_id, appointment_id)
);

-- 4. MEDICAL RECORDS (EHR - the digital version of the doctor's paper pad)
CREATE TABLE medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id),
    complaint TEXT NOT NULL,
    diagnosis TEXT,
    notes TEXT,
    visit_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. PRESCRIPTIONS
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id),
    medical_record_id UUID REFERENCES medical_records(id),
    medicine_name VARCHAR(150) NOT NULL,
    dosage VARCHAR(50),
    frequency VARCHAR(50),      -- e.g. "twice a day"
    duration VARCHAR(50),       -- e.g. "7 days"
    instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. MEDICINE REMINDERS
CREATE TABLE medicine_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_of_day TIME NOT NULL,
    taken_today BOOLEAN DEFAULT FALSE,
    stock_remaining INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. BLOOD DONORS
CREATE TABLE blood_donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blood_group VARCHAR(5) NOT NULL,
    location VARCHAR(150),
    last_donation_date DATE,
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 8. BLOOD REQUESTS
CREATE TABLE blood_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blood_group VARCHAR(5) NOT NULL,
    urgency VARCHAR(20) CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    hospital_name VARCHAR(150),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'matched', 'fulfilled', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 9. AI CHECK-INS (daily AI assistant conversations + risk scoring)
CREATE TABLE ai_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    severity_score INT,          -- 0-100
    severity_label VARCHAR(20),  -- mild / moderate / serious
    flagged BOOLEAN DEFAULT FALSE,
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Helpful indexes for the prototype's most common lookups
CREATE INDEX idx_records_patient ON medical_records(patient_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_reminders_patient ON medicine_reminders(patient_id);
CREATE INDEX idx_checkins_patient ON ai_checkins(patient_id);
CREATE INDEX idx_donors_bloodgroup ON blood_donors(blood_group);


-- ============================================================
-- MediConnect V2 CORE EXTENSIONS
-- Pharmacy, appointments, lab reports, payments, notifications,
-- audit logs, emergency requests, and richer patient profiles.
-- ============================================================

-- 10. PHARMACIES / SHOPS
CREATE TABLE pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_name VARCHAR(150) NOT NULL,
    license_number VARCHAR(100),
    address TEXT,
    location VARCHAR(150),
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 11. PHARMACY INVENTORY
CREATE TABLE pharmacy_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    medicine_name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150),
    dosage VARCHAR(80),
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    prescription_required BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(pharmacy_id, medicine_name, dosage)
);

-- 12. MEDICINE ORDERS
CREATE TABLE medicine_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id),
    prescription_id UUID REFERENCES prescriptions(id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','confirmed','packed','out_for_delivery','delivered','cancelled')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    delivery_address TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 13. MEDICINE ORDER ITEMS
CREATE TABLE medicine_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES medicine_orders(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES pharmacy_inventory(id),
    medicine_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);

-- 14. APPOINTMENTS / TELEMEDICINE BOOKINGS
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id),
    appointment_date TIMESTAMP NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 10 AND 180),
    consultation_type VARCHAR(20) NOT NULL DEFAULT 'in_person'
      CHECK (consultation_type IN ('in_person','video','audio')),
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
    reason TEXT,
    meeting_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 15. LAB / DIAGNOSTIC REPORTS
CREATE TABLE lab_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id),
    lab_name VARCHAR(150) NOT NULL,
    test_name VARCHAR(150) NOT NULL,
    result_value VARCHAR(100),
    unit VARCHAR(50),
    reference_range VARCHAR(100),
    is_abnormal BOOLEAN DEFAULT FALSE,
    report_url TEXT,
    report_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 16. PAYMENTS / INVOICES
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES medicine_orders(id),
    appointment_id UUID REFERENCES appointments(id),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'INR',
    purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('medicine','consultation','lab','other')),
    provider VARCHAR(30) DEFAULT 'mock',
    provider_payment_id VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','paid','failed','refunded')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 17. NOTIFICATIONS
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 18. AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 19. EMERGENCY REQUESTS
CREATE TABLE emergency_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('high','critical')),
    symptoms TEXT NOT NULL,
    location TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open','acknowledged','resolved','cancelled')),
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- 20. FAMILY / DEPENDENT PROFILES
CREATE TABLE dependents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    relationship VARCHAR(50),
    dob DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(5),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Additional profile fields useful to the frontend
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS chronic_conditions TEXT;

CREATE INDEX idx_pharmacy_inventory_name ON pharmacy_inventory(LOWER(medicine_name));
CREATE INDEX idx_orders_patient ON medicine_orders(patient_id);
CREATE INDEX idx_orders_pharmacy ON medicine_orders(pharmacy_id);
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date);
CREATE INDEX idx_appointments_patient_date ON appointments(patient_id, appointment_date);
CREATE INDEX idx_lab_reports_patient_date ON lab_reports(patient_id, report_date DESC);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_emergency_status ON emergency_requests(status, created_at DESC);
CREATE INDEX idx_dependents_owner ON dependents(account_owner_id);
CREATE INDEX idx_doctor_specialization ON doctor_profiles(LOWER(specialization));
CREATE INDEX idx_doctor_availability ON doctor_availability(doctor_id, day_of_week);
CREATE INDEX idx_doctor_reviews_doctor ON doctor_reviews(doctor_id, created_at DESC);

-- V3/V4 production-shaped workflow extensions
CREATE TABLE IF NOT EXISTS doctor_verifications (
    doctor_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    registration_number VARCHAR(100) UNIQUE,
    qualifications TEXT,
    document_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
    rejection_reason TEXT,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    granted_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,
    UNIQUE(patient_id, doctor_id, consent_type)
);

CREATE TABLE IF NOT EXISTS medical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_verification_status ON doctor_verifications(status);
CREATE INDEX IF NOT EXISTS idx_consents_patient ON patient_consents(patient_id, granted);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON medical_documents(patient_id, created_at DESC);
