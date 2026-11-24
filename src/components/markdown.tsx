import type { ReactNode } from "react";

/**
 * Tiny, safe Markdown renderer for our own static legal texts: headings
 * (#, ##, ###), paragraphs, "- " lists and **bold**. No HTML passthrough.
 */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-4 text-base leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (b.startsWith("### "))
          return (
            <h3 key={i} className="font-heading text-xl">
              {inline(b.slice(4))}
            </h3>
          );
        if (b.startsWith("## "))
          return (
            <h2 key={i} className="mt-2 font-heading text-2xl">
              {inline(b.slice(3))}
            </h2>
          );
        if (b.startsWith("# "))
          return (
            <h1 key={i} className="font-heading text-4xl">
              {inline(b.slice(2))}
            </h1>
          );
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
