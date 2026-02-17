const axios = require("axios");

async function semanticSearch(question) {
  const embed = await axios.post(
    "http://localhost:11434/api/embeddings",
    {
      model: "nomic-embed-text",
      prompt: question
    }
  );

  return embed.data.embedding;
}

module.exports = { semanticSearch };
