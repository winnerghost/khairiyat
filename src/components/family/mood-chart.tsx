import type { MoodPoint } from "@/server/dashboard";
import { moodWord } from "@/domain/status";
import { formatLocalDate } from "@/lib/time";

/**
 * Simple, accessible mood trend (1–5). Bars, not a line: missing days stay
 * visibly empty instead of being interpolated.
 */
export function MoodChart({ points }: { points: MoodPoint[] }) {
  const h = 96;
  const barGap = points.length > 10 ? 2 : 6;
  const width = 320;
  const barW = (width - barGap * (points.length - 1)) / points.length;
  const spoke = points.filter((p) => p.mood !== null);
  const summary =
    spoke.length === 0
      ? "No calls with a mood in this period yet."
      : `Mood on ${spoke.length} of ${points.length} days. Latest: ${moodWord(spoke.at(-1)!.mood)}.`;

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${h + 18}`} className="w-full" role="img" aria-label={summary}>
        {[1, 3, 5].map((v) => (
          <line
            key={v}
            x1={0}
            x2={width}
            y1={h - (v / 5) * h + 1}
            y2={h - (v / 5) * h + 1}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}
        {points.map((p, i) => {
          const x = i * (barW + barGap);
          if (p.mood === null) {
            const missed = p.status === "unreachable";
            return (
              <rect
                key={p.localDate}
                x={x}
                y={h - 4}
                width={barW}
                height={4}
                rx={2}
                fill={missed ? "var(--brand-danger)" : "currentColor"}
                fillOpacity={missed ? 0.6 : 0.12}
              >
                <title>
                  {formatLocalDate(p.localDate)}: {missed ? "not reached" : "no call"}
                </title>
              </rect>
            );
          }
          const bh = Math.max(6, (p.mood / 5) * h);
          const color = p.mood <= 2 ? "var(--brand-warning)" : "var(--brand-success)";
          return (
            <rect key={p.localDate} x={x} y={h - bh} width={barW} height={bh} rx={3} fill={color}>
              <title>
                {formatLocalDate(p.localDate)}: {moodWord(p.mood)}
              </title>
            </rect>
          );
        })}
        <text x={0} y={h + 15} fontSize={11} fill="currentColor" fillOpacity={0.6}>
          {formatLocalDate(points[0]!.localDate)}
        </text>
        <text
          x={width}
          y={h + 15}
          fontSize={11}
          fill="currentColor"
          fillOpacity={0.6}
          textAnchor="end"
        >
          Today
        </text>
      </svg>
      <figcaption className="text-sm text-muted">
        {summary} Self-reported in conversation.
      </figcaption>
    </figure>
  );
}
