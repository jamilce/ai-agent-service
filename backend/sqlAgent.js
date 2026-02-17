const axios = require("axios");

async function generateSQL(question, lang, schema, jsonSchema, memoryContext) {
  const prompt = `
You are a senior SQLite expert.

Database Schema:
${schema}

JSON Fields inside raw_json:
${jsonSchema}

Conversation Context:
${memoryContext}

User Question:
${question}

Rules:
- Use SQLite syntax.
- Table name is: services
- Use json_extract(raw_json, '$.attr.fees_string') when needed
- Use json_extract(raw_json, '$.attr.serviceTime') when needed
- Always filter by language_id (${lang === "ar" ? 2 : 1})
- Only return ONE valid SELECT statement.
- Do NOT explain.
- Do NOT wrap in markdown.
`;

  const response = await axios.post("http://localhost:11434/api/generate", {
    model: "llama3.2:latest",
    prompt,
    stream: false,
  });

  return response.data.response.trim();
}

module.exports = { generateSQL };
