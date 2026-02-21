/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

function loadDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;

  const cwd = process.cwd();
  const candidates = [".env.local", ".env"]
    .map((p) => path.join(cwd, p))
    .filter((p) => fs.existsSync(p));

  for (const filePath of candidates) {
    const txt = fs.readFileSync(filePath, "utf8");
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnvIfNeeded();

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%lineup%'
          OR table_name ILIKE '%event%'
          OR table_name ILIKE '%protocol%'
        )
      ORDER BY table_name;
    `);

    const tableNames = (tables || []).map((r) => r.table_name).filter(Boolean);

    const preferredOrder = [
      "MatchUploadLineup",
      "MatchUploadEvent",
      "MatchProtocolPlayer",
      "MatchProtocolEvent",
    ];

    tableNames.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    console.log("Found tables (public):");
    for (const t of tableNames) console.log("-", t);

    for (const tableName of tableNames) {
      const cols = await prisma.$queryRawUnsafe(
        `
        SELECT column_name, data_type, is_nullable, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position;
        `,
        tableName
      );

      console.log("\n===", tableName, "===");
      for (const c of cols) {
        console.log(
          `${String(c.ordinal_position).padStart(2, "0")}  ${c.column_name}  ${c.data_type}  ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
