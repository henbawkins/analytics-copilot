"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChartRenderer, { parseChartSpec } from "./ChartRenderer";

// Split assistant text into markdown segments and ```chart blocks, rendering
// each chart with Recharts and everything else as GitHub-flavored markdown.
export default function MessageContent({ text }: { text: string }) {
  const parts: Array<
    { kind: "md"; content: string } | { kind: "chart"; content: string }
  > = [];

  const regex = /```chart\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "md", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ kind: "chart", content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "md", content: text.slice(lastIndex) });
  }

  return (
    <div className="md">
      {parts.map((part, i) => {
        if (part.kind === "chart") {
          const spec = parseChartSpec(part.content);
          if (spec) return <ChartRenderer key={i} spec={spec} />;
          // Invalid/incomplete (e.g. mid-stream) — show as code for now.
          return (
            <pre key={i}>
              <code>{part.content}</code>
            </pre>
          );
        }
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {part.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
