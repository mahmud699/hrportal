require("dotenv").config();
const ZKLib = require("node-zklib");

// .env এ ZK_IP, ZK_PORT (ডিফল্ট 4370) সেট করতে হবে — এটা তোমার ZKTeco
// ডিভাইসের নেটওয়ার্ক IP ঠিকানা (ডিভাইসের মেনু থেকে দেখা যায়)।
const ZK_IP = process.env.ZK_IP || "";
const ZK_PORT = parseInt(process.env.ZK_PORT || "4370", 10);

// node-zklib এর নিজের timeout প্যারামিটার সবসময় নির্ভরযোগ্যভাবে কাজ করে
// না — ডিভাইসটা পুরোপুরি বন্ধ/আনরিচেবল থাকলে এটা কখনো কখনো চিরকালের
// জন্য ঝুলে থাকতে পারে। তাই এখানে নিজস্ব একটা হার্ড টাইমআউট (১৫ সেকেন্ড)
// দেওয়া হলো, যাতে API রিকোয়েস্ট কখনো আটকে না থাকে।
function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms/1000}s — device didn't respond`)), ms))
  ]);
}

// ডিভাইস থেকে সব অ্যাটেনডেন্স লগ + রেজিস্টার্ড ইউজার লিস্ট টেনে আনে।
// রিটার্ন করে { ok, logs, users, error }। ডিভাইস অফলাইন বা IP ভুল হলে
// এটা throw করে না, শুধু ok:false আর একটা readable error message দেয়,
// যাতে বাকি সার্ভার/অ্যাপ চলতে থাকে।
async function pullFromDevice(){
  if(!ZK_IP){
    return { ok: false, error: "ZK_IP is not set in .env" };
  }

  const zk = new ZKLib(ZK_IP, ZK_PORT, 10000, 4000);
  try{
    await withTimeout(zk.createSocket(), 15000, "Connecting to device");

    const usersResult = await withTimeout(zk.getUsers(), 15000, "Reading users");
    const logsResult = await withTimeout(zk.getAttendances(), 20000, "Reading attendance logs");

    try{ await withTimeout(zk.disconnect(), 5000, "Disconnecting"); }catch(e){}

    return {
      ok: true,
      users: (usersResult && usersResult.data) || [],
      logs: (logsResult && logsResult.data) || []
    };
  }catch(err){
    try{ await withTimeout(zk.disconnect(), 5000, "Disconnecting"); }catch(e){}
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { pullFromDevice, ZK_IP, ZK_PORT };
