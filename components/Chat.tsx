"use client";

import { useRef, useState } from "react";
import MessageContent from "./MessageContent";
import { exportExcel, exportPdf, extractTables, extractCharts } from "@/lib/export";

type Msg = { role: "user" | "assistant"; content: string };

const EXAMPLE_GROUPS: { label: string; source: string; prompts: string[] }[] = [
  {
    label: "Full reports",
    source: "All sources · export to PDF",
    prompts: [
      "Full SEO snapshot for [client] — then I'll export it as a PDF",
      "Monthly client review for [client]: traffic, organic search, rankings & competitors",
      "How did [client] do this month vs last? Summarize across every source",
      "[client] vs [competitor]: side-by-side SEO health check",
    ],
  },
  {
    label: "Traffic & engagement",
    source: "GA4",
    prompts: [
      "List the GA4 properties I can access",
      "Sessions & users for [client], last 28 days, with a daily trend chart",
      "[client] this month vs last — sessions, conversions, and what changed",
      "Which channels drove the most conversions for [client], last 28 days?",
      "Top landing pages by sessions for [client], last 30 days",
      "New vs returning users and engagement rate for [client] this month",
      "[client]'s traffic by channel and top countries",
    ],
  },
  {
    label: "Organic search (our sites)",
    source: "Search Console",
    prompts: [
      "List the Search Console sites I can access",
      "[client]'s top organic queries by clicks, last 28 days",
      "Clicks & impressions trend for [client], last 3 months (chart)",
      "Quick wins for [client]: queries on page 2 (positions 11-20) with high impressions",
      "Which pages gained or lost the most clicks for [client] vs the prior 28 days?",
      "Average position trend for [client] over 90 days",
      "[client]'s top pages by clicks, and which queries each ranks for",
    ],
  },
  {
    label: "SEO intelligence & competitors",
    source: "Semrush",
    prompts: [
      "Semrush domain overview for [client].com",
      "Top organic keywords [competitor].com ranks for",
      "Who are [client].com's organic competitors?",
      "Content gap: keywords [competitor].com ranks for that [client].com doesn't",
      "Backlink profile & authority: [client].com vs [competitor].com",
      "Search volume & difficulty for 'managed IT services [city]'",
      "Keyword ideas around 'cloud backup' sorted by volume",
    ],
  },
  {
    label: "Rank tracking",
    source: "Pro Rank Tracker",
    prompts: [
      "List the Pro Rank Tracker groups and tracked sites",
      "How are [client]'s tracked rankings trending this week?",
      "[client]'s biggest rank gains and losses vs last week",
      "[client]'s keywords ranking in the top 3, with their best-ever rank",
      "Tracked keywords that dropped out of range (NTH) for [client]",
      "[client]'s rank movement vs a month ago",
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function fillInput(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

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
        if (node) {
          // The user question that produced this answer (previous message).
          const query = messages[index - 1]?.content;
          await exportPdf(node, exportName("pdf"), { query });
        }
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
              keyword rankings — across GA4, Search Console, Semrush, and Pro
              Rank Tracker. Replace <code>[client]</code> /{" "}
              <code>[competitor]</code> with a real name and Copilot resolves the
              right property, site, or domain for you. Every answer can be
              exported to a branded <strong>PDF</strong> or to{" "}
              <strong>Excel</strong>.
            </p>
            {EXAMPLE_GROUPS.map((group) => (
              <div key={group.label} className="example-group">
                <div className="example-group-head">
                  {group.label}
                  <span className="example-source">{group.source}</span>
                </div>
                <div className="examples">
                  {group.prompts.map((ex) => (
                    <button key={ex} onClick={() => fillInput(ex)}>
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
          ref={inputRef}
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
