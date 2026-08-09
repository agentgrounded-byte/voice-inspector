export const statusStyles: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  fail: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function statusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status.replace("_", " ");
}

export function statusBadgeClass(status: string | null | undefined) {
  return (
    statusStyles[status ?? ""] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  );
}
