require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "hr_portal"
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
});

module.exports = pool;
