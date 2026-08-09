import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus, Camera } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { statusBadgeClass, statusLabel } from "@/lib/status";

export const dynamic = "force-dynamic";

type Asset = {
  id: string;
  name: string;
  location: string | null;
  asset_type: string;
};

type JobCard = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | null;
  start_time: string | null;
  end_time: string | null;
  checklist_templates: { title: string } | null;
};

type Defect = {
  id: string;
  description: string;
  photo_url: string | null;
  job_cards: { id: string; title: string } | null;
};

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AssetDetailPage({
  params,
}: PageProps<"/assets/[id]">) {
  const { id } = await params;

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id, name, location, asset_type")
    .eq("id", id)
    .maybeSingle();

  if (assetError || !asset) {
    notFound();
  }

  const typedAsset = asset as unknown as Asset;

  const [{ data: jobs }, { data: defects }] = await Promise.all([
    supabase
      .from("job_cards")
      .select("id, title, status, start_time, end_time, checklist_templates(title)")
      .eq("asset_id", typedAsset.id)
      .order("start_time", { ascending: true, nullsFirst: true }),
    supabase
      .from("defects")
      .select("id, description, photo_url, job_cards!inner(id, title, asset_id)")
      .eq("job_cards.asset_id", typedAsset.id),
  ]);

  const typedJobs = (jobs as unknown as JobCard[]) ?? [];
  const completedCount = typedJobs.filter((j) => j.status === "completed").length;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <Link
          href="/assets"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
          Assets
        </Link>

        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {typedAsset.name}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {typedAsset.asset_type}
                {typedAsset.location ? ` — ${typedAsset.location}` : ""}
              </p>
            </div>
            <Link
              href={`/jobs/new?asset=${typedAsset.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              <Plus size={16} />
              New Job
            </Link>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {typedJobs.length} job{typedJobs.length === 1 ? "" : "s"} total —{" "}
            {completedCount} completed
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Job History
          </h2>
          {typedJobs.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No jobs for this asset yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {typedJobs.map((job) => (
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
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDateTime(job.start_time) ?? "Not started"}
                      {job.end_time ? ` — ${formatDateTime(job.end_time)}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Defects
          </h2>
          {!defects || defects.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No defects reported for this asset.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(defects as unknown as Defect[]).map((defect) => (
                <li
                  key={defect.id}
                  className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
                >
                  <p className="text-sm text-red-800 dark:text-red-300">
                    {defect.description}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    {defect.job_cards && (
                      <Link
                        href={`/jobs/${defect.job_cards.id}`}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        {defect.job_cards.title}
                      </Link>
                    )}
                    {defect.photo_url && (
                      <a
                        href={defect.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                      >
                        <Camera size={14} />
                        View photo
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
