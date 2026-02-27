import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTurneringDomainTables } from "@/lib/turnering/db";
import { requireApprovedUser } from "@/lib/auth";
import { TaRole, TaRoleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function getRefereeIdFromUser(user: Awaited<ReturnType<typeof requireApprovedUser>>) {
  const role = user.roles.find(
    (r) => r.role === TaRole.REFEREE && r.status === TaRoleStatus.APPROVED && r.refereeId
  );
  return role?.refereeId ?? null;
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApprovedUser();
    if (!user.isReferee) throw new Error("NOT_AUTHORIZED");

    const refereeId = getRefereeIdFromUser(user);
    if (!refereeId) throw new Error("NO_REFEREE_ID");

    const { ruleId } = await ctx.params;
    const id = norm(ruleId);
    if (!id) return NextResponse.json({ message: "Ugyldig regel." }, { status: 400 });

    await ensureTurneringDomainTables();

    const rules = (prisma as any)["taRefereeAvailabilityRule"] as any;
    await rules.deleteMany({ where: { id, refereeId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status =
      message === "NOT_AUTHENTICATED"
        ? 401
        : message === "NOT_AUTHORIZED"
          ? 403
          : message === "NO_REFEREE_ID"
            ? 400
            : 500;

    return NextResponse.json({ message: "Kunne ikke slette fast regel." }, { status });
  }
}
