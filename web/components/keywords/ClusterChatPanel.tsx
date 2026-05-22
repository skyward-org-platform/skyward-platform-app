"use client";

// Cluster-scoped agent chat panel, rendered inside the ClusterDrawer.
// Mirrors the BrandDnaAssistant UI pattern (message list + composer),
// simplified for v1:
//   - Server action is blocking (no SSE stream); we just refresh the
//     full message list after each round-trip.
//   - Messages persist server-side in cluster_chat_message — the panel
//     lazy-loads the thread on mount (one fetch per drawer-open).
//   - Tool calls (role='tool' or assistant turns with non-null
//     tool_calls) render in a small expandable section so the operator
//     can audit what the agent did.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Markdownish } from "@/components/Markdownish";
import {
  getClusterChatThread,
  postClusterChatMessage,
} from "@/app/properties/[slug]/keywords/actions";
import type { ChatMessage } from "@/lib/cluster-chat";

const SUGGESTED_PROMPTS = [
  "Are there related keywords we're missing in this cluster?",
  "What URLs should target this cluster?",
  "Which member keywords look like noise we should exclude?",
  "What's the search intent across this cluster?",
];

export function ClusterChatPanel({
  propertySlug,
  clusterId,
  clusterName,
}: {
  propertySlug: string;
  clusterId: string;
  clusterName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Lazy-load the thread on mount. The drawer instance is recreated when
  // the cluster changes, so this effect runs once per drawer-open.
  useEffect(() => {
    let cancelled = false;
    getClusterChatThread(propertySlug, clusterId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setMessages(res.messages);
        } else {
          setLoadError(res.error);
          setMessages([]);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertySlug, clusterId]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  const send = useCallback(
    (text?: string) => {
      const value = (text ?? input).trim();
      if (!value || pending) return;
      setSendError(null);
      // Optimistic append of the user message so the UI feels responsive.
      setMessages((m) => [
        ...(m ?? []),
        {
          id: `optimistic-${Date.now()}`,
          thread_id: "pending",
          role: "user",
          content: value,
          tool_calls: null,
          tool_results: null,
          created_at: new Date().toISOString(),
        },
      ]);
      setInput("");
      startTransition(async () => {
        const res = await postClusterChatMessage(propertySlug, clusterId, value);
        if (res.ok) {
          setMessages(res.messages);
        } else {
          setSendError(res.error);
          // Roll back optimistic message on failure.
          setMessages((m) => (m ?? []).filter((x) => !x.id.startsWith("optimistic-")));
        }
        inputRef.current?.focus();
      });
    },
    [input, pending, propertySlug, clusterId],
  );

  if (messages === null) {
    return (
      <p className="text-[11.5px] text-muted-foreground italic">
        Loading chat…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
          <strong className="font-semibold">Load error:</strong> {loadError}
        </div>
      )}

      <div
        ref={scrollRef}
        className="max-h-[320px] min-h-[80px] overflow-y-auto rounded border bg-muted/20 px-2.5 py-2 space-y-2"
      >
        {messages.length === 0 ? (
          <EmptyState
            clusterName={clusterName}
            disabled={pending}
            onPick={(p) => send(p)}
          />
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}
        {pending && (
          <div className="text-[11px] text-muted-foreground italic animate-pulse">
            Thinking…
          </div>
        )}
      </div>

      {sendError && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
          <strong className="font-semibold">Error:</strong> {sendError}
        </div>
      )}

      <Composer
        ref={inputRef}
        value={input}
        onChange={setInput}
        onSend={() => send()}
        disabled={pending}
      />
    </div>
  );
}

// ─── Message row ─────────────────────────────────────────────────────────
function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-foreground text-background rounded-lg rounded-tr-sm px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "tool") {
    return <ToolRow message={message} />;
  }
  // assistant
  const toolCalls = parseToolCalls(message.tool_calls);
  return (
    <div className="flex justify-start gap-2">
      <div
        className="size-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5"
        aria-hidden
      >
        ◈
      </div>
      <div className="max-w-[85%] flex-1 min-w-0 space-y-1.5">
        {message.content && (
          <div className="bg-background border rounded-lg rounded-tl-sm px-2.5 py-1.5 text-[12px] leading-relaxed">
            <Markdownish text={message.content} />
          </div>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <ToolCallSummary calls={toolCalls} />
        )}
      </div>
    </div>
  );
}

function ToolRow({ message }: { message: ChatMessage }) {
  const results = parseToolResults(message.tool_results);
  if (!results || results.length === 0) return null;
  return (
    <details className="rounded border border-violet-200 bg-violet-50/40 text-[11px]">
      <summary className="cursor-pointer px-2 py-1 flex items-center gap-1.5">
        <span className="text-violet-700 font-semibold">
          ✦ Tool results ({results.length})
        </span>
        <span className="text-muted-foreground truncate">{message.content}</span>
      </summary>
      <ul className="border-t border-violet-200 px-2 py-1.5 space-y-1.5">
        {results.map((r) => (
          <li
            key={r.tool_use_id}
            className="border-l-2 border-violet-300 pl-2 text-foreground/80 whitespace-pre-wrap"
          >
            {r.content}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ToolCallSummary({
  calls,
}: {
  calls: { id: string; name: string; input: Record<string, unknown> }[];
}) {
  return (
    <details className="rounded border border-violet-200 bg-violet-50/40 text-[11px]">
      <summary className="cursor-pointer px-2 py-1 flex items-center gap-1.5">
        <span className="text-violet-700 font-semibold">
          ✦ Tool calls ({calls.length})
        </span>
        <span className="text-muted-foreground truncate">
          {calls.map((c) => c.name).join(", ")}
        </span>
      </summary>
      <ul className="border-t border-violet-200 px-2 py-1.5 space-y-1.5">
        {calls.map((c) => (
          <li key={c.id} className="border-l-2 border-violet-300 pl-2">
            <div className="font-semibold text-foreground">{c.name}</div>
            <pre className="text-[10.5px] text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(c.input, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </details>
  );
}

function parseToolCalls(
  raw: unknown,
): { id: string; name: string; input: Record<string, unknown> }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (x): x is { id: string; name: string; input: Record<string, unknown> } =>
      !!x &&
      typeof x === "object" &&
      typeof (x as { id?: unknown }).id === "string" &&
      typeof (x as { name?: unknown }).name === "string",
  );
}

function parseToolResults(
  raw: unknown,
): { tool_use_id: string; content: string }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (x): x is { tool_use_id: string; content: string } =>
      !!x &&
      typeof x === "object" &&
      typeof (x as { tool_use_id?: unknown }).tool_use_id === "string" &&
      typeof (x as { content?: unknown }).content === "string",
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────
function EmptyState({
  clusterName,
  onPick,
  disabled,
}: {
  clusterName: string;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="py-2">
      <p className="text-[11.5px] text-muted-foreground mb-2">
        Ask the agent about <strong>{clusterName}</strong> — research, prune,
        or expand the cluster.
      </p>
      <div className="flex flex-col gap-1.5">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            disabled={disabled}
            className="text-[11px] text-left px-2 py-1 border border-dashed rounded hover:bg-muted hover:border-solid disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────
function Composer({
  ref,
  value,
  onChange,
  onSend,
  disabled,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }
  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Ask about this cluster…"
        rows={1}
        className="flex-1 text-[12px] px-2 py-1.5 border rounded bg-background outline-none focus:border-foreground/40 placeholder:text-muted-foreground resize-none"
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSend();
        }}
        disabled={disabled || !value.trim()}
        className="text-[11.5px] font-medium px-2.5 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {disabled ? "…" : "Send"}
      </button>
    </div>
  );
}
