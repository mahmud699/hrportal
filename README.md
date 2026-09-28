# HR Portal — PostgreSQL ব্যাকএন্ড

তোমার `hr-portal.html` ফাইলটা এখন `window.storage` এর বদলে একটা রিয়েল
Node.js + Express ব্যাকএন্ড ব্যবহার করে, যা লোকাল PostgreSQL এ ডেটা রাখে।

> ⚠️ **আগে থেকে অ্যাপটা চালু থাকলে (আপগ্রেড করছো):** এই ভার্সনে ইমেইল
> নোটিফিকেশন ও ZKTeco অ্যাটেনডেন্স ইন্টিগ্রেশনের জন্য নতুন কিছু প্যাকেজ
> (`nodemailer`, `node-zklib`, `xlsx`) যুক্ত হয়েছে। ফাইলগুলো রিপ্লেস করার
> পর অবশ্যই আরেকবার `npm install` চালাতে হবে (নিচে ধাপ ৪), নাহলে সার্ভার
> চালু হওয়ার সময় "Cannot find module" এরর দেখাবে।

## ফোল্ডার স্ট্রাকচার

```
hr-portal-app/
├── package.json
├── .env.example      ← এটা কপি করে .env বানাবে
├── db.js             ← PostgreSQL কানেকশন
├── schema.sql         ← টেবিলের গঠন
├── seed.js           ← শুরুর ডেমো ডেটা ভরার স্ক্রিপ্ট
├── server.js         ← Express সার্ভার + সব API
├── mailer.js         ← ইমেইল নোটিফিকেশন (Nodemailer)
├── zkteco.js         ← ZKTeco অ্যাটেনডেন্স ডিভাইস ইন্টিগ্রেশন
└── public/
    └── hr-portal.html ← তোমার আপডেট করা ফ্রন্টএন্ড
```

## সেটআপের ধাপ

### ১. Node.js ইনস্টল আছে কিনা দেখো
```bash
node -v
```
না থাকলে https://nodejs.org থেকে LTS ভার্সন ইনস্টল করো।

### ২. PostgreSQL ইনস্টল করো (যদি না থাকে)
- **Windows:** https://www.postgresql.org/download/windows/ থেকে ইনস্টলার নামাও
- **Mac:** `brew install postgresql@16` তারপর `brew services start postgresql@16`
- **Linux (Ubuntu/Debian):** `sudo apt install postgresql postgresql-contrib`

ইনস্টল করার সময় একটা পাসওয়ার্ড সেট করতে বলবে `postgres` ইউজারের জন্য — সেটা মনে রেখো।

### ৩. ডাটাবেস তৈরি করো
টার্মিনালে (psql দিয়ে):
```bash
psql -U postgres
```
তারপর psql প্রম্পটে:
```sql
CREATE DATABASE hr_portal;
\q
```

### ৪. প্রজেক্ট ডিপেন্ডেন্সি ইনস্টল করো
এই `hr-portal-app` ফোল্ডারে গিয়ে:
```bash
npm install
```

### ৫. .env ফাইল বানাও
```bash
cp .env.example .env
```
তারপর `.env` ফাইলটা খুলে `PGPASSWORD` এ তোমার PostgreSQL পাসওয়ার্ডটা দাও।

### ৬. ডাটাবেস সিড করো (টেবিল + ডেমো ডেটা)
```bash
npm run seed
```
এটা সফল হলে দেখাবে:
```
Seeding complete. Demo logins:
  Employee — ID EMP001, password password123
  HR admin — ID HR001, password hrpass123
```

### ৭. সার্ভার চালাও
```bash
npm start
```
টার্মিনালে দেখাবে: `HR Portal সার্ভার চলছে: http://localhost:3000`

### ৮. ব্রাউজারে খোলো
```
http://localhost:3000
```
Demo অ্যাকাউন্ট দিয়ে লগইন করো (উপরে দেওয়া আছে)।

---

## কী কী বদলেছে

- আগে ডেটা `window.storage` (Claude আর্টিফ্যাক্টের অস্থায়ী স্টোরেজ) তে থাকতো।
- এখন ডেটা প্রকৃত **PostgreSQL ডাটাবেসে**, ডিস্কে, স্থায়ীভাবে জমা থাকে — সার্ভার
  রিস্টার্ট করলেও ডেটা হারাবে না।
- পাসওয়ার্ড এখন **bcrypt দিয়ে হ্যাশ** করে রাখা হয় — প্লেইন টেক্সটে না।
  লগইন চেকও এখন ক্লায়েন্ট সাইডে না, সার্ভার সাইডে হয়।
- ডেটা স্টোরেজ ডিজাইন: প্রতিটা কালেকশন (`employees`, `announcements`,
  `holidays`, `leave_requests`, `bill_claims`, `hr_directory`) একটা
  `app_collections` টেবিলে key-value (JSONB) হিসেবে থাকে। এটা এখনকার জন্য
  সহজ ও দ্রুত সমাধান; ভবিষ্যতে চাইলে প্রতিটা কালেকশনকে আলাদা রিলেশনাল
  টেবিলে (foreign key সহ) ভাঙা যাবে যদি অ্যাপ বড় হয়।

## API এন্ডপয়েন্টের তালিকা

| Method | Path | কাজ |
|---|---|---|
| GET | `/api/bootstrap` | সব ডেটা একসাথে লোড (পাসওয়ার্ড ছাড়া) |
| POST | `/api/login` | `{id, password}` দিয়ে লগইন |
| POST | `/api/employees` | নতুন অ্যাকাউন্ট তৈরি (HR) |
| PATCH | `/api/employees/:id` | ইমেইল/ফোন/বেতন/ছুটি/ডিভাইস আইডি আপডেট |
| DELETE | `/api/employees/:id` | অ্যাকাউন্ট রিমুভ (পাসওয়ার্ড কনফার্মেশন লাগে) |
| POST | `/api/employees/:id/reset-password` | পাসওয়ার্ড রিসেট (পাসওয়ার্ড কনফার্মেশন লাগে) |
| PATCH | `/api/leave-requests/:id` | ছুটির রিকোয়েস্ট approve/deny (ইমেইল যাবে) |
| PATCH | `/api/bill-claims/:id` | বিল ক্লেইম approve/deny (ইমেইল যাবে) |
| POST | `/api/attendance/sync` | ZKTeco ডিভাইস থেকে অ্যাটেনডেন্স লগ সিঙ্ক |
| POST | `/api/documents/email` | অটো-জেনারেটেড PDF ডকুমেন্ট (certificate/letter) এমপ্লয়ির ইমেইলে পাঠানো |
| PUT | `/api/collections/announcements` | ঘোষণা লিস্ট সেভ |
| PUT | `/api/collections/holidays` | ছুটির লিস্ট সেভ |
| PUT | `/api/collections/leave_requests` | নতুন ছুটির রিকোয়েস্ট তৈরি |
| PUT | `/api/collections/bill_claims` | নতুন বিল ক্লেইম তৈরি |

## ইমেইল নোটিফিকেশন সেটআপ

`.env` ফাইলে `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` ইত্যাদি পূরণ করলে —
লিভ/বিল claim approve বা deny হলে এমপ্লয়ির ইমেইলে সাথে সাথে নোটিফিকেশন যাবে।

**Gmail ব্যবহার করলে:**
1. Google Account → Security → 2-Step Verification চালু করো
2. তারপর "App passwords" এ গিয়ে একটা নতুন App password জেনারেট করো
3. সেই ১৬-ডিজিটের পাসওয়ার্ডটা `SMTP_PASS` এ বসাও (তোমার সাধারণ Gmail পাসওয়ার্ড কাজ করবে না)

`.env` এ কিছু না দিলে এই ফিচারটা চুপচাপ বন্ধ থাকবে — বাকি অ্যাপ স্বাভাবিকভাবেই চলবে, কোনো এরর দেখাবে না।

## ZKTeco অ্যাটেনডেন্স মেশিন সেটআপ

1. ডিভাইসের মেনু থেকে (সাধারণত Menu → Comm → Ethernet) এর IP ঠিকানা বের করো
2. সার্ভার যেই কম্পিউটারে চলছে, সেটা ও ডিভাইস **একই নেটওয়ার্কে** থাকতে হবে
3. `.env` এ `ZK_IP` এবং `ZK_PORT` (সাধারণত 4370) বসাও
4. প্রতিটা এমপ্লয়ির জন্য "Manage accounts" পেজে গিয়ে **"Attendance device ID"** সেট করো — এটা ডিভাইসে যেই ইউজার আইডি/PIN নাম্বার দেওয়া আছে সেটা (ডিভাইসের মেনু থেকে বা এনরোলমেন্টের সময় দেখা যায়)
5. অ্যাপে লগইন করে **"Attendance"** পেজে গিয়ে **"Sync now"** চাপো

⚠️ **গুরুত্বপূর্ণ:** এই ইন্টিগ্রেশনটা `node-zklib` লাইব্রেরি দিয়ে বানানো (ZKTeco'র পুরোনো/স্ট্যান্ডঅ্যালোন প্রোটোকল সমর্থনকারী মডেলগুলোর জন্য কাজ করার কথা — যেমন K40, TX628, MB360, iFace সিরিজ)। যেহেতু এটা কোনো আসল ডিভাইসের বিপরীতে টেস্ট করা হয়নি (আমার কাছে ফিজিক্যাল হার্ডওয়্যার নেই), **তোমার নির্দিষ্ট মডেলে প্রথমবার "Sync now" চাপার সময় এরর আসতে পারে**। এরর মেসেজটা (যেমন device timeout, protocol mismatch ইত্যাদি) আমাকে জানালে সেই অনুযায়ী ঠিক করে দিতে পারব। নতুন/ADMS-বেইজড মডেল হলে ভিন্ন প্রোটোকল লাগতে পারে।

## Excel ডাউনলোড

CSV এর পাশাপাশি এখন **"⬇ Excel"** বাটনও আছে (Reports পেজ ও Attendance পেজে) — এটা সরাসরি `.xlsx` ফাইল হিসেবে ডাউনলোড করে, CSV থেকে কনভার্ট করার দরকার নেই।

## HR ডকুমেন্ট — Certificates ও Letters (অটোমেটিক PDF)

**Reports** পেজে এখন একটা **"Documents"** কার্ড আছে, যেখান থেকে যেকোনো এমপ্লয়ির জন্য নিচের ৭ ধরনের ডকুমেন্ট এক ক্লিকেই A4 সাইজ, প্রফেশনাল লেটারহেড-স্টাইলে অটোমেটিক জেনারেট হয়ে যায় — কিছু হাতে টাইপ করা লাগে না:

- Experience Certificate
- Salary Certificate
- No Objection Certificate (NOC)
- Offer Letter
- Appointment Letter
- Promotion Letter
- Relieving Letter

এমপ্লয়ি বেছে নিলে ডকুমেন্ট টাইপ অনুযায়ী কিছু অতিরিক্ত ফিল্ড (যেমন purpose, joining date, new title, salary ইত্যাদি) দেখাবে — সেগুলো পূরণ করে দুইটার একটা করা যায়:

- **⬇ Download PDF** — ব্রাউজারেই সরাসরি ডাউনলোড হয়ে যায় (jsPDF ব্যবহার করে, তাই এর জন্য ইন্টারনেট কানেকশন লাগে, কিন্তু সার্ভারে কোনো ডেটা যায় না)
- **✉ Email to employee** — জেনারেট হওয়া PDF-টা অ্যাটাচমেন্ট হিসেবে সরাসরি এমপ্লয়ির ইমেইলে (যেটা তার প্রোফাইলে সেভ করা আছে) পাঠিয়ে দেয়, `mailer.js`/SMTP সেটিংস ব্যবহার করে — নিচের "ইমেইল নোটিফিকেশন সেটআপ" অংশে দেওয়া `.env` ভ্যারিয়েবলগুলো পূরণ করা থাকলেই এটা কাজ করবে। SMTP সেটআপ না থাকলে টোস্ট মেসেজে জানিয়ে দেবে, PDF ডাউনলোড তখনও কাজ করবে।

কোম্পানির নাম, ঠিকানা, যোগাযোগের তথ্য `hr-portal.html` ফাইলের `COMPANY` নামের কনস্ট্যান্টে বসানো আছে (Documents-সংক্রান্ত JavaScript সেকশনের একদম শুরুতে) — নিজের কোম্পানির তথ্য দিয়ে বদলে নেওয়া যায়। লোগো/সিগনেচার ছবি বসানোর দরকার হলে এই ফাইলের কোড এডিট করে যোগ করা যাবে।

## সমস্যা হলে

- **`ECONNREFUSED` বা কানেকশন এরর:** PostgreSQL সার্ভিস চলছে কিনা চেক করো
  (`sudo service postgresql status` বা Windows Services প্যানেল)।
- **পাসওয়ার্ড ভুল এরর:** `.env` এ `PGPASSWORD` ঠিক আছে কিনা দেখো।
- **`npm run seed` বারবার চালালে সমস্যা হবে না** — যেটা আগে থেকে আছে সেটা
  স্কিপ করে যায়, ডুপ্লিকেট করে না।
