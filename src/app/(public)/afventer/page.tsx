import Link from "next/link";

export default function AfventerPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Afventer godkendelse</h1>
      <p className="mt-2 text-zinc-600">
        Din konto er oprettet, men dine rettigheder afventer godkendelse.
      </p>
      <p className="mt-4 text-sm text-zinc-600">
        Godkendelse følger et hierarki: <strong>Admin</strong> godkender
        <strong> Turneringsadmin</strong> og <strong>Dommeradmin</strong>. En
        <strong> Turneringsadmin</strong> godkender <strong>Klubledere</strong>.
        En <strong>Klubleder</strong> godkender <strong>Holdledere</strong> og
        <strong> Sekretariat</strong>. En <strong>Dommeradmin</strong> godkender
        <strong> Dommere</strong>.
      </p>

      <div className="mt-6">
        <Link className="underline" href="/login">
          Tilbage til login
        </Link>
      </div>
    </main>
  );
}
