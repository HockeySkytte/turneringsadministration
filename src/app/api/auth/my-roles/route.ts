import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth";
import { ensureTaUserRoleMetadataColumns, ensureTurneringDomainTables } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const user = await requireApprovedUser();

    await ensureTurneringDomainTables();
    await ensureTaUserRoleMetadataColumns();

    const roles = await prisma.taUserRole.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        role: true,
        status: true,
        scopeKey: true,
        clubLeaderTitle: true,
        holdId: true,
        club: { select: { id: true, name: true, clubNo: true } },
        team: { select: { id: true, name: true, league: true, gender: true, seasonStartYear: true, holdId: true } },
        referee: { select: { id: true, name: true, refereeNo: true } },
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      roles: roles.map((r) => {
        const clubName = norm(r.club?.name);
        const clubNo = norm(r.club?.clubNo);
        const teamName = norm(r.team?.name);
        const teamLeague = norm(r.team?.league);
        const refereeName = norm(r.referee?.name);
        const refereeNo = norm(r.referee?.refereeNo);

        const scopeParts: string[] = [];
        if (clubName) scopeParts.push(clubNo ? `${clubName} (${clubNo})` : clubName);
        if (teamName) scopeParts.push(teamLeague ? `${teamName} · ${teamLeague}` : teamName);
        if (refereeName) scopeParts.push(refereeNo ? `${refereeName} (${refereeNo})` : refereeName);

        return {
          id: r.id,
          role: r.role,
          status: r.status,
          scopeKey: r.scopeKey,
          scopeLabel: scopeParts.join(" · ") || null,
          clubLeaderTitle: r.clubLeaderTitle ?? null,
          holdId: r.holdId ?? r.team?.holdId ?? null,
          teamSeasonStartYear: r.team?.seasonStartYear ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    });
  } catch (err) {
    console.error("[api/auth/my-roles] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : message === "NOT_APPROVED" ? 403 : 500;
    return NextResponse.json({ ok: false, message: "Kunne ikke hente roller." }, { status });
  }
}
