import { Mic } from "lucide-react";

export default function TalkPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
        <Mic size={32} className="text-zinc-500 dark:text-zinc-400" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Talk to me
      </h1>
      <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
        Voice-driven inspection is coming in a later step. For now, use the
        Jobs and Assets tabs.
      </p>
    </div>
  );
}
