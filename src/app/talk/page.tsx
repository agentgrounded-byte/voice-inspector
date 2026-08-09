"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { speak } from "@/lib/speak";

export default function TalkPage() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [askError, setAskError] = useState<string | null>(null);

  const { listening, transcript, interim, supported, toggleListening } =
    useSpeechRecognition(askQuestion);

  async function askQuestion(text: string) {
    setAsking(true);
    setAskError(null);
    setAnswer("");
    try {
      const res = await fetch("/api/voice/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const responseText: string = data.answer ?? "";
      setAnswer(responseText);
      speak(responseText);

      if (data.action === "start_job" && data.jobId) {
        setTimeout(() => router.push(`/jobs/${data.jobId}`), 1200);
      }
    } catch {
      setAskError("Couldn't get an answer. Try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      {!supported ? (
        <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
          Voice isn&apos;t supported in this browser. Try Chrome.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleListening}
            className={`flex h-20 w-20 items-center justify-center rounded-full transition-colors ${
              listening
                ? "bg-red-500 text-white"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {listening ? <MicOff size={32} /> : <Mic size={32} />}
          </button>
          <p className="text-sm font-medium text-black dark:text-zinc-50">
            {listening ? "Listening..." : "Tap to talk"}
          </p>

          <div className="min-h-16 w-full max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            {transcript || interim ? (
              <p className="text-black dark:text-zinc-50">
                {transcript}
                {interim && <span className="text-zinc-400"> {interim}</span>}
              </p>
            ) : (
              <p className="text-zinc-400 dark:text-zinc-500">
                Ask something like &quot;What are my jobs today?&quot; or say
                &quot;I&apos;m inspecting Pump A-1&quot; to start a job.
              </p>
            )}
          </div>

          {(asking || answer || askError) && (
            <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              {asking ? (
                <p className="flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </p>
              ) : askError ? (
                <p className="text-red-600 dark:text-red-400">{askError}</p>
              ) : (
                <p className="text-black dark:text-zinc-50">{answer}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
