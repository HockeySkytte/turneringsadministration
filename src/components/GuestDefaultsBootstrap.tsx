"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function GuestDefaultsBootstrap({
  enabled,
}: {
  enabled: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const res = await fetch("/api/ui/ensure-guest-defaults", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { changed?: boolean } | null;
      if (json?.changed) {
        router.refresh();
      }
    })();
  }, [enabled, router]);

  return null;
}
