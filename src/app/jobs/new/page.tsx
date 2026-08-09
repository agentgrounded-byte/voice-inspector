import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: PageProps<"/jobs/new">) {
  const resolvedParams = await searchParams;
  const initialAssetId =
    typeof resolvedParams.asset === "string" ? resolvedParams.asset : "";

  const [{ data: assets }, { data: templates }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, name, location, asset_type")
      .order("name", { ascending: true }),
    supabase
      .from("checklist_templates")
      .select(
        "id, asset_type, title, checklist_template_fields(id, field_label, field_type, is_mandatory)"
      ),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <Link
          href="/jobs"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
          Jobs
        </Link>

        <header>
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
            New Job
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Start a new inspection for an asset
          </p>
        </header>

        <NewJobForm
          assets={assets ?? []}
          templates={templates ?? []}
          initialAssetId={initialAssetId}
        />
      </main>
    </div>
  );
}
