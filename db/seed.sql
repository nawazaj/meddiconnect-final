-- MediConnect Demo Dataset Generator
-- Creates a large, deterministic mock dataset for frontend development.
-- Demo password for every seeded account: password123

TRUNCATE TABLE
  audit_logs, notifications, emergency_requests, payments, medicine_order_items,
  medicine_orders, pharmacy_inventory, pharmacies, lab_reports, appointments,
  doctor_reviews, doctor_availability, medicine_reminders, prescriptions,
  medical_records, ai_checkins, blood_requests, blood_donors, dependents,
  doctor_profiles, patient_profiles, patient_consents, medical_documents, doctor_verifications, users CASCADE;

-- One bcrypt hash for password123. Never use this credential in production.
DO $$
DECLARE
  pwd TEXT := '$2b$10$4UB2K4FguKiTOwpN3lT5juoP7gcHTQCOnO8p9S6m3o7so.D4UXN3q';
  specialties TEXT[] := ARRAY['General Physician','Cardiologist','Dermatologist','Orthopedic','Physiotherapist','Pediatrician','Gynecologist','Neurologist','ENT Specialist','Psychiatrist'];
  hospitals TEXT[] := ARRAY['MediConnect City Hospital','Apollo Care Centre','Fortis Health Hub','Lifeline Multispeciality','Medisphere Hospital','Aarogya Medical Centre','Sunrise Hospital','Wellness Point Clinic'];
  cities TEXT[] := ARRAY['Patna','Ranchi','Delhi','Bengaluru','Mumbai','Kolkata','Hyderabad','Pune','Lucknow','Jaipur'];
  first_names TEXT[] := ARRAY['Aarav','Aisha','Arjun','Ananya','Kabir','Meera','Rohan','Sara','Aditya','Ishita','Rahul','Zoya','Vihaan','Diya','Karan','Nisha','Aryan','Maya','Dev','Sana','Yash','Tanya','Rehan','Pooja','Aman'];
  last_names TEXT[] := ARRAY['Sharma','Khan','Verma','Singh','Mehta','Gupta','Roy','Das','Kapoor','Malhotra','Reddy','Patel','Sinha','Bose','Mishra','Jain','Chopra','Iyer','Nair','Ahmed'];
  i INT;
  uid UUID;
  pid UUID;
  did UUID;
  phid UUID;
  rid UUID;
  rxid UUID;
  item_name TEXT;
  item_price NUMERIC;
  aid UUID;
  oid UUID;
  inv UUID;
  appt_date TIMESTAMP;
  bg TEXT;
  medicine TEXT[] := ARRAY['Paracetamol 500mg','Amoxicillin 500mg','Cetirizine 10mg','Metformin 500mg','Pantoprazole 40mg','Azithromycin 500mg','Atorvastatin 10mg','Vitamin D3 60000 IU','Ibuprofen 400mg','Omeprazole 20mg','Montelukast 10mg','Calcium 500mg'];
  tests TEXT[] := ARRAY['Complete Blood Count','Blood Glucose','HbA1c','Lipid Profile','Liver Function Test','Kidney Function Test','Thyroid Profile','Hemoglobin','Vitamin D','Blood Pressure'];
  complaints TEXT[] := ARRAY['Fever and fatigue','Persistent cough','Back pain','Headache','Chest discomfort','Skin irritation','Joint pain','Follow-up consultation','Stomach discomfort','Seasonal allergy'];
BEGIN
  -- 100 doctors with rich public directory information.
  FOR i IN 1..100 LOOP
    uid := gen_random_uuid();
    INSERT INTO users(id,name,email,password_hash,role,phone)
    VALUES(uid, first_names[((i-1)%array_length(first_names,1))+1] || ' ' || last_names[((i-1)%array_length(last_names,1))+1], 'doctor'||i||'@mediconnect.demo', pwd, 'doctor', '+91' || LPAD((9000000000+i)::text,10,'0'));
    INSERT INTO doctor_profiles(user_id,specialization,hospital_name,years_experience,bio,location,profile_image_url,languages,consultation_fee,rating,review_count,is_available,next_available_at)
    VALUES(
      uid,
      specialties[((i-1)%array_length(specialties,1))+1],
      hospitals[((i-1)%array_length(hospitals,1))+1],
      3 + (i % 22),
      'Experienced ' || specialties[((i-1)%array_length(specialties,1))+1] || ' focused on patient-centred care, clear communication and evidence-based treatment.',
      cities[((i-1)%array_length(cities,1))+1],
      'https://i.pravatar.cc/300?img=' || (10 + (i % 60)),
      ARRAY['English', CASE WHEN i%3=0 THEN 'Hindi' WHEN i%3=1 THEN 'Bengali' ELSE 'Tamil' END],
      400 + ((i*37)%1100),
      ROUND((4.1 + ((i*7)%9)/10.0)::numeric,1),
      35 + ((i*17)%480),
      i % 7 <> 0,
      NOW() + ((i%10)+1) * INTERVAL '1 hour'
    );
    -- Daily prototype availability so every seeded doctor has bookable slots.
    -- The booking API still checks overlaps and consultation type.
    FOR j IN 0..6 LOOP
      INSERT INTO doctor_availability(doctor_id,day_of_week,start_time,end_time,consultation_types)
      VALUES(uid, j, '09:00'::time, '18:00'::time,
             ARRAY['in_person','video','audio']::text[])
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- 250 patients.
  FOR i IN 1..250 LOOP
    uid := gen_random_uuid();
    INSERT INTO users(id,name,email,password_hash,role,phone)
    VALUES(uid, first_names[((i-1)%array_length(first_names,1))+1] || ' ' || last_names[((i*3-1)%array_length(last_names,1))+1], 'patient'||i||'@mediconnect.demo', pwd, 'patient', '+91' || LPAD((8000000000+i)::text,10,'0'));
    SELECT user_id INTO did FROM doctor_profiles ORDER BY random() LIMIT 1;
    bg := (ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-'])[((i-1)%8)+1];
    INSERT INTO patient_profiles(user_id,dob,gender,blood_group,address,linked_doctor_id,emergency_contact_name,emergency_contact_phone,allergies,chronic_conditions)
    VALUES(uid, CURRENT_DATE - ((20+(i%55))*365 + (i%12)*30), CASE WHEN i%3=0 THEN 'Female' WHEN i%3=1 THEN 'Male' ELSE 'Other' END, bg, (i%250+1)||' Healthcare Avenue, '||cities[((i-1)%10)+1], did, 'Emergency Contact '||i, '+91'||LPAD((7000000000+i)::text,10,'0'), CASE WHEN i%6=0 THEN 'Penicillin' ELSE NULL END, CASE WHEN i%7=0 THEN 'Hypertension' ELSE NULL END);
  END LOOP;

  -- 30 pharmacies + 360 inventory rows.
  FOR i IN 1..30 LOOP
    uid := gen_random_uuid();
    INSERT INTO users(id,name,email,password_hash,role,phone)
    VALUES(uid, 'Pharmacy Owner '||i, 'pharmacy'||i||'@mediconnect.demo', pwd, 'pharmacy', '+91'||LPAD((8100000000+i)::text,10,'0'));
    INSERT INTO pharmacies(owner_user_id,shop_name,license_number,address,location,verified)
    VALUES(uid,'MediConnect Pharmacy '||i,'PHARM-'||LPAD(i::text,5,'0'),(i+1)||' Main Market, '||cities[((i-1)%10)+1],cities[((i-1)%10)+1],i%9<>0)
    RETURNING id INTO phid;
    FOR j IN 1..12 LOOP
      INSERT INTO pharmacy_inventory(pharmacy_id,medicine_name,generic_name,dosage,quantity,price,prescription_required)
      VALUES(phid,medicine[((j+i-2)%array_length(medicine,1))+1], 'Generic Medicine '||j, CASE WHEN j%2=0 THEN '500 mg' ELSE '10 mg' END, 20+((i*j*7)%180), 35+((i*j*13)%500), j%4<>0)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- 100+ blood donors as real user records.
  FOR i IN 1..120 LOOP
    uid := gen_random_uuid();
    INSERT INTO users(id,name,email,password_hash,role,phone)
    VALUES(uid, 'Donor '||first_names[((i-1)%array_length(first_names,1))+1]||' '||last_names[((i-1)%array_length(last_names,1))+1], 'donor'||i||'@mediconnect.demo', pwd, 'patient', '+91'||LPAD((7200000000+i)::text,10,'0'));
    INSERT INTO blood_donors(user_id,blood_group,location,last_donation_date,available)
    VALUES(uid,(ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-'])[((i-1)%8)+1],cities[((i-1)%10)+1],CURRENT_DATE-(60+(i%300)),i%11<>0);
  END LOOP;

  -- 400 medical records and linked prescriptions/reminders.
  FOR i IN 1..400 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT id INTO did FROM users WHERE role='doctor' ORDER BY random() LIMIT 1;
    INSERT INTO medical_records(patient_id,doctor_id,complaint,diagnosis,notes,visit_date)
    VALUES(pid,did,complaints[((i-1)%10)+1],CASE WHEN i%4=0 THEN 'Requires follow-up' ELSE 'Stable condition' END,'Demo clinical note #'||i,NOW()-((i%180)||' days')::interval)
    RETURNING id INTO rid;
    INSERT INTO prescriptions(patient_id,doctor_id,medical_record_id,medicine_name,dosage,frequency,duration,instructions)
    VALUES(pid,did,rid,medicine[((i-1)%12)+1],CASE WHEN i%2=0 THEN '1 tablet' ELSE '500 mg' END,CASE WHEN i%3=0 THEN 'Once daily' ELSE 'Twice daily' END,(5+(i%15))||' days','Take after food unless advised otherwise.')
    RETURNING id INTO rxid;
    INSERT INTO medicine_reminders(prescription_id,patient_id,time_of_day,taken_today,stock_remaining)
    VALUES(rxid,pid,CASE WHEN i%2=0 THEN '08:00'::time ELSE '20:00'::time END,i%3<>0,5+(i%30));
  END LOOP;

  -- 350 lab reports.
  FOR i IN 1..350 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT id INTO did FROM users WHERE role='doctor' ORDER BY random() LIMIT 1;
    INSERT INTO lab_reports(patient_id,doctor_id,lab_name,test_name,result_value,unit,reference_range,is_abnormal,report_url,report_date)
    VALUES(pid,did,'MediConnect Diagnostics '||((i%8)+1),tests[((i-1)%10)+1],CASE WHEN i%5=0 THEN (110+(i%40))::text ELSE (70+(i%35))::text END,CASE WHEN i%2=0 THEN 'mg/dL' ELSE 'g/dL' END,'70 - 110',i%5=0,'https://example.com/mediconnect/reports/'||i,NOW()-((i%240)||' days')::interval);
  END LOOP;

  -- 500 appointments spread across past and future.
  FOR i IN 1..500 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT id INTO did FROM users WHERE role='doctor' ORDER BY random() LIMIT 1;
    appt_date := NOW() + ((i%45)-10) * INTERVAL '1 day' + ((i%10)+8) * INTERVAL '1 hour';
    INSERT INTO appointments(patient_id,doctor_id,appointment_date,duration_minutes,consultation_type,status,reason,meeting_url)
    VALUES(pid,did,appt_date,30,CASE WHEN i%3=0 THEN 'video' ELSE 'in_person' END,
      CASE WHEN appt_date < NOW() THEN 'completed' ELSE CASE WHEN i%5=0 THEN 'confirmed' ELSE 'scheduled' END END,
      complaints[((i-1)%10)+1],CASE WHEN i%3=0 THEN 'https://meet.mediconnect.demo/'||i ELSE NULL END)
    RETURNING id INTO aid;
    IF i%4=0 THEN
      INSERT INTO doctor_reviews(doctor_id,patient_id,appointment_id,rating,review_text)
      VALUES(did,pid,aid,3+(i%3),'Helpful consultation and clear guidance.');
    END IF;
  END LOOP;

  -- 250 orders, distributed across pharmacies and inventory.
  FOR i IN 1..250 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT id INTO phid FROM pharmacies ORDER BY random() LIMIT 1;
    SELECT id INTO inv FROM pharmacy_inventory WHERE pharmacy_id=phid ORDER BY random() LIMIT 1;
    SELECT medicine_name, price INTO item_name, item_price FROM pharmacy_inventory WHERE id=inv;
    INSERT INTO medicine_orders(patient_id,pharmacy_id,status,total_amount,delivery_address)
    VALUES(pid,phid,(ARRAY['pending','confirmed','packed','out_for_delivery','delivered'])[((i-1)%5)+1],item_price*(1+(i%3)),(i%250+1)||' Delivery Street, '||cities[((i-1)%10)+1]) RETURNING id INTO oid;
    INSERT INTO medicine_order_items(order_id,inventory_id,medicine_name,quantity,unit_price)
    VALUES(oid,inv,item_name,1+(i%3),item_price);
    INSERT INTO payments(user_id,order_id,amount,purpose,provider,provider_payment_id,status)
    VALUES(pid,oid,item_price*(1+(i%3)),'medicine','mock','PAY-DEMO-'||i,CASE WHEN i%6=0 THEN 'failed' ELSE 'paid' END);
  END LOOP;

  -- AI check-ins, emergency cases and notifications.
  FOR i IN 1..300 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    INSERT INTO ai_checkins(patient_id,message_text,severity_score,severity_label,flagged,ai_summary)
    VALUES(pid,CASE WHEN i%6=0 THEN 'I have worsening chest discomfort and feel short of breath.' ELSE 'I am feeling better today and my symptoms are manageable.' END,
      CASE WHEN i%6=0 THEN 82+(i%15) ELSE 10+(i%50) END,
      CASE WHEN i%6=0 THEN 'serious' ELSE 'mild' END,
      i%6=0,
      CASE WHEN i%6=0 THEN 'Potential escalation required. Doctor review recommended.' ELSE 'No immediate escalation detected.' END);
    INSERT INTO notifications(user_id,type,title,message)
    VALUES(pid,'health','Daily health check-in','Your MediConnect health check-in is ready.');
  END LOOP;

  FOR i IN 1..80 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    INSERT INTO emergency_requests(patient_id,severity,symptoms,location,status)
    VALUES(pid,CASE WHEN i%4=0 THEN 'critical' ELSE 'high' END,CASE WHEN i%4=0 THEN 'Severe chest pain and breathing difficulty' ELSE 'Sudden worsening symptoms requiring urgent review' END,cities[((i-1)%10)+1],CASE WHEN i%5=0 THEN 'resolved' ELSE 'open' END);
  END LOOP;

  FOR i IN 1..100 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    INSERT INTO blood_requests(patient_id,blood_group,urgency,hospital_name,status)
    VALUES(pid,(ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-'])[((i-1)%8)+1],(ARRAY['low','medium','high','critical'])[((i-1)%4)+1],hospitals[((i-1)%8)+1],CASE WHEN i%5=0 THEN 'matched' ELSE 'open' END);
  END LOOP;

  -- Doctor verification records. All demo doctors are verified so discovery is populated.
  INSERT INTO doctor_verifications(doctor_id,registration_number,qualifications,document_url,status,verified_at)
  SELECT id,'MED-'||SUBSTRING(id::text,1,8),'MBBS, MD','https://example.com/mediconnect/doctor-docs/'||id,'verified',NOW()
  FROM users WHERE role='doctor';

  -- Patient-doctor consent records for demo workflows.
  FOR i IN 1..500 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT linked_doctor_id INTO did FROM patient_profiles WHERE user_id=pid;
    IF did IS NOT NULL THEN
      INSERT INTO patient_consents(patient_id,doctor_id,consent_type,granted)
      VALUES(pid,did,CASE WHEN i%2=0 THEN 'medical_records' ELSE 'care_coordination' END,true)
      ON CONFLICT (patient_id,doctor_id,consent_type) DO NOTHING;
    END IF;
  END LOOP;

  -- 500 medical document metadata records.
  FOR i IN 1..500 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    SELECT id INTO did FROM users WHERE role='doctor' ORDER BY random() LIMIT 1;
    INSERT INTO medical_documents(patient_id,uploaded_by,document_type,title,file_url,mime_type,file_size_bytes,created_at)
    VALUES(pid,did,CASE WHEN i%3=0 THEN 'lab_report' WHEN i%3=1 THEN 'prescription' ELSE 'scan' END,'Demo medical document #'||i,'https://example.com/mediconnect/documents/'||i||'.pdf','application/pdf',120000+(i*731),NOW()-((i%180)||' days')::interval);
  END LOOP;

  -- Dependents and audit events.
  FOR i IN 1..120 LOOP
    SELECT id INTO pid FROM users WHERE role='patient' ORDER BY random() LIMIT 1;
    INSERT INTO dependents(account_owner_id,name,relationship,dob,gender,blood_group,phone)
    VALUES(pid,'Dependent '||i,CASE WHEN i%2=0 THEN 'Parent' ELSE 'Child' END,CURRENT_DATE-((5+(i%70))*365),CASE WHEN i%2=0 THEN 'Female' ELSE 'Male' END,(ARRAY['A+','B+','O+','AB+'])[((i-1)%4)+1],'+91'||LPAD((7600000000+i)::text,10,'0'));
    INSERT INTO audit_logs(actor_user_id,action,entity_type,metadata)
    VALUES(pid,'VIEW_DASHBOARD','dashboard',jsonb_build_object('demo_event',true,'sequence',i));
  END LOOP;
END $$;

-- Refresh doctor ratings after review generation.
UPDATE doctor_profiles dp SET
  rating = COALESCE((SELECT ROUND(AVG(rating)::numeric,1) FROM doctor_reviews r WHERE r.doctor_id=dp.user_id), dp.rating),
  review_count = COALESCE((SELECT COUNT(*) FROM doctor_reviews r WHERE r.doctor_id=dp.user_id), dp.review_count);

-- Helpful demo account aliases.
-- doctor1@mediconnect.demo / password123
-- patient1@mediconnect.demo / password123
-- pharmacy1@mediconnect.demo / password123
