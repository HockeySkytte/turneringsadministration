import { notFound } from "next/navigation";

export default function OevelserPage() {
  const SHOW_OEVELSER = false;
  if (!SHOW_OEVELSER) notFound();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Øvelser</h1>
    </main>
  );
}
