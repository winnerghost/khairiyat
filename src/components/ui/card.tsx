import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-foreground/10 bg-surface p-4 shadow-sm sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("font-heading text-xl text-foreground", className)}>{children}</h2>;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-foreground/5 text-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/10 text-info",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  role?: "alert" | "status";
}) {
  const border: Record<Tone, string> = {
    neutral: "border-foreground/15",
    success: "border-success/40",
    warning: "border-warning/40",
    danger: "border-danger/40",
    info: "border-info/40",
  };
  return (
    <div role={role} className={cn("rounded-xl border-l-4 bg-surface p-3 text-base", border[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-foreground/85">{children}</div>
    </div>
  );
}
