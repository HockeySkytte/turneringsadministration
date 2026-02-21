import Link from "next/link";
import MatchReportRotatableImage from "./MatchReportRotatableImage";

async function headOk(url: string): Promise<{ ok: boolean; contentType: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    return { ok: res.ok, contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return { ok: false, contentType: "" };
  }
}

export default async function MatchReportViewer({ kampId }: { kampId: number }) {
  const candidates = [
    `https://floora.floorball.dk/Public/MatchFile/${kampId}.jpg`,
    `https://floora.floorball.dk/Public/MatchFile/${kampId}.jpeg`,
    `https://floora.floorball.dk/Public/MatchFile/${kampId}.png`,
    `https://floora.floorball.dk/Public/MatchFile/${kampId}.pdf`,
  ];

  let resolvedUrl: string | null = null;
  let kind: "pdf" | "image" | null = null;
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const { ok, contentType } = await headOk(url);
    if (!ok) continue;

    resolvedUrl = url;
    if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
      kind = "pdf";
    } else {
      kind = "image";
    }
    break;
  }

  return (
    <div className="space-y-3">
      {!resolvedUrl ? null : kind === "pdf" ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <object data={resolvedUrl} type="application/pdf" className="h-[80vh] w-full">
            <div className="p-4 text-sm text-zinc-700">
              Kunne ikke vise PDF'en direkte. Brug linket ovenfor.
            </div>
          </object>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <MatchReportRotatableImage src={resolvedUrl} alt={`Kamprapport ${kampId}`} />
        </div>
      )}
    </div>
  );
}
