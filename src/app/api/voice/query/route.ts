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

async function fetchChecklistSummary(jobId: string) {
  const { data: items } = await supabase
    .from("checklist_items")
    .select(
      "id, field_label, field_type, is_mandatory, value_recorded, checklist_template_fields(options)"
    )
    .eq("job_card_id", jobId);

  const typedItems = (items as unknown as ChecklistItemRow[]) ?? [];

  const summary =
    typedItems
      .map((item) => {
        const options = item.checklist_template_fields?.options ?? [];
        const optionsPart = options.length ? ` — options: [${options.join(", ")}]` : "";
        return `- id: ${item.id} — ${item.field_label} (${item.field_type}${
          item.is_mandatory ? ", mandatory" : ""
        })${optionsPart} — current value: ${item.value_recorded ?? "not recorded"}`;
      })
      .join("\n") || "No checklist items.";

  return { typedItems, summary };
}

export async function POST(req: Request) {
  let body: { transcript?: string; jobId?: string };
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

  let checklistSummary = "";
  if (activeJob) {
    const { summary } = await fetchChecklistSummary(activeJob.id);
    checklistSummary = summary;
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let systemPrompt = `You are a voice assistant inside "Voice Inspector," an app a water utility field technician uses on their phone. Today's date is ${today}.

Here is the technician's current job list, live from the database:
${jobsSummary}

Here are the PENDING jobs eligible to be started (use these ids with the start_job tool):
${pendingSummary}

If the technician is asking a general question, answer conversationally in 1-3 short sentences based only on this data — if the question needs information this data doesn't include, say so honestly instead of guessing.`;

  const tools = [startJobTool];

  if (activeJob) {
    systemPrompt += `

The technician is currently working on this job:
Job: ${activeJob.title} (id: ${activeJob.id})
Asset: ${activeJob.assets?.name ?? "unknown"} (${activeJob.assets?.asset_type ?? "unknown"})

Its checklist:
${checklistSummary}

Rules for this job's checklist:
- If the technician describes findings ("pressure is 45", "everything looks fine", "safety guard is secured"), call update_checklist_items with the matching item id(s) and value(s) for each field they addressed.
  - For radio/dropdown fields, use one of the field's exact listed options.
  - For checkbox fields, use "Yes" or "No".
  - For number fields, use just the numeric value they stated.
  - For text fields, use their described remarks.
  - Never fabricate a specific number or remark the technician didn't state. A vague "everything's fine" only applies to condition-style radio fields (pick the normal/best option) and confirmation checkboxes — leave numeric and text fields for them to state explicitly.
  - Never fill "photo" type fields — those need an actual photo attached by tapping "Report defect" on the checklist, not voice. If they describe a problem/defect, acknowledge it in your reply and remind them to use "Report defect" on that item to attach a photo.
- After applying updates, if any mandatory field on this checklist still has no value, ask the technician for it by name in your reply instead of just confirming.
- Only call complete_job when the technician clearly says they're done, finished, or ready to submit. If mandatory fields are still missing at that point, don't call it — tell them what's still needed instead.
- If the technician starts describing a different job/asset entirely, call start_job for that one instead.`;

    tools.push(updateChecklistTool, completeJobTool);
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
      const { typedItems } = await fetchChecklistSummary(activeJob.id);
      const validIds = new Set(typedItems.map((i) => i.id));
      const updates: { item_id: string; value: string }[] = Array.isArray(args.updates)
        ? args.updates
        : [];

      for (const u of updates) {
        if (!validIds.has(u.item_id)) continue;
        const trimmed = (u.value ?? "").trim();
        await supabase
          .from("checklist_items")
          .update({
            value_recorded: trimmed === "" ? null : trimmed,
            status: trimmed === "" ? "pending" : "completed",
          })
          .eq("id", u.item_id);
      }
      replyPrefix += `Recorded ${updates.length} item${updates.length === 1 ? "" : "s"}. `;
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
