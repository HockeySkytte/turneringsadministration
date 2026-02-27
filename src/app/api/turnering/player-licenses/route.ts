import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const dynamic = "force-dynamic";

function parseDateOnly(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseIntParam(value: string | null, fallback: number): number {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseDateOnlyParam(value: string | null): Date | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function clearExpiredDoubleLicenses() {
  const today = dateOnlyUtc(new Date());
  await prisma.taPlayerLicense.updateMany({
    where: {
      doubleClubExpiresAt: { not: null, lte: today },
    },
    data: {
      doubleClubId: null,
      doubleClubExpiresAt: null,
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaClientKnownRequestError && err.code === "P2002";
}

export async function GET(req: Request) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();

  await clearExpiredDoubleLicenses();

  const url = new URL(req.url);
  const page = Math.max(1, parseIntParam(url.searchParams.get("page"), 1));
  const pageSize = clamp(parseIntParam(url.searchParams.get("pageSize"), 50), 10, 200);
  const skip = (page - 1) * pageSize;

  const q = String(url.searchParams.get("q") ?? "").trim();
  const clubId = String(url.searchParams.get("clubId") ?? "").trim() || null;
  const gender = String(url.searchParams.get("gender") ?? "").trim().toUpperCase();
  const bornFrom = parseDateOnlyParam(url.searchParams.get("bornFrom"));
  const bornTo = parseDateOnlyParam(url.searchParams.get("bornTo"));

  const where: Prisma.TaPlayerLicenseWhereInput = {
    ...(q
      ? {
          name: {
            contains: q,
            mode: "insensitive",
          },
        }
      : {}),
    ...(clubId ? { clubId } : {}),
    ...(gender === "MEN" || gender === "WOMEN" ? { gender: gender as any } : {}),
    ...(bornFrom || bornTo
      ? {
          birthDate: {
            ...(bornFrom ? { gte: bornFrom } : {}),
            ...(bornTo ? { lte: bornTo } : {}),
          },
        }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.taPlayerLicense.count({ where }),
    prisma.taPlayerLicense.findMany({
      where,
      orderBy: [{ licenseNumber: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        licenseNumber: true,
        name: true,
        birthDate: true,
        gender: true,
        clubId: true,
        club: { select: { id: true, name: true, clubNo: true } },
        doubleClubId: true,
        doubleClubExpiresAt: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, items, total, page, pageSize });
}

export async function POST(req: Request) {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const birthDate = parseDateOnly(body?.birthDate);
  const gender = String(body?.gender ?? "").trim();
  const clubId = String(body?.clubId ?? "").trim();

  if (!name) return NextResponse.json({ ok: false, message: "Mangler navn." }, { status: 400 });
  if (!birthDate) return NextResponse.json({ ok: false, message: "Mangler fødselsdato." }, { status: 400 });
  if (gender !== "MEN" && gender !== "WOMEN") {
    return NextResponse.json({ ok: false, message: "Ugyldigt køn." }, { status: 400 });
  }
  if (!clubId) return NextResponse.json({ ok: false, message: "Mangler klub." }, { status: 400 });

  const club = await prisma.taClub.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!club) return NextResponse.json({ ok: false, message: "Klub findes ikke." }, { status: 400 });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const agg = await tx.taPlayerLicense.aggregate({
          _max: { licenseNumber: true },
        });
        const maxNo = agg._max.licenseNumber ?? 100000;
        const nextNo = Math.max(100000, maxNo) + 1;

        return tx.taPlayerLicense.create({
          data: {
            licenseNumber: nextNo,
            name,
            birthDate,
            gender: gender as any,
            clubId,
          },
          select: {
            id: true,
            licenseNumber: true,
            name: true,
            birthDate: true,
            gender: true,
            clubId: true,
            club: { select: { id: true, name: true, clubNo: true } },
            doubleClubId: true,
            doubleClubExpiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });

      return NextResponse.json({ ok: true, item: created });
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }

  return NextResponse.json(
    { ok: false, message: "Kunne ikke oprette spillerlicens (prøv igen)." },
    { status: 409 }
  );
}
