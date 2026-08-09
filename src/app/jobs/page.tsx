import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { statusBadgeClass, statusLabel } from "@/lib/status";

// This page has no dynamic route segment, so Next.js would otherwise be free
// to statically cache it. Force fresh data on every request.
export const dynamic = "force-dynamic";

type JobCard = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | null;
  start_time: string | null;
  end_time: string | null;
  assets: { name: string; location: string | null; asset_type: string } | null;
  checklist_templates: { title: string } | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

function filterLink(status: string, type: string) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return `/jobs${query ? `?${query}` : ""}`;
}

export default async function JobsPage({
  searchParams,
}: PageProps<"/jobs">) {
  const resolvedParams = await searchParams;
  const status =
    typeof resolvedParams.status === "string" ? resolvedParams.status : "all";
  const type = typeof resolvedParams.type === "string" ? resolvedParams.type : "all";

  const { data: assetTypeRows } = await supabase
    .from("assets")
    .select("asset_type")
    .order("asset_type", { ascending: true });
  const assetTypes = Array.from(
    new Set((assetTypeRows ?? []).map((r) => r.asset_type))
  );

  let query = supabase
    .from("job_cards")
    .select(
      "id, title, status, start_time, end_time, assets!inner(name, location, asset_type), checklist_templates(title)"
    )
    .order("start_time", { ascending: true, nullsFirst: true });

  if (status !== "all") query = query.eq("status", status);
  if (type !== "all") query = query.eq("assets.asset_type", type);

  const { data: jobs, error } = await query;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Jobs
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your inspection jobs
            </p>
          </div>
          <Link
            href="/jobs/new"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            <Plus size={16} />
            New Job
          </Link>
        </header>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={filterLink(opt.value, type)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === opt.value
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={filterLink(status, "all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                type === "all"
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              All Types
            </Link>
            {assetTypes.map((t) => (
              <Link
                key={t}
                href={filterLink(status, t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  type === t
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load jobs: {error.message}
          </p>
        ) : !jobs || jobs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No jobs match these filters.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(jobs as unknown as JobCard[]).map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-black dark:text-zinc-50">
                      {job.title}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass(
                        job.status
                      )}`}
                    >
                      {statusLabel(job.status)}
                    </span>
                  </div>
                  {job.assets && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {job.assets.name}
                      {job.assets.location ? ` — ${job.assets.location}` : ""}
                    </p>
                  )}
                  {job.checklist_templates && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      Checklist: {job.checklist_templates.title}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
