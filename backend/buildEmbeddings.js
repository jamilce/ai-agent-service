const db = require("./db");
const { getEmbedding } = require("./embedding");

async function build() {
  db.all("SELECT id, title_en, title_ar, language_id, raw_json FROM services", async (err, rows) => {
    if (err) throw err;

    for (const row of rows) {
      const parsed = JSON.parse(row.raw_json);
      const isArabic = row.language_id === 2;
      const title = isArabic ? row.title_ar : row.title_en;
      const subcategory = parsed.attr?.subcategory?.title || "";
      const intro = parsed.introText || "";
      const cleanText = `
Language: ${isArabic ? "AR" : "EN"}
Title: ${title || ""}
Intro: ${intro}
Subcategory: ${subcategory}
`;
      const embedding = await getEmbedding(cleanText);
      await new Promise((resolve, reject) => {
        db.run("UPDATE services SET embedding = ? WHERE id = ?", [JSON.stringify(embedding), row.id], (err) => (err ? reject(err) : resolve()));
      });

      console.log("Embedded:", row.id);
    }

    console.log("Done.");
  });
}

build();
