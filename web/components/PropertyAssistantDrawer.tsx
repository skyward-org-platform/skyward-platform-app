"use client";

// Property Assistant Drawer — right-side slide-over chat for the property
// scope. Streams SSE from /api/property/ask/[slug] and renders token-level
// deltas plus inline tool-use status lines. Conversation state is local
// to the component (refresh clears it) at this phase.

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { applyPropertyAssistantProposal } from "@/app/properties/[slug]/property-assistant-actions";

type ToolUseRecord = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: { ok: boolean; error?: string; data?: unknown };
};

type ProposalRecord = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  count: number;
  state: "pending" | "applying" | "applied" | "error";
  result?: string;
};

type Message =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      toolUses?: ToolUseRecord[];
      proposals?: ProposalRecord[];
    };

export function PropertyAssistantDrawer({
  open,
  onClose,
  propertySlug,
}: {
  open: boolean;
  onClose: () => void;
  propertySlug: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function mutateLastAssistant(fn: (msg: Message & { role: "assistant" }) => Message) {
    setMessages((curr) => {
      const last = curr[curr.length - 1];
      if (!last || last.role !== "assistant") return curr;
      return [...curr.slice(0, -1), fn(last)];
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    // Capture history snapshot BEFORE appending the new user message +
    // assistant placeholder, so we don't ship the in-progress turn.
    const history = messages.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    setMessages((curr) => [
      ...curr,
      { role: "user", text },
      { role: "assistant", text: "", toolUses: [], proposals: [] },
    ]);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      const res = await fetch(
        `/api/property/ask/${encodeURIComponent(propertySlug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            route: {
              pathname: pathname ?? "",
              search: search?.toString() ?? "",
            },
          }),
        },
      );
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf("\n\n");
        while (idx >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) {
            idx = buf.indexOf("\n\n");
            continue;
          }
          try {
            const payload = JSON.parse(dataLine.slice("data: ".length));
            if (payload.event === "delta" && typeof payload.text === "string") {
              mutateLastAssistant((m) => ({ ...m, text: m.text + payload.text }));
            } else if (payload.event === "tool_use") {
              mutateLastAssistant((m) => ({
                ...m,
                toolUses: [
                  ...(m.toolUses ?? []),
                  {
                    id: String(payload.id),
                    name: String(payload.name),
                    input: (payload.input as Record<string, unknown>) ?? {},
                  },
                ],
              }));
            } else if (payload.event === "tool_result") {
              mutateLastAssistant((m) => ({
                ...m,
                toolUses: (m.toolUses ?? []).map((t) =>
                  t.id === payload.id
                    ? {
                        ...t,
                        result: payload.result as ToolUseRecord["result"],
                      }
                    : t,
                ),
              }));
            } else if (payload.event === "proposal") {
              mutateLastAssistant((m) => ({
                ...m,
                proposals: [
                  ...(m.proposals ?? []),
                  {
                    id: String(payload.id),
                    tool: String(payload.proposal.tool),
                    input:
                      (payload.proposal.input as Record<string, unknown>) ?? {},
                    summary: String(payload.proposal.summary ?? ""),
                    count: Number(payload.proposal.count ?? 0),
                    state: "pending",
                  },
                ],
              }));
            } else if (payload.event === "error") {
              setError(payload.message ?? "Stream error");
            } else if (payload.event === "done") {
              // No-op — the reader will close.
            }
          } catch {
            // ignore malformed
          }
          idx = buf.indexOf("\n\n");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-screen w-[480px] bg-card border-l z-50 shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="px-4 py-3 border-b flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">
              Property Assistant
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {propertySlug}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] leading-none text-muted-foreground hover:text-foreground shrink-0 px-1"
            aria-label="Close Property Assistant"
          >
            ×
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[12px]"
        >
          {messages.length === 0 ? (
            <p className="italic text-muted-foreground">
              Ask me anything about this property. Try: &ldquo;What&rsquo;s
              the status of Phase 1?&rdquo;
            </p>
          ) : (
            messages.map((m, idx) => {
              if (m.role === "user") {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[90%] bg-foreground text-background rounded-2xl rounded-tr-md px-3 py-1.5 whitespace-pre-wrap leading-relaxed">
                      {m.text}
                    </div>
                  </div>
                );
              }
              return (
                <div key={idx} className="flex flex-col items-start gap-1">
                  <div className="max-w-[90%] bg-muted/40 rounded-2xl rounded-tl-md px-3 py-1.5 whitespace-pre-wrap leading-relaxed">
                    {m.text ||
                      (streaming && idx === messages.length - 1 ? (
                        <span className="italic text-muted-foreground animate-pulse">
                          Thinking…
                        </span>
                      ) : (
                        ""
                      ))}
                  </div>
                  {m.toolUses && m.toolUses.length > 0 && (
                    <ul className="font-mono text-[10px] text-muted-foreground space-y-0.5 pl-1">
                      {m.toolUses.map((t) => (
                        <li key={t.id}>{renderToolLine(t)}</li>
                      ))}
                    </ul>
                  )}
                  {m.proposals && m.proposals.length > 0 && (
                    <div className="mt-2 space-y-2 w-[90%]">
                      {m.proposals.map((p) => (
                        <ProposalCard
                          key={p.id}
                          proposal={p}
                          propertySlug={propertySlug}
                          onUpdate={(state, result) => {
                            setMessages((msgs) => {
                              const copy = [...msgs];
                              for (const msg of copy) {
                                if (msg.role !== "assistant" || !msg.proposals)
                                  continue;
                                const i = msg.proposals.findIndex(
                                  (x) => x.id === p.id,
                                );
                                if (i >= 0) {
                                  msg.proposals[i] = {
                                    ...msg.proposals[i],
                                    state,
                                    result,
                                  };
                                }
                              }
                              return copy;
                            });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {error && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this property…"
              disabled={streaming}
              className="flex-1 text-[12px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="text-[12px] font-medium px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {streaming ? "…" : "Send"}
            </button>
          </form>
        </footer>
      </aside>
    </>
  );
}

function renderToolLine(t: ToolUseRecord): string {
  if (!t.result) return `→ ${t.name}…`;
  if (t.result.ok) return `✓ ${t.name}`;
  return `✗ ${t.name}: ${t.result.error ?? "failed"}`;
}

function ProposalCard({
  proposal,
  propertySlug,
  onUpdate,
}: {
  proposal: ProposalRecord;
  propertySlug: string;
  onUpdate: (state: ProposalRecord["state"], result?: string) => void;
}) {
  const handleApply = async () => {
    onUpdate("applying");
    const res = await applyPropertyAssistantProposal(propertySlug, {
      tool: proposal.tool,
      input: proposal.input,
      summary: proposal.summary,
      count: proposal.count,
    });
    if (res.ok) {
      onUpdate("applied", res.summary);
    } else {
      onUpdate("error", res.error);
    }
  };
  const handleDiscard = () => onUpdate("error", "Discarded by operator.");

  return (
    <div className="border rounded-md px-3 py-2 bg-card text-[11px]">
      <div className="font-semibold mb-1 text-[11.5px]">
        Proposal: {proposal.tool}
      </div>
      <div className="text-muted-foreground leading-snug mb-2">
        {proposal.summary}
      </div>
      {proposal.state === "pending" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] hover:bg-emerald-700"
          >
            Apply ({proposal.count})
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="px-2 py-1 border rounded text-[11px] hover:bg-muted/50"
          >
            Discard
          </button>
        </div>
      )}
      {proposal.state === "applying" && (
        <div className="text-muted-foreground italic">Applying…</div>
      )}
      {proposal.state === "applied" && (
        <div className="text-emerald-700">✓ {proposal.result}</div>
      )}
      {proposal.state === "error" && (
        <div className="text-rose-700">✗ {proposal.result}</div>
      )}
    </div>
  );
}
