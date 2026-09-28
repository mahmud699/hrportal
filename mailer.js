require("dotenv").config();
const nodemailer = require("nodemailer");

// SMTP কনফিগ .env থেকে আসে। কনফিগ না দেওয়া থাকলে (SMTP_HOST খালি),
// মেইল পাঠানোর চেষ্টা না করে শুধু কনসোলে লগ করে রাখে — যাতে ইমেইল সেটআপ
// ছাড়াই বাকি অ্যাপ স্বাভাবিকভাবে চলতে থাকে।
const isConfigured = !!process.env.SMTP_HOST;

let transporter = null;
if(isConfigured){
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true", // true হলে port 465 (SSL), false হলে port 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// to: ইমেইল ঠিকানা, subject: বিষয়, html: মেইলের ভেতরের কনটেন্ট (HTML),
// attachments: (optional) nodemailer-এর attachment অবজেক্টের array,
// যেমন [{ filename, content: Buffer, contentType }] — PDF সার্টিফিকেট/লেটার
// ইমেইলে জুড়ে পাঠানোর জন্য এটা ব্যবহার হয়।
// রিটার্ন করে { sent: true/false, reason }। মেইল পাঠাতে ব্যর্থ হলেও এটা
// throw করে না — কলার (server.js) যেন এর জন্য মূল কাজ (approve/deny) আটকে না যায়।
async function sendMail({ to, subject, html, attachments }){
  if(!isConfigured){
    console.log(`[mailer] SMTP not configured — skipped email to ${to}: ${subject}`);
    return { sent: false, reason: "smtp_not_configured" };
  }
  if(!to){
    console.log(`[mailer] No recipient email on file — skipped: ${subject}`);
    return { sent: false, reason: "no_recipient" };
  }
  try{
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      attachments: attachments || []
    });
    return { sent: true };
  }catch(err){
    console.error("[mailer] Failed to send email:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendMail };
