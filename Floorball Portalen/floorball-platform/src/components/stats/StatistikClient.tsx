"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStatsFilters } from "@/components/stats/StatsFiltersProvider";
import VideoSection from "@/components/stats/VideoSection";

type StatsFile = {
  id: string;
  kind: "EVENTS" | "PLAYERS";
  originalName: string;
  createdAt: string;
  gameId: string | null;
  gameDate: string | null;
  competition: string | null;
};

type StatsEvent = {
  id: string;
  timestamp: string | null;
  period: number | null;
  event: string;
  perspective?: string | null;
  strength?: string | null;
  goalieName?: string | null;
  gNo?: number | null;
  teamName?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  homePlayersNames?: string | null;
  awayPlayersNames?: string | null;
  p1No: number | null;
  p1Name: string | null;
  p2No: number | null;
  p2Name: string | null;
  xM: number | null;
  yM: number | null;
  videoUrl?: string | null;
  videoTime?: number | null;
  gameId: string | null;
  gameDate?: string | null;
  competition: string | null;
  file: { id: string; originalName: string; createdAt: string };
};

type TabKey = "events" | "shotmap" | "heatmap" | "tabeller";

type StatsPlayerSummary = {
  id: string;
  number: number | null;
  name: string | null;
  line: string | null;
  teamName: string | null;
  teamColor: string | null;
  gameId: string | null;
};

type ShotKind = "GOAL" | "SHOT" | "MISS" | "BLOCK" | "PENALTY";

type ZonesGeoJson = {
  type: "FeatureCollection";
  features: ZoneFeature[];
};

type ZoneFeature = {
  type: "Feature";
  properties: { id: string; side: "O" | "D" };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

function classifyShotKind(event: string): ShotKind {
  const e = String(event ?? "").trim().toLowerCase();
  if (e.includes("goal")) return "GOAL";
  if (e.includes("miss")) return "MISS";
  if (e.includes("block")) return "BLOCK";
  if (e.includes("penalty")) return "PENALTY";
  return "SHOT";
}

function isShotLikeEvent(event: string) {
  const e = String(event ?? "").trim().toLowerCase();
  return e.includes("goal") || e.includes("shot") || e.includes("miss") || e.includes("block") || e.includes("penalty");
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toHalfRinkPoint(
  xM: number,
  yM: number,
  half: "left" | "right"
): { x: number; y: number } | null {
  // Data uses center-origin meters: x in [-20,20], y in [-10,10]
  // Each half-rink displays x in [-20,0] (left) or [0,20] (right), normalized to [0,1]
  const x = clamp(xM, -20, 20);
  const y = clamp(yM, -10, 10);

  if (half === "left") {
    if (x > 0) return null;
    return { x: (x + 20) / 20, y: (-y + 10) / 20 };
  }

  if (x < 0) return null;
  return { x: x / 20, y: (-y + 10) / 20 };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return clamp(t, 0, 1);
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function mixRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  const tt = clamp01(t);
  return {
    r: Math.round(lerp(a.r, b.r, tt)),
    g: Math.round(lerp(a.g, b.g, tt)),
    b: Math.round(lerp(a.b, b.b, tt)),
  };
}

function rgbCss(c: { r: number; g: number; b: number }) {
  return `rgb(${c.r} ${c.g} ${c.b})`;
}

function textColorForRgbBg(bg: string) {
  // Expects `rgb(r g b)` from rgbCss(). Falls back to dark text.
  const m = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)/.exec(bg);
  if (!m) return "rgb(9 9 11)"; // zinc-950
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  // Relative luminance (sRGB), simple threshold works well for these scales.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.6 ? "rgb(255 255 255)" : "rgb(9 9 11)";
}

function Pill({ value, bg }: { value: React.ReactNode; bg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{ background: bg, color: textColorForRgbBg(bg) }}
    >
      {value}
    </span>
  );
}

function colorScaleRedWhiteBlue(value: number, low: number, mid: number, high: number) {
  // Requested colors: red at low, white at mid, blue at high.
  const red = hexToRgb("#ef4444");
  const white = hexToRgb("#ffffff");
  const blue = hexToRgb("#3b82f6");

  if (!Number.isFinite(value)) return rgbCss(white);
  if (value <= mid) {
    const t = (value - low) / Math.max(1e-9, mid - low);
    return rgbCss(mixRgb(red, white, t));
  }
  const t = (value - mid) / Math.max(1e-9, high - mid);
  return rgbCss(mixRgb(white, blue, t));
}

type ShotMapKpis = {
  corsi: { ca: number; cfPct: number; cf: number };
  fenwick: { fa: number; ffPct: number; ff: number };
  shots: { sa: number; sfPct: number; sf: number };
  goals: { ga: number; gfPct: number; gf: number };
  sg: { svPct: number; pdo: number; shPct: number };
};

function computeShotMapKpis(events: StatsEvent[], selectedTeam: string): ShotMapKpis {
  const sel = String(selectedTeam ?? "").trim();
  const isFor = (e: StatsEvent) => String(e.teamName ?? "").trim() === sel;

  let corsiFor = 0;
  let corsiAgainst = 0;
  let fenwickFor = 0;
  let fenwickAgainst = 0;
  let shotsFor = 0;
  let shotsAgainst = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const e of events) {
    const kind = classifyShotKind(e.event);
    if (kind === "PENALTY") continue;
    const forTeam = isFor(e);

    const isCorsi = kind === "GOAL" || kind === "SHOT" || kind === "MISS" || kind === "BLOCK";
    const isFenwick = kind === "GOAL" || kind === "SHOT" || kind === "MISS";
    const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
    const isGoal = kind === "GOAL";

    if (isCorsi) {
      if (forTeam) corsiFor++;
      else corsiAgainst++;
    }
    if (isFenwick) {
      if (forTeam) fenwickFor++;
      else fenwickAgainst++;
    }
    if (isShotOnGoal) {
      if (forTeam) shotsFor++;
      else shotsAgainst++;
    }
    if (isGoal) {
      if (forTeam) goalsFor++;
      else goalsAgainst++;
    }
  }

  const pctShare = (f: number, a: number) => {
    const den = f + a;
    return den > 0 ? (f / den) * 100 : 0;
  };

  const cfPct = pctShare(corsiFor, corsiAgainst);
  const ffPct = pctShare(fenwickFor, fenwickAgainst);
  const sfPct = pctShare(shotsFor, shotsAgainst);
  const gfPct = pctShare(goalsFor, goalsAgainst);

  const svPct = shotsAgainst > 0 ? ((shotsAgainst - goalsAgainst) / shotsAgainst) * 100 : 0;
  const shPct = shotsFor > 0 ? (goalsFor / shotsFor) * 100 : 0;
  const pdo = svPct + shPct;

  return {
    corsi: { ca: corsiAgainst, cfPct, cf: corsiFor },
    fenwick: { fa: fenwickAgainst, ffPct, ff: fenwickFor },
    shots: { sa: shotsAgainst, sfPct, sf: shotsFor },
    goals: { ga: goalsAgainst, gfPct, gf: goalsFor },
    sg: { svPct, pdo, shPct },
  };
}

function pct(n: number) {
  return Math.round(n * 10) / 10;
}

function pointInPolygon(x: number, y: number, ring: number[][]) {
  // Ray-casting algorithm. Assumes ring is closed or open (we handle both).
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / Math.max(1e-9, yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distance2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function polygonToSvgPath(
  ring: number[][],
  half: "left" | "right"
): { d: string; cx: number; cy: number } | null {
  const pts: Array<{ x: number; y: number }> = [];
  for (const p of ring) {
    const mapped = toHalfRinkPoint(p[0]!, p[1]!, half);
    if (!mapped) return null;
    pts.push({ x: mapped.x * 100, y: mapped.y * 100 });
  }
  if (pts.length === 0) return null;

  // Centroid of polygon (area-weighted). Falls back to vertex-average for degenerate polygons.
  const ptsForCentroid =
    pts.length > 2 && pts[0]!.x === pts[pts.length - 1]!.x && pts[0]!.y === pts[pts.length - 1]!.y
      ? pts.slice(0, -1)
      : pts;

  let area2 = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  for (let i = 0; i < ptsForCentroid.length; i++) {
    const p0 = ptsForCentroid[i]!;
    const p1 = ptsForCentroid[(i + 1) % ptsForCentroid.length]!;
    const cross = p0.x * p1.y - p1.x * p0.y;
    area2 += cross;
    cxAcc += (p0.x + p1.x) * cross;
    cyAcc += (p0.y + p1.y) * cross;
  }

  const area = area2 / 2;
  const cx = Math.abs(area) > 1e-6 ? cxAcc / (6 * area) : pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = Math.abs(area) > 1e-6 ? cyAcc / (6 * area) : pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const d =
    `M ${pts[0]!.x} ${pts[0]!.y} ` +
    pts
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ") +
    " Z";

  return { d, cx, cy };
}

function ShotMarker({
  kind,
  x,
  y,
  color,
  selected,
}: {
  kind: ShotKind;
  x: number;
  y: number;
  color: string;
  selected?: boolean;
}) {
  const cx = x * 100;
  const cy = y * 100;
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: selected ? 3.4 : 2,
    vectorEffect: "non-scaling-stroke" as const,
  };

  // Marker sizing in viewBox units (0..100)
  const r = 1.3;
  const s = 2.6;

  switch (kind) {
    case "SHOT":
      return <circle cx={cx} cy={cy} r={r} {...common} />;
    case "MISS":
      return (
        <polygon
          points={`${cx},${cy - s / 1.6} ${cx - s / 1.4},${cy + s / 2} ${cx + s / 1.4},${cy + s / 2}`}
          {...common}
        />
      );
    case "BLOCK":
      return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={0.2} {...common} />;
    case "PENALTY":
      return (
        <polygon
          points={`${cx},${cy - s / 1.6} ${cx - s / 1.6},${cy} ${cx},${cy + s / 1.6} ${cx + s / 1.6},${cy}`}
          {...common}
        />
      );
    case "GOAL":
    default:
      // 5-point star
      return (
        <path
          d={`M 0,-2.6 L 0.8,-0.8 L 2.6,-0.8 L 1.1,0.3 L 1.6,2.2 L 0,1.1 L -1.6,2.2 L -1.1,0.3 L -2.6,-0.8 L -0.8,-0.8 Z`}
          transform={`translate(${cx} ${cy})`}
          {...common}
        />
      );
  }
}

function KpiCard({
  title,
  leftLabel,
  midLabel,
  rightLabel,
  leftValue,
  midValue,
  rightValue,
  midBg,
  className,
}: {
  title: string;
  leftLabel: string;
  midLabel: string;
  rightLabel: string;
  leftValue: string;
  midValue: string;
  rightValue: string;
  midBg: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md bg-[color:var(--surface)]/70 px-2.5 py-2 ${className ?? ""}`.trim()}>
      <div className="text-center text-sm font-semibold text-zinc-700">{title}</div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <div className="rounded-md bg-[color:var(--surface)] px-2 py-1 text-center">
          <div className="text-xs leading-4 text-zinc-500">{leftLabel}</div>
          <div className="text-base font-semibold tabular-nums">{leftValue}</div>
        </div>
        <div className="rounded-md px-2 py-1 text-center" style={{ background: midBg }}>
          <div className="text-xs leading-4 text-zinc-800">{midLabel}</div>
          <div className="text-base font-semibold tabular-nums text-zinc-900">{midValue}</div>
        </div>
        <div className="rounded-md bg-[color:var(--surface)] px-2 py-1 text-center">
          <div className="text-xs leading-4 text-zinc-500">{rightLabel}</div>
          <div className="text-base font-semibold tabular-nums">{rightValue}</div>
        </div>
      </div>
    </div>
  );
}

// VideoSection extracted to src/components/stats/VideoSection.tsx

type SortDir = "asc" | "desc";
type TableColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "center";
  getValue: (row: T) => string | number | null | undefined;
  format?: (row: T, index: number) => React.ReactNode;
  style?: (row: T, index: number) => React.CSSProperties | undefined;
};

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined) {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "da-DK", { numeric: true, sensitivity: "base" });
}

function SortableTable<T>({
  rows,
  columns,
  getRowKey,
  defaultSortKey,
  defaultSortDir,
  minWidthClass,
}: {
  rows: T[];
  columns: Array<TableColumn<T>>;
  getRowKey: (row: T) => string;
  defaultSortKey: string;
  defaultSortDir: SortDir;
  minWidthClass?: string;
}) {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    const dirMul = sortDir === "asc" ? 1 : -1;
    const out = [...rows];
    out.sort((ra, rb) => dirMul * compareValues(col?.getValue(ra), col?.getValue(rb)));
    return out;
  }, [rows, columns, sortKey, sortDir]);

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain">
      <table
        className={
          (minWidthClass ?? "") +
          " w-full border-collapse text-[13px] leading-5 text-[color:var(--surface-foreground)]"
        }
      >
        <thead className="sticky top-0 z-10 bg-[color:var(--surface)]">
          <tr className="border-b border-[color:var(--surface-border)]">
            {columns.map((c) => {
              const align = c.align ?? "center";
              const isActive = sortKey === c.key;
              const arrow = isActive ? (sortDir === "asc" ? "▲" : "▼") : "";
              return (
                <th
                  key={c.key}
                  className={
                    "px-2 py-1.5 font-semibold " +
                    (align === "left" ? "text-left" : "text-center")
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    onClick={() => {
                      if (c.key === "__rank") {
                        setSortKey(defaultSortKey);
                        setSortDir(defaultSortDir);
                        return;
                      }
                      if (sortKey === c.key) {
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setSortKey(c.key);
                        setSortDir(defaultSortDir);
                      }
                    }}
                  >
                    <span>{c.label}</span>
                    <span className="text-xs text-zinc-500">{arrow}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, index) => (
            <tr key={getRowKey(r)} className="border-b border-[color:var(--surface-border)]">
              {columns.map((c) => {
                const align = c.align ?? "center";
                if (c.key === "__rank") {
                  return (
                    <td
                      key={c.key}
                      className={
                        "px-2 py-1 tabular-nums whitespace-nowrap " +
                        (align === "left" ? "text-left" : "text-center")
                      }
                    >
                      {index + 1}
                    </td>
                  );
                }

                const v = c.getValue(r);
                const isNum = typeof v === "number";
                return (
                  <td
                    key={c.key}
                    className={
                      "px-2 py-1 whitespace-nowrap " +
                      (isNum ? "tabular-nums " : "") +
                      (align === "left" ? "text-left" : "text-center")
                    }
                    style={c.style ? c.style(r, index) : undefined}
                  >
                    {c.format ? c.format(r, index) : String(v ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-sm text-zinc-600" colSpan={columns.length}>
                Ingen data.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function HalfRink({
  title,
  half,
  events,
  selectedTeam,
  flipByPeriod,
  teamColors,
  selectedEventIds,
  onToggleEvent,
  onSetSelection,
}: {
  title: string;
  half: "left" | "right";
  events: StatsEvent[];
  selectedTeam: string;
  flipByPeriod: Map<string, boolean>;
  teamColors: Map<string, string>;
  selectedEventIds: Set<string>;
  onToggleEvent: (eventId: string) => void;
  onSetSelection: (eventIds: string[], mode: "replace" | "add") => void;
}) {
  const selected = String(selectedTeam ?? "").trim();
  const fallbackOffenseColor = "var(--brand)";
  const fallbackDefenseColor = "var(--surface-foreground)";

  const points = useMemo(() => {
    const out: Array<{
      id: string;
      kind: ShotKind;
      x: number;
      y: number;
      color: string;
    }> = [];

    for (const e of events) {
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) continue;

      const flipKey = `${String(e.gameId ?? "")}\u007c${String(e.period ?? 0)}`;
      const flip = flipByPeriod.get(flipKey) ?? false;
      const xAdj = flip ? -e.xM : e.xM;
      const yAdj = flip ? -e.yM : e.yM;

      const p = toHalfRinkPoint(xAdj, yAdj, half);
      if (!p) continue;

      const isOffense = String(e.teamName ?? "").trim() === selected;

      const teamNameKey = String(e.teamName ?? "").trim();
      const mappedColor = teamNameKey ? teamColors.get(teamNameKey) : undefined;
      const color = mappedColor ?? (isOffense ? fallbackOffenseColor : fallbackDefenseColor);

      out.push({
        id: e.id,
        kind: classifyShotKind(e.event),
        x: p.x,
        y: p.y,
        color,
      });
    }

    return out;
  }, [events, half, selected, flipByPeriod, teamColors]);

  const [lasso, setLasso] = useState<{
    active: boolean;
    points: Array<{ x: number; y: number }>;
  }>({ active: false, points: [] });

  const lassoPathD = useMemo(() => {
    if (!lasso.active || lasso.points.length === 0) return null;
    const d =
      `M ${lasso.points[0]!.x} ${lasso.points[0]!.y} ` +
      lasso.points
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ");
    return d;
  }, [lasso.active, lasso.points]);

  const svgRef = useRef<SVGSVGElement | null>(null);

  function eventToViewBoxPoint(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Only start lasso if user clicks on empty canvas (not a marker).
    const target = e.target as Element | null;
    if (target && typeof target.closest === "function" && target.closest("[data-event-id]")) return;

    if (e.button !== 0) return;
    const p = eventToViewBoxPoint(e);
    if (!p) return;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    setLasso({ active: true, points: [p] });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!lasso.active) return;
    const p = eventToViewBoxPoint(e);
    if (!p) return;
    setLasso((cur) => {
      if (!cur.active) return cur;
      const last = cur.points[cur.points.length - 1];
      if (last && distance2(last, p) < 0.8 * 0.8) return cur;
      return { active: true, points: [...cur.points, p] };
    });
  }

  function finishLasso(e: React.PointerEvent<SVGSVGElement>) {
    if (!lasso.active) return;
    const pts = lasso.points;
    setLasso({ active: false, points: [] });

    if (pts.length < 3) return;

    const ring = pts.map((p) => [p.x, p.y]);
    const selectedIds = points
      .filter((p) => pointInPolygon(p.x * 100, p.y * 100, ring))
      .map((p) => p.id);

    const mode: "replace" | "add" = e.shiftKey ? "add" : "replace";
    onSetSelection(selectedIds, mode);
  }

  return (
    <div className="space-y-2">
      <div className="text-center text-base font-semibold text-zinc-600">{title}</div>
      <div className="relative overflow-hidden">
        <div className="relative aspect-[1/1] w-full">
          <img
            src="/bane.png"
            alt="Bane"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: half === "left" ? "left center" : "right center" }}
          />
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishLasso}
            onPointerCancel={() => setLasso({ active: false, points: [] })}
          >
            {lassoPathD ? (
              <path
                d={lassoPathD}
                fill="none"
                stroke="rgba(250,204,21,.95)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {points.map((p) => (
              <g
                key={p.id}
                data-event-id={p.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleEvent(p.id);
                }}
              >
                <ShotMarker
                  kind={p.kind}
                  x={p.x}
                  y={p.y}
                  color={p.color}
                  selected={selectedEventIds.has(p.id)}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function HeatHalfRink({
  title,
  half,
  zones,
  fillByZoneId,
  labelByZoneId,
  selectedZoneCode,
  onSelectZone,
}: {
  title: string;
  half: "left" | "right";
  zones: ZoneFeature[];
  fillByZoneId: Map<string, string>;
  labelByZoneId: Map<string, number>;
  selectedZoneCode: string | null;
  onSelectZone: (zoneId: string) => void;
}) {
  const side: "O" | "D" = half === "right" ? "O" : "D";

  const paths = useMemo(() => {
    return zones
      .filter((z) => z.properties.side === side)
      .map((z) => {
        const ring = z.geometry.coordinates?.[0];
        if (!ring || ring.length < 3) return null;
        const path = polygonToSvgPath(ring, half);
        if (!path) return null;
        return { id: z.properties.id, d: path.d, cx: path.cx, cy: path.cy };
      })
      .filter((x): x is { id: string; d: string; cx: number; cy: number } => Boolean(x));
  }, [zones, side, half]);

  return (
    <div className="space-y-2">
      <div className="text-center text-base font-semibold text-zinc-600">{title}</div>
      <div className="relative overflow-hidden">
        <div className="relative aspect-[1/1] w-full">
          <img
            src="/bane.png"
            alt="Bane"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: half === "left" ? "left center" : "right center" }}
          />

          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {paths.map((p) => (
              <g key={p.id} className="cursor-pointer">
                <path
                  d={p.d}
                  fill={fillByZoneId.get(p.id) ?? "transparent"}
                  stroke={
                    selectedZoneCode && p.id.slice(1) === selectedZoneCode
                      ? "rgba(250,204,21,.95)"
                      : "rgba(255,255,255,.25)"
                  }
                  strokeWidth={selectedZoneCode && p.id.slice(1) === selectedZoneCode ? 1.4 : 0.6}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => onSelectZone(p.id)}
                />
                <text
                  x={p.cx}
                  y={p.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(0,0,0,.55)"
                  fontSize={5}
                  style={{ pointerEvents: "none" }}
                >
                  {String(labelByZoneId.get(p.id) ?? 0)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function StatistikClient({ isLeader }: { isLeader: boolean }) {
  const [tab, setTab] = useState<TabKey>(isLeader ? "events" : "shotmap");

  type TablesTabKey = "players-individual" | "players-onice" | "goalies" | "team";
  const [tablesTab, setTablesTab] = useState<TablesTabKey>("players-individual");

  const [selectedZoneCode, setSelectedZoneCode] = useState<string | null>(null);
  const [selectedShotEventIds, setSelectedShotEventIds] = useState<string[]>([]);
  const [zones, setZones] = useState<ZoneFeature[] | null>(null);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const { filters } = useStatsFilters();

  const eventsFileInputRef = useRef<HTMLInputElement | null>(null);
  const playersFileInputRef = useRef<HTMLInputElement | null>(null);

  const [events, setEvents] = useState<StatsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [players, setPlayers] = useState<StatsPlayerSummary[]>([]);

  const [eventFiles, setEventFiles] = useState<StatsFile[]>([]);
  const [playerFiles, setPlayerFiles] = useState<StatsFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [uploading, setUploading] = useState<"EVENTS" | "PLAYERS" | null>(null);

  const tabs = useMemo(() => {
    const list = [
      ...(isLeader ? ([{ key: "events" as const, label: "Events" }] as const) : ([] as const)),
      { key: "shotmap" as const, label: "Shot Map" },
      { key: "heatmap" as const, label: "Heat Map" },
      { key: "tabeller" as const, label: "Tabeller" },
    ];
    return list;
  }, [isLeader]);

  useEffect(() => {
    if (isLeader) return;
    if (tab === "events") setTab("shotmap");
  }, [isLeader, tab]);

  useEffect(() => {
    let cancelled = false;
    async function loadZones() {
      try {
        const res = await fetch("/zones.json");
        if (!res.ok) throw new Error("Kunne ikke hente zones.json");
        const json = (await res.json()) as ZonesGeoJson;
        if (!cancelled) setZones(Array.isArray(json?.features) ? json.features : null);
      } catch (e) {
        if (!cancelled) setZonesError(e instanceof Error ? e.message : "Kunne ikke hente zoner.");
      }
    }

    void loadZones();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadEvents() {
    setEventsLoading(true);
    setEventsError(null);

    try {
      const res = await fetch("/api/stats/events?limit=1000", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEvents([]);
        setEventsError(data?.message ?? "Kunne ikke hente events.");
        return;
      }

      setEvents(data?.events ?? []);
    } finally {
      setEventsLoading(false);
    }
  }

  async function loadFiles() {
    if (!isLeader) return;

    setFilesLoading(true);
    setFilesError(null);

    try {
      const [eventsRes, playersRes] = await Promise.all([
        fetch("/api/stats/files?kind=EVENTS", { cache: "no-store" }),
        fetch("/api/stats/files?kind=PLAYERS", { cache: "no-store" }),
      ]);

      const eventsData = await eventsRes.json().catch(() => ({}));
      const playersData = await playersRes.json().catch(() => ({}));

      if (!eventsRes.ok || !playersRes.ok) {
        setEventFiles([]);
        setPlayerFiles([]);
        setFilesError(
          eventsData?.message ?? playersData?.message ?? "Kunne ikke hente filer."
        );
        return;
      }

      setEventFiles(eventsData?.files ?? []);
      setPlayerFiles(playersData?.files ?? []);
    } finally {
      setFilesLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
    void loadPlayers();
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlayers() {
    try {
      const res = await fetch("/api/stats/players", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlayers([]);
        return;
      }
      setPlayers(data?.players ?? []);
    } catch {
      setPlayers([]);
    }
  }

  async function uploadFiles(kind: "EVENTS" | "PLAYERS", files: FileList | File[]) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    setUploading(kind);
    setEventsError(null);
    setFilesError(null);

    try {
      for (const file of list) {
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", file);

        const res = await fetch("/api/stats/upload", {
          method: "POST",
          body: form,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.message ?? `Upload fejlede (${file.name}).`;
          setEventsError(msg);
          return;
        }
      }

      await Promise.all([loadEvents(), loadFiles()]);
    } finally {
      setUploading(null);
    }
  }

  async function deleteFile(fileId: string) {
    setFilesError(null);

    const res = await fetch(`/api/stats/files/${fileId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFilesError(data?.message ?? "Kunne ikke slette fil.");
      return;
    }

    await Promise.all([loadEvents(), loadFiles()]);
  }

  function norm(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
  }

  function makePlayerKey(team: string, name: string) {
    return `${String(team ?? "").trim()}||${String(name ?? "").trim()}`;
  }

  function otherTeamInGame(eventTeam: string, homeTeam: string, awayTeam: string) {
    const t = String(eventTeam ?? "").trim();
    const h = String(homeTeam ?? "").trim();
    const a = String(awayTeam ?? "").trim();
    if (!t || !h || !a) return null;
    if (t === h) return a;
    if (t === a) return h;
    return null;
  }

  function splitOnIce(value: string | null | undefined) {
    return String(value ?? "")
      .split(" - ")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const selectedShotEventIdSet = useMemo(() => new Set(selectedShotEventIds), [selectedShotEventIds]);

  function toggleShotEvent(eventId: string) {
    setSelectedShotEventIds((cur) => {
      const set = new Set(cur);
      if (set.has(eventId)) set.delete(eventId);
      else set.add(eventId);
      return Array.from(set);
    });
  }

  function setShotSelection(eventIds: string[], mode: "replace" | "add") {
    setSelectedShotEventIds((cur) => {
      if (mode === "replace") return Array.from(new Set(eventIds));
      const set = new Set(cur);
      for (const id of eventIds) set.add(id);
      return Array.from(set);
    });
  }

  const tableEvents = useMemo(() => {
    // Base for tabeller: apply filter selections like game/strength/goalie/on-ice.
    // We intentionally do NOT require coordinates for tables.
    const gameSel = norm(filters.kamp);
    const strengthSel = norm(filters.styrke);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    return events.filter((e) => {
      if (gameSel && norm(e.gameId) !== gameSel) return false;
      if (strengthSel && norm(e.strength) !== strengthSel) return false;
      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) => norm(n))
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      return true;
    });
  }, [events, filters]);

  const gameLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (!e.gameId) continue;
      if (map.has(e.gameId)) continue;
      const date = e.gameDate ? new Date(e.gameDate).toLocaleDateString("da-DK") : "";
      const homeAway = `${e.teamHome ?? ""} - ${e.teamAway ?? ""}`.trim();
      map.set(e.gameId, `${date} - ${homeAway}`.trim().replace(/^\s*-\s*/g, ""));
    }
    return map;
  }, [events]);

  const playerMetaByKey = useMemo(() => {
    const map = new Map<string, { number: number | null }>();
    for (const p of players) {
      const name = String(p.name ?? "").trim();
      const team = String(p.teamName ?? "").trim();
      if (!name || !team) continue;
      const key = makePlayerKey(team, name);
      if (!map.has(key)) map.set(key, { number: p.number ?? null });
    }
    return map;
  }, [players]);

  const gpByPlayerKey = useMemo(() => {
    // GP = unique games per player+team from Players CSV data.
    const byKey = new Map<string, Set<string>>();
    for (const p of players) {
      const name = String(p.name ?? "").trim();
      const team = String(p.teamName ?? "").trim();
      if (!name || !team) continue;
      const gid = String(p.gameId ?? "").trim();
      if (!gid) continue;
      const key = makePlayerKey(team, name);
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(gid);
    }
    const out = new Map<string, number>();
    for (const [key, set] of byKey.entries()) out.set(key, set.size);
    return out;
  }, [players]);

  const playerIndividualRows = useMemo(() => {
    const byKey = new Map<
      string,
      {
        name: string;
        team: string;
        gp: number;
        g: number;
        a: number;
        penMinus: number;
        penPlus: number;
        shots: number;
        miss: number;
        shotInBlock: number;
        blocks: number;
        attempts: number;
      }
    >();

    const ensure = (team: string, name: string) => {
      const t = String(team ?? "").trim();
      const n = String(name ?? "").trim();
      if (!t || !n) return null;
      const key = makePlayerKey(t, n);
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: n,
          team: t,
          gp: gpByPlayerKey.get(key) ?? 0,
          g: 0,
          a: 0,
          penMinus: 0,
          penPlus: 0,
          shots: 0,
          miss: 0,
          shotInBlock: 0,
          blocks: 0,
          attempts: 0,
        });
      }
      return byKey.get(key)!;
    };

    for (const e of tableEvents) {
      const kind = classifyShotKind(e.event);
      const eventTeam = String(e.teamName ?? "").trim();
      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();

      if (kind === "PENALTY") {
        const takenBy = String(e.p1Name ?? "").trim();
        if (eventTeam && takenBy) {
          const row = ensure(eventTeam, takenBy);
          if (row) row.penMinus += 1;
        }

        const drawnBy = String(e.p2Name ?? "").trim();
        const drawnTeam = eventTeam ? otherTeamInGame(eventTeam, home, away) : null;
        if (drawnTeam && drawnBy) {
          const row = ensure(drawnTeam, drawnBy);
          if (row) row.penPlus += 1;
        }
        continue;
      }

      if (!eventTeam) continue;

      const shooter = String(e.p1Name ?? "").trim();
      const assist = String(e.p2Name ?? "").trim();

      if (shooter) {
        const row = ensure(eventTeam, shooter);
        if (row) {
          row.attempts += 1;
          if (kind === "GOAL") row.g += 1;
          if (kind === "GOAL" || kind === "SHOT") row.shots += 1;
          if (kind === "MISS") row.miss += 1;
          if (kind === "BLOCK") row.shotInBlock += 1;
        }
      }

      if (kind === "GOAL" && assist && assist !== shooter) {
        const row = ensure(eventTeam, assist);
        if (row) row.a += 1;
      }

      if (kind === "BLOCK") {
        const blocker = String(e.p2Name ?? "").trim();
        const blockTeam = otherTeamInGame(eventTeam, home, away);
        if (blockTeam && blocker) {
          const row = ensure(blockTeam, blocker);
          if (row) row.blocks += 1;
        }
      }
    }

    const rows = Array.from(byKey.values()).map((r) => {
      const p = r.g + r.a;
      const shPct = r.shots > 0 ? (r.g / r.shots) * 100 : 0;
      return { ...r, p, shPct };
    });

    rows.sort(
      (a, b) => (b.p - a.p) || (b.g - a.g) || (b.shots - a.shots) || a.name.localeCompare(b.name, "da-DK")
    );
    return rows;
  }, [gpByPlayerKey, tableEvents]);

  const playerOnIceRows = useMemo(() => {
    const byKey = new Map<
      string,
      {
        name: string;
        team: string;
        gp: number;
        cf: number;
        ca: number;
        ff: number;
        fa: number;
        sf: number;
        sa: number;
        gf: number;
        ga: number;
      }
    >();

    const ensure = (team: string, name: string) => {
      const t = String(team ?? "").trim();
      const n = String(name ?? "").trim();
      if (!t || !n) return null;
      const key = makePlayerKey(t, n);
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: n,
          team: t,
          gp: gpByPlayerKey.get(key) ?? 0,
          cf: 0,
          ca: 0,
          ff: 0,
          fa: 0,
          sf: 0,
          sa: 0,
          gf: 0,
          ga: 0,
        });
      }
      return byKey.get(key)!;
    };

    for (const e of tableEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const eventTeam = String(e.teamName ?? "").trim();
      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();
      if (!eventTeam || !home || !away) continue;

      const isCorsi = kind === "GOAL" || kind === "SHOT" || kind === "MISS" || kind === "BLOCK";
      const isFenwick = kind === "GOAL" || kind === "SHOT" || kind === "MISS";
      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";

      const homeList = splitOnIce(e.homePlayersNames);
      const awayList = splitOnIce(e.awayPlayersNames);

      for (const name of homeList) {
        const row = ensure(home, name);
        if (!row) continue;
        const forTeam = eventTeam === home;
        if (isCorsi) forTeam ? (row.cf += 1) : (row.ca += 1);
        if (isFenwick) forTeam ? (row.ff += 1) : (row.fa += 1);
        if (isShotOnGoal) forTeam ? (row.sf += 1) : (row.sa += 1);
        if (isGoal) forTeam ? (row.gf += 1) : (row.ga += 1);
      }

      for (const name of awayList) {
        const row = ensure(away, name);
        if (!row) continue;
        const forTeam = eventTeam === away;
        if (isCorsi) forTeam ? (row.cf += 1) : (row.ca += 1);
        if (isFenwick) forTeam ? (row.ff += 1) : (row.fa += 1);
        if (isShotOnGoal) forTeam ? (row.sf += 1) : (row.sa += 1);
        if (isGoal) forTeam ? (row.gf += 1) : (row.ga += 1);
      }
    }

    const pctShare = (f: number, a: number) => {
      const den = f + a;
      return den > 0 ? (f / den) * 100 : 0;
    };

    const rows = Array.from(byKey.values()).map((r) => {
      const cfPct = pctShare(r.cf, r.ca);
      const ffPct = pctShare(r.ff, r.fa);
      const sfPct = pctShare(r.sf, r.sa);
      const gfPct = pctShare(r.gf, r.ga);

      const svPct = r.sa > 0 ? ((r.sa - r.ga) / r.sa) * 100 : 0;
      const shPct = r.sf > 0 ? (r.gf / r.sf) * 100 : 0;
      const pdo = svPct + shPct;

      return { ...r, cfPct, ffPct, sfPct, gfPct, svPct, shPct, pdo };
    });

    rows.sort(
      (a, b) => (b.cfPct - a.cfPct) || (b.cf - a.cf) || a.name.localeCompare(b.name, "da-DK")
    );
    return rows;
  }, [gpByPlayerKey, tableEvents]);

  const goalieRows = useMemo(() => {
    const byKey = new Map<string, { name: string; team: string; sa: number; ga: number }>();
    const gamesByKey = new Map<string, Set<string>>();

    const ensure = (team: string, name: string) => {
      const t = String(team ?? "").trim();
      const n = String(name ?? "").trim();
      if (!t || !n) return null;
      const key = makePlayerKey(t, n);
      if (!byKey.has(key)) byKey.set(key, { name: n, team: t, sa: 0, ga: 0 });
      if (!gamesByKey.has(key)) gamesByKey.set(key, new Set());
      return { key, row: byKey.get(key)! };
    };

    for (const e of tableEvents) {
      const goalie = String(e.goalieName ?? "").trim();
      if (!goalie) continue;

      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const eventTeam = String(e.teamName ?? "").trim();
      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();
      const goalieTeam = eventTeam ? otherTeamInGame(eventTeam, home, away) : null;
      if (!goalieTeam) continue;

      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";
      if (!isShotOnGoal && !isGoal) continue;

      const ensured = ensure(goalieTeam, goalie);
      if (!ensured) continue;

      if (isShotOnGoal) ensured.row.sa += 1;
      if (isGoal) ensured.row.ga += 1;

      if (e.gameId) gamesByKey.get(ensured.key)!.add(e.gameId);
    }

    const rows = Array.from(byKey.entries()).map(([key, r]) => {
      const svPct = r.sa > 0 ? ((r.sa - r.ga) / r.sa) * 100 : 0;
      const games = gamesByKey.get(key)?.size ?? 0;
      return { ...r, games, svPct };
    });

    rows.sort(
      (a, b) => (b.svPct - a.svPct) || (b.sa - a.sa) || a.name.localeCompare(b.name, "da-DK")
    );
    return rows;
  }, [tableEvents]);

  const teamRows = useMemo(() => {
    const byTeam = new Map<
      string,
      {
        team: string;
        cf: number;
        ca: number;
        ff: number;
        fa: number;
        sf: number;
        sa: number;
        gf: number;
        ga: number;
      }
    >();

    const ensure = (team: string) => {
      const t = String(team ?? "").trim();
      if (!t) return null;
      if (!byTeam.has(t)) {
        byTeam.set(t, { team: t, cf: 0, ca: 0, ff: 0, fa: 0, sf: 0, sa: 0, gf: 0, ga: 0 });
      }
      return byTeam.get(t)!;
    };

    // Ensure all teams from games appear even if one team has 0 events after filtering.
    for (const e of tableEvents) {
      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();
      if (home) ensure(home);
      if (away) ensure(away);
    }

    for (const e of tableEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const eventTeam = String(e.teamName ?? "").trim();
      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();
      const oppTeam = eventTeam ? otherTeamInGame(eventTeam, home, away) : null;
      if (!eventTeam || !oppTeam) continue;

      const teamRow = ensure(eventTeam);
      const oppRow = ensure(oppTeam);
      if (!teamRow || !oppRow) continue;

      const isCorsi = kind === "GOAL" || kind === "SHOT" || kind === "MISS" || kind === "BLOCK";
      const isFenwick = kind === "GOAL" || kind === "SHOT" || kind === "MISS";
      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";

      if (isCorsi) {
        teamRow.cf += 1;
        oppRow.ca += 1;
      }
      if (isFenwick) {
        teamRow.ff += 1;
        oppRow.fa += 1;
      }
      if (isShotOnGoal) {
        teamRow.sf += 1;
        oppRow.sa += 1;
      }
      if (isGoal) {
        teamRow.gf += 1;
        oppRow.ga += 1;
      }
    }

    const pctShare = (f: number, a: number) => {
      const den = f + a;
      return den > 0 ? (f / den) * 100 : 0;
    };

    const rows = Array.from(byTeam.values()).map((r) => {
      const cfPct = pctShare(r.cf, r.ca);
      const ffPct = pctShare(r.ff, r.fa);
      const sfPct = pctShare(r.sf, r.sa);
      const gfPct = pctShare(r.gf, r.ga);
      const shPct = r.sf > 0 ? (r.gf / r.sf) * 100 : 0;
      const svPct = r.sa > 0 ? ((r.sa - r.ga) / r.sa) * 100 : 0;
      const pdo = shPct + svPct;
      return { ...r, cfPct, ffPct, sfPct, gfPct, shPct, svPct, pdo };
    });

    rows.sort((a, b) => a.team.localeCompare(b.team, "da-DK"));
    return rows;
  }, [tableEvents]);

  const filteredEvents = useMemo(() => {
    const pSel = norm(filters.perspektiv);
    const gameSel = norm(filters.kamp);
    const strengthSel = norm(filters.styrke);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    if (!pSel) return [];

    return events.filter((e) => {
      if (norm(e.teamName ?? e.perspective) !== pSel) return false;

      if (gameSel && norm(e.gameId) !== gameSel) return false;

      if (strengthSel && norm(e.strength) !== strengthSel) return false;

      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (playerSel) {
        const matches =
          norm(e.p1Name) === playerSel ||
          norm(e.p2Name) === playerSel;
        if (!matches) return false;
      }

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) =>
            norm(n)
          )
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      return true;
    });
  }, [events, filters]);

  const shotMapEvents = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return [];

    const gameSel = norm(filters.kamp);
    const strengthSel = norm(filters.styrke);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    return events.filter((e) => {
      // Only show shot-like events on the map
      if (!isShotLikeEvent(e.event)) return false;

      if (gameSel && norm(e.gameId) !== gameSel) return false;

      if (strengthSel && norm(e.strength) !== strengthSel) return false;
      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (playerSel) {
        const matches = norm(e.p1Name) === playerSel || norm(e.p2Name) === playerSel;
        if (!matches) return false;
      }

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) => norm(n))
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      // Require coordinates
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) return false;
      return true;
    });
  }, [events, filters]);

  const teamColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) {
      const name = String(p.teamName ?? "").trim();
      const color = String(p.teamColor ?? "").trim();
      if (!name || !color) continue;
      if (!map.has(name)) map.set(name, color);
    }
    return map;
  }, [players]);

  const shotMapFlipByPeriod = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    const sums = new Map<string, number>();
    for (const e of shotMapEvents) {
      if (String(e.teamName ?? "").trim() !== selectedTeam) continue;
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;
      const flipKey = `${String(e.gameId ?? "")}\u007c${String(e.period ?? 0)}`;
      sums.set(flipKey, (sums.get(flipKey) ?? 0) + (e.xM ?? 0));
    }

    const flip = new Map<string, boolean>();
    for (const [key, sumX] of sums.entries()) {
      flip.set(key, sumX < 0);
    }
    return flip;
  }, [shotMapEvents, filters.perspektiv]);

  const shotMapKpis = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return null;
    const base =
      selectedShotEventIdSet.size > 0
        ? shotMapEvents.filter((e) => selectedShotEventIdSet.has(String(e.id)))
        : shotMapEvents;
    return computeShotMapKpis(base, selectedTeam);
  }, [shotMapEvents, filters.perspektiv, selectedShotEventIdSet]);

  const shotMapSelectedEvents = useMemo(() => {
    if (selectedShotEventIdSet.size === 0) return shotMapEvents;
    return shotMapEvents.filter((e) => selectedShotEventIdSet.has(String(e.id)));
  }, [shotMapEvents, selectedShotEventIdSet]);

  const heatmap = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam || !zones) {
      return {
        fillByZoneId: new Map<string, string>(),
        labelByZoneId: new Map<string, number>(),
        zoneIdByEventId: new Map<string, string | null>(),
      };
    }

    const zonesO = zones.filter((z) => z.properties.side === "O");
    const zonesD = zones.filter((z) => z.properties.side === "D");

    const findZone = (x: number, y: number) => {
      const pool = x >= 0 ? zonesO : zonesD;
      for (const z of pool) {
        const ring = z.geometry.coordinates?.[0];
        if (!ring || ring.length < 3) continue;
        if (pointInPolygon(x, y, ring)) return z.properties.id;
      }
      return null;
    };

    const isFor = (e: StatsEvent) => String(e.teamName ?? "").trim() === selectedTeam;

    const zoneIdByEventId = new Map<string, string | null>();
    const forByZoneId = new Map<string, number>();
    const againstByZoneId = new Map<string, number>();
    for (const z of zones) {
      forByZoneId.set(z.properties.id, 0);
      againstByZoneId.set(z.properties.id, 0);
    }

    for (const e of shotMapEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") {
        zoneIdByEventId.set(e.id, null);
        continue;
      }
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) {
        zoneIdByEventId.set(e.id, null);
        continue;
      }

      const flipKey = `${String(e.gameId ?? "")}\u007c${String(e.period ?? 0)}`;
      const flip = shotMapFlipByPeriod.get(flipKey) ?? false;
      const xAdj = flip ? -e.xM : e.xM;
      const yAdj = flip ? -e.yM : e.yM;
      const zoneId = findZone(xAdj, yAdj);

      zoneIdByEventId.set(e.id, zoneId);
      if (!zoneId) continue;

      if (isFor(e)) {
        forByZoneId.set(zoneId, (forByZoneId.get(zoneId) ?? 0) + 1);
      } else {
        againstByZoneId.set(zoneId, (againstByZoneId.get(zoneId) ?? 0) + 1);
      }
    }

    // Display rule:
    // - Offensive end (Oxx): show Events For
    // - Defensive end (Dxx): show Events Against
    const labelByZoneId = new Map<string, number>();
    for (const z of zones) {
      const id = z.properties.id;
      const display = id.startsWith("O")
        ? (forByZoneId.get(id) ?? 0)
        : (againstByZoneId.get(id) ?? 0);
      labelByZoneId.set(id, display);
    }

    const values = [...labelByZoneId.values()].filter((n) => Number.isFinite(n));
    const max = values.length ? Math.max(...values) : 0;

    const fillByZoneId = new Map<string, string>();
    for (const [id, v] of labelByZoneId.entries()) {
      const a = max > 0 ? 0.12 + 0.78 * clamp01(v / max) : 0;
      fillByZoneId.set(id, `rgba(239,68,68,${a.toFixed(3)})`);
    }

    return { fillByZoneId, labelByZoneId, zoneIdByEventId };
  }, [filters.perspektiv, zones, shotMapEvents, shotMapFlipByPeriod]);

  const heatmapSelectedEvents = useMemo(() => {
    if (!selectedZoneCode) return shotMapEvents;
    const allow = new Set([`O${selectedZoneCode}`, `D${selectedZoneCode}`]);
    return shotMapEvents.filter((e) => {
      const zoneId = heatmap.zoneIdByEventId.get(e.id) ?? null;
      return zoneId ? allow.has(zoneId) : false;
    });
  }, [shotMapEvents, heatmap.zoneIdByEventId, selectedZoneCode]);

  const heatmapKpis = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return null;
    return computeShotMapKpis(heatmapSelectedEvents, selectedTeam);
  }, [heatmapSelectedEvents, filters.perspektiv]);

  function onSelectZone(zoneId: string) {
    const code = String(zoneId ?? "").slice(1);
    if (!code) return;
    setSelectedZoneCode((cur) => (cur === code ? null : code));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Statistik</h1>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)]"
                : "rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "events" ? (
        <section className="space-y-6">
          {isLeader ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-[color:var(--surface-border)] p-4">
                <h2 className="text-lg font-semibold">Upload Events (CSV)</h2>

                <div className="mt-3 flex flex-col gap-2">
                  <input
                    ref={eventsFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files) void uploadFiles("EVENTS", files);
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading === "EVENTS"}
                    onClick={() => eventsFileInputRef.current?.click()}
                    className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Filer</h3>
                    <button
                      type="button"
                      onClick={loadFiles}
                      disabled={filesLoading}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Opdater
                    </button>
                  </div>

                  {eventFiles.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">Ingen filer.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {eventFiles.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-2"
                        >
                          <div className="min-w-0 text-sm">
                            <div className="truncate font-medium">{f.originalName}</div>
                            <div className="text-xs text-zinc-600">
                              {new Date(f.createdAt).toLocaleString("da-DK")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteFile(f.id)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            Slet
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[color:var(--surface-border)] p-4">
                <h2 className="text-lg font-semibold">Upload Players (CSV)</h2>

                <div className="mt-3 flex flex-col gap-2">
                  <input
                    ref={playersFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files) void uploadFiles("PLAYERS", files);
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading === "PLAYERS"}
                    onClick={() => playersFileInputRef.current?.click()}
                    className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Filer</h3>
                    <button
                      type="button"
                      onClick={loadFiles}
                      disabled={filesLoading}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Opdater
                    </button>
                  </div>

                  {playerFiles.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">Ingen filer.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {playerFiles.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-2"
                        >
                          <div className="min-w-0 text-sm">
                            <div className="truncate font-medium">{f.originalName}</div>
                            <div className="text-xs text-zinc-600">
                              {new Date(f.createdAt).toLocaleString("da-DK")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteFile(f.id)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            Slet
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {filesError ? <p className="text-sm text-red-600">{filesError}</p> : null}
            </div>
          ) : null}

          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Events</h2>
              <button
                type="button"
                onClick={loadEvents}
                disabled={eventsLoading}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Opdater
              </button>
            </div>

            {eventsError ? <p className="mt-2 text-sm text-red-600">{eventsError}</p> : null}

            {filteredEvents.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
            ) : (
              <div className="mt-4 max-h-[60vh] overflow-auto">
                <table className="min-w-[900px] w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[color:var(--surface)]">
                    <tr className="border-b border-[color:var(--surface-border)] text-left">
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Tid</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Periode</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Event</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">P1</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">P2</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">X</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Y</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Fil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e) => (
                      <tr key={e.id} className="border-b border-[color:var(--surface-border)]">
                        <td className="py-2 pr-3">
                          {e.timestamp
                            ? new Date(e.timestamp).toLocaleString("da-DK")
                            : "-"}
                        </td>
                        <td className="py-2 pr-3">{e.period ?? "-"}</td>
                        <td className="py-2 pr-3 font-medium">{e.event}</td>
                        <td className="py-2 pr-3">
                          {e.p1No ?? ""}{e.p1Name ? ` ${e.p1Name}` : ""}
                        </td>
                        <td className="py-2 pr-3">
                          {e.p2No ?? ""}{e.p2Name ? ` ${e.p2Name}` : ""}
                        </td>
                        <td className="py-2 pr-3">{e.xM ?? "-"}</td>
                        <td className="py-2 pr-3">{e.yM ?? "-"}</td>
                        <td className="py-2 pr-3 text-xs text-zinc-600">
                          {e.file?.originalName ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : tab === "shotmap" ? (
        <section className="space-y-6">
          {eventsError ? <p className="mt-2 text-sm text-red-600">{eventsError}</p> : null}

          {String(filters.perspektiv ?? "").trim().length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">Vælg et Perspektiv.</p>
          ) : shotMapEvents.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
          ) : (
            <>
              {/* Mobile: KPI cards above both ends; ends stack (portrait) or sit side-by-side (landscape). */}
              <div className="mt-4 space-y-2 md:hidden">
                {shotMapKpis ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <KpiCard
                      title="Corsi"
                      leftLabel="CA"
                      midLabel="CF%"
                      rightLabel="CF"
                      leftValue={String(shotMapKpis.corsi.ca)}
                      midValue={String(pct(shotMapKpis.corsi.cfPct))}
                      rightValue={String(shotMapKpis.corsi.cf)}
                      midBg={colorScaleRedWhiteBlue(shotMapKpis.corsi.cfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Fenwick"
                      leftLabel="FA"
                      midLabel="FF%"
                      rightLabel="FF"
                      leftValue={String(shotMapKpis.fenwick.fa)}
                      midValue={String(pct(shotMapKpis.fenwick.ffPct))}
                      rightValue={String(shotMapKpis.fenwick.ff)}
                      midBg={colorScaleRedWhiteBlue(shotMapKpis.fenwick.ffPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Shots"
                      leftLabel="SA"
                      midLabel="SF%"
                      rightLabel="SF"
                      leftValue={String(shotMapKpis.shots.sa)}
                      midValue={String(pct(shotMapKpis.shots.sfPct))}
                      rightValue={String(shotMapKpis.shots.sf)}
                      midBg={colorScaleRedWhiteBlue(shotMapKpis.shots.sfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Goals"
                      leftLabel="GA"
                      midLabel="GF%"
                      rightLabel="GF"
                      leftValue={String(shotMapKpis.goals.ga)}
                      midValue={String(pct(shotMapKpis.goals.gfPct))}
                      rightValue={String(shotMapKpis.goals.gf)}
                      midBg={colorScaleRedWhiteBlue(shotMapKpis.goals.gfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Shooting / Goaltending"
                      leftLabel="Sv%"
                      midLabel="PDO"
                      rightLabel="Sh%"
                      leftValue={String(pct(shotMapKpis.sg.svPct))}
                      midValue={String(pct(shotMapKpis.sg.pdo))}
                      rightValue={String(pct(shotMapKpis.sg.shPct))}
                      midBg={colorScaleRedWhiteBlue(shotMapKpis.sg.pdo, 90, 100, 110)}
                      className="sm:col-span-2"
                    />
                  </div>
                ) : null}

                <div className="grid gap-2 landscape:grid-cols-2">
                  <HalfRink
                    title="Defensive End"
                    half="left"
                    events={shotMapEvents}
                    selectedTeam={String(filters.perspektiv ?? "").trim()}
                    flipByPeriod={shotMapFlipByPeriod}
                    teamColors={teamColors}
                    selectedEventIds={selectedShotEventIdSet}
                    onToggleEvent={toggleShotEvent}
                    onSetSelection={setShotSelection}
                  />

                  <HalfRink
                    title="Offensive End"
                    half="right"
                    events={shotMapEvents}
                    selectedTeam={String(filters.perspektiv ?? "").trim()}
                    flipByPeriod={shotMapFlipByPeriod}
                    teamColors={teamColors}
                    selectedEventIds={selectedShotEventIdSet}
                    onToggleEvent={toggleShotEvent}
                    onSetSelection={setShotSelection}
                  />
                </div>
              </div>

              {/* Desktop: keep current layout (defensive • KPI stack • offensive). */}
              <div className="mt-4 hidden gap-2 md:grid md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] md:items-stretch">
                <HalfRink
                  title="Defensive End"
                  half="left"
                  events={shotMapEvents}
                  selectedTeam={String(filters.perspektiv ?? "").trim()}
                  flipByPeriod={shotMapFlipByPeriod}
                  teamColors={teamColors}
                  selectedEventIds={selectedShotEventIdSet}
                  onToggleEvent={toggleShotEvent}
                  onSetSelection={setShotSelection}
                />

                <div className="flex h-full flex-col justify-between gap-2">
                  {shotMapKpis ? (
                    <>
                      <KpiCard
                        title="Corsi"
                        leftLabel="CA"
                        midLabel="CF%"
                        rightLabel="CF"
                        leftValue={String(shotMapKpis.corsi.ca)}
                        midValue={String(pct(shotMapKpis.corsi.cfPct))}
                        rightValue={String(shotMapKpis.corsi.cf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.corsi.cfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Fenwick"
                        leftLabel="FA"
                        midLabel="FF%"
                        rightLabel="FF"
                        leftValue={String(shotMapKpis.fenwick.fa)}
                        midValue={String(pct(shotMapKpis.fenwick.ffPct))}
                        rightValue={String(shotMapKpis.fenwick.ff)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.fenwick.ffPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Shots"
                        leftLabel="SA"
                        midLabel="SF%"
                        rightLabel="SF"
                        leftValue={String(shotMapKpis.shots.sa)}
                        midValue={String(pct(shotMapKpis.shots.sfPct))}
                        rightValue={String(shotMapKpis.shots.sf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.shots.sfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Goals"
                        leftLabel="GA"
                        midLabel="GF%"
                        rightLabel="GF"
                        leftValue={String(shotMapKpis.goals.ga)}
                        midValue={String(pct(shotMapKpis.goals.gfPct))}
                        rightValue={String(shotMapKpis.goals.gf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.goals.gfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Shooting / Goaltending"
                        leftLabel="Sv%"
                        midLabel="PDO"
                        rightLabel="Sh%"
                        leftValue={String(pct(shotMapKpis.sg.svPct))}
                        midValue={String(pct(shotMapKpis.sg.pdo))}
                        rightValue={String(pct(shotMapKpis.sg.shPct))}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.sg.pdo, 90, 100, 110)}
                        className="flex-1"
                      />
                    </>
                  ) : null}
                </div>

                <HalfRink
                  title="Offensive End"
                  half="right"
                  events={shotMapEvents}
                  selectedTeam={String(filters.perspektiv ?? "").trim()}
                  flipByPeriod={shotMapFlipByPeriod}
                  teamColors={teamColors}
                  selectedEventIds={selectedShotEventIdSet}
                  onToggleEvent={toggleShotEvent}
                  onSetSelection={setShotSelection}
                />
              </div>
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
            <div className="flex flex-1 flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-[color:var(--surface-foreground)]" />
              <span>Shot</span>
            </div>
              <div className="flex items-center gap-2">
              <span className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-b-[12px] border-l-transparent border-r-transparent border-b-[color:var(--surface-foreground)]" />
              <span>Miss</span>
            </div>
              <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 border-2 border-[color:var(--surface-foreground)]" />
              <span>Block</span>
            </div>
              <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rotate-45 border-2 border-[color:var(--surface-foreground)]" />
              <span>Penalty</span>
            </div>
              <div className="flex items-center gap-2">
              <span className="text-base text-[color:var(--surface-foreground)]">★</span>
              <span>Goal</span>
            </div>
            </div>

            {selectedShotEventIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedShotEventIds([])}
                className="rounded-md border border-[color:var(--surface-border)] px-3 py-1.5 text-sm"
              >
                Fravælg alle
              </button>
            ) : null}
          </div>

          <VideoSection title="Video" events={shotMapSelectedEvents} />
        </section>
      ) : tab === "heatmap" ? (
        <section className="space-y-6">
          {eventsError ? <p className="mt-2 text-sm text-red-600">{eventsError}</p> : null}

          {String(filters.perspektiv ?? "").trim().length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">Vælg et Perspektiv.</p>
          ) : shotMapEvents.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
          ) : zonesError ? (
            <p className="mt-4 text-sm text-red-600">{zonesError}</p>
          ) : !zones ? (
            <p className="mt-4 text-sm text-zinc-600">Indlæser zoner…</p>
          ) : (
            <>
              {/* Mobile: KPI cards above both ends; ends stack (portrait) or sit side-by-side (landscape). */}
              <div className="space-y-2 md:hidden">
                {heatmapKpis ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <KpiCard
                      title="Corsi"
                      leftLabel="CA"
                      midLabel="CF%"
                      rightLabel="CF"
                      leftValue={String(heatmapKpis.corsi.ca)}
                      midValue={String(pct(heatmapKpis.corsi.cfPct))}
                      rightValue={String(heatmapKpis.corsi.cf)}
                      midBg={colorScaleRedWhiteBlue(heatmapKpis.corsi.cfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Fenwick"
                      leftLabel="FA"
                      midLabel="FF%"
                      rightLabel="FF"
                      leftValue={String(heatmapKpis.fenwick.fa)}
                      midValue={String(pct(heatmapKpis.fenwick.ffPct))}
                      rightValue={String(heatmapKpis.fenwick.ff)}
                      midBg={colorScaleRedWhiteBlue(heatmapKpis.fenwick.ffPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Shots"
                      leftLabel="SA"
                      midLabel="SF%"
                      rightLabel="SF"
                      leftValue={String(heatmapKpis.shots.sa)}
                      midValue={String(pct(heatmapKpis.shots.sfPct))}
                      rightValue={String(heatmapKpis.shots.sf)}
                      midBg={colorScaleRedWhiteBlue(heatmapKpis.shots.sfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Goals"
                      leftLabel="GA"
                      midLabel="GF%"
                      rightLabel="GF"
                      leftValue={String(heatmapKpis.goals.ga)}
                      midValue={String(pct(heatmapKpis.goals.gfPct))}
                      rightValue={String(heatmapKpis.goals.gf)}
                      midBg={colorScaleRedWhiteBlue(heatmapKpis.goals.gfPct, 20, 50, 80)}
                    />
                    <KpiCard
                      title="Shooting / Goaltending"
                      leftLabel="Sv%"
                      midLabel="PDO"
                      rightLabel="Sh%"
                      leftValue={String(pct(heatmapKpis.sg.svPct))}
                      midValue={String(pct(heatmapKpis.sg.pdo))}
                      rightValue={String(pct(heatmapKpis.sg.shPct))}
                      midBg={colorScaleRedWhiteBlue(heatmapKpis.sg.pdo, 90, 100, 110)}
                      className="sm:col-span-2"
                    />
                  </div>
                ) : null}

                <div className="grid gap-2 landscape:grid-cols-2">
                  <HeatHalfRink
                    title="Defensive End"
                    half="left"
                    zones={zones}
                    fillByZoneId={heatmap.fillByZoneId}
                    labelByZoneId={heatmap.labelByZoneId}
                    selectedZoneCode={selectedZoneCode}
                    onSelectZone={onSelectZone}
                  />

                  <HeatHalfRink
                    title="Offensive End"
                    half="right"
                    zones={zones}
                    fillByZoneId={heatmap.fillByZoneId}
                    labelByZoneId={heatmap.labelByZoneId}
                    selectedZoneCode={selectedZoneCode}
                    onSelectZone={onSelectZone}
                  />
                </div>
              </div>

              {/* Desktop: keep current layout (defensive • KPI stack • offensive). */}
              <div className="hidden gap-2 md:grid md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] md:items-stretch">
                <HeatHalfRink
                  title="Defensive End"
                  half="left"
                  zones={zones}
                  fillByZoneId={heatmap.fillByZoneId}
                  labelByZoneId={heatmap.labelByZoneId}
                  selectedZoneCode={selectedZoneCode}
                  onSelectZone={onSelectZone}
                />

                <div className="flex h-full flex-col justify-between gap-2">
                  {heatmapKpis ? (
                    <>
                      <KpiCard
                        title="Corsi"
                        leftLabel="CA"
                        midLabel="CF%"
                        rightLabel="CF"
                        leftValue={String(heatmapKpis.corsi.ca)}
                        midValue={String(pct(heatmapKpis.corsi.cfPct))}
                        rightValue={String(heatmapKpis.corsi.cf)}
                        midBg={colorScaleRedWhiteBlue(heatmapKpis.corsi.cfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Fenwick"
                        leftLabel="FA"
                        midLabel="FF%"
                        rightLabel="FF"
                        leftValue={String(heatmapKpis.fenwick.fa)}
                        midValue={String(pct(heatmapKpis.fenwick.ffPct))}
                        rightValue={String(heatmapKpis.fenwick.ff)}
                        midBg={colorScaleRedWhiteBlue(heatmapKpis.fenwick.ffPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Shots"
                        leftLabel="SA"
                        midLabel="SF%"
                        rightLabel="SF"
                        leftValue={String(heatmapKpis.shots.sa)}
                        midValue={String(pct(heatmapKpis.shots.sfPct))}
                        rightValue={String(heatmapKpis.shots.sf)}
                        midBg={colorScaleRedWhiteBlue(heatmapKpis.shots.sfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Goals"
                        leftLabel="GA"
                        midLabel="GF%"
                        rightLabel="GF"
                        leftValue={String(heatmapKpis.goals.ga)}
                        midValue={String(pct(heatmapKpis.goals.gfPct))}
                        rightValue={String(heatmapKpis.goals.gf)}
                        midBg={colorScaleRedWhiteBlue(heatmapKpis.goals.gfPct, 20, 50, 80)}
                        className="flex-1"
                      />
                      <KpiCard
                        title="Shooting / Goaltending"
                        leftLabel="Sv%"
                        midLabel="PDO"
                        rightLabel="Sh%"
                        leftValue={String(pct(heatmapKpis.sg.svPct))}
                        midValue={String(pct(heatmapKpis.sg.pdo))}
                        rightValue={String(pct(heatmapKpis.sg.shPct))}
                        midBg={colorScaleRedWhiteBlue(heatmapKpis.sg.pdo, 90, 100, 110)}
                        className="flex-1"
                      />
                    </>
                  ) : null}
                </div>

                <HeatHalfRink
                  title="Offensive End"
                  half="right"
                  zones={zones}
                  fillByZoneId={heatmap.fillByZoneId}
                  labelByZoneId={heatmap.labelByZoneId}
                  selectedZoneCode={selectedZoneCode}
                  onSelectZone={onSelectZone}
                />
              </div>
            </>
          )}

          <VideoSection title="Video" events={heatmapSelectedEvents} />
        </section>
      ) : tab === "tabeller" ? (
        <section className="space-y-4">
          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            <h2 className="text-lg font-semibold">Tabeller</h2>

            <nav className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  { key: "players-individual" as const, label: "Spillere - Individuel" },
                  { key: "players-onice" as const, label: "Spillere - På Banen" },
                  { key: "goalies" as const, label: "Målmænd" },
                  { key: "team" as const, label: "Hold" },
                ]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTablesTab(t.key)}
                  className={
                    tablesTab === t.key
                      ? "rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)]"
                      : "rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm"
                  }
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tablesTab === "players-individual" ? (
              <div className="mt-4">
                <SortableTable
                  rows={playerIndividualRows}
                  getRowKey={(r) => `${r.team}||${r.name}`}
                  defaultSortKey="p"
                  defaultSortDir="desc"
                  minWidthClass="min-w-[980px]"
                  columns={[
                    { key: "__rank", label: "Rank", getValue: () => 0 },
                    { key: "name", label: "Navn", align: "left", getValue: (r) => r.name },
                    { key: "team", label: "Hold", align: "left", getValue: (r) => r.team },
                    { key: "gp", label: "Kampe", getValue: (r) => r.gp },
                    { key: "g", label: "Mål", getValue: (r) => r.g },
                    { key: "a", label: "Assist", getValue: (r) => r.a },
                    { key: "p", label: "Point", getValue: (r) => r.p },
                    { key: "penMinus", label: "Udv-", getValue: (r) => r.penMinus },
                    { key: "penPlus", label: "Udv+", getValue: (r) => r.penPlus },
                    { key: "shots", label: "Skud", getValue: (r) => r.shots },
                    { key: "miss", label: "Mis", getValue: (r) => r.miss },
                    { key: "shotInBlock", label: "Skud i Blok", getValue: (r) => r.shotInBlock },
                    { key: "blocks", label: "Blokeringer", getValue: (r) => r.blocks },
                    { key: "shPct", label: "Sh%", getValue: (r) => r.shPct, format: (r) => pct(r.shPct) },
                  ]}
                />
              </div>
            ) : null}

            {tablesTab === "players-onice" ? (
              <div className="mt-4">
                <SortableTable
                  rows={playerOnIceRows}
                  getRowKey={(r) => `${r.team}||${r.name}`}
                  defaultSortKey="cfPct"
                  defaultSortDir="desc"
                  minWidthClass="min-w-[1180px]"
                  columns={[
                    { key: "__rank", label: "Rank", getValue: () => 0 },
                    { key: "name", label: "Spiller", align: "left", getValue: (r) => r.name },
                    { key: "team", label: "Hold", align: "left", getValue: (r) => r.team },
                    { key: "gp", label: "Kampe", getValue: (r) => r.gp },
                    { key: "cf", label: "CF", getValue: (r) => r.cf },
                    { key: "ca", label: "CA", getValue: (r) => r.ca },
                    {
                      key: "cfPct",
                      label: "CF%",
                      getValue: (r) => r.cfPct,
                      format: (r) => (
                        <Pill value={pct(r.cfPct)} bg={colorScaleRedWhiteBlue(r.cfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "ff", label: "FF", getValue: (r) => r.ff },
                    { key: "fa", label: "FA", getValue: (r) => r.fa },
                    {
                      key: "ffPct",
                      label: "FF%",
                      getValue: (r) => r.ffPct,
                      format: (r) => (
                        <Pill value={pct(r.ffPct)} bg={colorScaleRedWhiteBlue(r.ffPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "sf", label: "SF", getValue: (r) => r.sf },
                    { key: "sa", label: "SA", getValue: (r) => r.sa },
                    {
                      key: "sfPct",
                      label: "SF%",
                      getValue: (r) => r.sfPct,
                      format: (r) => (
                        <Pill value={pct(r.sfPct)} bg={colorScaleRedWhiteBlue(r.sfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "gf", label: "GF", getValue: (r) => r.gf },
                    { key: "ga", label: "GA", getValue: (r) => r.ga },
                    {
                      key: "gfPct",
                      label: "GF%",
                      getValue: (r) => r.gfPct,
                      format: (r) => (
                        <Pill value={pct(r.gfPct)} bg={colorScaleRedWhiteBlue(r.gfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "shPct", label: "Sh%", getValue: (r) => r.shPct, format: (r) => pct(r.shPct) },
                    { key: "svPct", label: "Sv%", getValue: (r) => r.svPct, format: (r) => pct(r.svPct) },
                    {
                      key: "pdo",
                      label: "PDO",
                      getValue: (r) => r.pdo,
                      format: (r) => (
                        <Pill value={pct(r.pdo)} bg={colorScaleRedWhiteBlue(r.pdo, 90, 100, 110)} />
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}

            {tablesTab === "goalies" ? (
              <div className="mt-4">
                <SortableTable
                  rows={goalieRows}
                  getRowKey={(r) => `${r.team}||${r.name}`}
                  defaultSortKey="svPct"
                  defaultSortDir="desc"
                  minWidthClass="min-w-[640px]"
                  columns={[
                    { key: "__rank", label: "Rank", getValue: () => 0 },
                    { key: "name", label: "Målmand", align: "left", getValue: (r) => r.name },
                    { key: "team", label: "Hold", align: "left", getValue: (r) => r.team },
                    { key: "games", label: "Kampe", getValue: (r) => r.games },
                    { key: "sa", label: "SA", getValue: (r) => r.sa },
                    { key: "ga", label: "GA", getValue: (r) => r.ga },
                    { key: "svPct", label: "Sv%", getValue: (r) => r.svPct, format: (r) => pct(r.svPct) },
                  ]}
                />
              </div>
            ) : null}

            {tablesTab === "team" ? (
              <div className="mt-4">
                <SortableTable
                  rows={teamRows}
                  getRowKey={(r) => r.team}
                  defaultSortKey="cfPct"
                  defaultSortDir="desc"
                  minWidthClass="min-w-[1180px]"
                  columns={[
                    { key: "__rank", label: "Rank", getValue: () => 0 },
                    { key: "team", label: "Hold", align: "left", getValue: (r) => r.team },
                    { key: "cf", label: "CF", getValue: (r) => r.cf },
                    { key: "ca", label: "CA", getValue: (r) => r.ca },
                    {
                      key: "cfPct",
                      label: "CF%",
                      getValue: (r) => r.cfPct,
                      format: (r) => (
                        <Pill value={pct(r.cfPct)} bg={colorScaleRedWhiteBlue(r.cfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "ff", label: "FF", getValue: (r) => r.ff },
                    { key: "fa", label: "FA", getValue: (r) => r.fa },
                    {
                      key: "ffPct",
                      label: "FF%",
                      getValue: (r) => r.ffPct,
                      format: (r) => (
                        <Pill value={pct(r.ffPct)} bg={colorScaleRedWhiteBlue(r.ffPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "sf", label: "SF", getValue: (r) => r.sf },
                    { key: "sa", label: "SA", getValue: (r) => r.sa },
                    {
                      key: "sfPct",
                      label: "SF%",
                      getValue: (r) => r.sfPct,
                      format: (r) => (
                        <Pill value={pct(r.sfPct)} bg={colorScaleRedWhiteBlue(r.sfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "gf", label: "GF", getValue: (r) => r.gf },
                    { key: "ga", label: "GA", getValue: (r) => r.ga },
                    {
                      key: "gfPct",
                      label: "GF%",
                      getValue: (r) => r.gfPct,
                      format: (r) => (
                        <Pill value={pct(r.gfPct)} bg={colorScaleRedWhiteBlue(r.gfPct, 20, 50, 80)} />
                      ),
                    },
                    { key: "shPct", label: "Sh%", getValue: (r) => r.shPct, format: (r) => pct(r.shPct) },
                    { key: "svPct", label: "Sv%", getValue: (r) => r.svPct, format: (r) => pct(r.svPct) },
                    {
                      key: "pdo",
                      label: "PDO",
                      getValue: (r) => r.pdo,
                      format: (r) => (
                        <Pill value={pct(r.pdo)} bg={colorScaleRedWhiteBlue(r.pdo, 90, 100, 110)} />
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-md border border-[color:var(--surface-border)] p-4">
          <h2 className="text-lg font-semibold">
            {tabs.find((t) => t.key === tab)?.label}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">Kommer snart.</p>
        </section>
      )}
    </div>
  );
}
