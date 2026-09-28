require("dotenv").config();
const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const { sendMail } = require("./mailer");
const { pullFromDevice } = require("./zkteco");

const app = express();
// bill claims এ base64 PDF (up to ~3MB) সংযুক্ত থাকে, তাই body limit বাড়ানো
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Small DB helpers ----------
async function getCollection(key){
  const r = await pool.query("SELECT value FROM app_collections WHERE key = $1", [key]);
  return r.rows[0] ? r.rows[0].value : [];
}

async function setCollection(key, value){
  await pool.query(
    `INSERT INTO app_collections(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

// পাসওয়ার্ড কখনো ক্লায়েন্টে ফেরত পাঠানো হয় না
function sanitizeEmployee(e){
  const { password, ...rest } = e;
  return rest;
}

// ---------- Bootstrap: all app data at once ----------
app.get("/api/bootstrap", async (req, res) => {
  try{
    const [employees, announcements, directory, holidays, leaveRequests, billClaims, attendance] = await Promise.all([
      getCollection("employees"),
      getCollection("announcements"),
      getCollection("hr_directory"),
      getCollection("holidays"),
      getCollection("leave_requests"),
      getCollection("bill_claims"),
      getCollection("attendance")
    ]);
    res.json({
      employees: employees.map(sanitizeEmployee),
      announcements,
      directory,
      holidays,
      leaveRequests,
      billClaims,
      attendance
    });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Login ----------
app.post("/api/login", async (req, res) => {
  try{
    const { id, password } = req.body || {};
    if(!id || !password) return res.status(400).json({ error: "missing fields" });

    const employees = await getCollection("employees");
    const user = employees.find(e => e.id.toUpperCase() === String(id).toUpperCase());
    if(!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if(!ok) return res.status(401).json({ error: "invalid credentials" });

    res.json(sanitizeEmployee(user));
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Employees (dedicated endpoints because of password hashing) ----------
app.post("/api/employees", async (req, res) => {
  try{
    const body = req.body || {};
    if(!body.id || !body.password || !body.name || !body.title || !body.department || !body.email){
      return res.status(400).json({ error: "missing fields" });
    }
    const employees = await getCollection("employees");
    const id = String(body.id).toUpperCase();
    if(employees.some(e => e.id.toUpperCase() === id)){
      return res.status(409).json({ error: "duplicate id" });
    }
    const hashed = await bcrypt.hash(body.password, 10);
    const newEmployee = {
      id,
      password: hashed,
      name: body.name,
      role: body.role === "hr" ? "hr" : "employee",
      title: body.title,
      department: body.department,
      email: body.email,
      phone: body.phone || "",
      startDate: new Date().toISOString().slice(0, 10),
      leaveBalance: 12,
      monthlySalary: parseInt(body.monthlySalary, 10) || 60000,
      travelAllowance: 4000,
      lunchAllowance: 3000,
      mobileAllowance: 1500,
      deviceUserId: body.deviceUserId ? String(body.deviceUserId) : ""
    };
    employees.push(newEmployee);
    await setCollection("employees", employees);
    res.json(sanitizeEmployee(newEmployee));
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Bulk import (from an uploaded CSV/Excel file, parsed client-side) ----------
function randomTempPassword(){
  // পড়তে সহজ একটা টেম্পোরারি পাসওয়ার্ড, যেমন: gss-4restolks
  const words = ["maple","harbor","cedar","willow","ember","copper","meadow","quartz","canyon","ridge"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `gss-${word}${num}`;
}

app.post("/api/employees/bulk", async (req, res) => {
  try{
    const rows = Array.isArray(req.body.employees) ? req.body.employees : [];
    if(rows.length === 0) return res.status(400).json({ error: "no rows to import" });
    if(rows.length > 1000) return res.status(400).json({ error: "too many rows in one import (max 1000)" });

    const employees = await getCollection("employees");
    const existingIds = new Set(employees.map(e => e.id.toUpperCase()));
    const seenInBatch = new Set();

    const created = [];
    const skipped = [];

    for(let i = 0; i < rows.length; i++){
      const row = rows[i] || {};
      const rowNum = i + 2; // +2 ধরে নিচ্ছি: সাধারণত শীটের ১ম সারি হেডার, তাই ডেটা ২ নং সারি থেকে শুরু
      const id = row.id ? String(row.id).trim().toUpperCase() : "";
      const name = row.name ? String(row.name).trim() : "";
      const title = row.title ? String(row.title).trim() : "";
      const department = row.department ? String(row.department).trim() : "";
      const email = row.email ? String(row.email).trim() : "";

      if(!id || !name || !title || !department || !email){
        skipped.push({ row: rowNum, id: id || "(missing)", reason: "missing required field (id/name/title/department/email)" });
        continue;
      }
      if(existingIds.has(id) || seenInBatch.has(id)){
        skipped.push({ row: rowNum, id, reason: "duplicate employee ID" });
        continue;
      }

      const plainPassword = row.password && String(row.password).trim().length >= 6
        ? String(row.password).trim()
        : randomTempPassword();
      const hashed = await bcrypt.hash(plainPassword, 10);

      const newEmployee = {
        id,
        password: hashed,
        name,
        role: row.role === "hr" ? "hr" : "employee",
        title,
        department,
        email,
        phone: row.phone ? String(row.phone).trim() : "",
        startDate: row.startDate ? String(row.startDate).trim() : new Date().toISOString().slice(0, 10),
        leaveBalance: parseInt(row.leaveBalance, 10) || 12,
        monthlySalary: parseInt(row.monthlySalary, 10) || 60000,
        travelAllowance: parseInt(row.travelAllowance, 10) || 4000,
        lunchAllowance: parseInt(row.lunchAllowance, 10) || 3000,
        mobileAllowance: parseInt(row.mobileAllowance, 10) || 1500,
        deviceUserId: row.deviceUserId ? String(row.deviceUserId).trim() : ""
      };

      employees.push(newEmployee);
      existingIds.add(id);
      seenInBatch.add(id);
      created.push({ id, name, email, tempPassword: plainPassword });
    }

    if(created.length > 0){
      await setCollection("employees", employees);
    }

    res.json({ ok: true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});


app.patch("/api/employees/:id", async (req, res) => {
  try{
    const employees = await getCollection("employees");
    const emp = employees.find(e => e.id === req.params.id);
    if(!emp) return res.status(404).json({ error: "not found" });

    const allowedFields = [
      "name", "title", "department", "email", "phone", "leaveBalance", "monthlySalary",
      "travelAllowance", "lunchAllowance", "mobileAllowance", "deviceUserId"
    ];
    allowedFields.forEach((key) => {
      if(req.body[key] === undefined) return;
      const val = req.body[key];
      // Don't let name/title/department/email be overwritten with a blank value.
      if(["name", "title", "department", "email"].includes(key) && typeof val === "string" && val.trim() === "") return;
      emp[key] = typeof val === "string" ? val.trim() : val;
    });

    await setCollection("employees", employees);
    res.json(sanitizeEmployee(emp));
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/employees/:id/reset-password", async (req, res) => {
  try{
    const { confirmerId, confirmerPassword, newPassword } = req.body || {};
    if(!confirmerId || !confirmerPassword || !newPassword){
      return res.status(400).json({ error: "missing fields" });
    }
    if(String(newPassword).length < 6){
      return res.status(400).json({ error: "new password too short" });
    }

    const employees = await getCollection("employees");
    const confirmer = employees.find(e => e.id === confirmerId);
    if(!confirmer) return res.status(401).json({ error: "invalid confirmation" });

    const ok = await bcrypt.compare(confirmerPassword, confirmer.password);
    if(!ok) return res.status(401).json({ error: "incorrect password" });

    const target = employees.find(e => e.id === req.params.id);
    if(!target) return res.status(404).json({ error: "not found" });

    target.password = await bcrypt.hash(newPassword, 10);
    await setCollection("employees", employees);
    res.json({ ok: true });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.delete("/api/employees/:id", async (req, res) => {
  try{
    const { confirmerId, password } = req.body || {};
    if(!confirmerId || !password){
      return res.status(400).json({ error: "password confirmation required" });
    }

    const employees = await getCollection("employees");
    const confirmer = employees.find(e => e.id === confirmerId);
    if(!confirmer) return res.status(401).json({ error: "invalid confirmation" });

    const ok = await bcrypt.compare(password, confirmer.password);
    if(!ok) return res.status(401).json({ error: "incorrect password" });

    const remaining = employees.filter(e => e.id !== req.params.id);
    await setCollection("employees", remaining);
    res.json({ ok: true });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// এই route এ ফ্রন্টএন্ড থেকে ব্রাউজারে (jsPDF দিয়ে) তৈরি হওয়া একটা PDF
// (Experience/Salary certificate, offer/appointment/promotion/relieving
// letter, NOC ইত্যাদি — base64 এনকোড করা) পাঠানো হয়। এই route সেটাকে
// ডিকোড করে এমপ্লয়ির ইমেইলে অ্যাটাচমেন্ট হিসেবে পাঠায়। SMTP কনফিগার না
// থাকলে বা এমপ্লয়ির ইমেইল না থাকলে, ব্যর্থ হলেও এটা throw করে না —
// mailer.js এর মতোই readable reason সহ { sent:false, reason } রিটার্ন করে।
app.post("/api/documents/email", async (req, res) => {
  try{
    const { employeeId, documentTitle, filename, pdfBase64 } = req.body || {};
    if(!employeeId || !pdfBase64){
      return res.status(400).json({ error: "employeeId and pdfBase64 are required" });
    }

    const employees = await getCollection("employees");
    const employee = employees.find(e => e.id === employeeId);
    if(!employee) return res.status(404).json({ error: "employee not found" });

    const safeTitle = documentTitle || "Document";
    const safeFilename = (filename || "document.pdf").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    const result = await sendMail({
      to: employee.email,
      subject: `Your ${safeTitle} — Global Sustainable Sourcing HR`,
      html: `
        <p>Dear ${employee.name},</p>
        <p>Please find attached your <b>${safeTitle}</b>, generated by the HR Portal on ${new Date().toLocaleDateString()}.</p>
        <p>If anything looks incorrect, please contact HR.</p>
        <p>— Global Sustainable Sourcing, Human Resources</p>
      `,
      attachments: [
        { filename: safeFilename, content: pdfBuffer, contentType: "application/pdf" }
      ]
    });

    res.json(result);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Generic collections (no sensitive data) ----------
// announcements, holidays, leave_requests, bill_claims — এগুলো পুরো
// array একসাথে সেভ হয়, ঠিক আগের window.storage প্যাটার্নের মতোই,
// শুধু এখন PostgreSQL এ যাচ্ছে।
const OPEN_COLLECTIONS = new Set(["announcements", "holidays", "leave_requests", "bill_claims"]);

app.put("/api/collections/:key", async (req, res) => {
  const { key } = req.params;
  if(!OPEN_COLLECTIONS.has(key)){
    return res.status(403).json({ error: "not allowed" });
  }
  try{
    await setCollection(key, req.body.value || []);
    res.json({ ok: true });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Status updates that also email the employee ----------
function leaveStatusEmail(request, status){
  const verb = status === "approved" ? "approved" : "denied";
  const color = status === "approved" ? "#2F6F4E" : "#A6483A";
  return {
    subject: `Your leave request has been ${verb}`,
    html: `
      <div style="font-family:Arial,sans-serif; font-size:14px; color:#222;">
        <p>Hi ${request.employeeName},</p>
        <p>Your leave request has been <b style="color:${color};">${verb}</b> by HR.</p>
        <table style="border-collapse:collapse; margin:12px 0;">
          <tr><td style="padding:4px 10px 4px 0; color:#666;">Dates</td><td style="padding:4px 0;">${request.start} to ${request.end}</td></tr>
          <tr><td style="padding:4px 10px 4px 0; color:#666;">Reason</td><td style="padding:4px 0;">${request.reason}</td></tr>
        </table>
        <p>If you have questions, please reach out to HR.</p>
      </div>
    `
  };
}

function billStatusEmail(claim, status){
  const verb = status === "approved" ? "approved" : "denied";
  const color = status === "approved" ? "#2F6F4E" : "#A6483A";
  return {
    subject: `Your bill claim has been ${verb}`,
    html: `
      <div style="font-family:Arial,sans-serif; font-size:14px; color:#222;">
        <p>Hi ${claim.employeeName},</p>
        <p>Your expense claim has been <b style="color:${color};">${verb}</b> by HR.</p>
        <table style="border-collapse:collapse; margin:12px 0;">
          <tr><td style="padding:4px 10px 4px 0; color:#666;">Category</td><td style="padding:4px 0;">${claim.category}</td></tr>
          <tr><td style="padding:4px 10px 4px 0; color:#666;">Amount</td><td style="padding:4px 0;">৳${claim.amount}</td></tr>
          <tr><td style="padding:4px 10px 4px 0; color:#666;">Description</td><td style="padding:4px 0;">${claim.description}</td></tr>
        </table>
        <p>If you have questions, please reach out to HR.</p>
      </div>
    `
  };
}

app.patch("/api/leave-requests/:id", async (req, res) => {
  try{
    const { status } = req.body || {};
    if(!["approved", "denied", "pending"].includes(status)){
      return res.status(400).json({ error: "invalid status" });
    }
    const requests = await getCollection("leave_requests");
    const request = requests.find(r => r.id === req.params.id);
    if(!request) return res.status(404).json({ error: "not found" });

    request.status = status;
    await setCollection("leave_requests", requests);

    let emailResult = { sent: false, reason: "not_applicable" };
    if(status === "approved" || status === "denied"){
      const employees = await getCollection("employees");
      const employee = employees.find(e => e.id === request.employeeId);
      const { subject, html } = leaveStatusEmail(request, status);
      emailResult = await sendMail({ to: employee ? employee.email : null, subject, html });
    }

    res.json({ ok: true, email: emailResult });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.patch("/api/bill-claims/:id", async (req, res) => {
  try{
    const { status } = req.body || {};
    if(!["approved", "denied", "pending"].includes(status)){
      return res.status(400).json({ error: "invalid status" });
    }
    const claims = await getCollection("bill_claims");
    const claim = claims.find(c => c.id === req.params.id);
    if(!claim) return res.status(404).json({ error: "not found" });

    claim.status = status;
    await setCollection("bill_claims", claims);

    let emailResult = { sent: false, reason: "not_applicable" };
    if(status === "approved" || status === "denied"){
      const employees = await getCollection("employees");
      const employee = employees.find(e => e.id === claim.employeeId);
      const { subject, html } = billStatusEmail(claim, status);
      emailResult = await sendMail({ to: employee ? employee.email : null, subject, html });
    }

    res.json({ ok: true, email: emailResult });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Attendance (ZKTeco device sync) ----------
app.post("/api/attendance/sync", async (req, res) => {
  const result = await pullFromDevice();
  if(!result.ok){
    return res.status(502).json({ error: result.error || "couldn't reach the attendance device" });
  }

  try{
    const employees = await getCollection("employees");
    const byDeviceId = {};
    employees.forEach(e => { if(e.deviceUserId) byDeviceId[String(e.deviceUserId)] = e; });

    const existing = await getCollection("attendance");
    const existingKeys = new Set(existing.map(r => r.deviceUserId + "|" + r.timestamp));

    let added = 0;
    let unmatched = 0;
    result.logs.forEach(log => {
      const timestamp = new Date(log.recordTime).toISOString();
      const dedupeKey = log.deviceUserId + "|" + timestamp;
      if(existingKeys.has(dedupeKey)) return;

      const employee = byDeviceId[String(log.deviceUserId)];
      if(!employee) unmatched++;

      existing.push({
        deviceUserId: String(log.deviceUserId),
        employeeId: employee ? employee.id : null,
        employeeName: employee ? employee.name : `Unmapped device ID ${log.deviceUserId}`,
        timestamp
      });
      existingKeys.add(dedupeKey);
      added++;
    });

    existing.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    await setCollection("attendance", existing);

    res.json({
      ok: true,
      deviceUsers: result.users.length,
      logsFromDevice: result.logs.length,
      newRecordsAdded: added,
      unmatchedDeviceIds: unmatched
    });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});


app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "hr-portal.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HR Portal সার্ভার চলছে: http://localhost:${PORT}`);
});
