"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
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
  items: initialItems,
  locked = false,
}: {
  items: ChecklistItemForForm[];
  locked?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);

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
          ) : item.field_type === "photo" ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Photo capture coming in a later step.
            </p>
          ) : item.field_type === "radio" ? (
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
        </li>
      ))}
    </ul>
  );
}
