const db = require("./db");

const saveMessage = (sessionId, role, message) =>
  new Promise((resolve, reject) => {
    db.run("INSERT INTO conversations (session_id, role, message) VALUES (?, ?, ?)", [sessionId, role, message], (err) => (err ? reject(err) : resolve()));
  });

const getRecentMessages = (sessionId) =>
  new Promise((resolve, reject) => {
    db.all("SELECT role, message FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT 5", [sessionId], (err, rows) =>
      err ? reject(err) : resolve(rows.reverse()),
    );
  });

module.exports = { saveMessage, getRecentMessages };
