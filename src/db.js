const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  // Fail fast if the connection string is missing.
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = { pool };
