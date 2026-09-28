-- HR Portal এর ডাটা রাখার জন্য টেবিল।
-- প্রতিটা "collection" (employees, announcements, holidays, leave_requests,
-- bill_claims, hr_directory) একটা key হিসেবে সেভ থাকে, আর তার পুরো লিস্টটা
-- JSONB (structured JSON) ফরম্যাটে value কলামে থাকে।
--
-- এই ডিজাইনটা বেছে নেওয়ার কারণ: অ্যাপটার আসলে ফিক্সড কলাম দরকার নেই (যেমন
-- bill claim-এ PDF proof যুক্ত হওয়া, বা ভবিষ্যতে নতুন ফিল্ড যুক্ত হওয়া
-- ইত্যাদি), তাই JSONB ব্যবহার করলে schema বদলানোর দরকার পড়বে না, কিন্তু
-- ডাটা তবুও সত্যিকারের PostgreSQL এ, ডিস্কে, স্থায়ীভাবে জমা থাকে।

CREATE TABLE IF NOT EXISTS app_collections (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '[]'::jsonb
);
