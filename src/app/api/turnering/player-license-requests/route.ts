import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prismaAny = prisma as any;

type RequestRow = {
  id: string;
  type: string;
  status: string;
  fromClubId: string | null;
  targetClubId: string | null;
  licenseId: string | null;
  payload: any;
  createdAt: Date;
  rejectionReason: string | null;
};

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function diffSummary(payload: any, type: string) {
  if (!payload || typeof payload !== "object") return null;

  if (type === "UPDATE") {
    const before = (payload.before && typeof payload.before === "object") ? payload.before : null;
    const after = (payload.after && typeof payload.after === "object") ? payload.after : payload;

    const afterName = normalizeText(after?.name);
    const afterBirthDate = normalizeText(after?.birthDate);
    const afterGender = normalizeText(after?.gender);

    if (!before) {
      const parts = [
        afterName ? `Navn: ${afterName}` : null,
        afterBirthDate ? `Født: ${afterBirthDate}` : null,
        afterGender ? `Køn: ${afterGender}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }

    const beforeName = normalizeText(before?.name);
    const beforeBirthDate = normalizeText(before?.birthDate);
    const beforeGender = normalizeText(before?.gender);

    const parts = [
      beforeName !== afterName && afterName ? `Navn: ${beforeName} → ${afterName}` : null,
      beforeBirthDate !== afterBirthDate && afterBirthDate ? `Født: ${beforeBirthDate} → ${afterBirthDate}` : null,
      beforeGender !== afterGender && afterGender ? `Køn: ${beforeGender} → ${afterGender}` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(" · ") : null;
  }

  if (type === "CREATE") {
    const name = normalizeText(payload?.name);
    const birthDate = normalizeText(payload?.birthDate);
    const gender = normalizeText(payload?.gender);
    const parts = [
      name ? `Navn: ${name}` : null,
      birthDate ? `Født: ${birthDate}` : null,
      gender ? `Køn: ${gender}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }

  return null;
}

export async function GET() {
  await requireTournamentAdmin();
  await ensureTurneringDomainTables();

  const items = (await prismaAny.taPlayerLicenseRequest.findMany({
    where: { status: "PENDING_TA" },
    orderBy: [{ createdAt: "asc" }],
    take: 200,
  })) as RequestRow[];

  const clubIds = Array.from(
    new Set(
      items
        .flatMap((i: RequestRow) => [i.fromClubId, i.targetClubId])
        .filter((x: string | null): x is string => Boolean(x && x.trim())),
    ),
  ) as string[];

  const clubs = clubIds.length
    ? await prisma.taClub.findMany({ where: { id: { in: clubIds } }, select: { id: true, name: true, clubNo: true } })
    : [];
  const clubLabelById = new Map(
    clubs.map((c) => {
      const no = String(c.clubNo ?? "").trim();
      return [c.id, no ? `${c.name} (${no})` : c.name] as const;
    }),
  );

  const licenseIds = Array.from(new Set(items.map((i: RequestRow) => i.licenseId).filter((x: string | null): x is string => Boolean(x && x.trim())))) as string[];
  const licenses = licenseIds.length
    ? await prisma.taPlayerLicense.findMany({ where: { id: { in: licenseIds } }, select: { id: true, licenseNumber: true, name: true } })
    : [];
  const licenseById = new Map(licenses.map((l) => [l.id, l] as const));

  const enriched = items.map((i: RequestRow) => {
    const lic = i.licenseId ? licenseById.get(i.licenseId) ?? null : null;
    const payload = (i.payload ?? {}) as any;
    return {
      ...i,
      fromClubLabel: i.fromClubId ? clubLabelById.get(i.fromClubId) ?? i.fromClubId : null,
      targetClubLabel: i.targetClubId ? clubLabelById.get(i.targetClubId) ?? i.targetClubId : null,
      licenseNumber: lic?.licenseNumber ?? null,
      licenseName: lic?.name ?? (normalizeText(payload?.name) || null),
      details: diffSummary(payload, String(i.type)),
    };
  });

  return NextResponse.json({ ok: true, items: enriched });
}
