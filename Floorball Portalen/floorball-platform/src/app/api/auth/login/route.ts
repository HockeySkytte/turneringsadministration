import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { TaRole, TaRoleStatus } from "@prisma/client";

async function ensureBootstrapAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!adminEmail || !adminPassword) return;

  const passwordHash = await hashPassword(adminPassword);

  const existing = await prisma.taUser.findUnique({
    where: { email: adminEmail },
    select: { id: true, username: true },
  });

  if (!existing) {
    const usernameCandidates = ["turnerings_admin", "admin", "floorball_admin"];
    let usernameToUse = usernameCandidates[0]!;
    for (const candidate of usernameCandidates) {
      const taken = await prisma.taUser.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) {
        usernameToUse = candidate;
        break;
      }
    }

    await prisma.taUser.create({
      data: {
        email: adminEmail,
        username: usernameToUse,
        passwordHash,
        roles: {
          create: {
            role: TaRole.ADMIN,
            status: TaRoleStatus.APPROVED,
            approvedAt: new Date(),
          },
        },
      },
    });
    return;
  }

  await prisma.taUser.update({
    where: { id: existing.id },
    data: { passwordHash },
  });

  const existingAdminRole = await prisma.taUserRole.findUnique({
    where: { userId_role_scopeKey: { userId: existing.id, role: TaRole.ADMIN, scopeKey: "GLOBAL" } },
    select: { id: true, status: true },
  });

  if (!existingAdminRole) {
    await prisma.taUserRole.create({
      data: {
        userId: existing.id,
        role: TaRole.ADMIN,
        scopeKey: "GLOBAL",
        status: TaRoleStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
  } else if (existingAdminRole.status !== TaRoleStatus.APPROVED) {
    await prisma.taUserRole.update({
      where: { id: existingAdminRole.id },
      data: { status: TaRoleStatus.APPROVED, approvedAt: new Date() },
    });
  }
}

function isLikelyMissingMigrations(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /table .* does not exist/i.test(message) ||
    /P2021/i.test(message) ||
    /P2022/i.test(message)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const emailOrUsername = String(body?.emailOrUsername ?? "").trim();
    const password = String(body?.password ?? "");

    if (!emailOrUsername || !password) {
      return NextResponse.json(
        { message: "Udfyld venligst alle felter." },
        { status: 400 }
      );
    }

    // If DB is empty on first deploy (no seed), allow bootstrapping admin + default teams.
    const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD ?? "";
    const isAdminAttempt =
      !!adminEmail &&
      !!adminPassword &&
      password === adminPassword &&
      (emailOrUsername.toLowerCase() === adminEmail || emailOrUsername === "admin");

    if (isAdminAttempt) {
      await ensureBootstrapAdmin();
    }

    const session = await getSession();
    const identifierEmail = emailOrUsername.toLowerCase();

    const candidate = await prisma.taUser.findFirst({
      where: {
        OR: [{ email: identifierEmail }, { username: emailOrUsername }],
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!candidate) {
      return NextResponse.json({ message: "Forkert login." }, { status: 401 });
    }

    const ok = await verifyPassword(password, candidate.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: "Forkert login." }, { status: 401 });
    }

    session.userId = candidate.id;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("/api/auth/login failed", error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("SESSION_PASSWORD")) {
      return NextResponse.json(
        { message: "Server-konfiguration fejl (SESSION_PASSWORD)." },
        { status: 500 }
      );
    }

    if (isLikelyMissingMigrations(error)) {
      return NextResponse.json(
        { message: "Database er ikke initialiseret endnu." },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Serverfejl." }, { status: 500 });
  }
}
