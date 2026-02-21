import { notFound } from "next/navigation";

export default function PlaybookPage() {
  const SHOW_PLAYBOOK = false;
  if (!SHOW_PLAYBOOK) notFound();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Playbook</h1>
    </main>
  );
}
