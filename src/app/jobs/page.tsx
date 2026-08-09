import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { statusBadgeClass, statusLabel } from "@/lib/status";

type JobCard = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | null;
  start_time: string | null;
  end_time: string | null;
  assets: { name: string; location: string | null } | null;
  checklist_templates: { title: string } | null;
};

export default async function JobsPage() {
  const { data: jobs, error } = await supabase
    .from("job_cards")
    .select(
      "id, title, status, start_time, end_time, assets(name, location), checklist_templates(title)"
    )
    .order("start_time", { ascending: true, nullsFirst: true });

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Jobs
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your inspection jobs
          </p>
        </header>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load jobs: {error.message}
          </p>
        ) : !jobs || jobs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No jobs found.
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
