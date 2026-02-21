"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type HoldTabKey = "kampe" | "stilling" | "spillere";

function buttonClass(active: boolean) {
  return (
    "rounded-md px-3 py-2 text-sm font-semibold " +
    (active
      ? "text-[var(--brand-foreground)]"
      : "border border-zinc-300 bg-white text-zinc-900")
  );
}

export default function HoldTabsClient({ activeTab }: { activeTab: HoldTabKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setTab(tab: HoldTabKey) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);

    router.replace(`${pathname}?${next.toString()}`);
    router.refresh();
  }

  const tabBtn = (key: HoldTabKey, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={buttonClass(activeTab === key)}
      style={activeTab === key ? { background: "var(--brand)" } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {tabBtn("kampe", "Kampe")}
      {tabBtn("stilling", "Stilling")}
      {tabBtn("spillere", "Spillere")}
    </div>
  );
}
