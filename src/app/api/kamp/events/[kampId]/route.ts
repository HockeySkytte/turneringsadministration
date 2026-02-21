import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/appContext";
import { prisma } from "@/lib/prisma";

type Venue = "Hjemme" | "Ude";

type MatchStatus = "open" | "live" | "closed";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeStatus(s: unknown): MatchStatus | null {
  const v = String(s ?? "").trim().toLowerCase();
  if (v === "open" || v === "live" || v === "closed") return v;
  return null;
}

function deriveStatus(statuses: Array<string | null | undefined>): MatchStatus {
  const normed = statuses.map(normalizeStatus).filter(Boolean) as MatchStatus[];
  if (normed.includes("closed")) return "closed";
  if (normed.includes("live")) return "live";
  return "open";
}

async function getMatchStatus(kampId: number): Promise<MatchStatus> {
  const [protoPlayersStatus, protoEventsStatus, uploadPlayersStatus, uploadEventsStatus] = await Promise.all([
    prisma.matchProtocolPlayer.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchProtocolEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadLineup.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
    prisma.matchUploadEvent.findMany({
      where: { kampId, status: { not: null } },
      distinct: ["status"],
      select: { status: true },
    } as any),
  ]);

  return deriveStatus([
    ...protoPlayersStatus.map((r: any) => r.status),
    ...protoEventsStatus.map((r: any) => r.status),
    ...uploadPlayersStatus.map((r: any) => r.status),
    ...uploadEventsStatus.map((r: any) => r.status),
  ]);
}

async function resolveHomeClubId(kampId: number) {
  const taMatch = await prisma.taMatch.findFirst({
    where: { externalId: String(kampId) },
    select: { homeHoldId: true, league: true, homeTeam: true },
  });
  if (!taMatch) return null;

  const homeHoldId = String((taMatch as any).homeHoldId ?? "").trim();
  if (homeHoldId) {
    const homeTeam = await prisma.taTeam.findFirst({
      where: { holdId: homeHoldId },
      orderBy: { updatedAt: "desc" },
      select: { clubId: true },
    });
    return homeTeam?.clubId ?? null;
  }

  // Legacy fallback for older rows where holdId is missing.
  if (!taMatch.league || !taMatch.homeTeam) return null;
  const homeTeam = await prisma.taTeam.findFirst({
    where: { league: taMatch.league, name: taMatch.homeTeam },
    select: { clubId: true },
  });
  return homeTeam?.clubId ?? null;
}

function userIsHomeSecretariat(user: any, homeClubId: string | null): boolean {
  if (!homeClubId) return false;
  return Boolean(
    user?.roles?.some(
      (r: any) =>
        r.status === "APPROVED" &&
        r.role === "SECRETARIAT" &&
        r.clubId != null &&
        r.clubId === homeClubId,
    ),
  );
}

function canOverride(user: any): boolean {
  if (!user) return false;
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) return false;
  return Boolean(user.isAdmin || user.isTournamentAdmin || user.isSuperuser);
}

function isRowEmpty(r: any): boolean {
  return !(
    norm(r?.period) ||
    norm(r?.time) ||
    norm(r?.side) ||
    norm(r?.number) ||
    norm(r?.goal) ||
    norm(r?.assist) ||
    norm(r?.penalty) ||
    norm(r?.code)
  );
}

function parseTimeToMmSs(raw: string): string | null {
  const v = norm(raw);
  if (!v) return null;

  // Accept mmss (digits) or mm:ss
  const digits = v.replace(/[^0-9]/g, "");
  if (digits.length !== 4) return null;
  const mm = Number.parseInt(digits.slice(0, 2), 10);
  const ss = Number.parseInt(digits.slice(2, 4), 10);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (mm < 0 || mm > 59) return null;
  if (ss < 0 || ss > 59) return null;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const CODES_2_MIN: Record<string, string> = {
  "201": "Ukorrekt slag",
  "202": "Låsning af stav",
  "203": "Løfte stav",
  "204": "Ukorrekt spark",
  "205": "Fastholdning",
  "206": "Højt spark eller høj stav",
  "207": "Ukorrekt skub",
  "208": "Hårdt spil",
  "209": "Måling af stav",
  "210": "Spil uden stav",
  "211": "Undlade at fjerne knækket stav",
  "212": "Obstruktion",
  "213": "Ukorrekt afstand",
  "214": "Liggende spil",
  "215": "Spil med hånden",
  "216": "Ukorrekt udskiftning",
  "217": "For mange spillere på banen",
  "218": "Ukorrekt indtræden på banen",
  "219": "Forsinkelse af spillet",
  "220": "Protester",
  "221": "Ukorrekt udstyr",
  "222": "Gentagne forseelser",
};

const CODES_4_MIN: Record<string, string> = {
  "501": "Voldsomt slag",
  "502": "Farligt spil",
  "503": "Hægtning",
  "504": "Hårdt spil",
  "301": "Matchstraf 1",
  "302": "Matchstraf 2",
  "303": "Matchstraf 3",
};

const CODES_SPECIAL: Record<string, string> = {
  "101": "Dårlig opførsel",
  "401": "Time out",
  "402": "Straffeslag",
};

function allowedCodesForPenalty(penalty: string): Set<string> {
  const p = norm(penalty);
  if (!p) return new Set(["", "401", "402"]);
  if (p === "2") return new Set(["", ...Object.keys(CODES_2_MIN)]);
  if (p === "4") return new Set(["", ...Object.keys(CODES_4_MIN)]);
  if (p === "2+10") return new Set(["", "101"]);
  return new Set([""]);
}

async function getLineupNumbers(kampId: number, venue: Venue): Promise<string[]> {
  const rows = await prisma.matchUploadLineup.findMany({
    where: { kampId, venue },
    orderBy: { rowIndex: "asc" },
    select: { number: true, leader: true },
  } as any);

  const nums = rows
    .filter((r: any) => norm(r?.leader).toUpperCase() !== "L")
    .map((r: any) => norm(r?.number))
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of nums) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const homeClubId = await resolveHomeClubId(kampId);
  const isHome = userIsHomeSecretariat(user, homeClubId);
  const override = canOverride(user);
  if (!isHome && !override) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const [status, started, homeNumbers, awayNumbers, events] = await Promise.all([
    getMatchStatus(kampId),
    (prisma as any).matchStart?.findUnique({ where: { kampId }, select: { startedAt: true } }) ?? Promise.resolve(null),
    getLineupNumbers(kampId, "Hjemme"),
    getLineupNumbers(kampId, "Ude"),
    prisma.matchProtocolEvent.findMany({
      where: { kampId },
      orderBy: { rowIndex: "asc" },
      select: {
        rowIndex: true,
        period: true,
        time: true,
        side: true,
        number: true,
        goal: true,
        assist: true,
        penalty: true,
        code: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    status,
    startedAt: started?.startedAt ?? null,
    lineups: { homeNumbers, awayNumbers },
    events,
    codes: {
      special: CODES_SPECIAL,
      p2: CODES_2_MIN,
      p4: CODES_4_MIN,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ kampId: string }> }) {
  const { user } = await getAppContext();
  if (!user?.hasApprovedRole) return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) return NextResponse.json({ ok: false, error: "INVALID_KAMP" }, { status: 400 });

  const homeClubId = await resolveHomeClubId(kampId);
  const isHome = userIsHomeSecretariat(user, homeClubId);
  const override = canOverride(user);
  if (!isHome && !override) {
    return NextResponse.json({ ok: false, error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  const status = await getMatchStatus(kampId);
  if (status === "closed" && !override) {
    return NextResponse.json({ ok: false, error: "MATCH_LOCKED", status }, { status: 409 });
  }

  const started = await (prisma as any).matchStart?.findUnique({ where: { kampId }, select: { startedAt: true } });
  if (!started?.startedAt) {
    return NextResponse.json({ ok: false, error: "MATCH_NOT_STARTED" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const eventsIn = Array.isArray(body?.events) ? body.events : [];

  const [homeNumbers, awayNumbers] = await Promise.all([
    getLineupNumbers(kampId, "Hjemme"),
    getLineupNumbers(kampId, "Ude"),
  ]);
  const homeSet = new Set(homeNumbers);
  const awaySet = new Set(awayNumbers);

  const toSide = (v: string): "H" | "U" | "" => {
    const s = norm(v).toUpperCase();
    if (s === "H" || s === "HOME" || s === "HJEMME") return "H";
    if (s === "U" || s === "AWAY" || s === "UDE") return "U";
    return "";
  };

  const out: any[] = [];
  for (let i = 0; i < Math.min(eventsIn.length, 80); i++) {
    const r = eventsIn[i] ?? {};
    if (isRowEmpty(r)) continue;

    const period = norm(r.period);
    if (!["1", "2", "3", "OT"].includes(period)) {
      return NextResponse.json({ ok: false, error: "INVALID_PERIOD", rowIndex: i }, { status: 400 });
    }

    const time = parseTimeToMmSs(String(r.time ?? ""));
    if (!time) {
      return NextResponse.json({ ok: false, error: "INVALID_TIME", rowIndex: i }, { status: 400 });
    }

    const side = toSide(String(r.side ?? ""));
    if (!side) {
      return NextResponse.json({ ok: false, error: "INVALID_SIDE", rowIndex: i }, { status: 400 });
    }

    const number = norm(r.number);
    const assist = norm(r.assist);

    const goal = norm(r.goal);
    if (goal && !/^\d+\-\d+$/.test(goal)) {
      return NextResponse.json({ ok: false, error: "INVALID_GOAL", rowIndex: i }, { status: 400 });
    }

    const penalty = norm(r.penalty);
    if (penalty && !["2", "4", "2+10"].includes(penalty)) {
      return NextResponse.json({ ok: false, error: "INVALID_PENALTY", rowIndex: i }, { status: 400 });
    }

    const code = norm(r.code);
    const allowed = allowedCodesForPenalty(penalty);
    if (!allowed.has(code)) {
      return NextResponse.json({ ok: false, error: "INVALID_CODE", rowIndex: i }, { status: 400 });
    }

    // Number dropdown must be from lineup for the selected side (except timeouts).
    if (code !== "401" && code !== "402") {
      if (!number) {
        return NextResponse.json({ ok: false, error: "MISSING_NUMBER", rowIndex: i }, { status: 400 });
      }
      const set = side === "H" ? homeSet : awaySet;
      if (!set.has(number)) {
        return NextResponse.json({ ok: false, error: "NUMBER_NOT_IN_LINEUP", rowIndex: i }, { status: 400 });
      }

      if (assist) {
        if (!set.has(assist)) {
          return NextResponse.json({ ok: false, error: "ASSIST_NOT_IN_LINEUP", rowIndex: i }, { status: 400 });
        }
      }
    }

    out.push({
      kampId,
      rowIndex: i,
      status: "live",
      period,
      time,
      side,
      number: number || null,
      goal: goal || null,
      assist: assist || null,
      penalty: penalty || null,
      code: code || null,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchProtocolEvent.deleteMany({ where: { kampId } });
    if (out.length) {
      await tx.matchProtocolEvent.createMany({ data: out });
    }
  });

  return NextResponse.json({ ok: true, count: out.length, status: "live" });
}
