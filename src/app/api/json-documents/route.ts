import { NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type JsonDocumentKind = "PLAYBOOK" | "EXERCISE";
type JsonDocumentScope = "TEAM" | "PUBLIC";

function normalizeTitle(input: unknown) {
  return String(input ?? "").trim();
}

function normalizeContent(input: unknown) {
  return String(input ?? "");
}

function parseKind(raw: unknown): JsonDocumentKind | null {
  const k = String(raw ?? "").trim().toUpperCase();
  if (k === "PLAYBOOK") return "PLAYBOOK";
  if (k === "EXERCISE" || k === "OEVELSE" || k === "OEVERSER") return "EXERCISE";
  return null;
}

function parseScope(raw: unknown): JsonDocumentScope | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "PUBLIC" || s === "OFFENTLIG" || s === "OFFENTLIGT") return "PUBLIC";
  if (s === "TEAM" || s === "HOLD") return "TEAM";
  return null;
}

function hasApprovedMembership(user: Awaited<ReturnType<typeof requireApprovedUser>>, teamId: string) {
  if (user.isAdmin) return true;
  return user.memberships.some((m) => m.teamId === teamId && m.status === ApprovalStatus.APPROVED);
}

export async function GET(req: Request) {
  const user = await requireApprovedUser();
  const url = new URL(req.url);

  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ message: "kind mangler (PLAYBOOK|EXERCISE)." }, { status: 400 });
  }

  const teamId = user.activeTeamId ?? null;

  const db = prisma as any;

  const docs = await db.jsonDocument.findMany({
    where: {
      kind,
      OR: [
        { scope: "PUBLIC" },
        ...(teamId ? [{ scope: "TEAM", teamId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      scope: true,
      kind: true,
      teamId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ teamId, documents: docs });
}

export async function POST(req: Request) {
  const user = await requireApprovedUser();
  const body = await req.json().catch(() => null);

  const title = normalizeTitle(body?.title);
  const kind = parseKind(body?.kind);
  const scope = parseScope(body?.scope);
  const content = normalizeContent(body?.content);
  const teamIdRaw = String(body?.teamId ?? "").trim();

  if (!title) {
    return NextResponse.json({ message: "Titel mangler." }, { status: 400 });
  }
  if (!kind) {
    return NextResponse.json({ message: "Ugyldig kind (PLAYBOOK|EXERCISE)." }, { status: 400 });
  }
  if (!scope) {
    return NextResponse.json({ message: "Ugyldig scope (TEAM|PUBLIC)." }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ message: "JSON content mangler." }, { status: 400 });
  }

  // Validate JSON
  try {
    JSON.parse(content);
  } catch {
    return NextResponse.json({ message: "JSON er ugyldig." }, { status: 400 });
  }

  const db = prisma as any;

  let teamId: string | null = null;
  if (scope === "TEAM") {
    if (!teamIdRaw) {
      return NextResponse.json({ message: "teamId mangler (TEAM upload)." }, { status: 400 });
    }

    const exists = await db.team.findUnique({ where: { id: teamIdRaw }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ message: "Ugyldigt hold." }, { status: 400 });
    }

    if (!hasApprovedMembership(user, teamIdRaw)) {
      return NextResponse.json({ message: "Du har ikke adgang til dette hold." }, { status: 403 });
    }

    teamId = teamIdRaw;
  }

  const created = await db.jsonDocument.create({
    data: {
      scope,
      kind,
      teamId,
      title,
      content,
    },
    select: {
      id: true,
      scope: true,
      kind: true,
      teamId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, document: created });
}
