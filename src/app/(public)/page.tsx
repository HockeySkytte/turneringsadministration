import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/kalender");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Floorball Portalen</h1>
      <p className="mt-2 text-zinc-600">Log ind eller opret en bruger.</p>

      <div className="mt-6 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-[var(--brand)] px-4 py-2 text-[var(--brand-foreground)]"
        >
          Log ind
        </Link>
        <Link
          href="/opret-bruger"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2"
        >
          Opret bruger
        </Link>
      </div>
    </main>
  );
}
