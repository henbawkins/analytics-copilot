"use client";

import { useRef, useState } from "react";
import MessageContent from "./MessageContent";
import { exportExcel, exportPdf, extractTables, extractCharts } from "@/lib/export";

type Msg = { role: "user" | "assistant"; content: string };

const EXAMPLE_GROUPS: { label: string; source: string; prompts: string[] }[] = [
  {
    label: "Traffic & engagement",
    source: "GA4",
    prompts: [
      "List the GA4 properties I have access to",
      "Sessions and users for the last 28 days, with a daily trend chart",
      "Compare this month's sessions to last month for [client]",
      "Which channels drove the most conversions in the last 28 days?",
      "Top landing pages by sessions for [client], last 30 days",
      "Traffic by device category for [client] this month",
      "Where is [client]'s traffic coming from geographically?",
    ],
  },
  {
    label: "Organic search (our sites)",
    source: "Search Console",
    prompts: [
      "List the Search Console sites I can access",
      "Top 10 organic search queries by clicks over the last 28 days",
      "Clicks and impressions trend for [client], last 3 months",
      "Which pages gained or lost the most clicks vs the prior period?",
      "What queries are we ranking on page 2 for (positions 11-20)?",
      "Average position trend for [client] over the last 90 days",
      "Mobile vs desktop search performance for [client]",
    ],
  },
  {
    label: "SEO intelligence & competitors",
    source: "Semrush",
    prompts: [
      "Give me a Semrush domain overview for [client].com",
      "What organic keywords does [competitor].com rank for?",
      "Who are [client].com's top organic competitors?",
      "Search volume and difficulty for 'managed it services chicago'",
      "Related keyword ideas for 'cloud backup' sorted by volume",
      "Backlink profile and authority score for [client].com",
      "Compare estimated organic traffic: [client].com vs [competitor].com",
    ],
  },
  {
    label: "Rank tracking",
    source: "Pro Rank Tracker",
    prompts: [
      "List the Pro Rank Tracker groups and tracked sites",
      "How are [client]'s tracked keyword rankings trending this week?",
      "Which tracked keywords moved up or down vs last week for [client]?",
      "Show [client]'s keywords ranking in the top 3, with their best-ever rank",
      "Which tracked keywords fell out of range (NTH) for [client]?",
      "Compare current rank to a month ago for [client]'s tracked terms",
    ],
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  function exportName(ext: string) {
    const now = new Date();
    const stamp = now
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(/:/g, "");
    return `analytics-copilot-${stamp}.${ext}`;
  }

  async function handleExport(index: number, kind: "pdf" | "xlsx") {
    const text = messages[index]?.content ?? "";
    if (!text) return;
    setExporting(`${index}:${kind}`);
    try {
      if (kind === "xlsx") {
        await exportExcel(text, exportName("xlsx"));
      } else {
        const node = contentRefs.current.get(index);
        if (node) await exportPdf(node, exportName("pdf"));
      }
    } catch (err) {
      console.error("Export failed", err);
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  }

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setTools([]);
    scrollToBottom();

    // Placeholder assistant message we'll stream into.
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "text") {
            assistantText += evt.text;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: assistantText,
              };
              return copy;
            });
            scrollToBottom();
          } else if (evt.type === "tool") {
            setTools((t) => [...t, evt.name]);
          } else if (evt.type === "error") {
            assistantText += `\n\n_Error: ${evt.message}_`;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: assistantText,
              };
              return copy;
            });
          }
        }
      }
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `_Error: ${(err as Error).message}_`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
      setTools([]);
      scrollToBottom();
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Analytics Copilot</h1>
          <div className="sub">
            GA4 + Search Console + Semrush + Pro Rank Tracker, across all clients
          </div>
        </div>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <p>
              Ask about any client&apos;s traffic, search performance, SEO, or
              keyword rankings. Replace <code>[client]</code> /{" "}
              <code>[competitor]</code> with a real name — Copilot resolves the
              right property, site, or domain for you.
            </p>
            {EXAMPLE_GROUPS.map((group) => (
              <div key={group.label} className="example-group">
                <div className="example-group-head">
                  {group.label}
                  <span className="example-source">{group.source}</span>
                </div>
                <div className="examples">
                  {group.prompts.map((ex) => (
                    <button key={ex} onClick={() => send(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const streaming = busy && isLast && m.role === "assistant";
          const canExport = m.role === "assistant" && !!m.content && !streaming;
          const hasData =
            canExport &&
            (extractTables(m.content).length > 0 ||
              extractCharts(m.content).length > 0);
          return (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === "assistant" && <div className="role">Copilot</div>}
              {m.role === "assistant" ? (
                <>
                  <div
                    ref={(el) => {
                      if (el) contentRefs.current.set(i, el);
                      else contentRefs.current.delete(i);
                    }}
                  >
                    <MessageContent text={m.content || (busy ? "…" : "")} />
                  </div>
                  {canExport && (
                    <div className="msg-actions">
                      <button
                        onClick={() => handleExport(i, "pdf")}
                        disabled={exporting !== null}
                        title="Download this answer (text, tables, and charts) as a PDF"
                      >
                        {exporting === `${i}:pdf` ? "…" : "⬇ PDF"}
                      </button>
                      {hasData && (
                        <button
                          onClick={() => handleExport(i, "xlsx")}
                          disabled={exporting !== null}
                          title="Download the tables and chart data as an Excel workbook"
                        >
                          {exporting === `${i}:xlsx` ? "…" : "⬇ Excel"}
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div>{m.content}</div>
              )}
            </div>
          );
        })}

        {busy && tools.length > 0 && (
          <div className="bubble assistant">
            {tools.map((t, i) => (
              <span key={i} className="tool-chip">
                ⚙ {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="composer">
        <textarea
          rows={1}
          value={input}
          placeholder="Ask about a client's GA4 or Search Console data…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={busy}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
