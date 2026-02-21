"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Size = { width: number; height: number };

function clampPositive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeLayout({
  containerWidth,
  natural,
  rotationDeg,
}: {
  containerWidth: number;
  natural: Size;
  rotationDeg: number;
}): { rendered: Size; boxHeight: number } {
  const cw = clampPositive(containerWidth);
  const nw = clampPositive(natural.width);
  const nh = clampPositive(natural.height);

  if (!cw || !nw || !nh) {
    return { rendered: { width: 0, height: 0 }, boxHeight: 0 };
  }

  const normalized = ((rotationDeg % 360) + 360) % 360;

  // Requirement: width is always 100% (bounding box width == container width).
  // For 0/180: rendered width is cw; height follows aspect ratio.
  // For 90/270: bounding box width equals rendered height, so set rendered height to cw.
  const isQuarterTurn = normalized === 90 || normalized === 270;

  if (!isQuarterTurn) {
    const renderedW = cw;
    const renderedH = (cw * nh) / nw;
    return { rendered: { width: renderedW, height: renderedH }, boxHeight: renderedH };
  }

  const renderedH = cw;
  const renderedW = (cw * nw) / nh;
  // After rotation, the bounding box height equals rendered width.
  return { rendered: { width: renderedW, height: renderedH }, boxHeight: renderedW };
}

export default function MatchReportRotatableImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [rotationDeg, setRotationDeg] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerWidth(rect.width);
    });

    ro.observe(el);

    // Initial
    const rect = el.getBoundingClientRect();
    setContainerWidth(rect.width);

    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => computeLayout({ containerWidth, natural, rotationDeg }),
    [containerWidth, natural, rotationDeg]
  );

  if (failed) {
    return (
      <div className="p-4 text-sm text-zinc-700">
        Kunne ikke hente kamprapport-billedet.
        <div className="mt-1 break-all text-xs text-zinc-500">{src}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
        <div className="text-xs text-zinc-600" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotationDeg((d) => (d + 90) % 360)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
            title="Rotér billedet 90°"
          >
            Rotér
          </button>
          {rotationDeg !== 0 ? (
            <button
              type="button"
              onClick={() => setRotationDeg(0)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900"
              title="Nulstil rotation"
            >
              Nulstil
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full bg-white"
        style={{ height: layout.boxHeight ? `${layout.boxHeight}px` : "80vh" }}
      >
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          onLoad={(e) => {
            const img = e.currentTarget;
            const w = img.naturalWidth || 0;
            const h = img.naturalHeight || 0;
            setNatural({ width: w, height: h });
          }}
          className="absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: layout.rendered.width ? `${layout.rendered.width}px` : undefined,
            height: layout.rendered.height ? `${layout.rendered.height}px` : undefined,
            transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
}
