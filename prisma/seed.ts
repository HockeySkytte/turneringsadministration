import bcrypt from "bcryptjs";
import { PrismaClient, GlobalRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaultLeague = await prisma.league.upsert({
    where: { id: "league_default" },
    update: { name: "Standard Liga" },
    create: { id: "league_default", name: "Standard Liga" },
  });

  const teams = ["U19 herrelandsholdet", "U17 herrelandsholdet"];

  for (const name of teams) {
    await prisma.team.upsert({
      where: { leagueId_name: { leagueId: defaultLeague.id, name } },
      update: {
        themePrimary: "RED",
        themeSecondary: "WHITE",
      },
      create: {
        leagueId: defaultLeague.id,
        name,
        themePrimary: "RED",
        themeSecondary: "WHITE",
      },
    });
  }

  const firstTeam = await prisma.team.findFirst({
    where: { leagueId: defaultLeague.id },
    orderBy: { name: "asc" },
    select: { id: true },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@floorball.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "SkiftMig123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const desiredUsername = "admin";
  const existingByUsername = await prisma.user.findUnique({
    where: { username: desiredUsername },
  });

  if (!existingByUsername) {
    await prisma.user.create({
      data: {
        globalRole: GlobalRole.ADMIN,
        leagueId: defaultLeague.id,
        teamId: firstTeam?.id ?? null,
        email: adminEmail,
        username: desiredUsername,
        passwordHash,
      },
    });
    return;
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  const canSetEmail = !emailOwner || emailOwner.id === existingByUsername.id;

  await prisma.user.update({
    where: { id: existingByUsername.id },
    data: {
      globalRole: GlobalRole.ADMIN,
      leagueId: defaultLeague.id,
      teamId: firstTeam?.id ?? null,
      passwordHash,
      ...(canSetEmail ? { email: adminEmail } : {}),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
