const db = require("./db");

function getSchema() {
  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(services);", [], (err, columns) => {
      if (err) return reject(err);

      const schema = columns.map((col) => `${col.name} (${col.type})`).join("\n");

      resolve(schema);
    });
  });
}

module.exports = { getSchema };
