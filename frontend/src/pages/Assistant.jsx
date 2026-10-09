import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EmptyState, Notice, Panel, controlClass } from "../components/InsightUI";

const SUGGESTIONS = [
  "Why is the average quality score low today?",
  "Which production line has the most predicted defects?",
  "Summarize today's production data.",
  "Explain this batch prediction.",
];

export default function Assistant({ initialBatchId }) {
  const [question, setQuestion] = useState("");
  const [batchCode, setBatchCode] = useState(initialBatchId || "");
  const [batches, setBatches] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    setBatchCode(initialBatchId || "");
  }, [initialBatchId]);

  useEffect(() => {
    let cancelled = false;
    api.getBatchReport({ days: 30 }).then((rows) => !cancelled && setBatches(rows)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function sendMessage(event, suggestedQuestion) {
    event?.preventDefault();
    const text = (suggestedQuestion ?? question).trim();
    if (!text || sending) return;
    setQuestion("");
    setError(null);
    setMessages((current) => [...current, { role: "user", text }]);
    setSending(true);
    try {
      const response = await api.askAssistant({ question: text, batch_id: batchCode || null });
      setMessages((current) => [...current, {
        role: "assistant",
        text: response.answer,
        provider: response.provider,
        relatedData: response.related_data,
      }]);
    } catch (err) {
      setError(err.message);
      setMessages((current) => [...current, { role: "assistant", text: "I could not retrieve project data for that request." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 min-h-0">
      <div><p className="text-[11px] uppercase tracking-wider text-low">Production-data assistant</p><h1 className="text-xl mt-1">AI assistant</h1></div>
      <Panel title="Project context" action={<span className="text-[10px] text-low">Gemini explains data; prediction models remain authoritative</span>}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-mid flex-1">Answers are grounded in recorded production predictions and batch data. Missing data is called out explicitly.</p>
          <label className="flex items-center gap-2 text-[10px] uppercase text-low shrink-0">Batch
            <select className={controlClass} value={batchCode} onChange={(event) => setBatchCode(event.target.value)}><option value="">Production overview</option>{batches.map((batch) => <option key={`${batch.batch_code}-${batch.created_at}`} value={batch.batch_code}>{batch.batch_code}</option>)}</select>
          </label>
        </div>
      </Panel>

      <section className="panel flex flex-col min-h-[460px]">
        <div className="panel-header"><h2>Conversation</h2><span className="text-[10px] uppercase text-low">{messages.length} messages</span></div>
        <div className="flex-1 min-h-64 max-h-[52vh] overflow-y-auto p-4 flex flex-col gap-4">
          {!messages.length && <div className="my-auto"><EmptyState>Ask about live production records, quality predictions, or a selected batch.</EmptyState><div className="flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={(event) => sendMessage(event, suggestion)} className="border border-line-strong px-3 py-2 text-xs text-mid hover:text-hi hover:border-coolant">{suggestion}</button>)}</div></div>}
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[90%] ${message.role === "user" ? "self-end" : "self-start"}`}>
            <p className="text-[10px] uppercase tracking-wider text-low mb-1">{message.role === "user" ? "Operator" : `Assistant${message.provider ? ` · ${message.provider}` : ""}`}</p>
            <div className={`px-3 py-2.5 text-sm leading-relaxed border ${message.role === "user" ? "bg-bg2 border-line-strong text-hi" : "bg-bg1 border-line text-mid"}`}>{message.text}</div>
            {message.role === "assistant" && message.relatedData && <details className="mt-2 text-xs text-low"><summary className="cursor-pointer hover:text-mid">Related production data</summary><pre className="mt-2 p-3 bg-bg0 border border-line overflow-auto max-h-44 text-[10px]">{JSON.stringify(message.relatedData, null, 2)}</pre></details>}
          </div>)}
          {sending && <p className="text-xs text-low">Checking current project records…</p>}
          <div ref={endRef} />
        </div>
        {error && <div className="px-4 pb-3"><Notice tone="warn">Assistant request failed: {error}</Notice></div>}
        <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t border-line">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} disabled={sending} className={`${controlClass} flex-1 min-w-0`} placeholder="Ask about recorded production data…" aria-label="Ask the production data assistant" />
          <button type="submit" disabled={sending || !question.trim()} className="px-4 border border-molten text-molten hover:bg-molten/10 disabled:opacity-40 text-sm">Send</button>
        </form>
      </section>
    </div>
  );
}