/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur.replace(/\r$/, ""));
      cur = "";
      if (!(row.length === 1 && row[0] === "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  if (rows.length === 0) return { header: [], records: [] };

  const header = rows[0].map((h) => String(h ?? "").trim());
  const records = [];
  for (const r of rows.slice(1)) {
    if (!r.some((c) => String(c ?? "").trim())) continue;
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = r[i] ?? "";
    }
    records.push(obj);
  }

  return { header, records };
}

function parseIntSafe(v) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isNonEmptyPlayer(r) {
  return Boolean(
    String(r.role ?? "").trim() ||
      String(r.number ?? "").trim() ||
      String(r.name ?? "").trim() ||
      String(r.born ?? "").trim()
  );
}

function isNonEmptyEvent(r) {
  return Boolean(
    String(r.period ?? "").trim() ||
      String(r.time ?? "").trim() ||
      String(r.side ?? "").trim() ||
      String(r.number ?? "").trim() ||
      String(r.goal ?? "").trim() ||
      String(r.assist ?? "").trim() ||
      String(r.penalty ?? "").trim() ||
      String(r.code ?? "").trim()
  );
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/verify-protocol-import.cjs --events <events.csv> --lineups <lineups.csv>");
}

function parseArgs(argv) {
  const args = { events: null, lineups: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--events") args.events = argv[++i];
    else if (a === "--lineups") args.lineups = argv[++i];
    else throw new Error("Unknown arg: " + a);
  }
  return args;
}

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const eventsPath = resolvePath(args.events);
  const lineupsPath = resolvePath(args.lineups);

  if (!eventsPath || !lineupsPath) {
    usage();
    throw new Error("Missing --events and/or --lineups");
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const events = parseCsv(fs.readFileSync(eventsPath, "utf8")).records;
  const lineups = parseCsv(fs.readFileSync(lineupsPath, "utf8")).records;

  const expectedByKamp = new Map();
  function getBucket(kampId) {
    const cur = expectedByKamp.get(kampId) ?? { HOME: [], AWAY: [], events: [] };
    expectedByKamp.set(kampId, cur);
    return cur;
  }

  for (const r of lineups) {
    const kampId = parseIntSafe(r.kampId);
    const side = String(r.side ?? "").trim().toUpperCase();
    if (!kampId || (side !== "HOME" && side !== "AWAY")) continue;
    const bucket = getBucket(kampId);
    const row = {
      role: String(r.role ?? "").trim(),
      number: String(r.number ?? "").trim(),
      name: String(r.name ?? "").trim(),
      born: String(r.born ?? "").trim(),
    };
    if (isNonEmptyPlayer(row)) bucket[side].push(row);
  }

  for (const r of events) {
    const kampId = parseIntSafe(r.kampId);
    if (!kampId) continue;
    const bucket = getBucket(kampId);
    const row = {
      period: String(r.period ?? "").trim(),
      time: String(r.time ?? "").trim(),
      side: String(r.side ?? "").trim(),
      number: String(r.number ?? "").trim(),
      goal: String(r.goal ?? "").trim(),
      assist: String(r.assist ?? "").trim(),
      penalty: String(r.penalty ?? "").trim(),
      code: String(r.code ?? "").trim(),
    };
    if (isNonEmptyEvent(row)) bucket.events.push(row);
  }

  const kampIds = Array.from(expectedByKamp.keys()).sort((a, b) => a - b);
  console.log("Verifying kampIds:", kampIds.length);

  let mismatchCount = 0;
  for (const kampId of kampIds) {
    const exp = expectedByKamp.get(kampId);
    const expHome = Math.min(exp.HOME.length, 20);
    const expAway = Math.min(exp.AWAY.length, 20);
    const expEvents = Math.min(exp.events.length, 60);

    const [dbHome, dbAway, dbEvents] = await Promise.all([
      prisma.matchProtocolPlayer.count({ where: { kampId, side: "HOME" } }),
      prisma.matchProtocolPlayer.count({ where: { kampId, side: "AWAY" } }),
      prisma.matchProtocolEvent.count({ where: { kampId } }),
    ]);

    if (dbHome !== expHome || dbAway !== expAway || dbEvents !== expEvents) {
      mismatchCount += 1;
      if (mismatchCount <= 20) {
        console.log(
          `Mismatch kampId=${kampId}: players HOME ${dbHome}/${expHome}, AWAY ${dbAway}/${expAway}, events ${dbEvents}/${expEvents}`
        );
      }
    }
  }

  if (mismatchCount === 0) {
    console.log("OK: DB counts match expected (with 20/20/60 caps). ");
  } else {
    console.log("Mismatches:", mismatchCount);
    console.log("(Only first 20 mismatches printed.)");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
