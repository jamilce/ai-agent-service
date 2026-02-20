const db = require("./database/db");

const extractKeys = (obj, prefix = "") => {
  let keys = [];

  for (let key in obj) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);

    if (typeof obj[key] === "object" && obj[key] !== null) {
      keys = keys.concat(extractKeys(obj[key], path));
    }
  }

  return keys;
};

const getJsonSchema = () =>
  new Promise((resolve, reject) => {
    db.get("SELECT raw_json FROM services LIMIT 1", [], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve("");

      try {
        const parsed = JSON.parse(row.raw_json);
        const keys = extractKeys(parsed);
        resolve(keys.join("\n"));
      } catch (e) {
        resolve("");
      }
    });
  });

module.exports = { getJsonSchema };
