const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const pino = require("pino");
const { semanticSearch } = require("./vectorSearch");

const db = require("./database/db");
const { decideAction } = require("./agent");
const { generateSQL } = require("./sqlAgent");
const { getJsonSchema } = require("./jsonSchema");
const { saveMessage, getRecentMessages } = require("./memory");

const app = express();
const logger = pino({ level: "info" });

app.use(cors());
app.use(express.json());

/* -----------------------------
   Rate Limiting
----------------------------- */

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
  }),
);

/* -----------------------------
   Schema Introspection
----------------------------- */

let schemaCache = null;

const getSchema = () =>
  new Promise((resolve, reject) => {
    if (schemaCache) return resolve(schemaCache);

    db.all("PRAGMA table_info(services)", (err, rows) => {
      if (err) return reject(err);

      const columns = rows.map((r) => `${r.name} (${r.type})`).join("\n");

      schemaCache = `
Table: services
Columns:
${columns}
      `;
      resolve(schemaCache);
    });
  });

/* -----------------------------
   SQL Safety
----------------------------- */

const sanitizeSQL = (sql) =>
  sql
    .replace(/```sql/gi, "")
    .replace(/```/g, "")
    .trim()
    .replace(/;$/, "");

const isSafeSQL = (sql) => {
  if (!/^select\s+/i.test(sql)) return false;

  const forbidden = ["insert", "update", "delete", "drop", "alter"];
  return !forbidden.some((w) => sql.toLowerCase().includes(w));
};

const executeSQL = (sql) =>
  new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const normalizeResult = (rows) => {
  if (!rows || rows.length === 0) return "0";

  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    return String(Object.values(rows[0])[0]);
  }

  return JSON.stringify(rows);
};

/* =========================================================
   STREAM ENDPOINT
========================================================= */

app.post("/ask/stream", async (req, res) => {
  const { question, lang } = req.body;
  const sessionId = req.headers["x-session-id"] || "default";
  console.log("STREAM HIT:", question);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const cleanText = (text) => {
    return text
      .replace(/\s+([.,!?])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+'/g, "'")
      .replace(/'\s+/g, "'");
  };
  const normalizeStreamText = (text) =>
    text
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,:;!?])/g, "$1")
      .trimStart();

  const send = (msg) => res.write(`data: ${msg}\n\n`);

  try {
    const schema = await getSchema();
    const jsonSchema = await getJsonSchema();
    const history = await getRecentMessages(sessionId);

    const memoryContext = history.map((m) => `${m.role.toUpperCase()}: ${m.message}`).join("\n");

    /* -------- Safe Decision -------- */

    let decision;
    try {
      decision = await decideAction(question);
      if (!decision || typeof decision !== "object") {
        decision = { action: "query_db" };
      }
    } catch {
      decision = { action: "query_db" };
    }

    const analyticalKeywords = ["how many", "count", "list", "fee", "fees", "cost", "price", "services"];

    if (analyticalKeywords.some((k) => question.toLowerCase().includes(k))) {
      decision.action = "query_db";
    }

    /* ======================================================
       DIRECT ANSWER (NO DB)
    ====================================================== */

    if (decision.action === "direct_answer") {
      let response;
      try {
        response = await axios.post(
          "http://localhost:11434/api/generate",
          {
            model: "llama3.1:8b",
            prompt: question,
            stream: true,
          },
          { responseType: "stream" },
        );
      } catch (err) {
        logger.error(err.message);
        send("[ERROR]");
        return res.end();
      }

      response.data.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) send(cleanText(parsed.response));
            if (parsed.done) {
              send("[DONE]");
              res.end();
            }
          } catch {}
        }
      });

      return;
    }

    /* ======================================================
      semantic Search
    ====================================================== */

    const relevantIds = await semanticSearch(question, 30, lang);

    if (relevantIds.length === 0) {
      send("No relevant services found.");
      send("[DONE]");
      return res.end();
    }
    logger.info("Hybrid semantic retrieval executed");
    logger.info({ relevantIdsCount: relevantIds.length }, "Semantic match count");

    /* -------- Execute with timeout -------- */

    let rows;

    try {
      if (question.toLowerCase().includes("how many")) {
        rows = [{ count: relevantIds.length }];
      } else {
        const titleCol = lang === "ar" ? "title_ar" : "title_en";
        rows = await executeSQL(`SELECT service_code, ${titleCol} AS title, raw_json FROM services WHERE id IN (${relevantIds.join(",")})`);
      }
    } catch (err) {
      logger.warn("AI Agent has some issue while generating answer, retrying once. Error:", err.message);

      const retryPrompt = `
The following SQL failed:

${sql}

Error:
${err.message}

Schema:
${schema}

JSON Fields:
${jsonSchema}

Fix the SQL.
Return ONLY valid SELECT.
      `;

      const retry = await axios.post("http://localhost:11434/api/generate", {
        model: "llama3.1:8b",
        prompt: retryPrompt,
        stream: false,
      });

      sql = sanitizeSQL(retry.data.response);

      if (!isSafeSQL(sql)) {
        send("SQL correction failed.");
        send("[DONE]");
        return res.end();
      }

      rows = await executeSQL(sql);
    }

    const resultText = normalizeResult(rows);

    /* ======================================================
       FINAL SINGLE LLM CALL (NO DOUBLE REASONING)
    ====================================================== */

    let response;
    try {
      response = await axios.post(
        "http://localhost:11434/api/generate",
        {
          model: "llama3.1:8b",
          prompt: `
You are a Ministry of Climate Change and Environment UAE government services AI assistant.

User Question:
${question}

Relevant Services Data:
${resultText}

Instructions:
- Answer ONLY what the user asked.
- If user asked about fees, respond ONLY with fee information.
- Do NOT include statistics.
- Do NOT include downloadable forms.
- Do NOT include unrelated details.
- Format clearly.
- No extra spacing between characters.
- Professional tone.

Rules:
- Base answer ONLY on provided data.
- If numeric result, respond directly.
- If list, summarize.
- Do NOT invent data.
- Respond in ${lang === "ar" ? "Arabic" : "English"}.
`,
          stream: true,
        },
        { responseType: "stream" },
      );
    } catch (err) {
      logger.error(err.message);
      send("[ERROR]");
      return res.end();
    }

    let buffer = "";

    response.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);

          if (parsed.response) {
            send(normalizeStreamText(parsed.response));
          }

          if (parsed.done) {
            send("[DONE]");
            return res.end();
          }
        } catch (err) {
          console.error("Stream parse error:", err.message);
        }
      }
    });

    response.data.on("error", (err) => {
      console.error("Ollama stream error:", err.message);
      send("[ERROR]");
      res.end();
    });
  } catch (err) {
    logger.error(err);
    send("[ERROR]");
    res.end();
  }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(5000, () => {
  logger.info("Backend running on http://localhost:5000");
});
