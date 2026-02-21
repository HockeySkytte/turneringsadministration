"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStatsFilters } from "@/components/stats/StatsFiltersProvider";
import VideoSection, { type VideoEvent } from "@/components/stats/VideoSection";
import {
  BEEP_BOUNDS,
  closestRowByDecimal,
  rowByNiveau,
} from "@/lib/beepTestTable";

type Role = "LEADER" | "PLAYER" | "SUPPORTER" | null;

type AuthMeResponse = {
  user: null | {
    id: string;
    username: string;
    email: string;
    globalRole: "ADMIN" | "USER";
    role: Role;
    membershipStatus: "PENDING_ADMIN" | "PENDING_LEADER" | "APPROVED" | "REJECTED" | null;
    team: { id: string; name: string } | null;
  };
};

type PlayerRow = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  imageUrl: string | null;
  position?: string | null;
  birthDate?: string | null;
};

type PlayersResponse = {
  ok: boolean;
  canPickAllPlayers: boolean;
  players: PlayerRow[];
  message?: string;
};

type TestType = "BEEP";

type PlayerTestResponse = {
  ok: boolean;
  mode: "all" | "single";
  selectedPlayerId: string | null;
  tests: {
    id: string;
    type: TestType;
    testDate: string;
    playerResultText: string | null;
    teamAverage: { niveau: string; decimal: number; kondital: number } | null;
  }[];
  message?: string;
};

function tabButtonClass(active: boolean) {
  return active
    ? "rounded-md px-3 py-2 text-sm font-semibold text-white"
    : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
}

function tabButtonStyle(active: boolean) {
  if (!active) return undefined;
  return {
    background: "var(--brand)",
    color: "var(--brand-foreground)",
  } as const;
}

type ReadinessEntry = {
  id: string;
  userId: string;
  entryDate: string;
  fatigue: number;
  sleepQuality: number;
  sleepDuration: number;
  soreness: number;
  mood: number;
  stress: number;
};

type ReadinessResponse = {
  ok: boolean;
  mode: "all" | "single";
  selectedPlayerId: string | null;
  entries: ReadinessEntry[];
  message?: string;
};

const readinessMetrics = [
  { key: "fatigue" as const, label: "Træthed" },
  { key: "sleepQuality" as const, label: "Søvn kvalitet" },
  { key: "sleepDuration" as const, label: "Søvn tid" },
  { key: "soreness" as const, label: "Ømhed" },
  { key: "mood" as const, label: "Humør" },
  { key: "stress" as const, label: "Stress" },
];

function clamp1to10(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 10) return null;
  return i;
}

function formatDateDK(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("da-DK");
  } catch {
    return iso;
  }
}

function dateKeyFromIso(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function dateLabelFromKey(key: string) {
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(key)) {
    return formatDateDK(`${key}T12:00:00.000Z`);
  }
  return key;
}

function RadarPlot({
  values,
  stroke,
}: {
  values: { label: string; value: number }[];
  stroke?: string;
}) {
  // Use a wider viewBox to give labels room outside the plot
  // without overlapping the radar or getting clipped.
  const width = 620;
  const height = 560;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 200;
  const labelRadius = 235;

  const strokeColor = stroke ?? "var(--brand)";
  const fillColor = "color-mix(in srgb, var(--brand) 18%, transparent)";

  const points = values.map((v, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / values.length;
    const r = (v.value / 10) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      ax: cx + radius * Math.cos(angle),
      ay: cy + radius * Math.sin(angle),
      lx: cx + labelRadius * Math.cos(angle),
      ly: cy + labelRadius * Math.sin(angle),
      label: v.label,
      value: v.value,
    };
  });

  const poly = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width="100%"
      height={420}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible" }}
    >
      {[2, 4, 6, 8, 10].map((lvl) => {
        const r = (lvl / 10) * radius;
        const ring = values
          .map((_, i) => {
            const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / values.length;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            return `${x},${y}`;
          })
          .join(" ");
        return (
          <polygon
            key={lvl}
            points={ring}
            fill="none"
            stroke="#e4e4e7"
            strokeWidth={1}
          />
        );
      })}

      {points.map((p, idx) => (
        <line key={idx} x1={cx} y1={cy} x2={p.ax} y2={p.ay} stroke="#e4e4e7" strokeWidth={1} />
      ))}

      <polygon points={poly} fill={fillColor} stroke={strokeColor} strokeWidth={3} />

      {points.map((p, idx) => (
        <g key={`lbl-${idx}`}>
          <text
            x={p.lx}
            y={p.ly}
            fontSize={15}
            fontWeight={600}
            textAnchor={p.lx < cx - 10 ? "end" : p.lx > cx + 10 ? "start" : "middle"}
            dominantBaseline="middle"
            fill="#3f3f46"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LineChart({
  points,
  stroke,
}: {
  points: { xLabel: string; y: number }[];
  stroke?: string;
}) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = 520;
  const height = isNarrow ? 270 : 230;
  const padL = isNarrow ? 62 : 52;
  const padR = 10;
  const padT = 12;
  const padB = isNarrow ? 48 : 40;

  const yTickFontSize = isNarrow ? 16 : 14;
  const xTickFontSize = isNarrow ? 15 : 13;

  const minY = 1;
  const maxY = 10;
  const usableW = width - padL - padR;
  const usableH = height - padT - padB;

  const toX = (i: number) => padL + (points.length <= 1 ? usableW / 2 : (i / (points.length - 1)) * usableW);
  const toY = (v: number) => padT + ((maxY - v) / (maxY - minY)) * usableH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.y)}`)
    .join(" ");

  const strokeColor = stroke ?? "var(--brand)";

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[1, 3, 5, 7, 9].map((y) => (
        <g key={y}>
          <line x1={padL} y1={toY(y)} x2={width - padR} y2={toY(y)} stroke="#f4f4f5" />
          <text x={padL - 10} y={toY(y)} fontSize={yTickFontSize} textAnchor="end" dominantBaseline="middle" fill="#71717a">
            {y}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke={strokeColor} strokeWidth={3} />

      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.y)} r={4} fill={strokeColor} />
      ))}

      {points.map((p, i) => {
        if (points.length > 10 && i % 2 === 1) return null;
        return (
          <text
            key={`x-${i}`}
            x={toX(i)}
            y={height - 10}
            fontSize={xTickFontSize}
            textAnchor="middle"
            fill="#71717a"
          >
            {p.xLabel}
          </text>
        );
      })}
    </svg>
  );
}

type BeepMetric = "NIVEAU" | "DECIMAL" | "KONDITAL";

function MultiLineChart({
  series,
  yDomain,
  formatY,
}: {
  series: {
    key: string;
    label: string;
    color: string;
    points: { xLabel: string; y: number | null }[];
  }[];
  yDomain: { min: number; max: number } | null;
  formatY: (v: number) => string;
}) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = 720;
  const height = isNarrow ? 360 : 300;
  const padL = isNarrow ? 66 : 54;
  const padR = 12;
  const padT = 16;
  const padB = isNarrow ? 54 : 44;
  const xInset = 18;

  const yTickFontSize = isNarrow ? 14 : 12;
  const xTickFontSize = isNarrow ? 13 : 11;

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const allFiniteY = series.flatMap((s) => s.points.map((p) => p.y)).filter((y): y is number => typeof y === "number" && Number.isFinite(y));
  if (allFiniteY.length === 0) {
    return <div className="text-sm text-zinc-600">Ingen data.</div>;
  }

  const xLabels = series[0]?.points.map((p) => p.xLabel) ?? [];

  const autoMin = Math.min(...allFiniteY);
  const autoMax = Math.max(...allFiniteY);
  const span = Math.max(1e-6, autoMax - autoMin);
  const y0 = yDomain ? yDomain.min : autoMin - span * 0.08;
  const y1 = yDomain ? yDomain.max : autoMax + span * 0.08;

  const usableW = width - padL - padR - xInset * 2;
  const usableH = height - padT - padB;

  const toX = (i: number, n: number) => padL + xInset + (n <= 1 ? usableW / 2 : (i / (n - 1)) * usableW);
  const toY = (v: number) => padT + ((y1 - v) / (y1 - y0)) * usableH;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => y0 + (i / yTicks) * (y1 - y0));

  return (
    <div className="relative">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => {
          setHoverIndex(null);
          setHoverPos(null);
        }}
        onMouseMove={(e) => {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const n = xLabels.length;
          if (!n) return;
          const minX = padL + xInset;
          const maxX = width - padR - xInset;
          const clamped = Math.min(Math.max(px * (width / rect.width), minX), maxX);
          const t = n <= 1 ? 0 : (clamped - minX) / (maxX - minX);
          const idx = n <= 1 ? 0 : Math.round(t * (n - 1));
          setHoverIndex(idx);
          setHoverPos({ x: clamped, y: padT });
        }}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={toY(v)} x2={width - padR} y2={toY(v)} stroke="#f4f4f5" />
            <text x={padL - 10} y={toY(v)} fontSize={yTickFontSize} textAnchor="end" dominantBaseline="middle" fill="#71717a">
              {formatY(v)}
            </text>
          </g>
        ))}

        {typeof hoverIndex === "number" && hoverIndex >= 0 && hoverIndex < xLabels.length ? (
          <line
            x1={toX(hoverIndex, xLabels.length)}
            y1={padT}
            x2={toX(hoverIndex, xLabels.length)}
            y2={height - padB}
            stroke="#e4e4e7"
            strokeWidth={1}
          />
        ) : null}

        {series.map((s) => {
          const n = s.points.length;
          let d = "";
          let started = false;
          for (let i = 0; i < n; i += 1) {
            const y = s.points[i]?.y;
            if (typeof y !== "number" || !Number.isFinite(y)) {
              started = false;
              continue;
            }
            d += `${started ? " L" : " M"} ${toX(i, n)} ${toY(y)}`;
            started = true;
          }
          return <path key={s.key} d={d.trim()} fill="none" stroke={s.color} strokeWidth={3} />;
        })}

        {series.map((s) => {
          const n = s.points.length;
          return s.points
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => typeof p.y === "number" && Number.isFinite(p.y))
            .map(({ p, i }) => (
              <circle
                key={`${s.key}-${i}`}
                cx={toX(i, n)}
                cy={toY(p.y as number)}
                r={typeof hoverIndex === "number" && hoverIndex === i ? 5 : 4}
                fill={s.color}
              />
            ));
        })}

        {xLabels.map((lbl, i) => {
          if (xLabels.length > 10 && i % 2 === 1) return null;
          return (
            <text key={i} x={toX(i, xLabels.length)} y={height - 12} fontSize={xTickFontSize} textAnchor="middle" fill="#71717a">
              {lbl}
            </text>
          );
        })}
      </svg>

      {typeof hoverIndex === "number" && hoverIndex >= 0 && hoverIndex < xLabels.length && hoverPos ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm"
          style={{
            left: Math.min(Math.max(8, (hoverPos.x / width) * 100), 92) + "%",
            top: 8,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-semibold">{xLabels[hoverIndex]}</div>
          <div className="mt-1 space-y-0.5">
            {series.map((s) => {
              const y = s.points[hoverIndex]?.y;
              return (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                    <span>{s.label}</span>
                  </div>
                  <div className="font-medium">{typeof y === "number" && Number.isFinite(y) ? formatY(y) : "–"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-3 text-sm md:text-xs text-zinc-700">
        {series.map((s) => (
          <div key={s.key} className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SpillerPage() {
  type TabKey = "readiness" | "spillerskema" | "tests" | "statistik" | "video";
  const [tab, setTab] = useState<TabKey>("readiness");

  const router = useRouter();

  const searchParams = useSearchParams();

  const { filters: statsFilters } = useStatsFilters();

  const [me, setMe] = useState<AuthMeResponse["user"]>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [canPickAllPlayers, setCanPickAllPlayers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayerId = useMemo(() => {
    const mode = String(searchParams.get("mode") ?? "").toLowerCase();
    const pid = String(searchParams.get("playerId") ?? "").trim();
    if (mode === "all") return "ALL" as const;
    return pid || null;
  }, [searchParams]);

  useEffect(() => {
    const qp = String(searchParams.get("tab") ?? "").toLowerCase();
    const allowed: TabKey[] = ["readiness", "spillerskema", "tests", "statistik", "video"];
    if (allowed.includes(qp as TabKey) && qp !== tab) {
      setTab(qp as TabKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function setTabAndUrl(next: TabKey) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    router.replace(url.pathname + "?" + url.searchParams.toString());
  }

  const isLeaderOrAdmin = useMemo(() => {
    if (!me) return false;
    return me.globalRole === "ADMIN" || me.role === "LEADER";
  }, [me]);

  async function loadMeAndPlayers() {
    setLoading(true);
    setError(null);

    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = (await meRes.json().catch(() => ({}))) as AuthMeResponse;
      const nextMe = meData?.user ?? null;
      setMe(nextMe);

      if (nextMe?.role === "SUPPORTER") {
        setError("Du har ikke adgang til Spiller-siden.");
        router.replace("/statistik");
        return;
      }

      const playersRes = await fetch("/api/player/players", { cache: "no-store" });
      const playersData = (await playersRes.json().catch(() => ({}))) as PlayersResponse;
      if (!playersRes.ok || !playersData?.ok) {
        setError(playersData?.message ?? "Kunne ikke hente spillere.");
        setPlayers([]);
        setCanPickAllPlayers(false);
        return;
      }

      setPlayers(playersData.players ?? []);
      setCanPickAllPlayers(!!playersData.canPickAllPlayers);

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeAndPlayers();
  }, []);

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId || selectedPlayerId === "ALL") return null;
    return players.find((p) => p.id === selectedPlayerId) ?? null;
  }, [players, selectedPlayerId]);

  const playerNameById = useMemo(() => {
    return new Map(players.map((p) => [p.id, p.displayName] as const));
  }, [players]);

  const headerName = useMemo(() => {
    if (selectedPlayerId === "ALL") return "Alle spillere";
    return selectedPlayer?.displayName ?? "Spiller";
  }, [selectedPlayerId, selectedPlayer]);

  const headerMeta = useMemo(() => {
    if (!selectedPlayer || selectedPlayerId === "ALL") return null;
    const items: string[] = [];
    const pos = String(selectedPlayer.position ?? "").trim();
    if (pos) items.push(`Position: ${pos}`);
    const bd = String(selectedPlayer.birthDate ?? "").trim();
    if (bd) items.push(`Fødselsdato: ${formatDateDK(bd)}`);
    return items.length ? items.join(" · ") : null;
  }, [selectedPlayer, selectedPlayerId]);

  const headerImageUrl = useMemo(() => {
    const fallback =
      "https://hockeystatisticscom.wordpress.com/wp-content/uploads/2025/12/default_image.png";
    const url = String(selectedPlayer?.imageUrl ?? "").trim();
    return url || fallback;
  }, [selectedPlayer]);

  // Tests tab
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [tests, setTests] = useState<PlayerTestResponse["tests"]>([]);
  const [beepMetric, setBeepMetric] = useState<BeepMetric>("NIVEAU");

  async function loadTests() {
    setTestsLoading(true);
    setTestsError(null);

    try {
      const url = new URL("/api/player/tests", window.location.origin);
      if (selectedPlayerId === "ALL" && isLeaderOrAdmin) {
        url.searchParams.set("mode", "all");
      } else if (selectedPlayerId && selectedPlayerId !== "ALL") {
        url.searchParams.set("playerId", selectedPlayerId);
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as PlayerTestResponse;
      if (!res.ok || !data?.ok) {
        setTestsError(data?.message ?? "Kunne ikke hente tests.");
        setTests([]);
        return;
      }
      setTests(Array.isArray(data.tests) ? data.tests : []);
    } finally {
      setTestsLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== "tests") return;
    if (!selectedPlayerId) return;
    loadTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedPlayerId, isLeaderOrAdmin]);

  function testTypeLabel(t: TestType) {
    if (t === "BEEP") return "Beep Test";
    return t;
  }

  // Readiness
  type ReadinessTab = "submit" | "receipts" | "charts";
  const [readinessTab, setReadinessTab] = useState<ReadinessTab>("submit");
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [readinessEntries, setReadinessEntries] = useState<ReadinessEntry[]>([]);

  const [form, setForm] = useState<Record<string, string>>({
    fatigue: "",
    sleepQuality: "",
    sleepDuration: "",
    soreness: "",
    mood: "",
    stress: "",
  });
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ReadinessEntry | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const [chartMetric, setChartMetric] = useState<
    (typeof readinessMetrics)[number]["key"] | "avg"
  >("avg");

  const canSubmitReadiness = useMemo(() => {
    // Don't allow submit when ALL is selected.
    if (!selectedPlayerId || selectedPlayerId === "ALL") return false;
    // Player can submit own; leader/admin can submit for any selected player.
    return isLeaderOrAdmin || me?.id === selectedPlayerId;
  }, [isLeaderOrAdmin, me?.id, selectedPlayerId]);

  async function loadReadiness() {
    if (!selectedPlayerId) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const url = new URL("/api/player/readiness", window.location.origin);
      if (selectedPlayerId === "ALL" && isLeaderOrAdmin) {
        url.searchParams.set("mode", "all");
      } else if (selectedPlayerId && selectedPlayerId !== "ALL") {
        url.searchParams.set("playerId", selectedPlayerId);
      }
      url.searchParams.set("days", "90");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ReadinessResponse;
      if (!res.ok || !data?.ok) {
        setReadinessError(data?.message ?? "Kunne ikke hente readiness.");
        setReadinessEntries([]);
        return;
      }

      const entries = Array.isArray(data.entries) ? data.entries : [];
      setReadinessEntries(entries);
    } finally {
      setReadinessLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== "readiness") return;
    if (!selectedPlayerId) return;
    loadReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedPlayerId, isLeaderOrAdmin]);

  async function submitReadiness() {
    if (!selectedPlayerId || selectedPlayerId === "ALL") return;
    if (!canSubmitReadiness) return;

    setSubmitOk(null);
    setReadinessError(null);

    const payload: any = { playerId: selectedPlayerId };
    for (const m of readinessMetrics) {
      const v = clamp1to10(form[m.key] ?? "");
      if (v === null) {
        setReadinessError("Alle felter skal være et tal mellem 1 og 10.");
        return;
      }
      payload[m.key] = v;
    }

    setSubmitBusy(true);
    try {
      const res = await fetch("/api/player/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReadinessError(data?.message ?? "Kunne ikke indsende readiness.");
        return;
      }
      setSubmitOk("Indsendt.");
      await loadReadiness();
    } finally {
      setSubmitBusy(false);
    }
  }

  function openEdit(e: ReadinessEntry) {
    setEditError(null);
    setEditEntry(e);
    setEditForm({
      fatigue: String(e.fatigue),
      sleepQuality: String(e.sleepQuality),
      sleepDuration: String(e.sleepDuration),
      soreness: String(e.soreness),
      mood: String(e.mood),
      stress: String(e.stress),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editEntry) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const payload: any = {};
      for (const m of readinessMetrics) {
        const v = clamp1to10(editForm[m.key] ?? "");
        if (v === null) {
          setEditError("Alle felter skal være et tal mellem 1 og 10.");
          return;
        }
        payload[m.key] = v;
      }

      const res = await fetch(`/api/player/readiness/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data?.message ?? "Kunne ikke gemme.");
        return;
      }
      setEditOpen(false);
      setEditEntry(null);
      await loadReadiness();
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteEntry(e: ReadinessEntry) {
    const ok = window.confirm("Slet readiness-kvittering?\nDette kan ikke fortrydes.");
    if (!ok) return;

    setReadinessError(null);
    const res = await fetch(`/api/player/readiness/${e.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setReadinessError(data?.message ?? "Kunne ikke slette.");
      return;
    }
    await loadReadiness();
  }

  const latestEntry = useMemo(() => {
    if (readinessEntries.length === 0) return null;
    return readinessEntries
      .slice()
      .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())[0];
  }, [readinessEntries]);

  const readinessByDate = useMemo(() => {
    const map = new Map<string, ReadinessEntry[]>();
    for (const e of readinessEntries) {
      const key = dateKeyFromIso(e.entryDate);
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    const keys = Array.from(map.keys()).sort();
    return { map, keys };
  }, [readinessEntries]);

  const latestDateKey = useMemo(() => {
    if (readinessByDate.keys.length === 0) return null;
    return readinessByDate.keys[readinessByDate.keys.length - 1];
  }, [readinessByDate.keys]);

  const readinessDateOptionsDesc = useMemo(() => {
    return readinessByDate.keys.slice().sort().reverse();
  }, [readinessByDate.keys]);

  const [allTableDateKey, setAllTableDateKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPlayerId !== "ALL") return;
    if (!latestDateKey) return;
    if (!allTableDateKey || !readinessByDate.map.has(allTableDateKey)) {
      setAllTableDateKey(latestDateKey);
    }
  }, [allTableDateKey, latestDateKey, readinessByDate.map, selectedPlayerId]);

  const effectiveAllTableDateKey =
    selectedPlayerId === "ALL" ? (allTableDateKey ?? latestDateKey) : null;

  const latestAllAggregate = useMemo(() => {
    if (selectedPlayerId !== "ALL") return null;
    if (!latestDateKey) return null;
    const list = readinessByDate.map.get(latestDateKey) ?? [];
    if (list.length === 0) return null;

    const sum = {
      fatigue: 0,
      sleepQuality: 0,
      sleepDuration: 0,
      soreness: 0,
      mood: 0,
      stress: 0,
    };
    for (const e of list) {
      sum.fatigue += e.fatigue;
      sum.sleepQuality += e.sleepQuality;
      sum.sleepDuration += e.sleepDuration;
      sum.soreness += e.soreness;
      sum.mood += e.mood;
      sum.stress += e.stress;
    }
    const n = list.length;
    return {
      dateKey: latestDateKey,
      count: n,
      metrics: {
        fatigue: sum.fatigue / n,
        sleepQuality: sum.sleepQuality / n,
        sleepDuration: sum.sleepDuration / n,
        soreness: sum.soreness / n,
        mood: sum.mood / n,
        stress: sum.stress / n,
      },
    };
  }, [latestDateKey, readinessByDate.map, selectedPlayerId]);

  const chartSeries = useMemo(() => {
    // Single player: plot the player's values over time.
    if (selectedPlayerId !== "ALL") {
      const byDate = readinessEntries
        .slice()
        .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

      return byDate.map((e) => {
        const avg =
          (e.fatigue + e.sleepQuality + e.sleepDuration + e.soreness + e.mood + e.stress) / 6;
        const y = chartMetric === "avg" ? avg : ((e as any)[chartMetric] as number);
        return {
          xLabel: formatDateDK(e.entryDate),
          y,
        };
      });
    }

    // All players: plot the average per day (across players who submitted that day).
    const pts: { xLabel: string; y: number }[] = [];
    for (const key of readinessByDate.keys) {
      const list = readinessByDate.map.get(key) ?? [];
      if (list.length === 0) continue;

      let sum = 0;
      let n = 0;
      for (const e of list) {
        const v =
          chartMetric === "avg"
            ? (e.fatigue + e.sleepQuality + e.sleepDuration + e.soreness + e.mood + e.stress) / 6
            : ((e as any)[chartMetric] as number);
        sum += v;
        n += 1;
      }
      if (n === 0) continue;
      pts.push({ xLabel: dateLabelFromKey(key), y: sum / n });
    }
    return pts;
  }, [chartMetric, readinessByDate.keys, readinessByDate.map, readinessEntries, selectedPlayerId]);

  type TableSortKey = "name" | (typeof readinessMetrics)[number]["key"] | "avg";
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("avg");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("desc");

  const latestDayRows = useMemo(() => {
    if (selectedPlayerId !== "ALL") return [];
    if (!effectiveAllTableDateKey) return [];

    const byUser = new Map<string, ReadinessEntry>();
    for (const e of readinessByDate.map.get(effectiveAllTableDateKey) ?? []) {
      byUser.set(e.userId, e);
    }

    // Include all players (even missing submissions) so the table truly shows "alle spillere".
    const rows = players.map((p) => {
      const e = byUser.get(p.id) ?? null;
      const fatigue = e?.fatigue ?? null;
      const sleepQuality = e?.sleepQuality ?? null;
      const sleepDuration = e?.sleepDuration ?? null;
      const soreness = e?.soreness ?? null;
      const mood = e?.mood ?? null;
      const stress = e?.stress ?? null;
      const avg =
        e
          ? (e.fatigue + e.sleepQuality + e.sleepDuration + e.soreness + e.mood + e.stress) / 6
          : null;
      return {
        userId: p.id,
        name: p.displayName,
        fatigue,
        sleepQuality,
        sleepDuration,
        soreness,
        mood,
        stress,
        avg,
        hasEntry: !!e,
      };
    });

    const getVal = (r: (typeof rows)[number]) => {
      if (tableSortKey === "name") return r.name;
      if (tableSortKey === "avg") return r.avg ?? -1;
      return (r as any)[tableSortKey] ?? -1;
    };

    rows.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv, "da");
        return tableSortDir === "asc" ? cmp : -cmp;
      }
      const an = Number(av);
      const bn = Number(bv);
      const cmp = an === bn ? 0 : an < bn ? -1 : 1;
      return tableSortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [effectiveAllTableDateKey, players, readinessByDate.map, selectedPlayerId, tableSortDir, tableSortKey]);

  function splitOnIce(value: string | null | undefined) {
    return String(value ?? "")
      .split(" - ")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Video tab
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoEvents, setVideoEvents] = useState<VideoEvent[]>([]);

  async function loadVideoEvents() {
    setVideoLoading(true);
    setVideoError(null);
    try {
      const res = await fetch("/api/stats/events?limit=1000", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVideoError(data?.message ?? "Kunne ikke hente video-events.");
        setVideoEvents([]);
        return;
      }
      const evts = Array.isArray(data?.events) ? (data.events as VideoEvent[]) : [];
      setVideoEvents(evts);
    } finally {
      setVideoLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== "video") return;
    loadVideoEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredVideoEvents = useMemo(() => {
    const kamp = String(statsFilters.kamp ?? "").trim();
    const styrke = String(statsFilters.styrke ?? "").trim();
    const eventType = String(statsFilters.event ?? "").trim();
    const scope = statsFilters.scope;

    const selectedName = selectedPlayer?.displayName ?? null;
    const wantPlayerScope = scope === "individual" || scope === "onIce";
    const playerName = wantPlayerScope ? selectedName : null;

    const out: VideoEvent[] = [];

    for (const e of videoEvents) {
      if (kamp && e.gameId !== kamp) continue;
      if (styrke && String(e.strength ?? "") !== styrke) continue;
      if (eventType && String(e.event ?? "") !== eventType) continue;

      const hasVideo =
        Boolean(String(e.videoUrl ?? "").trim()) &&
        typeof e.videoTime === "number" &&
        Number.isFinite(e.videoTime);
      if (!hasVideo) continue;

      if (scope === "individual") {
        if (!playerName) continue;
        const pn = playerName.trim();
        const p1 = String(e.p1Name ?? "").trim();
        const p2 = String(e.p2Name ?? "").trim();
        const gk = String(e.goalieName ?? "").trim();
        if (p1 !== pn && p2 !== pn && gk !== pn) continue;
      }

      if (scope === "onIce") {
        if (!playerName) continue;
        const pn = playerName.trim();
        const onIce = new Set<string>();
        for (const n of splitOnIce(e.homePlayersNames)) onIce.add(n);
        for (const n of splitOnIce(e.awayPlayersNames)) onIce.add(n);
        if (!onIce.has(pn)) continue;
      }

      out.push(e);
    }

    return out;
  }, [selectedPlayer?.displayName, statsFilters.event, statsFilters.kamp, statsFilters.scope, statsFilters.styrke, videoEvents]);

  function toggleTableSort(key: TableSortKey) {
    setTableSortKey((prev) => {
      if (prev !== key) {
        setTableSortDir(key === "name" ? "asc" : "desc");
        return key;
      }
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return prev;
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-3 pb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={headerImageUrl}
            alt={headerName}
            className="h-28 w-28 rounded-full border border-zinc-200 object-cover"
            loading="lazy"
          />
          <div>
            <h1 className="text-2xl font-semibold">{headerName}</h1>
            {headerMeta ? <div className="mt-0.5 text-sm text-zinc-600">{headerMeta}</div> : null}
            {me?.team?.name ? <div className="mt-0.5 text-sm text-zinc-600">{me.team.name}</div> : null}
          </div>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mb-4 text-sm text-zinc-600">Henter…</p> : null}

      <div className="rounded-md border bg-white p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTabAndUrl("readiness")}
              className={tabButtonClass(tab === "readiness")}
              style={tabButtonStyle(tab === "readiness")}
            >
              Readiness
            </button>
            <button
              type="button"
              onClick={() => setTabAndUrl("spillerskema")}
              className={tabButtonClass(tab === "spillerskema")}
              style={tabButtonStyle(tab === "spillerskema")}
            >
              Spillerskema
            </button>
            <button
              type="button"
              onClick={() => setTabAndUrl("tests")}
              className={tabButtonClass(tab === "tests")}
              style={tabButtonStyle(tab === "tests")}
            >
              Tests
            </button>
            <button
              type="button"
              onClick={() => setTabAndUrl("statistik")}
              className={tabButtonClass(tab === "statistik")}
              style={tabButtonStyle(tab === "statistik")}
            >
              Statistik
            </button>
            <button
              type="button"
              onClick={() => setTabAndUrl("video")}
              className={tabButtonClass(tab === "video")}
              style={tabButtonStyle(tab === "video")}
            >
              Video
            </button>
          </div>

          {tab === "readiness" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReadinessTab("submit")}
                  className={tabButtonClass(readinessTab === "submit")}
                  style={tabButtonStyle(readinessTab === "submit")}
                >
                  Indsend
                </button>
                <button
                  type="button"
                  onClick={() => setReadinessTab("receipts")}
                  className={tabButtonClass(readinessTab === "receipts")}
                  style={tabButtonStyle(readinessTab === "receipts")}
                >
                  Kvitteringer
                </button>
                <button
                  type="button"
                  onClick={() => setReadinessTab("charts")}
                  className={tabButtonClass(readinessTab === "charts")}
                  style={tabButtonStyle(readinessTab === "charts")}
                >
                  Readiness
                </button>
              </div>

              {readinessError ? <p className="text-sm text-red-600">{readinessError}</p> : null}
              {readinessLoading ? <p className="text-sm text-zinc-600">Henter…</p> : null}

              {readinessTab === "submit" ? (
                <div className="space-y-3">
                  <div className="text-sm text-zinc-600">
                    Udfyld felterne med værdier mellem 1 og 10 – 1 er dårligst og 10 er bedst.
                  </div>

                  {selectedPlayerId === "ALL" ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                      Vælg en spiller for at indsende.
                    </div>
                  ) : !canSubmitReadiness ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                      Du kan kun indsende for din egen profil.
                    </div>
                  ) : (
                    <div
                      className="overflow-hidden rounded-md border"
                      style={{ borderColor: "color-mix(in srgb, var(--brand) 22%, #e4e4e7)" }}
                    >
                      <div
                        className="px-4 py-2 text-base font-semibold"
                        style={{ background: "color-mix(in srgb, var(--brand) 12%, #f4f4f5)" }}
                      >
                        Readiness
                      </div>
                      <div className="divide-y divide-zinc-200">
                        {readinessMetrics.map((m) => (
                          <div
                            key={m.key}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                            style={{ background: "color-mix(in srgb, var(--brand) 6%, #fafafa)" }}
                          >
                            <div className="text-base">{m.label}</div>
                            <input
                              inputMode="numeric"
                              className="h-10 w-28 rounded-md border border-zinc-300 bg-white px-3 text-base"
                              value={form[m.key] ?? ""}
                              onChange={(e) => setForm((p) => ({ ...p, [m.key]: e.target.value }))}
                              placeholder="1-10"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {submitOk ? <div className="text-sm text-green-700">{submitOk}</div> : null}

                  <button
                    type="button"
                    onClick={submitReadiness}
                    className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    style={{ background: "var(--brand)", color: "var(--brand-foreground)" }}
                    disabled={!canSubmitReadiness || submitBusy || selectedPlayerId === "ALL"}
                  >
                    {submitBusy ? "Indsender…" : "Indsend"}
                  </button>
                </div>
              ) : null}

              {readinessTab === "receipts" ? (
                <div className="space-y-3">
                  {selectedPlayerId === "ALL" ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                      Vælg en spiller for at se kvitteringer.
                    </div>
                  ) : readinessEntries.length === 0 ? (
                    <p className="text-sm text-zinc-600">Ingen kvitteringer endnu.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-xs text-zinc-600">
                            <th className="py-2 pr-3">Dato</th>
                            {readinessMetrics.map((m) => (
                              <th key={m.key} className="py-2 pr-3">{m.label}</th>
                            ))}
                            <th className="py-2 pr-3">Handling</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readinessEntries
                            .slice()
                            .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
                            .map((e) => (
                              <tr key={e.id} className="border-b border-zinc-100 last:border-0">
                                <td className="py-2 pr-3">{formatDateDK(e.entryDate)}</td>
                                <td className="py-2 pr-3">{e.fatigue}</td>
                                <td className="py-2 pr-3">{e.sleepQuality}</td>
                                <td className="py-2 pr-3">{e.sleepDuration}</td>
                                <td className="py-2 pr-3">{e.soreness}</td>
                                <td className="py-2 pr-3">{e.mood}</td>
                                <td className="py-2 pr-3">{e.stress}</td>
                                <td className="py-2 pr-3">
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(e)}
                                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                                      disabled={editBusy}
                                    >
                                      Ret
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteEntry(e)}
                                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700"
                                      disabled={editBusy}
                                    >
                                      Slet
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {readinessTab === "charts" ? (
                <div className="space-y-4">
                  {readinessEntries.length === 0 ? (
                    <p className="text-sm text-zinc-600">Ingen readiness-data endnu.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[520px_1fr]">
                      <div className="rounded-md border border-zinc-200 p-3">
                        <div className="text-sm font-semibold">Seneste</div>
                        <div className="mt-0.5 text-xs text-zinc-600">
                          {selectedPlayerId === "ALL"
                            ? latestAllAggregate
                              ? dateLabelFromKey(latestAllAggregate.dateKey)
                              : ""
                            : latestEntry
                              ? formatDateDK(latestEntry.entryDate)
                              : ""}
                        </div>
                        {(selectedPlayerId === "ALL" ? !!latestAllAggregate : !!latestEntry) ? (
                          <div className="mt-2">
                            <RadarPlot
                              values={readinessMetrics.map((m) => ({
                                label: m.label,
                                value:
                                  selectedPlayerId === "ALL"
                                    ? ((latestAllAggregate!.metrics as any)[m.key] as number)
                                    : ((latestEntry as any)[m.key] as number),
                              }))}
                              stroke="var(--brand)"
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-zinc-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-lg font-semibold">Udvikling</div>
                            <div className="mt-0.5 text-xs text-zinc-600">Dato på x-aksen, værdi på y-aksen</div>
                          </div>
                          <label className="text-sm">
                            <span className="sr-only">Metric</span>
                            <select
                              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={chartMetric}
                              onChange={(e) => setChartMetric(e.target.value as any)}
                            >
                              <option value="avg">Gennemsnit</option>
                              {readinessMetrics.map((m) => (
                                <option key={m.key} value={m.key}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="mt-3">
                          <LineChart points={chartSeries} stroke="var(--brand)" />
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedPlayerId === "ALL" && effectiveAllTableDateKey ? (
                    <div className="rounded-md border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">Dag (alle spillere)</div>
                          <div className="mt-2">
                            <label className="text-xs">
                              <span className="sr-only">Dato</span>
                              <select
                                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={effectiveAllTableDateKey}
                                onChange={(e) => setAllTableDateKey(e.target.value)}
                              >
                                {readinessDateOptionsDesc.map((k) => (
                                  <option key={k} value={k}>
                                    {dateLabelFromKey(k)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-600">
                          Rækker: {latestDayRows.length}
                        </div>
                      </div>

                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 text-xs text-zinc-600">
                              <th className="py-2 pr-3">
                                <button type="button" className="hover:underline" onClick={() => toggleTableSort("name")}>
                                  Spiller
                                </button>
                              </th>
                              {readinessMetrics.map((m) => (
                                <th key={m.key} className="py-2 pr-3">
                                  <button type="button" className="hover:underline" onClick={() => toggleTableSort(m.key)}>
                                    {m.label}
                                  </button>
                                </th>
                              ))}
                              <th className="py-2 pr-3">
                                <button type="button" className="hover:underline" onClick={() => toggleTableSort("avg")}>
                                  Gns.
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {latestDayRows.map((r) => (
                              <tr key={r.userId} className="border-b border-zinc-100 last:border-0">
                                <td className="py-2 pr-3">
                                  <div className="font-medium">{r.name}</div>
                                  {!r.hasEntry ? <div className="text-xs text-zinc-500">Ingen indsendelse</div> : null}
                                </td>
                                <td className="py-2 pr-3">{r.fatigue ?? "–"}</td>
                                <td className="py-2 pr-3">{r.sleepQuality ?? "–"}</td>
                                <td className="py-2 pr-3">{r.sleepDuration ?? "–"}</td>
                                <td className="py-2 pr-3">{r.soreness ?? "–"}</td>
                                <td className="py-2 pr-3">{r.mood ?? "–"}</td>
                                <td className="py-2 pr-3">{r.stress ?? "–"}</td>
                                <td className="py-2 pr-3">{r.avg === null ? "–" : r.avg.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "spillerskema" ? (
            <div className="text-sm text-zinc-600">
              {selectedPlayerId === "ALL" ? "Spillerskema (alle) – kommer." : "Spillerskema – kommer."}
            </div>
          ) : null}

          {tab === "tests" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Beep Test</div>
                </div>

                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Metric</div>
                  <select
                    className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={beepMetric}
                    onChange={(e) => setBeepMetric(e.target.value as BeepMetric)}
                  >
                    <option value="NIVEAU">Niveau</option>
                    <option value="DECIMAL">Decimal</option>
                    <option value="KONDITAL">Kondital</option>
                  </select>
                </label>
              </div>

              {selectedPlayerId === "ALL" ? (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                  Vælg en spiller for at se tests
                </div>
              ) : (
                <>
                  {testsError ? <p className="text-sm text-red-600">{testsError}</p> : null}
                  {testsLoading ? <p className="text-sm text-zinc-600">Henter…</p> : null}

                  {!testsLoading ? (
                    (() => {
                      const byDate = new Map<string, { player?: number; team?: number }>();

                      const sorted = [...tests]
                        .filter((t) => t.type === "BEEP")
                        .sort((a, b) => new Date(a.testDate).getTime() - new Date(b.testDate).getTime());

                      for (const t of sorted) {
                        const dk = dateLabelFromKey(dateKeyFromIso(t.testDate));

                        let playerY: number | null = null;

                        const playerRow = rowByNiveau(t.playerResultText);
                        if (playerRow) {
                          playerY =
                            beepMetric === "KONDITAL"
                              ? playerRow.kondital
                              : playerRow.decimal; // NIVEAU + DECIMAL are plotted on numeric decimal scale
                        }

                        const teamAvg = t.teamAverage
                          ? beepMetric === "KONDITAL"
                            ? t.teamAverage.kondital
                            : t.teamAverage.decimal
                          : null;

                        byDate.set(dk, {
                          player: playerY ?? undefined,
                          team: teamAvg ?? undefined,
                        });
                      }

                      const xLabels = Array.from(byDate.keys());
                      const playerPoints = xLabels.map((x) => ({ xLabel: x, y: byDate.get(x)?.player ?? null }));
                      const teamPoints = xLabels.map((x) => ({ xLabel: x, y: byDate.get(x)?.team ?? null }));

                      if (
                        playerPoints.every((p) => p.y === null) &&
                        teamPoints.every((p) => p.y === null)
                      ) {
                        return <p className="text-sm text-zinc-600">Ingen tests endnu.</p>;
                      }

                      const goalRow = rowByNiveau("13,04");
                      const goalY =
                        goalRow
                          ? beepMetric === "KONDITAL"
                            ? goalRow.kondital
                            : goalRow.decimal
                          : null;
                      const goalPoints = xLabels.map((x) => ({ xLabel: x, y: goalY }));

                      const bounds = BEEP_BOUNDS;
                      const yDomain =
                        bounds
                          ? beepMetric === "KONDITAL"
                            ? { min: bounds.minKondital, max: bounds.maxKondital }
                            : { min: bounds.minDecimal, max: bounds.maxDecimal } // NIVEAU + DECIMAL
                          : null;

                      const formatY = (v: number) => {
                        if (beepMetric === "NIVEAU") return closestRowByDecimal(v)?.niveau ?? v.toFixed(2);
                        if (beepMetric === "DECIMAL") return v.toFixed(2);
                        return v.toFixed(1);
                      };

                      return (
                        <MultiLineChart
                          yDomain={yDomain}
                          formatY={formatY}
                          series={[
                            {
                              key: "player",
                              label: "Spiller",
                              color: "var(--brand)",
                              points: playerPoints,
                            },
                            {
                              key: "team",
                              label: "Hold gennemsnit",
                              color: "#64748b",
                              points: teamPoints,
                            },
                            {
                              key: "goal",
                              label: "Målsætning (13,04)",
                              color: "#16a34a",
                              points: goalPoints,
                            },
                          ]}
                        />
                      );
                    })()
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === "statistik" ? (
            <div className="text-sm text-zinc-600">Statistik – kommer. (Du kan stadig bruge /statistik.)</div>
          ) : null}

          {tab === "video" ? (
            <div className="space-y-3">
              {selectedPlayerId === "ALL" ? (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                  Vælg en spiller for at se video
                </div>
              ) : (
                <>
                  {videoError ? <p className="text-sm text-red-600">{videoError}</p> : null}
                  {videoLoading ? <p className="text-sm text-zinc-600">Henter…</p> : null}
                  <VideoSection title="" events={filteredVideoEvents} showTable={false} />
                </>
              )}
            </div>
          ) : null}
      </div>

      {editOpen && editEntry ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editBusy) setEditOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold">Ret readiness • {formatDateDK(editEntry.entryDate)}</div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={editBusy}
              >
                Luk
              </button>
            </div>

            <div className="space-y-4 p-4">
              {editError ? <p className="text-sm text-red-600">{editError}</p> : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {readinessMetrics.map((m) => (
                  <label key={m.key} className="block">
                    <div className="text-xs font-semibold text-zinc-700">{m.label}</div>
                    <input
                      inputMode="numeric"
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={editForm[m.key] ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, [m.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={editBusy}
                >
                  Annuller
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--brand)", color: "var(--brand-foreground)" }}
                  disabled={editBusy}
                >
                  {editBusy ? "Gemmer…" : "Gem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
