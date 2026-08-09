import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// This route runs server-side only. OPENAI_API_KEY must be set as a plain
// (non-NEXT_PUBLIC_) Vercel environment variable so it's never sent to the
// browser.

type JobRow = {
  title: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  assets: { name: string; location: string | null; asset_type: string } | null;
};

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
    .select("title, status, start_time, end_time, assets(name, location, asset_type)")
    .order("start_time", { ascending: true, nullsFirst: true });

  const jobsSummary =
    ((jobs as unknown as JobRow[]) ?? [])
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

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `You are a voice assistant inside "Voice Inspector," an app a water utility field technician uses on their phone. Today's date is ${today}.

Here is the technician's current job list, live from the database:
${jobsSummary}

Answer the technician's question conversationally in 1-3 short sentences, based only on this data. If the question needs information this data doesn't include, say so honestly instead of guessing.`;

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
  const answer: string =
    data.choices?.[0]?.message?.content?.trim() ??
    "Sorry, I couldn't come up with an answer.";

  return NextResponse.json({ answer });
}
