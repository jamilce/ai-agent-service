const axios = require("axios");

async function decideAction(question) {
  const prompt = `
You are a routing AI.

If the user question requires:
- counting services
- listing services
- service fees
- cost
- service details
- analytics about services

Then choose: query_db

If the question is general knowledge unrelated to services, choose: direct_answer

Always choose query_db if the question mentions "service" or "services".

Return JSON only:

{
  "action": "query_db"
}

or

{
  "action": "direct_answer"
}

Question:
${question}
`;

  const response = await axios.post(
    "http://localhost:11434/api/generate",
    {
      model: "llama3.2",
      prompt,
      stream: false
    }
  );

  const text = response.data.response
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    return { action: "query_db" }; // fallback safety
  }
}

module.exports = { decideAction };
