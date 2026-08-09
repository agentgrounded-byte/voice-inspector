import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Asset = {
  id: string;
  name: string;
  location: string | null;
  asset_type: string;
};

export default async function AssetsPage() {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, name, location, asset_type")
    .order("name", { ascending: true });

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Assets
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live from Supabase
          </p>
        </header>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load assets: {error.message}
          </p>
        ) : !assets || assets.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No assets found.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(assets as Asset[]).map((asset) => (
              <li
                key={asset.id}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="font-medium text-black dark:text-zinc-50">
                  {asset.name}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {asset.asset_type}
                  {asset.location ? ` — ${asset.location}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
