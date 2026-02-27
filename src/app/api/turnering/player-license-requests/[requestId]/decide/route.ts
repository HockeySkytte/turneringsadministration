import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

type Decision = "APPROVE" | "REJECT";

type RequestType = "CREATE" | "UPDATE" | "MOVE" | "DOUBLE_LICENSE";

function nextJuly1Utc(today = new Date()): Date {
  const y = today.getUTCFullYear();
  const july1ThisYear = new Date(Date.UTC(y, 6, 1));
  if (today.getTime() < july1ThisYear.getTime()) return july1ThisYear;
  return new Date(Date.UTC(y + 1, 6, 1));
}

function parseDateOnlyIso(value: unknown): Date | null {
  const v = normalizeText(value);
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const actor = await requireTournamentAdmin();
  await ensureTurneringDomainTables();

  const { requestId } = await ctx.params;
  const id = normalizeText(requestId);
  if (!id) return NextResponse.json({ ok: false, message: "Mangler id." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as any;
  const decisionRaw = normalizeText(body?.decision).toUpperCase();
  const decision: Decision | null = decisionRaw === "APPROVE" || decisionRaw === "REJECT" ? (decisionRaw as Decision) : null;
  if (!decision) return NextResponse.json({ ok: false, message: "Ugyldig beslutning." }, { status: 400 });

  const reason = normalizeText(body?.reason) || null;

  try {
    let updated: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        updated = await prisma.$transaction(
          async (tx) => {
        const r = await tx.taPlayerLicenseRequest.findUnique({ where: { id } });
        if (!r) throw new Error("NOT_FOUND");
        if (r.status !== "PENDING_TA") throw new Error("NOT_PENDING");

        if (decision === "REJECT") {
          return tx.taPlayerLicenseRequest.update({
            where: { id },
            data: {
              status: "REJECTED",
              taDecidedById: actor.id,
              taDecidedAt: new Date(),
              rejectionReason: reason,
            },
          });
        }

        // APPROVE: apply requested change to the license DB.
        const type = r.type as RequestType;
        const payload = (r.payload ?? {}) as any;

        if (!r.fromClubId) throw new Error("MISSING_FROM_CLUB");

        if (type === "CREATE") {
          const name = normalizeText(payload?.name);
          const birthDate = parseDateOnlyIso(payload?.birthDate);
          const gender = normalizeText(payload?.gender);

          if (!name) throw new Error("BAD_NAME");
          if (!birthDate) throw new Error("BAD_BIRTHDATE");
          if (gender !== "MEN" && gender !== "WOMEN") throw new Error("BAD_GENDER");

          // Assign next license number on approval: MAX + 1.
          const agg = await tx.taPlayerLicense.aggregate({ _max: { licenseNumber: true } });
          const max = Number(agg?._max?.licenseNumber ?? 0);
          const licenseNumber = (Number.isFinite(max) ? max : 0) + 1;

          await tx.taPlayerLicense.create({
            data: {
              licenseNumber,
              name,
              birthDate,
              gender,
              clubId: r.fromClubId,
            },
          });
        } else if (type === "UPDATE") {
          if (!r.licenseId) throw new Error("MISSING_LICENSE");

          // New payload shape: { before, after }. Backwards compatible: { name, birthDate, gender }.
          const after = (payload?.after ?? payload) as any;
          const name = normalizeText(after?.name);
          const birthDate = parseDateOnlyIso(after?.birthDate);
          const gender = normalizeText(after?.gender);

          if (!name) throw new Error("BAD_NAME");
          if (!birthDate) throw new Error("BAD_BIRTHDATE");
          if (gender !== "MEN" && gender !== "WOMEN") throw new Error("BAD_GENDER");

          const existing = await tx.taPlayerLicense.findUnique({ where: { id: r.licenseId }, select: { id: true, clubId: true } });
          if (!existing) throw new Error("LICENSE_NOT_FOUND");
          if (String(existing.clubId) !== String(r.fromClubId)) throw new Error("LICENSE_NOT_IN_FROM_CLUB");

          await tx.taPlayerLicense.update({
            where: { id: r.licenseId },
            data: { name, birthDate, gender },
          });
        } else if (type === "MOVE") {
          if (!r.licenseId) throw new Error("MISSING_LICENSE");
          if (!r.targetClubId) throw new Error("MISSING_TARGET_CLUB");

          // Here: fromClubId = destination club (requesting club), targetClubId = current club (approving club).
          const existing = await tx.taPlayerLicense.findUnique({ where: { id: r.licenseId }, select: { id: true, clubId: true } });
          if (!existing) throw new Error("LICENSE_NOT_FOUND");
          if (String(existing.clubId) !== String(r.targetClubId)) throw new Error("LICENSE_NOT_IN_TARGET_CLUB");

          await tx.taPlayerLicense.update({
            where: { id: r.licenseId },
            data: {
              clubId: r.fromClubId,
              doubleClubId: null,
              doubleClubExpiresAt: null,
            },
          });
        } else if (type === "DOUBLE_LICENSE") {
          if (!r.licenseId) throw new Error("MISSING_LICENSE");
          if (!r.targetClubId) throw new Error("MISSING_TARGET_CLUB");

          // Here: fromClubId = requesting club (becomes double club), targetClubId = current club (approving club).
          const existing = await tx.taPlayerLicense.findUnique({ where: { id: r.licenseId }, select: { id: true, clubId: true } });
          if (!existing) throw new Error("LICENSE_NOT_FOUND");
          if (String(existing.clubId) !== String(r.targetClubId)) throw new Error("LICENSE_NOT_IN_TARGET_CLUB");

          await tx.taPlayerLicense.update({
            where: { id: r.licenseId },
            data: {
              doubleClubId: r.fromClubId,
              doubleClubExpiresAt: nextJuly1Utc(),
            },
          });
        } else {
          throw new Error("UNKNOWN_TYPE");
        }

        return tx.taPlayerLicenseRequest.update({
          where: { id },
          data: {
            status: "APPROVED",
            taDecidedById: actor.id,
            taDecidedAt: new Date(),
            rejectionReason: null,
          },
        });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        break;
      } catch (e: any) {
        const isRetryable =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (e.code === "P2034" || e.code === "P2002");
        if (isRetryable && attempt < 3) continue;
        throw e;
      }
    }

    return NextResponse.json({ ok: true, item: updated });
  } catch (err: any) {
    const code = String(err?.message ?? "");

    if (code === "NOT_FOUND") return NextResponse.json({ ok: false, message: "Anmodning ikke fundet." }, { status: 404 });
    if (code === "NOT_PENDING") return NextResponse.json({ ok: false, message: "Anmodningen kan ikke behandles." }, { status: 400 });
    if (code === "LICENSE_NUMBER_EXISTS") {
      return NextResponse.json({ ok: false, message: "Licensnummer findes allerede." }, { status: 400 });
    }
    if (code === "LICENSE_NOT_FOUND") return NextResponse.json({ ok: false, message: "Spillerlicens ikke fundet." }, { status: 400 });
    if (code === "LICENSE_NOT_IN_FROM_CLUB") {
      return NextResponse.json({ ok: false, message: "Spillerlicensen tilhører ikke den klub der har anmodet." }, { status: 400 });
    }
    if (code === "LICENSE_NOT_IN_TARGET_CLUB") {
      return NextResponse.json({ ok: false, message: "Spillerlicensen tilhører ikke den klub der skal godkende." }, { status: 400 });
    }
    if (code === "MISSING_TARGET_CLUB") return NextResponse.json({ ok: false, message: "Mangler mål-klub." }, { status: 400 });

    return NextResponse.json({ ok: false, message: "Kunne ikke behandle anmodning." }, { status: 500 });
  }
}
