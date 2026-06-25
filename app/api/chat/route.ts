import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { tools, dispatchTool, SYSTEM_PROMPT } from "@/lib/tools";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingMessage = { role: "user" | "assistant"; content: string };

// Server-Sent-Events-style streaming. We emit small JSON events:
//   { type: "text", text }        incremental answer text
//   { type: "tool", name }        a tool is being run (for UX)
//   { type: "done" }              turn complete
//   { type: "error", message }    something failed
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: { messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const incoming = body.messages ?? [];
  if (incoming.length === 0) {
    return new Response(JSON.stringify({ error: "No messages" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const messages: Anthropic.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  // Anchor relative dates by prepending today's date to the latest user turn.
  const lastUser = messages[messages.length - 1];
  if (lastUser?.role === "user" && typeof lastUser.content === "string") {
    lastUser.content = `(Today is ${today}.)\n\n${lastUser.content}`;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const anthropic = getAnthropic();
        // Manual agentic loop: stream each assistant turn, run any tools it
        // requests, feed the results back, and continue until it stops.
        const MAX_TURNS = 10;
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const sdkStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: SYSTEM_PROMPT,
            tools,
            messages,
          });

          sdkStream.on("text", (delta) => send({ type: "text", text: delta }));

          const final = await sdkStream.finalMessage();
          messages.push({ role: "assistant", content: final.content });

          if (final.stop_reason !== "tool_use") break;

          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ type: "tool", name: tu.name });
            try {
              const result = await dispatchTool(
                tu.name,
                tu.input as Record<string, unknown>,
              );
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(result),
              });
            } catch (err) {
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `Error: ${(err as Error).message}`,
                is_error: true,
              });
            }
          }

          messages.push({ role: "user", content: results });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
