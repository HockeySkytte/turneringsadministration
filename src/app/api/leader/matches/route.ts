import { NextResponse } from "next/server";
import { requireLeaderOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeTitle(input: unknown) {
  return String(input ?? "").trim();
}

function normalizeUrl(input: unknown) {
  return String(input ?? "").trim();
}

function parseDateOnly(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  // Expect yyyy-mm-dd
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  // Store at noon UTC to avoid timezone date shifts
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

export async function GET() {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const matches = await prisma.match.findMany({
    where: { teamId },
    orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      videoUrl: true,
      matchDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ teamId, matches });
}

export async function POST(req: Request) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const title = normalizeTitle(body?.title);
  const videoUrl = normalizeUrl(body?.videoUrl);
  const matchDate = parseDateOnly(body?.matchDate);

  if (!title) {
    return NextResponse.json({ message: "Titel mangler." }, { status: 400 });
  }
  if (!videoUrl) {
    return NextResponse.json({ message: "Video URL mangler." }, { status: 400 });
  }
  if (!matchDate) {
    return NextResponse.json({ message: "Dato mangler eller er ugyldig (yyyy-mm-dd)." }, { status: 400 });
  }

  const created = await prisma.match.create({
    data: {
      teamId,
      title,
      videoUrl,
      matchDate,
    },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      matchDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, match: created });
}

export async function DELETE(req: Request) {
  const user = await requireLeaderOrAdmin();
  const teamId = user.activeTeamId;
  if (!teamId) {
    return NextResponse.json({ message: "Ingen valgt hold." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const matchId = String(body?.matchId ?? "").trim();
  if (!matchId) {
    return NextResponse.json({ message: "matchId mangler." }, { status: 400 });
  }

  const existing = await prisma.match.findUnique({ where: { id: matchId } });
  if (!existing || existing.teamId !== teamId) {
    return NextResponse.json({ message: "Ugyldig kamp." }, { status: 404 });
  }

  await prisma.match.delete({ where: { id: matchId } });
  return NextResponse.json({ ok: true });
}
