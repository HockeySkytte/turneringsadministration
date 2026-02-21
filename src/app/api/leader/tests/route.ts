import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole, TestType } from "@prisma/client";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTestType(raw: unknown): TestType | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "BEEP" || t === "BEEP_TEST" || t === "BEEPTEST") return TestType.BEEP;
  return null;
}

function parseDateOnly(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

function normalizeUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = String(v ?? "").trim();
    if (id) out.push(id);
  }
  return Array.from(new Set(out));
}

function normalizeParticipantNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const name = String(v ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

type CreateResultPatch = {
  userId?: string;
  externalName?: string;
  resultText: string | null;
};

function normalizeCreateResults(raw: unknown): CreateResultPatch[] {
  if (!Array.isArray(raw)) return [];
  const out: CreateResultPatch[] = [];
  for (const v of raw) {
    const userId = String((v as any)?.userId ?? "").trim();
    const externalName = String((v as any)?.externalName ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!userId && !externalName) continue;
    const rt = String((v as any)?.resultText ?? "");
    const trimmed = rt.trim();
    out.push({
      ...(userId ? { userId } : {}),
      ...(externalName ? { externalName } : {}),
      resultText: trimmed ? trimmed : null,
    });
  }

  // De-dup by identity (last wins)
  const map = new Map<string, CreateResultPatch>();
  for (const r of out) {
    const key = r.userId ? `u:${r.userId}` : `e:${String(r.externalName ?? "").toLowerCase()}`;
    map.set(key, r);
  }
  return Array.from(map.values());
}

function sanitizeResultText(type: TestType, raw: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (type === TestType.BEEP) {
    // Required format: ##,## (e.g. 09,07)
    if (!/^\d{2},\d{2}$/.test(t)) return null;
  }
  return t;
}

async function reconcileExternalParticipantsToMembers(teamId: string) {
  // Map approved player display names to userId
  const members = await prisma.teamMembership.findMany({
    where: { teamId, role: TeamRole.PLAYER, status: ApprovalStatus.APPROVED },
    select: {
      userId: true,
      user: { select: { name: true, username: true } },
    },
  });

  const nameToUserId = new Map<string, string>();
  for (const m of members) {
    const display = String((m.user?.name ?? m.user?.username ?? "") as any)
      .trim()
      .replace(/\s+/g, " ");
    if (!display) continue;
    const key = display.toLowerCase();
    if (!nameToUserId.has(key)) nameToUserId.set(key, m.userId);
  }

  if (nameToUserId.size === 0) return;

  const candidates = await prisma.teamTestResult.findMany({
    where: {
      userId: null,
      externalName: { not: null },
      test: { teamId },
    },
    select: { id: true, testId: true, externalName: true, resultText: true },
  });

  if (candidates.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const row of candidates) {
      const key = String(row.externalName ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      const userId = nameToUserId.get(key);
      if (!userId) continue;

      const existingUserRow = await tx.teamTestResult.findUnique({
        where: { testId_userId: { testId: row.testId, userId } },
        select: { id: true, resultText: true },
      });

      if (existingUserRow) {
        if (!existingUserRow.resultText && row.resultText) {
          await tx.teamTestResult.update({
            where: { id: existingUserRow.id },
            data: { resultText: row.resultText },
          });
        }
        await tx.teamTestResult.delete({ where: { id: row.id } });
        continue;
      }

      await tx.teamTestResult.update({
        where: { id: row.id },
        data: { userId, externalName: null },
      });
    }
  });
}

export async function GET() {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  // If players have been created as members after tests were created, convert matching
  // external participants to member participants (by display name).
  await reconcileExternalParticipantsToMembers(teamId);

  const tests = await prisma.teamTest.findMany({
    where: { teamId },
    orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      type: true,
      testDate: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { results: true } },
    },
  });

  return NextResponse.json({
    teamId,
    tests: tests.map((t) => ({
      id: t.id,
      type: t.type,
      testDate: t.testDate,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      participantsCount: t._count.results,
    })),
  });
}

export async function POST(req: Request) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const type = parseTestType(body?.type);
  const testDate = parseDateOnly(body?.testDate);
  const participantUserIds = normalizeUserIds(body?.participantUserIds);
  const participantNames = normalizeParticipantNames(body?.participantNames);
  const resultsPatch = normalizeCreateResults(body?.results);

  if (!type) {
    return NextResponse.json({ message: "Ugyldig test type." }, { status: 400 });
  }
  if (!testDate) {
    return NextResponse.json({ message: "Dato mangler eller er ugyldig (yyyy-mm-dd)." }, { status: 400 });
  }
  if (participantUserIds.length + participantNames.length === 0) {
    return NextResponse.json({ message: "Vælg mindst én deltager." }, { status: 400 });
  }

  if (participantUserIds.length > 0) {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId,
        role: TeamRole.PLAYER,
        status: ApprovalStatus.APPROVED,
        userId: { in: participantUserIds },
      },
      select: { userId: true },
    });

    const allowed = new Set(memberships.map((m) => m.userId));
    if (allowed.size !== participantUserIds.length) {
      return NextResponse.json({ message: "En eller flere deltagere er ugyldige." }, { status: 400 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const test = await tx.teamTest.create({
      data: {
        teamId,
        type,
        testDate,
      },
      select: { id: true },
    });

    const resultByUserId = new Map<string, string | null>();
    const resultByExternalKey = new Map<string, string | null>();
    for (const r of resultsPatch) {
      if (r.userId) resultByUserId.set(r.userId, sanitizeResultText(type, r.resultText));
      if (r.externalName) resultByExternalKey.set(r.externalName.toLowerCase(), sanitizeResultText(type, r.resultText));
    }

    if (participantUserIds.length > 0) {
      await tx.teamTestResult.createMany({
        data: participantUserIds.map((userId) => ({
          testId: test.id,
          userId,
          resultText: resultByUserId.get(userId) ?? null,
        })),
      });
    }

    if (participantNames.length > 0) {
      await tx.teamTestResult.createMany({
        data: participantNames.map((externalName) => ({
          testId: test.id,
          externalName,
          resultText: resultByExternalKey.get(externalName.toLowerCase()) ?? null,
        })),
      });
    }

    return tx.teamTest.findUnique({
      where: { id: test.id },
      select: {
        id: true,
        type: true,
        testDate: true,
        createdAt: true,
        updatedAt: true,
        results: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            externalName: true,
            resultText: true,
            user: { select: { id: true, username: true, email: true, name: true, imageUrl: true } },
          },
        },
      },
    });
  });

  return NextResponse.json({ ok: true, test: created });
}
