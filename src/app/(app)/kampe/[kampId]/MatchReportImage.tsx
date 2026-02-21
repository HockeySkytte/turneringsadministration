"use client";

import { useMemo, useState } from "react";

export default function MatchReportImage({ kampId }: { kampId: number }) {
  const [failed, setFailed] = useState(false);

  const src = useMemo(
    () => `https://floora.floorball.dk/Public/MatchFile/${kampId}.jpg`,
    [kampId]
  );

  if (failed) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        Kunne ikke hente kamprapport-billedet.
        <div className="mt-1 text-xs text-zinc-500">{src}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <img
        src={src}
        alt={`Kamprapport ${kampId}`}
        className="h-auto w-full"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
