"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { speak } from "@/lib/speak";

type HistoryMessage = { role: "user" | "assistant"; content: string };

export default function JobMic({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);

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
        body: JSON.stringify({ transcript: text, jobId, history }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const responseText: string = data.answer ?? "";
      setAnswer(responseText);
      speak(responseText);
      setHistory((prev) => {
        const next: HistoryMessage[] = [
          ...prev,
          { role: "user", content: text },
          { role: "assistant", content: responseText },
        ];
        return next.slice(-10);
      });
      router.refresh();
    } catch {
      setAskError("Couldn't get an answer. Try again.");
    } finally {
      setAsking(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={toggleListening}
        className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
          listening
            ? "bg-red-500 text-white"
            : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        {listening ? <MicOff size={22} /> : <Mic size={22} />}
      </button>
      <p className="text-xs font-medium text-black dark:text-zinc-50">
        {listening ? "Listening..." : "Talk through this checklist"}
      </p>

      {(transcript || interim) && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          {transcript}
          {interim && <span className="text-zinc-400"> {interim}</span>}
        </p>
      )}

      {(asking || answer || askError) && (
        <div className="w-full rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800/60">
          {asking ? (
            <p className="flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              Thinking...
            </p>
          ) : askError ? (
            <p className="text-red-600 dark:text-red-400">{askError}</p>
          ) : (
            <p className="text-black dark:text-zinc-50">{answer}</p>
          )}
        </div>
      )}
    </div>
  );
}
