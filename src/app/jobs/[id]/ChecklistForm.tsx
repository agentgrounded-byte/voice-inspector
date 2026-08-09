"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle, Camera } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { statusBadgeClass, statusLabel } from "@/lib/status";

export type ChecklistItemForForm = {
  id: string;
  field_label: string;
  field_type: "text" | "number" | "radio" | "dropdown" | "checkbox" | "photo";
  is_mandatory: boolean | null;
  status: "pending" | "pass" | "fail" | "completed" | null;
  value_recorded: string | null;
  options: string[];
};

export default function ChecklistForm({
  jobId,
  items: initialItems,
  locked = false,
}: {
  jobId: string;
  items: ChecklistItemForForm[];
  locked?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);

  // JobMic triggers router.refresh() after a voice update, which re-fetches
  // fresh checklist_items on the server and passes new `items` props here.
  // Without this, our local state (seeded once on mount) would never pick up
  // changes made outside this form, like a voice-driven update.
  useEffect(() => {
    setItems(initialItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems]);

  const [defectOpenId, setDefectOpenId] = useState<string | null>(null);
  const [defectDescription, setDefectDescription] = useState("");
  const [defectFile, setDefectFile] = useState<File | null>(null);
  const [defectSubmitting, setDefectSubmitting] = useState(false);
  const [defectError, setDefectError] = useState<string | null>(null);

  async function saveValue(itemId: string, value: string) {
    if (locked) return;
    setSavingId(itemId);
    const trimmed = value.trim();
    const nextStatus = trimmed === "" ? "pending" : "completed";

    const { error } = await supabase
      .from("checklist_items")
      .update({ value_recorded: trimmed === "" ? null : trimmed, status: nextStatus })
      .eq("id", itemId);

    if (!error) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, value_recorded: trimmed === "" ? null : trimmed, status: nextStatus }
            : it
        )
      );
    }
    setSavingId(null);
  }

  function updateLocal(itemId: string, value: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, value_recorded: value } : it))
    );
  }

  function toggleDefectForm(itemId: string) {
    if (defectOpenId === itemId) {
      setDefectOpenId(null);
    } else {
      setDefectOpenId(itemId);
      setDefectDescription("");
      setDefectFile(null);
      setDefectError(null);
    }
  }

  async function submitDefect(item: ChecklistItemForForm) {
    if (!defectDescription.trim()) {
      setDefectError("Description is required.");
      return;
    }
    setDefectSubmitting(true);
    setDefectError(null);

    let photoUrl: string | null = null;
    if (defectFile) {
      const filePath = `${jobId}/${item.id}-${Date.now()}-${defectFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("defect-photos")
        .upload(filePath, defectFile);

      if (uploadError) {
        setDefectSubmitting(false);
        setDefectError("Photo upload failed. Try again.");
        return;
      }
      const { data: pub } = supabase.storage
        .from("defect-photos")
        .getPublicUrl(filePath);
      photoUrl = pub.publicUrl;
    }

    const { error: insertError } = await supabase.from("defects").insert({
      job_card_id: jobId,
      checklist_item_id: item.id,
      description: defectDescription.trim(),
      photo_url: photoUrl,
    });

    if (insertError) {
      setDefectSubmitting(false);
      setDefectError("Couldn't save defect. Try again.");
      return;
    }

    await supabase.from("checklist_items").update({ status: "fail" }).eq("id", item.id);
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: "fail" } : it))
    );

    setDefectSubmitting(false);
    setDefectOpenId(null);
    setDefectDescription("");
    setDefectFile(null);
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-black dark:text-zinc-50">
              {item.field_label}
              {item.is_mandatory && <span className="ml-1 text-red-500">*</span>}
            </p>
            <span className="flex items-center gap-1.5 shrink-0">
              {savingId === item.id ? (
                <Loader2
                  size={13}
                  className="animate-spin text-zinc-400"
                  aria-label="Saving"
                />
              ) : item.status === "completed" ? (
                <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
              ) : null}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass(
                  item.status
                )}`}
              >
                {statusLabel(item.status)}
              </span>
            </span>
          </div>

          {locked ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {item.field_type === "photo"
                ? "See photos below"
                : item.value_recorded ?? "Not recorded"}
            </p>
          ) : item.field_type === "photo" ? null : item.field_type === "radio" ? (
            <div className="flex flex-wrap gap-2">
              {item.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => saveValue(item.id, opt)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    item.value_recorded === opt
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : item.field_type === "dropdown" ? (
            <select
              value={item.value_recorded ?? ""}
              onChange={(e) => saveValue(item.id, e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <option value="">Select...</option>
              {item.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : item.field_type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
              <input
                type="checkbox"
                checked={item.value_recorded === "Yes"}
                onChange={(e) => saveValue(item.id, e.target.checked ? "Yes" : "No")}
                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
              />
              Confirmed
            </label>
          ) : item.field_type === "number" ? (
            <input
              type="number"
              inputMode="decimal"
              value={item.value_recorded ?? ""}
              onChange={(e) => updateLocal(item.id, e.target.value)}
              onBlur={(e) => saveValue(item.id, e.target.value)}
              placeholder="Enter value"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          ) : (
            <textarea
              value={item.value_recorded ?? ""}
              onChange={(e) => updateLocal(item.id, e.target.value)}
              onBlur={(e) => saveValue(item.id, e.target.value)}
              placeholder="Add remarks"
              rows={2}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          )}

          {!locked && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => toggleDefectForm(item.id)}
                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                <AlertTriangle size={13} />
                {defectOpenId === item.id ? "Cancel" : "Report defect"}
              </button>

              {defectOpenId === item.id && (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                  <textarea
                    value={defectDescription}
                    onChange={(e) => setDefectDescription(e.target.value)}
                    placeholder="Describe the issue"
                    rows={2}
                    className="rounded-md border border-red-300 bg-white px-2 py-1.5 text-sm text-black dark:border-red-800 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <label className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                    <Camera size={14} />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setDefectFile(e.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                  </label>
                  {defectError && (
                    <p className="text-xs text-red-700 dark:text-red-400">{defectError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => submitDefect(item)}
                    disabled={defectSubmitting}
                    className="flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
                  >
                    {defectSubmitting && <Loader2 size={12} className="animate-spin" />}
                    Submit Defect
                  </button>
                </div>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
