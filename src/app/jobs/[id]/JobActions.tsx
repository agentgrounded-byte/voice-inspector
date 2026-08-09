"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function JobActions({
  jobId,
  status,
}: {
  jobId: string;
  status: "pending" | "in_progress" | "completed" | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function startJob() {
    setLoading(true);
    setErrorMsg(null);
    const { error } = await supabase
      .from("job_cards")
      .update({ status: "in_progress", start_time: new Date().toISOString() })
      .eq("id", jobId);

    setLoading(false);
    if (error) {
      setErrorMsg("Couldn't start job. Try again.");
      return;
    }
    router.refresh();
  }

  async function completeJob() {
    setLoading(true);
    setErrorMsg(null);

    const { data: missingItems, error: fetchError } = await supabase
      .from("checklist_items")
      .select("field_label")
      .eq("job_card_id", jobId)
      .eq("is_mandatory", true)
      .is("value_recorded", null);

    if (fetchError) {
      setLoading(false);
      setErrorMsg("Couldn't validate checklist. Try again.");
      return;
    }

    if (missingItems && missingItems.length > 0) {
      setLoading(false);
      setErrorMsg(
        `Fill in required fields first: ${missingItems
          .map((i) => i.field_label)
          .join(", ")}`
      );
      return;
    }

    const { error } = await supabase
      .from("job_cards")
      .update({ status: "completed", end_time: new Date().toISOString() })
      .eq("id", jobId);

    setLoading(false);
    if (error) {
      setErrorMsg("Couldn't complete job. Try again.");
      return;
    }
    router.refresh();
  }

  if (status === "completed") return null;

  return (
    <div className="flex flex-col gap-2">
      {status === "pending" ? (
        <button
          type="button"
          onClick={startJob}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 dark:bg-white dark:text-black"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          Start Job
        </button>
      ) : (
        <button
          type="button"
          onClick={completeJob}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 dark:bg-emerald-500"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle2 size={16} />
          )}
          Complete Job
        </button>
      )}
      {errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
