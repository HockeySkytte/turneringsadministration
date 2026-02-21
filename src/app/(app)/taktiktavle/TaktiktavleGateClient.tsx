"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TaktiktavleEditorClient from "@/components/taktiktavle/TaktiktavleEditorClient";

export default function TaktiktavleGateClient() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");

    const update = () => setIsMobile(!!mq.matches);
    update();

    // Safari <14 uses addListener/removeListener
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    // eslint-disable-next-line deprecation/deprecation
    mq.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mq.removeListener(update);
  }, []);

  const shouldRedirect = useMemo(() => isMobile, [isMobile]);

  useEffect(() => {
    if (!shouldRedirect) return;
    router.replace("/statistik");
  }, [router, shouldRedirect]);

  if (shouldRedirect) return null;

  return <TaktiktavleEditorClient />;
}
