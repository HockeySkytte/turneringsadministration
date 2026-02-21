import { NextResponse } from "next/server";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv, toDate, toFloat, toInt } from "@/lib/csv";

type UploadKind = "EVENTS" | "PLAYERS";

function toLooseInt(value: string | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/-?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0]!, 10);
  return Number.isFinite(n) ? n : null;
}

function toLooseFloat(value: string | undefined): number | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(/,/g, ".") : s;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function canonicalKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getValue(row: Record<string, string>, keys: string[]): string | undefined {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    map[canonicalKey(k)] = v;
  }

  for (const key of keys) {
    const v = map[canonicalKey(key)];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }

  return undefined;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const actor = await requireLeaderOrAdmin();
  const teamId = actor.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { message: "Ugyldig request." },
      { status: 400 }
    );
  }

  const kindRaw = String(form.get("kind") ?? "").trim().toUpperCase();
  const kind = (kindRaw === "EVENTS" || kindRaw === "PLAYERS"
    ? (kindRaw as UploadKind)
    : null) as UploadKind | null;

  if (!kind) {
    return NextResponse.json({ message: "kind mangler." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Fil mangler." }, { status: 400 });
  }

  const content = await file.text();
  const rows = parseCsv(content);

  // Best-effort metadata from first row
  const first = rows[0] ?? null;
  const gameId = first ? getValue(first, ["gameId", "game", "matchId"]) : undefined;
  const competition = first ? getValue(first, ["competition", "turnering"]) : undefined;
  const gameDateStr = first ? getValue(first, ["gameDate", "date", "matchDate"]) : undefined;
  const gameDate = gameDateStr ? toDate(gameDateStr) : null;

  const prismaAny = prisma as any;

  const statsFile = await prismaAny.statsFile.create({
    data: {
      teamId,
      uploadedById: actor.id,
      kind,
      originalName: file.name,
      content,
      gameId: gameId ?? null,
      competition: competition ?? null,
      gameDate,
    },
    select: { id: true },
  });

  if (kind === "EVENTS") {
    const data = rows
      .map((row, index) => {
        const event = getValue(row, ["event", "eventType", "type"]) ?? "";
        if (!event) return null;

        const timestampStr = getValue(row, ["timestamp", "dateTime", "time"]);
        const timestamp = timestampStr ? toDate(timestampStr) : null;

        return {
          teamId,
          fileId: statsFile.id,
          rowId: toInt(getValue(row, ["rowId", "row", "id"])) ?? index + 1,
          timestamp,
          event,
          teamName: getValue(row, ["teamName", "team"]) ?? null,
          venue: getValue(row, ["venue"]) ?? null,
          teamHome: getValue(row, ["teamHome", "homeTeam"]) ?? null,
          teamAway: getValue(row, ["teamAway", "awayTeam"]) ?? null,
          period: toLooseInt(getValue(row, ["period", "prd"])) ?? null,
          perspective: getValue(row, ["perspective"]) ?? null,
          strength: getValue(row, ["strength"]) ?? null,
          p1No: toInt(getValue(row, ["p1No", "p1Number", "player1No"])) ?? null,
          p1Name: getValue(row, ["p1Name", "player1Name", "player1"]) ?? null,
          p2No: toInt(getValue(row, ["p2No", "p2Number", "player2No"])) ?? null,
          p2Name: getValue(row, ["p2Name", "player2Name", "player2"]) ?? null,
          gNo: toInt(getValue(row, ["gNo", "goalieNo"])) ?? null,
          goalieName: getValue(row, ["goalieName", "goalie"]) ?? null,
          homeLine: getValue(row, ["homeLine"]) ?? null,
          homePlayers: getValue(row, ["homePlayers"]) ?? null,
          homePlayersNames: getValue(row, ["homePlayersNames"]) ?? null,
          awayLine: getValue(row, ["awayLine"]) ?? null,
          awayPlayers: getValue(row, ["awayPlayers"]) ?? null,
          awayPlayersNames: getValue(row, ["awayPlayersNames"]) ?? null,
          xM: toLooseFloat(getValue(row, ["xM", "x", "x_m"])) ?? null,
          yM: toLooseFloat(getValue(row, ["yM", "y", "y_m"])) ?? null,
          gameId: gameId ?? null,
          gameDate,
          competition: competition ?? null,
          videoUrl: getValue(row, ["videoUrl", "video", "video_url", "videoUrlRaw", "videoLink"]) ?? null,
          videoTime: toInt(getValue(row, ["videoTime", "videoSeconds", "video_time", "videoTimestamp"])) ?? null,
          aimX: toLooseFloat(getValue(row, ["aimX"])) ?? null,
          aimY: toLooseFloat(getValue(row, ["aimY"])) ?? null,
        };
      })
      .filter((x) => x !== null);

    for (const part of chunk(data, 500)) {
      await prismaAny.statsEvent.createMany({ data: part });
    }
  }

  if (kind === "PLAYERS") {
    const data = rows.map((row) => {
      const rowGameId = getValue(row, ["gameId", "game", "matchId"]);
      const rowCompetition = getValue(row, ["competition"]);
      const rowGameDateStr = getValue(row, ["gameDate", "date"]);
      const rowGameDate = rowGameDateStr ? toDate(rowGameDateStr) : null;

      return {
        teamId,
        fileId: statsFile.id,
        number: toInt(getValue(row, ["number", "no", "playerNo"])) ?? null,
        name: getValue(row, ["name", "player", "playerName"]) ?? null,
        line: getValue(row, ["line"]) ?? null,
        venue: getValue(row, ["venue"]) ?? null,
        teamName: getValue(row, ["teamName", "team"]) ?? null,
        teamColor: getValue(row, ["teamColor", "color"]) ?? null,
        gameId: gameId ?? rowGameId ?? null,
        gameDate: gameDate ?? rowGameDate,
        competition: competition ?? rowCompetition ?? null,
      };
    });

    for (const part of chunk(data, 500)) {
      await prismaAny.statsPlayer.createMany({ data: part });
    }
  }

  return NextResponse.json({ ok: true, fileId: statsFile.id });
}
