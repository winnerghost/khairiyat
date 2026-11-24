export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warning" | "success";
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-foreground/10 bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`font-heading text-3xl ${color}`}>{value}</p>
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-foreground/10 bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-muted [&_tr]:border-b [&_tr]:border-foreground/10">
        {children}
      </table>
    </div>
  );
}
