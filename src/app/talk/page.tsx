"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2, Briefcase, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

// The Web Speech API isn't in TypeScript's default DOM lib, so we access it
// via `window` with loose typing rather than pulling in extra type packages.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type ActiveJob = { id: string; title: string };

export default function TalkPage() {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const activeJobRef = useRef<ActiveJob | null>(null);

  // If the technician already started a job via the click-through flow before
  // coming here, pick it up automatically so voice can continue where they
  // left off, rather than forcing them to say it again.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("job_cards")
        .select("id, title")
        .eq("status", "in_progress")
        .order("start_time", { ascending: false })
        .limit(1);
      if (data && data.length === 1) {
        setActiveJob(data[0]);
        activeJobRef.current = data[0];
      }
    })();
  }, []);

  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return;
    }

    const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText) {
        setTranscript((prev) => {
          const next = prev ? `${prev} ${finalText}`.trim() : finalText.trim();
          transcriptRef.current = next;
          return next;
        });
      }
      setInterim(interimText);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      if (transcriptRef.current.trim()) {
        askQuestion(transcriptRef.current.trim());
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askQuestion(text: string) {
    setAsking(true);
    setAskError(null);
    setAnswer("");
    try {
      const res = await fetch("/api/voice/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, jobId: activeJobRef.current?.id ?? null }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const responseText: string = data.answer ?? "";
      setAnswer(responseText);
      speak(responseText);

      if (data.action === "start_job" && data.jobId) {
        const job = { id: data.jobId, title: data.jobTitle ?? "Job" };
        setActiveJob(job);
        activeJobRef.current = job;
      } else if (data.action === "complete_job") {
        setActiveJob(null);
        activeJobRef.current = null;
        if (data.jobId) {
          setTimeout(() => router.push(`/jobs/${data.jobId}`), 1500);
        }
      }
    } catch {
      setAskError("Couldn't get an answer. Try again.");
    } finally {
      setAsking(false);
    }
  }

  function speak(text: string) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
    } else {
      setTranscript("");
      setInterim("");
      setAnswer("");
      setAskError(null);
      transcriptRef.current = "";
      recognition.start();
      setListening(true);
    }
  }

  function clearActiveJob() {
    setActiveJob(null);
    activeJobRef.current = null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      {!supported ? (
        <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
          Voice isn&apos;t supported in this browser. Try Chrome.
        </p>
      ) : (
        <>
          {activeJob && (
            <div className="flex w-full max-w-sm items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <Link
                href={`/jobs/${activeJob.id}`}
                className="flex min-w-0 items-center gap-1.5 text-zinc-600 hover:underline dark:text-zinc-300"
              >
                <Briefcase size={13} className="shrink-0" />
                <span className="truncate">Working on: {activeJob.title}</span>
              </Link>
              <button
                type="button"
                onClick={clearActiveJob}
                aria-label="Clear active job"
                className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X size={14} />
              </button>
            </div>
          )}

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
                {activeJob
                  ? 'Describe what you see, e.g. "pressure is 45, everything else looks fine."'
                  : 'Ask something like "What are my jobs today?"'}
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
