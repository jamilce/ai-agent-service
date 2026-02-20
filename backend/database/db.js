const sqlite3 = require("sqlite3").verbose();

// Initialize the database connection
const db = new sqlite3.Database("./services.db");

db.serialize(() => {
  // 1. Create the services table
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_code TEXT,
      title_en TEXT,
      title_ar TEXT,
      language_id INTEGER,
      raw_json TEXT
    )
  `);

  // 2. Create the conversations table (separate call)
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;
