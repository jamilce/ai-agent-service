const db = require("./database/db");
const { getEmbedding } = require("./embedding");

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function semanticSearch(question, topN = 20, lang = "en") {
  const queryEmbedding = await getEmbedding(question);
  const languageId = lang === "ar" ? 2 : 1;

  return new Promise((resolve, reject) => {
    db.all("SELECT id, embedding FROM services WHERE embedding IS NOT NULL AND language_id = ?", [languageId], (err, rows) => {
      if (err) return reject(err);

      const scored = rows.map((row) => {
        const emb = JSON.parse(row.embedding);
        return {
          id: row.id,
          score: cosineSimilarity(queryEmbedding, emb),
        };
      });

      scored.sort((a, b) => b.score - a.score);

      resolve(scored.slice(0, topN).map((r) => r.id));
    });
  });
}

module.exports = { semanticSearch };
