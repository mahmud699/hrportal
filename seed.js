// এই স্ক্রিপ্টটা একবার চালালে (npm run seed) ডাটাবেসে টেবিল বানাবে এবং
// শুরুর ডেমো ডেটা (employees, announcements ইত্যাদি) ভরে দেবে।
// আগে থেকে কোনো key থাকলে সেটা আর ওভাররাইট করবে না, তাই এটা নিরাপদে
// একাধিকবার চালানো যায়।

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const SEED_EMPLOYEES = [
  { id:"EMP001", password:"password123", name:"John Doe", role:"employee", title:"Software Engineer II", department:"Engineering", email:"john.doe@gss-corp.com", phone:"(555) 011-2244", startDate:"2022-03-14", leaveBalance:12, monthlySalary:95000, travelAllowance:5000, lunchAllowance:3000, mobileAllowance:1500 },
  { id:"EMP002", password:"password123", name:"Priya Nair", role:"employee", title:"Product Designer", department:"Design", email:"priya.nair@gss-corp.com", phone:"(555) 011-2255", startDate:"2023-07-01", leaveBalance:9, monthlySalary:82000, travelAllowance:4000, lunchAllowance:3000, mobileAllowance:1500 },
  { id:"HR001", password:"hrpass123", name:"Grace Kim", role:"hr", title:"HR Manager", department:"Human Resources", email:"grace.kim@gss-corp.com", phone:"(555) 011-2200", startDate:"2019-01-10", leaveBalance:15, monthlySalary:110000, travelAllowance:6000, lunchAllowance:3500, mobileAllowance:2000 }
];

const SEED_ANNOUNCEMENTS = [
  { id:"a1", title:"Open enrollment starts October 1", date:"2026-09-05", author:"Grace Kim, HR", body:"Benefits open enrollment runs from October 1–15. Review your medical, dental, and vision options in the benefits portal and reach out to HR with any questions before the window closes." },
  { id:"a2", title:"Office closed for Labor Day observance", date:"2026-08-28", author:"Grace Kim, HR", body:"The Dhaka and remote support desks will be closed on the upcoming public holiday. Normal hours resume the following business day." },
  { id:"a3", title:"New parental leave policy in effect", date:"2026-08-01", author:"HR Policy Team", body:"Our updated parental leave policy now offers 16 weeks of paid leave for all primary caregivers, effective for any leave starting on or after this date. Full details are in the employee handbook." }
];

const SEED_DIRECTORY = [
  { name:"Grace Kim", role:"HR Manager", email:"grace.kim@gss-corp.com", phone:"(555) 011-2200" },
  { name:"Omar Farouk", role:"Payroll & Benefits Specialist", email:"omar.farouk@gss-corp.com", phone:"(555) 011-2201" },
  { name:"Lena Ostrowski", role:"Recruiting Lead", email:"lena.ostrowski@gss-corp.com", phone:"(555) 011-2202" },
  { name:"Diego Marrero", role:"Employee Relations", email:"diego.marrero@gss-corp.com", phone:"(555) 011-2203" }
];

const SEED_HOLIDAYS = [
  { date:"2026-02-21", name:"International Mother Language Day" },
  { date:"2026-03-26", name:"Independence Day" },
  { date:"2026-04-14", name:"Bengali New Year (Pohela Boishakh)" },
  { date:"2026-05-01", name:"May Day" },
  { date:"2026-05-27", name:"Eid-ul-Fitr (subject to moon sighting)" },
  { date:"2026-08-03", name:"Eid-ul-Adha (subject to moon sighting)" },
  { date:"2026-12-16", name:"Victory Day" },
  { date:"2026-12-25", name:"Christmas Day" }
];

async function insertIfMissing(client, key, value, existingKeys){
  if(existingKeys.has(key)){
    console.log(`  · ${key} — already exists, skipped.`);
    return;
  }
  await client.query(
    "INSERT INTO app_collections(key, value) VALUES ($1, $2)",
    [key, JSON.stringify(value)]
  );
  console.log(`  · ${key} — seeded.`);
}

async function run(){
  const client = await pool.connect();
  try{
    console.log("Creating table (if not exists)...");
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await client.query(schema);

    const existing = await client.query("SELECT key FROM app_collections");
    const existingKeys = new Set(existing.rows.map(r => r.key));

    console.log("Seeding data:");

    let employeesToInsert = SEED_EMPLOYEES;
    if(!existingKeys.has("employees")){
      employeesToInsert = await Promise.all(
        SEED_EMPLOYEES.map(async (e) => ({ ...e, password: await bcrypt.hash(e.password, 10) }))
      );
    }
    await insertIfMissing(client, "employees", employeesToInsert, existingKeys);
    await insertIfMissing(client, "announcements", SEED_ANNOUNCEMENTS, existingKeys);
    await insertIfMissing(client, "hr_directory", SEED_DIRECTORY, existingKeys);
    await insertIfMissing(client, "holidays", SEED_HOLIDAYS, existingKeys);
    await insertIfMissing(client, "leave_requests", [], existingKeys);
    await insertIfMissing(client, "bill_claims", [], existingKeys);
    await insertIfMissing(client, "attendance", [], existingKeys);

    console.log("\nSeeding complete. Demo logins:");
    console.log("  Employee — ID EMP001, password password123");
    console.log("  HR admin — ID HR001, password hrpass123");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});
