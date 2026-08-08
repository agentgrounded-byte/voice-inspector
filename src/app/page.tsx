export default function Home() {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Voice Inspector — Pipeline Test
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{today}</p>
      </main>
    </div>
  );
}
