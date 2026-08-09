import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// This route runs server-side only. OPENAI_API_KEY must be set as a plain
// (non-NEXT_PUBLIC_) Vercel environment variable so it's never sent to the
// browser.

type JobRow = {
  id: string;
  title: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  assets: { name: string; location: string | null; asset_type: string } | null;
};

type ChecklistItemRow = {
  id: string;
  field_label: string;
  field_type: string;
  is_mandatory: boolean | null;
  value_recorded: string | null;
  checklist_template_fields: { options: string[] | null } | null;
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

const startJobTool = {
  type: "function" as const,
  function: {
    name: "start_job",
    description:
      "Start a specific pending inspection job for the technician, or switch to a different job than the one currently active. Only call this when the technician clearly says they're beginning work on a specific job or asset. Only choose from the list of pending jobs provided. If it's ambiguous which job they mean, don't call this — ask a clarifying question in your reply instead.",
    parameters: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "The id of the pending job to start, from the provided list.",
        },
      },
      required: ["job_id"],
    },
  },
};

const updateChecklistTool = {
  type: "function" as const,
  function: {
    name: "update_checklist_items",
    description:
      "Record one or more checklist field values for the job currently being worked on, based on what the technician just said.",
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string", description: "The checklist item id being updated." },
              value: { type: "string", description: "The value to record for this field." },
            },
            required: ["item_id", "value"],
          },
        },
      },
      required: ["updates"],
    },
  },
};

const completeJobTool = {
  type: "function" as const,
  function: {
    name: "complete_job",
    description:
      "Mark the job currently being worked on as completed. Only call this when the technician clearly says they're done, finished, or ready to submit.",
    parameters: { type: "object", properties: {} },
  },
};

async function fetchChecklistItems(jobId: string) {
  const { data: items } = await supabase
    .from("checklist_items")
    .select(
      "id, field_label, field_type, is_mandatory, value_recorded, checklist_template_fields(options)"
    )
    .eq("job_card_id", jobId);

  return (items as unknown as ChecklistItemRow[]) ?? [];
}

function summarizeChecklist(typedItems: ChecklistItemRow[]) {
  return (
    typedItems
      .map((item) => {
        const options = item.checklist_template_fields?.options ?? [];
        const optionsPart = options.length ? ` — options: [${options.join(", ")}]` : "";
        return `- id: ${item.id} — ${item.field_label} (${item.field_type}${
          item.is_mandatory ? ", mandatory" : ""
        })${optionsPart} — current value: ${item.value_recorded ?? "not recorded"}`;
      })
      .join("\n") || "No checklist items."
  );
}

/**
 * Coerces a model-provided value into something valid for this field's type,
 * rather than trusting the model to always follow the prompt's formatting
 * rules. Returns null if the value can't be confidently mapped (caller
 * should skip writing it rather than store something bogus).
 * Returns "" if the technician wants to clear the field.
 */
function normalizeChecklistValue(
  fieldType: string,
  options: string[],
  rawValue: string
): string | null {
  const value = (rawValue ?? "").trim();
  if (value === "") return "";
  if (fieldType === "photo") return null;

  if (fieldType === "checkbox") {
    const v = value.toLowerCase();
    if (/^(y|yes|true|confirmed?|secured?|ok|okay|good|done|checked)/.test(v)) return "Yes";
    if (/^(n|no|false|not|unsecured?|unconfirmed|unchecked)/.test(v)) return "No";
    return null;
  }

  if (fieldType === "radio" || fieldType === "dropdown") {
    const exact = options.find((o) => o.toLowerCase() === value.toLowerCase());
    if (exact) return exact;
    const partial = options.find(
      (o) =>
        o.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(o.toLowerCase())
    );
    return partial ?? null;
  }

  if (fieldType === "number") {
    const match = value.match(/-?\d+(\.\d+)?/);
    return match ? match[0] : null;
  }

  return value; // text, e.g. Inspector Remarks
}

export async function POST(req: Request) {
  let body: { transcript?: string; jobId?: string; history?: HistoryMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  const history: HistoryMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (m): m is HistoryMessage =>
            (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string"
        )
        .slice(-10)
    : [];

  const { data: jobs } = await supabase
    .from("job_cards")
    .select("id, title, status, start_time, end_time, assets(name, location, asset_type)")
    .order("start_time", { ascending: true, nullsFirst: true });

  const allJobs = (jobs as unknown as JobRow[]) ?? [];
  const pendingJobs = allJobs.filter((j) => j.status === "pending");

  const jobsSummary =
    allJobs
      .map((job) => {
        const asset = job.assets;
        const assetPart = asset
          ? ` — asset: ${asset.name} (${asset.asset_type})${
              asset.location ? ` at ${asset.location}` : ""
            }`
          : "";
        return `- [${job.status ?? "unknown"}] ${job.title}${assetPart} — start: ${
          job.start_time ?? "not started"
        } — end: ${job.end_time ?? "not finished"}`;
      })
      .join("\n") || "No jobs found.";

  const pendingSummary =
    pendingJobs
      .map((job) => {
        const asset = job.assets;
        return `- id: ${job.id} — ${job.title}${
          asset ? ` (asset: ${asset.name}, type: ${asset.asset_type})` : ""
        }`;
      })
      .join("\n") || "No pending jobs.";

  // Resolve the active job, if the client says one is in progress.
  const activeJob = body.jobId ? allJobs.find((j) => j.id === body.jobId) ?? null : null;

  let activeItems: ChecklistItemRow[] = [];
  if (activeJob) {
    activeItems = await fetchChecklistItems(activeJob.id);
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let systemPrompt = `You are a voice assistant inside "Voice Inspector," an app a water utility field technician uses on their phone. Today's date is ${today}. You're mid-conversation with the technician — use the prior turns below to resolve short replies like "yes", "no", or a bare number against whatever you just asked about.

Here is the technician's current job list, live from the database:
${jobsSummary}`;

  const tools: (typeof startJobTool | typeof updateChecklistTool | typeof completeJobTool)[] = [];

  if (activeJob) {
    const remarksField = activeItems.find((i) =>
      i.field_label.toLowerCase().includes("remark")
    );

    systemPrompt += `

The technician is on this job's page right now, so this is unambiguously the job they mean:
Job: ${activeJob.title} (id: ${activeJob.id})
Asset: ${activeJob.assets?.name ?? "unknown"} (${activeJob.assets?.asset_type ?? "unknown"})

Its checklist:
${summarizeChecklist(activeItems)}

Rules for this job's checklist:
- If the technician describes findings ("pressure is 45", "everything looks fine", "safety guard is secured"), call update_checklist_items with the matching item id(s) and value(s) for each field they addressed.
  - For radio/dropdown fields, the value MUST be one of that field's exact listed options, character for character. Never reuse a value that belongs to a different field.
  - For checkbox fields, the value MUST be exactly "Yes" or "No" — nothing else. Never put a condition word like "Operational" in a checkbox field.
  - For number fields, use just the numeric value they stated, no units.
  - Never fabricate a specific number the technician didn't state. A vague "everything's fine" only applies to condition-style radio fields (pick the normal/best option) and confirmation checkboxes ("Yes") — leave numeric fields for them to state explicitly.
  - Never fill "photo" type fields — those need an actual photo attached by tapping "Report defect" on the checklist, not voice. If they describe a problem/defect, acknowledge it in your reply and remind them to use "Report defect" on that item to attach a photo.${
    remarksField
      ? `
  - Anything the technician says that doesn't cleanly map to one of the structured fields above — general observations, context, things they mention in passing — should be recorded in the "${remarksField.field_label}" field (id: ${remarksField.id}) instead of being dropped. You can append to it across turns.`
      : ""
  }
- After applying updates, if any mandatory field on this checklist still has no value, ask the technician for it by name in your reply instead of just confirming.
- Only call complete_job when the technician clearly says they're done, finished, or ready to submit. If mandatory fields are still missing at that point, don't call it — tell them what's still needed instead.
- If the technician is just asking a general question instead, answer conversationally in 1-3 short sentences based on the data provided.`;

    tools.push(updateChecklistTool, completeJobTool);
  } else {
    systemPrompt += `

Here are the PENDING jobs eligible to be started (use these ids with the start_job tool):
${pendingSummary}

If the technician is asking a general question, answer conversationally in 1-3 short sentences based only on this data — if the question needs information this data doesn't include, say so honestly instead of guessing.`;

    tools.push(startJobTool);
  }

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: transcript },
      ],
      tools,
      temperature: 0.3,
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    return NextResponse.json(
      { error: "OpenAI request failed", detail },
      { status: 502 }
    );
  }

  const data = await openaiRes.json();
  const message = data.choices?.[0]?.message;
  const toolCalls: any[] = message?.tool_calls ?? [];

  let replyPrefix = "";
  let resultAction: string | null = null;
  let resultJobId: string | null = null;
  let resultJobTitle: string | null = null;

  for (const call of toolCalls) {
    const name = call.function?.name;
    let args: any = {};
    try {
      args = JSON.parse(call.function?.arguments ?? "{}");
    } catch {
      continue;
    }

    if (name === "start_job") {
      const matchedJob = pendingJobs.find((j) => j.id === args.job_id);
      if (!matchedJob) {
        replyPrefix += "I couldn't find that job to start. ";
        continue;
      }
      const { error: updateError } = await supabase
        .from("job_cards")
        .update({ status: "in_progress", start_time: new Date().toISOString() })
        .eq("id", matchedJob.id);

      if (updateError) {
        replyPrefix += "I found the job but couldn't start it. ";
        continue;
      }
      replyPrefix += `Started ${matchedJob.title}. `;
      resultAction = "start_job";
      resultJobId = matchedJob.id;
      resultJobTitle = matchedJob.title;
    }

    if (name === "update_checklist_items" && activeJob) {
      const itemById = new Map(activeItems.map((i) => [i.id, i]));
      const updates: { item_id: string; value: string }[] = Array.isArray(args.updates)
        ? args.updates
        : [];

      let appliedCount = 0;
      const skippedLabels: string[] = [];

      for (const u of updates) {
        const item = itemById.get(u.item_id);
        if (!item) continue;

        const options = item.checklist_template_fields?.options ?? [];
        const normalized = normalizeChecklistValue(item.field_type, options, u.value ?? "");

        if (normalized === null) {
          skippedLabels.push(item.field_label);
          continue;
        }

        await supabase
          .from("checklist_items")
          .update({
            value_recorded: normalized === "" ? null : normalized,
            status: normalized === "" ? "pending" : "completed",
          })
          .eq("id", u.item_id);
        appliedCount++;
      }

      if (appliedCount > 0) {
        replyPrefix += `Recorded ${appliedCount} item${appliedCount === 1 ? "" : "s"}. `;
      }
      if (skippedLabels.length > 0) {
        replyPrefix += `Couldn't confidently record: ${skippedLabels.join(", ")} — can you rephrase those? `;
      }

      // Describing findings out loud is, in effect, starting the job — so a
      // pending job auto-transitions to in_progress the first time voice
      // records something against it, same as tapping "Start Job" would.
      if (appliedCount > 0 && activeJob.status === "pending") {
        await supabase
          .from("job_cards")
          .update({ status: "in_progress", start_time: new Date().toISOString() })
          .eq("id", activeJob.id);
      }
    }

    if (name === "complete_job" && activeJob) {
      const { data: missing } = await supabase
        .from("checklist_items")
        .select("field_label")
        .eq("job_card_id", activeJob.id)
        .eq("is_mandatory", true)
        .is("value_recorded", null);

      if (missing && missing.length > 0) {
        replyPrefix += `I still need: ${missing.map((m) => m.field_label).join(", ")}. `;
      } else {
        const { error: completeError } = await supabase
          .from("job_cards")
          .update({ status: "completed", end_time: new Date().toISOString() })
          .eq("id", activeJob.id);

        if (!completeError) {
          replyPrefix += `${activeJob.title} is complete. Nice work. `;
          resultAction = "complete_job";
          resultJobId = activeJob.id;
          resultJobTitle = activeJob.title;
        } else {
          replyPrefix += "I couldn't complete the job. Try again. ";
        }
      }
    }
  }

  const modelText: string = message?.content?.trim() ?? "";
  const answer = (replyPrefix + modelText).trim() || "Got it.";

  return NextResponse.json({
    answer,
    action: resultAction,
    jobId: resultJobId,
    jobTitle: resultJobTitle,
  });
}
