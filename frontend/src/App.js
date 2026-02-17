import { useRef, useState, useEffect } from "react";
import "./App.css";

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [lang, setLang] = useState("en");
  const [isLoading, setIsLoading] = useState(false);

  const botIndexRef = useRef(null);
  const messagesEndRef = useRef(null);
  const controllerRef = useRef(null);

  const sessionId = useRef(localStorage.getItem("session_id") || crypto.randomUUID());

  useEffect(() => {
    localStorage.setItem("session_id", sessionId.current);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const labels = {
    en: {
      title: "MOCCAE - AI Assistant",
      subtitle: "Ask about services and get quick answers",
      placeholder: "Ask anything...",
      send: "Send",
      toggle: "العربية",
      welcome: "Ask a question to get started",
      error: "Something went wrong. Please try again.",
    },
    ar: {
      title: "مساعد الخدمات",
      subtitle: "اسأل عن الخدمات واحصل على إجابات سريعة",
      placeholder: "اكتب سؤالك هنا...",
      send: "إرسال",
      toggle: "English",
      welcome: "ابدأ بطرح سؤال",
      error: "حدث خطأ. حاول مرة أخرى.",
    },
  };

  const t = labels[lang];

  const send = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);

    // Cancel previous stream if exists
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    controllerRef.current = new AbortController();

    setMessages((prev) => {
      const next = [...prev, { role: "user", text: trimmed }, { role: "bot", text: "" }];
      botIndexRef.current = next.length - 1;
      return next;
    });

    setQuestion("");

    try {
      const response = await fetch("http://localhost:5000/ask/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId.current,
        },
        body: JSON.stringify({ question: trimmed, lang }),
        signal: controllerRef.current.signal,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");

          for (let line of lines) {
            if (!line.startsWith("data:")) continue;

            let data = line.replace("data:", "");

            if (data === "[DONE]") {
              setIsLoading(false);
              return;
            }

            if (data === "[ERROR]") {
              throw new Error("Stream error");
            }

            setMessages((prev) => prev.map((m, idx) => (idx === botIndexRef.current ? { ...m, text: m.text + data } : m)));
          }
        }
      }
    } catch (error) {
      setMessages((prev) => prev.map((m, idx) => (idx === botIndexRef.current ? { ...m, text: t.error } : m)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const toggleLang = () => setLang((prev) => (prev === "en" ? "ar" : "en"));

  return (
    <div className="app" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="header">
        <div className="header-content">
          <div className="header-text">
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <button className="lang-toggle" onClick={toggleLang}>
            {t.toggle}
          </button>
        </div>
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.length === 0 && <div className="welcome-message">{t.welcome}</div>}

          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-content">
                <p>{m.text}</p>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-form">
          <input
            className="message-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            disabled={isLoading}
          />
          <button className="send-button" onClick={send} disabled={isLoading}>
            {t.send}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
