"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Asset = {
  id: string;
  name: string;
  location: string | null;
  asset_type: string;
};

type TemplateField = {
  id: string;
  field_label: string;
  field_type: "text" | "number" | "radio" | "dropdown" | "checkbox" | "photo";
  is_mandatory: boolean | null;
};

type Template = {
  id: string;
  asset_type: string;
  title: string;
  checklist_template_fields: TemplateField[];
};

export default function NewJobForm({
  assets,
  templates,
}: {
  assets: Asset[];
  templates: Template[];
}) {
  const router = useRouter();
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateByAssetType = useMemo(() => {
    const map = new Map<string, Template>();
    templates.forEach((t) => map.set(t.asset_type, t));
    return map;
  }, [templates]);

  const selectedAsset = assets.find((a) => a.id === assetId) ?? null;
  const matchedTemplate = selectedAsset
    ? templateByAssetType.get(selectedAsset.asset_type) ?? null
    : null;

  function handleAssetChange(id: string) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
    if (asset && !titleTouched) {
      setTitle(`Routine ${asset.name} Inspection`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAsset) {
      setError("Choose an asset first.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const jobTitle = title.trim() || `Routine ${selectedAsset.name} Inspection`;

    const { data: newJob, error: insertError } = await supabase
      .from("job_cards")
      .insert({
        asset_id: selectedAsset.id,
        template_id: matchedTemplate?.id ?? null,
        title: jobTitle,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !newJob) {
      setSubmitting(false);
      setError("Couldn't create job. Try again.");
      return;
    }

    if (matchedTemplate && matchedTemplate.checklist_template_fields.length > 0) {
      const itemRows = matchedTemplate.checklist_template_fields.map((f) => ({
        job_card_id: newJob.id,
        field_id: f.id,
        field_label: f.field_label,
        field_type: f.field_type,
        is_mandatory: f.is_mandatory,
        status: "pending" as const,
        value_recorded: null,
      }));
      const { error: itemsError } = await supabase
        .from("checklist_items")
        .insert(itemRows);

      if (itemsError) {
        setSubmitting(false);
        setError(
          "Job created, but checklist setup failed. Open the job and contact support."
        );
        router.push(`/jobs/${newJob.id}`);
        return;
      }
    }

    setSubmitting(false);
    router.push(`/jobs/${newJob.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black dark:text-zinc-50">
          Asset
        </label>
        <select
          value={assetId}
          onChange={(e) => handleAssetChange(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">Select an asset...</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} — {asset.asset_type}
              {asset.location ? ` (${asset.location})` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedAsset && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {matchedTemplate
            ? `Checklist: ${matchedTemplate.title}`
            : "No checklist template exists for this asset type yet — job will be created without a checklist."}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black dark:text-zinc-50">
          Job Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          placeholder="e.g. Routine Pump A-1 Inspection"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !assetId}
        className="flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        Create Job
      </button>
    </form>
  );
}
