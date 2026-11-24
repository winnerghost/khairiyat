import Link from "next/link";
import { ONBOARDING_STEPS, type StepKey, stepIndex } from "@/domain/onboarding";

/** Progress through the setup wizard. Completed steps are links (edit anytime). */
export function StepHeader({
  current,
  parentId,
  reached = 1,
}: {
  current: StepKey;
  parentId?: string;
  reached?: number;
}) {
  const i = stepIndex(current);
  const step = ONBOARDING_STEPS[i]!;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-muted">
        Step {i + 1} of {ONBOARDING_STEPS.length}
      </p>
      <h1 className="font-heading text-3xl">{step.title}</h1>
      <ol className="flex gap-1.5" aria-label="Setup progress">
        {ONBOARDING_STEPS.map((s, j) => {
          const done = j < i;
          const canLink = parentId && j + 1 <= reached && j !== i;
          const bar = (
            <span
              className={`block h-2 rounded-full ${j <= i ? "bg-primary" : "bg-foreground/15"}`}
              aria-hidden="true"
            />
          );
          return (
            <li key={s.key} className="flex-1" aria-current={j === i ? "step" : undefined}>
              {canLink ? (
                <Link href={`/app/parents/${parentId}/setup/${s.key}`} title={s.title}>
                  {bar}
                  <span className="sr-only">
                    {s.title} {done ? "(done)" : ""}
                  </span>
                </Link>
              ) : (
                <>
                  {bar}
                  <span className="sr-only">{s.title}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
