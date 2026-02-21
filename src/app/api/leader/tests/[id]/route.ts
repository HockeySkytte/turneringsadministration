import { NextResponse } from "next/server";
import { ApprovalStatus, TeamRole, TestType } from "@prisma/client";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

type ResultPatch = {
  id?: string;
  userId?: string;
  externalName?: string;
  resultText: string | null;
};

function normalizeResults(raw: unknown): ResultPatch[] {
  if (!Array.isArray(raw)) return [];
  const out: ResultPatch[] = [];
  for (const v of raw) {
    const id = String((v as any)?.id ?? "").trim();
    const userId = String((v as any)?.userId ?? "").trim();
    const externalName = String((v as any)?.externalName ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!id && !userId && !externalName) continue;
    const rt = String((v as any)?.resultText ?? "");
    const trimmed = rt.trim();
    out.push({
      ...(id ? { id } : {}),
      ...(userId ? { userId } : {}),
      ...(externalName ? { externalName } : {}),
      resultText: trimmed ? trimmed : null,
    });
  }
  // De-dup by identity (last wins)
  const map = new Map<string, ResultPatch>();
  for (const r of out) {
    const key = r.id
      ? `id:${r.id}`
      : r.userId
        ? `u:${r.userId}`
        : `e:${String(r.externalName ?? "").toLowerCase()}`;
    map.set(key, r);
  }
  return Array.from(map.values());
}

function parseTestType(raw: unknown): TestType | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "BEEP" || t === "BEEP_TEST" || t === "BEEPTEST") return TestType.BEEP;
  return null;
}

function sanitizeResultText(type: TestType, raw: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (type === TestType.BEEP) {
    if (!/^\d{2},\d{2}$/.test(t)) return null;
  }
  return t;
}

async function reconcileExternalParticipantsToMembers(teamId: string, testId: string) {
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
    where: { testId, userId: null, externalName: { not: null } },
    select: { id: true, externalName: true, resultText: true },
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
        where: { testId_userId: { testId, userId } },
        select: { id: true, resultText: true },
      });

      if (existingUserRow) {
        if (!existingUserRow.resultText && row.resultText) {
          await tx.teamTestResult.update({ where: { id: existingUserRow.id }, data: { resultText: row.resultText } });
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const { id } = await params;
  const testId = String(id ?? "").trim();
  if (!testId) return NextResponse.json({ message: "id mangler." }, { status: 400 });

  // Convert matching external participants to member participants (by display name)
  // so tests created before players had accounts still become linked later.
  await reconcileExternalParticipantsToMembers(teamId, testId);

  const test = await prisma.teamTest.findUnique({
    where: { id: testId },
    select: {
      id: true,
      teamId: true,
      type: true,
      testDate: true,
      createdAt: true,
      updatedAt: true,
      results: {
        orderBy: [{ createdAt: "asc" }],
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

  if (!test || test.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig test." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, test });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const { id } = await params;
  const testId = String(id ?? "").trim();
  if (!testId) return NextResponse.json({ message: "id mangler." }, { status: 400 });

  const existing = await prisma.teamTest.findUnique({
    where: { id: testId },
    select: { id: true, teamId: true },
  });
  if (!existing || existing.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig test." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const nextType = body?.type !== undefined ? parseTestType(body?.type) : null;
  const nextDate = body?.testDate !== undefined ? parseDateOnly(body?.testDate) : null;
  const participantUserIds = body?.participantUserIds !== undefined ? normalizeUserIds(body?.participantUserIds) : null;
  const participantNames = body?.participantNames !== undefined ? normalizeParticipantNames(body?.participantNames) : null;
  const resultsPatch = body?.results !== undefined ? normalizeResults(body?.results) : null;

  if (body?.type !== undefined && !nextType) {
    return NextResponse.json({ message: "Ugyldig test type." }, { status: 400 });
  }
  if (body?.testDate !== undefined && !nextDate) {
    return NextResponse.json({ message: "Dato mangler eller er ugyldig (yyyy-mm-dd)." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
    const currentTest = await tx.teamTest.findUnique({ where: { id: testId }, select: { type: true } });
    const effectiveType: TestType = (nextType ?? currentTest?.type ?? TestType.BEEP) as TestType;

    if (nextType || nextDate) {
      await tx.teamTest.update({
        where: { id: testId },
        data: {
          ...(nextType ? { type: nextType } : {}),
          ...(nextDate ? { testDate: nextDate } : {}),
        },
      });
    }

    const shouldUpdateParticipants = participantUserIds !== null || participantNames !== null;
    if (shouldUpdateParticipants) {
      const nextUserIds = participantUserIds ?? [];
      const nextNames = participantNames ?? [];

      // Validate participants
      if (nextUserIds.length + nextNames.length === 0) {
        throw new Error("NO_PARTICIPANTS");
      }

      if (nextUserIds.length > 0) {
        const memberships = await tx.teamMembership.findMany({
          where: {
            teamId,
            role: TeamRole.PLAYER,
            status: ApprovalStatus.APPROVED,
            userId: { in: nextUserIds },
          },
          select: { userId: true },
        });
        const allowed = new Set(memberships.map((m) => m.userId));
        if (allowed.size !== nextUserIds.length) {
          throw new Error("INVALID_PARTICIPANTS");
        }
      }

      const existingResults = await tx.teamTestResult.findMany({
        where: { testId },
        select: { id: true, userId: true, externalName: true },
      });

      const existingUserIds = new Set(existingResults.map((r) => r.userId).filter((v): v is string => !!v));
      const nextUserIdSet = new Set(nextUserIds);
      const toAddUsers = nextUserIds.filter((id) => !existingUserIds.has(id));
      const toRemoveUsers = Array.from(existingUserIds).filter((id) => !nextUserIdSet.has(id));

      const existingExternalByKey = new Map<string, { id: string; externalName: string }>();
      for (const r of existingResults) {
        if (!r.externalName) continue;
        const key = r.externalName.trim().toLowerCase();
        existingExternalByKey.set(key, { id: r.id, externalName: r.externalName });
      }

      const nextExternalByKey = new Map<string, string>();
      for (const n of nextNames) {
        const key = n.trim().toLowerCase();
        if (!key) continue;
        if (!nextExternalByKey.has(key)) nextExternalByKey.set(key, n);
      }

      const toAddExternalNames: string[] = [];
      for (const [key, name] of nextExternalByKey) {
        if (!existingExternalByKey.has(key)) toAddExternalNames.push(name);
      }

      const toRemoveExternalIds: string[] = [];
      for (const [key, row] of existingExternalByKey) {
        if (!nextExternalByKey.has(key)) toRemoveExternalIds.push(row.id);
      }

      if (toAddUsers.length > 0) {
        await tx.teamTestResult.createMany({
          data: toAddUsers.map((userId) => ({ testId, userId, resultText: null })),
        });
      }

      if (toAddExternalNames.length > 0) {
        await tx.teamTestResult.createMany({
          data: toAddExternalNames.map((externalName) => ({ testId, externalName, resultText: null })),
        });
      }

      if (toRemoveUsers.length > 0) {
        await tx.teamTestResult.deleteMany({
          where: { testId, userId: { in: toRemoveUsers } },
        });
      }

      if (toRemoveExternalIds.length > 0) {
        await tx.teamTestResult.deleteMany({
          where: { id: { in: toRemoveExternalIds } },
        });
      }
    }

    if (resultsPatch) {
      const currentRows = await tx.teamTestResult.findMany({
        where: { testId },
        select: { id: true, userId: true, externalName: true },
      });
      const allowedIds = new Set(currentRows.map((r) => r.id));
      const byUserId = new Map<string, string>();
      const byExternalKey = new Map<string, string>();
      for (const r of currentRows) {
        if (r.userId) byUserId.set(r.userId, r.id);
        if (r.externalName) byExternalKey.set(r.externalName.trim().toLowerCase(), r.id);
      }

      for (const r of resultsPatch) {
        let rowId: string | null = null;

        if (r.id && allowedIds.has(r.id)) {
          rowId = r.id;
        } else if (r.userId) {
          rowId = byUserId.get(r.userId) ?? null;
        } else if (r.externalName) {
          rowId = byExternalKey.get(r.externalName.trim().toLowerCase()) ?? null;
        }

        if (!rowId) continue;
        const sanitized = sanitizeResultText(effectiveType, r.resultText);
        await tx.teamTestResult.update({
          where: { id: rowId },
          data: { resultText: sanitized },
        });
      }
    }
    });
  } catch (err) {
    const msg = String((err as any)?.message ?? err);
    if (msg === "NO_PARTICIPANTS") {
      return NextResponse.json({ message: "Vælg mindst én deltager." }, { status: 400 });
    }
    if (msg === "INVALID_PARTICIPANTS") {
      return NextResponse.json({ message: "En eller flere deltagere er ugyldige." }, { status: 400 });
    }
    throw err;
  }

  const updated = await prisma.teamTest.findUnique({
    where: { id: testId },
    select: {
      id: true,
      type: true,
      testDate: true,
      createdAt: true,
      updatedAt: true,
      results: {
        orderBy: [{ createdAt: "asc" }],
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

  return NextResponse.json({ ok: true, test: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });

  const { id } = await params;
  const testId = String(id ?? "").trim();
  if (!testId) return NextResponse.json({ message: "id mangler." }, { status: 400 });

  const existing = await prisma.teamTest.findUnique({ where: { id: testId }, select: { teamId: true } });
  if (!existing || existing.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig test." }, { status: 404 });
  }

  await prisma.teamTest.delete({ where: { id: testId } });
  return NextResponse.json({ ok: true });
}
