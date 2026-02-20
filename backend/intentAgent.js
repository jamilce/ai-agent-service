const axios = require("axios");

async function detectIntent(question) {
  const prompt = `
You are an intent classification AI.

User Question:
"${question}"

Available data fields inside raw_json.attr:
- fees_string
- requiredDocuments_string
- serviceProcess_string
- conditionsAndRequirements_string
- serviceTime
- subcategory.title

Available relational columns:
- title_en
- title_ar
- language_id

Return STRICT JSON:

{
  "intent": "count | list | fee | documents | process | requirements | time | general",
  "fields": ["list of relevant json paths"],
  "needsAggregation": true/false
}
`;

  const res = await axios.post("http://localhost:11434/api/generate", {
    model: "llama3.1:8b",
    prompt,
    stream: false,
  });

  return JSON.parse(res.data.response);
}

module.exports = { detectIntent };
