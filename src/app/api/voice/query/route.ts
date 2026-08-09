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

const tools = [
  {
    type: "function" as const,
    function: {
      name: "start_job",
      description:
        "Start a specific pending inspection job for the technician. Only call this when the technician clearly says they're beginning work on a specific job or asset (e.g. 'I'm inspecting Pump A-1', 'starting the booster pump check'). Only choose from the list of pending jobs provided. If it's ambiguous which job they mean, don't call this — ask a clarifying question in your reply instead.",
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
  },
];

export async function POST(req: Request) {
  let body: { transcript?: string };
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

  const pendingJobs = allJobs.filter((j) => j.status === "pending");
  const pendingSummary =
    pendingJobs
      .map((job) => {
        const asset = job.assets;
        return `- id: ${job.id} — ${job.title}${
          asset ? ` (asset: ${asset.name}, type: ${asset.asset_type})` : ""
        }`;
      })
      .join("\n") || "No pending jobs.";

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `You are a voice assistant inside "Voice Inspector," an app a water utility field technician uses on their phone. Today's date is ${today}.

Here is the technician's current job list, live from the database:
${jobsSummary}

Here are the PENDING jobs eligible to be started (use these ids with the start_job tool):
${pendingSummary}

If the technician is asking a question, answer conversationally in 1-3 short sentences based only on this data — if the question needs information this data doesn't include, say so honestly instead of guessing.

If the technician is clearly announcing they're starting work on one specific pending job (e.g. naming the asset or job), call the start_job tool with that job's id instead of just replying. If more than one pending job could match, don't call the tool — ask them to clarify which one instead.`;

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
  const toolCall = message?.tool_calls?.[0];

  if (toolCall?.function?.name === "start_job") {
    let jobId: string | undefined;
    try {
      jobId = JSON.parse(toolCall.function.arguments)?.job_id;
    } catch {
      // fall through to generic error below
    }

    const matchedJob = pendingJobs.find((j) => j.id === jobId);
    if (!matchedJob) {
      return NextResponse.json({
        answer: "I couldn't find that job to start. Could you say which one again?",
      });
    }

    const { error: updateError } = await supabase
      .from("job_cards")
      .update({ status: "in_progress", start_time: new Date().toISOString() })
      .eq("id", matchedJob.id);

    if (updateError) {
      return NextResponse.json({
        answer: "I found the job but couldn't start it. Try again in a moment.",
      });
    }

    return NextResponse.json({
      answer: `Started ${matchedJob.title}. Good luck out there.`,
      action: "start_job",
      jobId: matchedJob.id,
    });
  }

  const answer: string =
    message?.content?.trim() ?? "Sorry, I couldn't come up with an answer.";

  return NextResponse.json({ answer });
}
