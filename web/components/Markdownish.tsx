// Minimal markdown renderer used in the Brand DNA Assistant chat, in
// proposal cards, and on Project Brain cards. Handles paragraphs, ATX
// headers (#, ##, ###), horizontal rules, bullet lists, `**bold**`, and
// `inline code`. Not a full markdown parser — just enough to make
// assistant-written content readable without a runtime dep.

import React from "react";

export function Markdownish({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();

        if (/^[-*_]{3,}\s*$/.test(trimmed)) {
          return <hr key={i} className="my-2 border-t border-foreground/10" />;
        }

        const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
          const level = headerMatch[1].length;
          const content = headerMatch[2];
          const headerCls =
            level <= 2
              ? "font-semibold text-foreground text-[14px] mt-3 mb-1"
              : level === 3
                ? "font-semibold text-foreground text-[13px] mt-2.5 mb-1"
                : "font-semibold text-foreground text-[12.5px] mt-2 mb-0.5";
          return (
            <div key={i} className={headerCls}>
              <Inline text={content} />
            </div>
          );
        }

        const lines = para.split("\n");
        const allBullets = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (allBullets && lines.length > 1) {
          return (
            <ul key={i} className="list-disc list-inside space-y-1 my-1">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*[-*]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={i === 0 ? "" : "mt-2"}>
            <Inline text={para} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code
              key={i}
              className="font-mono text-[12px] bg-muted px-1 rounded"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
