"use client";

import { useRef, useState } from "react";
import MessageContent from "./MessageContent";

type Msg = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "List the GA4 properties I have access to",
  "Sessions and users for the last 28 days, with a daily trend chart",
  "Top 10 organic search queries by clicks over the last 28 days",
];

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          <div className="sub">GA4 + Search Console, across all clients</div>
        </div>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask about any client&apos;s traffic or search performance.</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" && <div className="role">Copilot</div>}
            {m.role === "assistant" ? (
              <MessageContent text={m.content || (busy ? "…" : "")} />
            ) : (
              <div>{m.content}</div>
            )}
          </div>
        ))}

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
