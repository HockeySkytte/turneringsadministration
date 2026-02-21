import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { closestRowByDecimal, rowByNiveau } from "@/lib/beepTestTable";

function parseMode(raw: string | null) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "all") return "all" as const;
  return "single" as const;
}

function normalizeName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

async function reconcileExternalParticipantsToMembers(teamId: string) {
  const db = prisma as any;

  const members = await db.teamMembership.findMany({
    where: { teamId, role: TeamRole.PLAYER, status: ApprovalStatus.APPROVED },
    select: {
      userId: true,
      user: { select: { name: true, username: true } },
    },
  });

  const nameToUserId = new Map<string, string>();
  for (const m of members) {
    const display = normalizeName(String(m.user?.name ?? m.user?.username ?? ""));
    if (!display) continue;
    const key = display.toLowerCase();
    if (!nameToUserId.has(key)) nameToUserId.set(key, m.userId);
  }

  if (nameToUserId.size === 0) return;

  const candidates = await db.teamTestResult.findMany({
    where: {
      userId: null,
      externalName: { not: null },
      test: { teamId },
    },
    select: { id: true, testId: true, externalName: true, resultText: true },
  });

  if (candidates.length === 0) return;

  await db.$transaction(async (tx: any) => {
    for (const row of candidates) {
      const key = normalizeName(String(row.externalName ?? "")).toLowerCase();
      const userId = nameToUserId.get(key);
      if (!userId) continue;

      const existingUserRow = await tx.teamTestResult.findUnique({
        where: { testId_userId: { testId: row.testId, userId } },
        select: { id: true, resultText: true },
      });

      if (existingUserRow) {
        if (!existingUserRow.resultText && row.resultText) {
          await tx.teamTestResult.update({ where: { id: existingUserRow.id }, data: { resultText: row.resultText } });
        }
        await tx.teamTestResult.delete({ where: { id: row.id } });
        continue;
      }

      await tx.teamTestResult.update({ where: { id: row.id }, data: { userId, externalName: null } });
    }
  });
}

export async function GET(req: Request) {
  const user = await requireApprovedUser();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const db = prisma as any;

  // Keep tests consistent when players become members later.
  await reconcileExternalParticipantsToMembers(teamId);

  const url = new URL(req.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const requestedPlayerId = String(url.searchParams.get("playerId") ?? "").trim();

  const isLeaderOrAdmin = user.isAdmin || user.activeRole === TeamRole.LEADER;

  let allowedPlayerIds: string[] = [];
  if (isLeaderOrAdmin) {
    const memberships = await db.teamMembership.findMany({
      where: { teamId, role: TeamRole.PLAYER, status: ApprovalStatus.APPROVED },
      select: { userId: true },
    });
    allowedPlayerIds = memberships.map((m: any) => m.userId);
  } else {
    allowedPlayerIds = [user.id];
  }

  const selectedPlayerId =
    mode === "all"
      ? null
      : requestedPlayerId && allowedPlayerIds.includes(requestedPlayerId)
        ? requestedPlayerId
        : isLeaderOrAdmin
          ? allowedPlayerIds[0] ?? null
          : user.id;

  const tests = await db.teamTest.findMany({
    where: { teamId },
    orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      type: true,
      testDate: true,
      results: {
        select: {
          userId: true,
          externalName: true,
          resultText: true,
        },
      },
    },
  });

  function computeTeamAverage(type: unknown, resultTexts: (string | null)[]) {
    if (String(type ?? "").toUpperCase() !== "BEEP") return null;
    const decimals: number[] = [];
    for (const rt of resultTexts) {
      const row = rowByNiveau(rt);
      if (row) decimals.push(row.decimal);
    }
    if (decimals.length === 0) return null;
    const avg = decimals.reduce((a, b) => a + b, 0) / decimals.length;
    const closest = closestRowByDecimal(avg);
    return closest
      ? { niveau: closest.niveau, decimal: closest.decimal, kondital: closest.kondital }
      : null;
  }

  return NextResponse.json({
    ok: true,
    mode,
    selectedPlayerId,
    tests: (tests as any[]).map((t: any) => ({
      id: t.id,
      type: t.type,
      testDate: t.testDate,
      playerResultText: selectedPlayerId
        ? (t.results.find((r: any) => r.userId === selectedPlayerId)?.resultText ?? null)
        : null,
      teamAverage: computeTeamAverage(
        t.type,
        t.results
          .filter((r: any) => Boolean(r.userId) || Boolean(r.externalName))
          .map((r: any) => r.resultText ?? null)
      ),
    })),
  });
}
