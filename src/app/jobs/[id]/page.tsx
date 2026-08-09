import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Camera } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { statusBadgeClass, statusLabel } from "@/lib/status";

type JobCardDetail = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | null;
  start_time: string | null;
  end_time: string | null;
  asset_id: string | null;
  template_id: string | null;
  assets: { name: string; location: string | null; asset_type: string } | null;
  checklist_templates: { title: string } | null;
};

type ChecklistItem = {
  id: string;
  field_id: string | null;
  field_label: string;
  field_type: "text" | "number" | "radio" | "dropdown" | "checkbox" | "photo";
  is_mandatory: boolean | null;
  status: "pending" | "pass" | "fail" | "completed" | null;
  value_recorded: string | null;
  checklist_template_fields: { display_order: number | null } | null;
};

type Defect = {
  id: string;
  checklist_item_id: string | null;
  description: string;
  photo_url: string | null;
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

export default async function JobDetailPage({
  params,
}: PageProps<"/jobs/[id]">) {
  const { id } = await params;

  const { data: job, error: jobError } = await supabase
    .from("job_cards")
    .select(
      "id, title, status, start_time, end_time, asset_id, template_id, assets(name, location, asset_type), checklist_templates(title)"
    )
    .eq("id", id)
    .maybeSingle();

  if (jobError || !job) {
    notFound();
  }

  const typedJob = job as unknown as JobCardDetail;

  // checklist_items is the source of truth for a job's checklist: one row per
  // (job_card_id, field_id), instantiated from checklist_template_fields when
  // the job was created. We only join back to the template field for display_order.
  const [{ data: items }, { data: defects }] = await Promise.all([
    supabase
      .from("checklist_items")
      .select(
        "id, field_id, field_label, field_type, is_mandatory, status, value_recorded, checklist_template_fields(display_order)"
      )
      .eq("job_card_id", typedJob.id),
    supabase
      .from("defects")
      .select("id, checklist_item_id, description, photo_url")
      .eq("job_card_id", typedJob.id),
  ]);

  const sortedItems = ((items as unknown as ChecklistItem[]) ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.checklist_template_fields?.display_order ?? 0) -
        (b.checklist_template_fields?.display_order ?? 0)
    );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <Link
          href="/jobs"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
          Jobs
        </Link>

        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
              {typedJob.title}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass(
                typedJob.status
              )}`}
            >
              {statusLabel(typedJob.status)}
            </span>
          </div>

          {typedJob.assets && (
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="font-medium text-black dark:text-zinc-50">
                {typedJob.assets.name}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {typedJob.assets.asset_type}
                {typedJob.assets.location
                  ? ` — ${typedJob.assets.location}`
                  : ""}
              </p>
            </div>
          )}

          <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              Start: {formatDateTime(typedJob.start_time) ?? "Not started"}
            </span>
            <span>End: {formatDateTime(typedJob.end_time) ?? "—"}</span>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Checklist
            {typedJob.checklist_templates
              ? ` — ${typedJob.checklist_templates.title}`
              : ""}
          </h2>

          {sortedItems.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No checklist items for this job yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sortedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-black dark:text-zinc-50">
                      {item.field_label}
                      {item.is_mandatory && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass(
                        item.status
                      )}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {item.field_type === "photo"
                      ? "See photos below"
                      : item.value_recorded ?? "Not recorded yet"}
                  </p>
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
              No defects reported.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(defects as Defect[]).map((defect) => (
                <li
                  key={defect.id}
                  className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
                >
                  <p className="text-sm text-red-800 dark:text-red-300">
                    {defect.description}
                  </p>
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
