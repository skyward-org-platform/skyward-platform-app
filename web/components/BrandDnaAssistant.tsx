"use client";

// Brand DNA Assistant chat. The assistant can both READ (grounded answers
// from brand_dna_section + project_brain_entry) AND WRITE (via Anthropic
// tool use — model emits structured proposals, user clicks Apply on inline
// cards, server executes via applyBrandDnaProposal).
//
// Conversation state is local to the component — refresh clears it. Each
// turn re-sends the full block history so Anthropic sees the tool_use /
// tool_result chain. The server stitches synthetic tool_result blocks
// based on each proposal's pending|applied|discarded|error status.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyBrandDnaProposal,
  getSectionItems,
} from "@/app/properties/[slug]/brand-dna/proposal-actions";
import { Markdownish } from "@/components/Markdownish";
import {
  clearChatHistory,
  saveChatTurn,
  updateAssistantBlocks,
  type AssistantBlock as PersistedBlock,
  type ChatMessage as PersistedMessage,
} from "@/app/properties/[slug]/brand-dna/chat-actions";

type ProposalStatus = "pending" | "applied" | "discarded" | "error";

type AssistantBlock = PersistedBlock;

type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      blocks: AssistantBlock[];
      /** DB id once persisted; null for in-flight assistant turn before save. */
      messageId: string | null;
    };

const SUGGESTED_PROMPTS = [
  "Suggest 3 starter personas for this brand.",
  "Draft a brand personality and tagline based on what you know.",
  "What seed keywords should the SEO pipeline start with?",
  "What's missing from our Brand DNA right now?",
];

function hydrateInitial(persisted: PersistedMessage[]): Message[] {
  const out: Message[] = [];
  for (const m of persisted) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text ?? "" });
    } else {
      out.push({
        role: "assistant",
        blocks: m.blocks ?? [],
        messageId: m.id,
      });
    }
  }
  return out;
}

export function BrandDnaAssistant({
  propertySlug,
  propertyName,
  hasContent,
  initialMessages,
  prominent = false,
  scopedSection,
}: {
  propertySlug: string;
  propertyName: string;
  hasContent: boolean;
  initialMessages: PersistedMessage[];
  /** Hero-style sizing (tall, more prominent) — set on Brand DNA Overview
   *  where the chat IS the primary entry point. Defaults to false (compact
   *  sizing used in the section-page drawer). */
  prominent?: boolean;
  /** When set, the route handler biases proposals toward this brand_dna
   *  section. Used by the drawer on /brand-dna/<section> pages. */
  scopedSection?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() =>
    hydrateInitial(initialMessages),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  function mutateLastAssistantBlocks(
    fn: (blocks: AssistantBlock[]) => AssistantBlock[],
  ) {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (!last || last.role !== "assistant") return m;
      return [...m.slice(0, -1), { ...last, blocks: fn(last.blocks) }];
    });
  }

  function appendTextDelta(text: string) {
    mutateLastAssistantBlocks((blocks) => {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        return [...blocks.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...blocks, { type: "text", text }];
    });
  }

  function pushProposalBlock(
    id: string,
    name: string,
    input: Record<string, unknown>,
  ) {
    mutateLastAssistantBlocks((blocks) => [
      ...blocks,
      { type: "tool_use", id, name, input, status: "pending" },
    ]);
  }

  /** Update a proposal status anywhere in the message stream, and persist
   *  the change back to DB so it survives reloads. */
  function updateProposalStatus(
    id: string,
    update: Partial<Pick<AssistantBlock & { type: "tool_use" }, "status" | "error" | "summary">>,
  ) {
    let touchedMessageId: string | null = null;
    let touchedBlocks: AssistantBlock[] | null = null;
    setMessages((m) =>
      m.map((msg) => {
        if (msg.role !== "assistant") return msg;
        let modified = false;
        const blocks = msg.blocks.map((b) => {
          if (b.type !== "tool_use" || b.id !== id) return b;
          modified = true;
          return { ...b, ...update };
        });
        if (modified) {
          touchedMessageId = msg.messageId;
          touchedBlocks = blocks;
          return { ...msg, blocks };
        }
        return msg;
      }),
    );
    if (touchedMessageId && touchedBlocks) {
      // Fire-and-forget persistence — UI already reflects the change.
      updateAssistantBlocks(touchedMessageId, touchedBlocks).catch(() => {});
    }
  }

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || streaming) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setStreaming(true);

    // Insert an empty assistant slot to fill as we stream.
    setMessages((m) => [
      ...m,
      { role: "assistant", blocks: [], messageId: null },
    ]);

    try {
      const res = await fetch(
        `/api/brand-dna/ask/${encodeURIComponent(propertySlug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            scopedSection: scopedSection ?? null,
          }),
        },
      );
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        setMessages((m) => m.slice(0, -1));
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
          const eventChunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = eventChunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) {
            idx = buf.indexOf("\n\n");
            continue;
          }
          try {
            const payload = JSON.parse(dataLine.slice("data: ".length));
            if (payload.type === "delta" && typeof payload.text === "string") {
              appendTextDelta(payload.text);
            } else if (payload.type === "proposal") {
              pushProposalBlock(payload.id, payload.tool, payload.input ?? {});
            } else if (payload.type === "research_running") {
              // Synthetic block in the assistant stream so the user sees
              // the research being fetched mid-reply.
              appendTextDelta(
                `\n\n_◇ Researching: **${payload.query ?? "…"}**_\n\n`,
              );
            } else if (payload.type === "research_done") {
              appendTextDelta(
                `_◇ Findings:_\n${payload.finding ?? "(no findings)"}\n\n`,
              );
            } else if (payload.type === "proposal_error") {
              setError(`Proposal "${payload.id}" failed: ${payload.error}`);
            } else if (payload.type === "error") {
              setError(payload.error ?? "Stream error");
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
      inputRef.current?.focus();

      // Persist the turn. Read the final assistant blocks from the latest
      // state via a functional update so we don't race the stream close.
      setMessages((curr) => {
        const last = curr[curr.length - 1];
        if (last && last.role === "assistant" && last.messageId === null) {
          // Persist async; on success, swap in the real messageId so
          // subsequent proposal status updates can write back to the right
          // row.
          saveChatTurn(propertySlug, text, last.blocks)
            .then((res) => {
              if (!res.ok) {
                setError(`Save failed: ${res.error}`);
                return;
              }
              setMessages((m2) => {
                const lastIdx = m2.length - 1;
                const lastMsg = m2[lastIdx];
                if (!lastMsg || lastMsg.role !== "assistant") return m2;
                return [
                  ...m2.slice(0, -1),
                  { ...lastMsg, messageId: res.assistantMessageId },
                ];
              });
            })
            .catch((e) => {
              setError(
                `Save failed: ${e instanceof Error ? e.message : String(e)}`,
              );
            });
        }
        return curr;
      });
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
    setInput("");
    clearChatHistory(propertySlug).catch(() => {});
    inputRef.current?.focus();
  }

  return (
    <section className="border rounded-lg bg-card overflow-hidden flex flex-col">
      <header className="px-5 py-3.5 border-b flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight inline-flex items-center gap-2">
            <span className="text-indigo-600">◈</span> Brand DNA Assistant
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            Ask questions, draft copy, propose new knowledge. The Assistant
            can write back to {propertyName}&rsquo;s Brand DNA and Project
            Brain — but every change is a proposal you approve.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={streaming}
            className="text-[11px] font-medium px-2.5 py-1 border rounded-md text-foreground hover:bg-muted disabled:opacity-50 shrink-0"
          >
            Clear
          </button>
        )}
      </header>

      {!hasContent && (
        <div className="px-5 py-2.5 border-b bg-amber-50/40 text-[11px] text-amber-900/80 leading-relaxed">
          <strong className="font-semibold">Heads up:</strong> no Brand DNA
          sections are filled yet. Try{" "}
          <em>&ldquo;Draft a brand personality and tagline based on what you
          know&rdquo;</em> — the Assistant will propose a starting point you
          can Apply.
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-5 py-4 ${
          prominent
            ? "max-h-[65vh] min-h-[380px]"
            : "max-h-[60vh] min-h-[200px]"
        }`}
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(p) => send(p)} disabled={streaming} />
        ) : (
          <ul className="space-y-4">
            {messages.map((m, idx) => (
              <MessageRow
                key={idx}
                message={m}
                streaming={streaming && idx === messages.length - 1}
                propertySlug={propertySlug}
                onProposalStatus={(id, update) => {
                  updateProposalStatus(id, update);
                  if (update.status === "applied") router.refresh();
                }}
              />
            ))}
          </ul>
        )}
        {error && (
          <div className="mt-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
            <strong className="font-semibold">Error:</strong> {error}
          </div>
        )}
      </div>

      <footer className="px-5 py-3 border-t">
        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={() => send()}
          disabled={streaming}
        />
      </footer>
    </section>
  );
}

function MessageRow({
  message,
  streaming,
  propertySlug,
  onProposalStatus,
}: {
  message: Message;
  streaming: boolean;
  propertySlug: string;
  onProposalStatus: (
    id: string,
    update: { status?: ProposalStatus; error?: string; summary?: string },
  ) => void;
}) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] bg-foreground text-background rounded-2xl rounded-tr-md px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </li>
    );
  }
  const hasContent = message.blocks.length > 0;
  return (
    <li className="flex justify-start gap-2.5">
      <div
        className="size-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5"
        aria-hidden
      >
        ◈
      </div>
      <div className="max-w-[85%] flex-1 min-w-0 space-y-2">
        {!hasContent && streaming && (
          <div className="bg-muted/50 border rounded-2xl rounded-tl-md px-3.5 py-2 text-[13px] leading-relaxed">
            <span className="text-muted-foreground italic animate-pulse">
              Thinking…
            </span>
          </div>
        )}
        {message.blocks.map((b, idx) => {
          if (b.type === "text") {
            const last = idx === message.blocks.length - 1;
            return (
              <div
                key={idx}
                className="bg-muted/50 border rounded-2xl rounded-tl-md px-3.5 py-2 text-[13px] leading-relaxed"
              >
                <Markdownish text={b.text} />
                {streaming && last && b.text && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-foreground/70 animate-pulse" />
                )}
              </div>
            );
          }
          return (
            <ProposalCard
              key={b.id}
              propertySlug={propertySlug}
              block={b}
              onStatus={(update) => onProposalStatus(b.id, update)}
            />
          );
        })}
      </div>
    </li>
  );
}

function ProposalCard({
  propertySlug,
  block,
  onStatus,
}: {
  propertySlug: string;
  block: Extract<AssistantBlock, { type: "tool_use" }>;
  onStatus: (update: {
    status?: ProposalStatus;
    error?: string;
    summary?: string;
  }) => void;
}) {
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const res = await applyBrandDnaProposal(propertySlug, {
        tool: block.name,
        input: block.input,
      });
      if (res.ok) {
        onStatus({ status: "applied", summary: res.summary });
      } else {
        onStatus({ status: "error", error: res.error });
      }
    });
  }

  function discard() {
    onStatus({ status: "discarded" });
  }

  const meta = PROPOSAL_META[block.name];
  const titleLine = describeProposal(block);

  return (
    <article
      className={`border rounded-lg overflow-hidden ${
        block.status === "applied"
          ? "border-emerald-200 bg-emerald-50/50"
          : block.status === "discarded"
            ? "border-muted-foreground/20 bg-muted/30 opacity-70"
            : block.status === "error"
              ? "border-rose-200 bg-rose-50/40"
              : "border-violet-200 bg-violet-50/40"
      }`}
    >
      <header className="px-3.5 py-2 flex items-center gap-2 text-[11px] font-semibold border-b border-current/10">
        <span className="text-violet-700">✦ Proposal</span>
        <span className="text-foreground/80 truncate">
          {meta?.label ?? block.name}
        </span>
        <span className="ml-auto">
          <ProposalStatusBadge status={block.status} />
        </span>
      </header>
      <div className="px-3.5 py-2.5 text-[12px] leading-relaxed">
        <div className="font-medium text-foreground">{titleLine}</div>
        <ProposalSummary
          input={block.input}
          tool={block.name}
          propertySlug={propertySlug}
        />
        {typeof block.input.rationale === "string" &&
          block.input.rationale.trim() && (
            <p className="mt-2 text-[11.5px] text-muted-foreground italic">
              {block.input.rationale}
            </p>
          )}
        {block.status === "error" && block.error && (
          <p className="mt-2 text-[11px] text-rose-700">
            <strong>Apply failed:</strong> {block.error}
          </p>
        )}
        {block.status === "applied" && block.summary && (
          <p className="mt-2 text-[11px] text-emerald-700">
            ✓ {block.summary}
          </p>
        )}
      </div>
      {block.status === "pending" && (
        <footer className="px-3.5 py-2 border-t border-current/10 flex items-center gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="text-[11.5px] font-medium px-3 py-1 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
          <button
            type="button"
            onClick={discard}
            disabled={pending}
            className="text-[11.5px] font-medium px-3 py-1 border rounded-md text-foreground hover:bg-muted disabled:opacity-50"
          >
            Discard
          </button>
          <span className="text-[10.5px] text-muted-foreground ml-1">
            {meta?.target}
          </span>
        </footer>
      )}
    </article>
  );
}

const PROPOSAL_META: Record<string, { label: string; target: string }> = {
  update_brand_field: {
    label: "Update brand field",
    target: "→ writes to brand_dna_section",
  },
  update_brand_items: {
    label: "Update brand items",
    target: "→ writes to brand_dna_section.content[]",
  },
  add_brain_entry: {
    label: "Add Project Brain entry",
    target: "→ writes to project_brain_entry",
  },
};

function describeProposal(
  block: Extract<AssistantBlock, { type: "tool_use" }>,
): string {
  if (block.name === "update_brand_field") {
    const section = String(block.input.section ?? "?");
    const fields = (block.input.fields as Record<string, unknown>) ?? {};
    const keys = Object.keys(fields);
    return `Update ${section} · ${keys.length} field${keys.length === 1 ? "" : "s"}: ${keys.join(", ")}`;
  }
  if (block.name === "update_brand_items") {
    const section = String(block.input.section ?? "?");
    const mode = String(block.input.mode ?? "append");
    const items = Array.isArray(block.input.items) ? block.input.items : [];
    return `${mode === "replace" ? "Replace" : "Append to"} ${section} · ${items.length} row${items.length === 1 ? "" : "s"}`;
  }
  if (block.name === "add_brain_entry") {
    const type = String(block.input.type ?? "?");
    const title = String(block.input.title ?? "?");
    const conf =
      typeof block.input.confidence === "number"
        ? ` · ${Math.round(block.input.confidence * 100)}% confidence`
        : "";
    return `Project Brain · ${type} · "${title}"${conf}`;
  }
  return block.name;
}

/** Inline preview for `update_brand_items` proposals in mode "replace".
 *  Shows the existing items that WILL be removed if the user clicks Apply,
 *  so destructive overwrites are visible before they happen. Fetched
 *  just-in-time per proposal card; collapsed by default to keep the chat
 *  scannable. */
function ReplaceDiffPreview({
  propertySlug,
  section,
  newItemCount,
}: {
  propertySlug: string;
  section: string;
  newItemCount: number;
}) {
  const [existing, setExisting] = useState<unknown[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSectionItems(propertySlug, section).then((items) => {
      if (!cancelled) setExisting(items);
    });
    return () => {
      cancelled = true;
    };
  }, [propertySlug, section]);

  if (existing === null) {
    return (
      <div className="mb-2 rounded-md border border-rose-200 bg-rose-50/40 px-2.5 py-1.5 text-[11px] text-rose-800/80 italic">
        Loading existing rows for diff…
      </div>
    );
  }

  if (existing.length === 0) {
    return (
      <div className="mb-2 rounded-md border border-violet-200 bg-violet-50/40 px-2.5 py-1.5 text-[11px] text-violet-800">
        <strong className="font-semibold">Replace mode</strong>, but{" "}
        {section} is empty — this is effectively an append of {newItemCount}{" "}
        row{newItemCount === 1 ? "" : "s"}.
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-md border border-rose-200 bg-rose-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-2.5 py-1.5 text-left text-[11px] text-rose-900 flex items-center gap-2 hover:bg-rose-100/40"
      >
        <span className="text-rose-700">−</span>
        <strong className="font-semibold">
          {existing.length} existing row{existing.length === 1 ? "" : "s"} will
          be removed
        </strong>
        <span className="ml-auto text-rose-800/70 underline decoration-dotted">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <ul className="border-t border-rose-200 px-2.5 py-2 space-y-1 max-h-[200px] overflow-y-auto">
          {existing.map((item, i) => (
            <li
              key={i}
              className="text-[11.5px] text-rose-900/80 border-l-2 border-rose-300 pl-2 line-through decoration-rose-400/60"
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalSummary({
  input,
  tool,
  propertySlug,
}: {
  input: Record<string, unknown>;
  tool: string;
  propertySlug: string;
}) {
  if (tool === "update_brand_field") {
    const fields = (input.fields as Record<string, unknown>) ?? {};
    return (
      <dl className="mt-1.5 space-y-1.5">
        {Object.entries(fields).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {k.replace(/_/g, " ")}
            </dt>
            <dd className="text-[12px] text-foreground leading-snug">
              {renderValue(v)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (tool === "update_brand_items") {
    const items = Array.isArray(input.items) ? input.items : [];
    const mode = String(input.mode ?? "append");
    const section = String(input.section ?? "");
    return (
      <div className="mt-1.5">
        {mode === "replace" && section && (
          <ReplaceDiffPreview
            propertySlug={propertySlug}
            section={section}
            newItemCount={items.length}
          />
        )}
        <ul className="space-y-1">
          {items.slice(0, 6).map((item, i) => (
            <li
              key={i}
              className="text-[12px] text-foreground border-l-2 border-violet-300 pl-2"
            >
              {renderItem(item)}
            </li>
          ))}
          {items.length > 6 && (
            <li className="text-[11px] text-muted-foreground italic">
              + {items.length - 6} more…
            </li>
          )}
        </ul>
      </div>
    );
  }
  if (tool === "add_brain_entry") {
    return (
      <Markdownish
        text={String(input.body ?? "")}
        className="mt-1.5 text-[12px] text-foreground leading-snug"
      />
    );
  }
  return null;
}

function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <em>—</em>;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === "string")) {
      return (v as string[]).join(", ");
    }
    return JSON.stringify(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderItem(item: unknown): React.ReactNode {
  if (typeof item !== "object" || item === null) return String(item);
  const obj = item as Record<string, unknown>;
  const headerRaw =
    obj.name ?? obj.persona_name ?? obj.title ?? obj.pattern ?? obj.keyword;
  const header = headerRaw ? String(headerRaw) : null;
  return (
    <div>
      {header && (
        <div className="font-semibold text-foreground">{header}</div>
      )}
      <div className="text-[11px] text-muted-foreground">
        {Object.entries(obj)
          .filter(
            ([k]) =>
              ![
                "name",
                "persona_name",
                "title",
                "pattern",
                "keyword",
              ].includes(k),
          )
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join(" · ")}
      </div>
    </div>
  );
}

function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const meta = {
    pending: { label: "Pending", cls: "bg-violet-100 text-violet-700" },
    applied: { label: "Applied", cls: "bg-emerald-100 text-emerald-700" },
    discarded: { label: "Discarded", cls: "bg-muted text-muted-foreground" },
    error: { label: "Error", cls: "bg-rose-100 text-rose-700" },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="text-center py-4">
      <p className="text-[12px] text-muted-foreground mb-3">
        Start with a question, draft request, or pick one below.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            disabled={disabled}
            className="text-[11.5px] text-left px-3 py-1.5 border border-dashed rounded-md text-foreground hover:bg-muted hover:border-solid disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}


const Composer = (function () {
  return function Composer({
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
          placeholder="Ask, draft, or propose changes…"
          rows={1}
          className="flex-1 text-[13px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground resize-none"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="text-[12px] font-medium px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {disabled ? "…" : "Send"}
        </button>
      </div>
    );
  };
})();
