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

function strOrNull(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function statusOrNull(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "open" || s === "live" || s === "closed") return s;
  return null;
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
  console.log(
    "  node scripts/import-protocol-from-csv.cjs --events <events.csv> --lineups <lineups.csv> [--dry-run] [--no-overwrite] [--kampId <id>]"
  );
  console.log();
  console.log("Defaults:");
  console.log("  --lineups Testdata/Lineups_updated.csv");
  console.log("  --events  (required)");
}

function parseArgs(argv) {
  const args = {
    lineups: path.join(process.cwd(), "Testdata", "Lineups_updated.csv"),
    events: null,
    dryRun: false,
    overwrite: true,
    kampId: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }

    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (a === "--no-overwrite") {
      args.overwrite = false;
      continue;
    }

    if (a === "--events") {
      args.events = argv[++i];
      continue;
    }

    if (a === "--lineups") {
      args.lineups = argv[++i];
      continue;
    }

    if (a === "--kampId") {
      args.kampId = parseIntSafe(argv[++i]);
      continue;
    }

    throw new Error("Unknown arg: " + a);
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
    process.exit(0);
  }

  const eventsPath = resolvePath(args.events);
  const lineupsPath = resolvePath(args.lineups);

  if (!eventsPath) {
    usage();
    throw new Error("Missing required --events <path>");
  }

  if (!fs.existsSync(eventsPath)) throw new Error("Missing events file: " + eventsPath);
  if (!fs.existsSync(lineupsPath)) throw new Error("Missing lineups file: " + lineupsPath);

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const eventsRaw = parseCsv(fs.readFileSync(eventsPath, "utf8")).records;
  const lineupsRaw = parseCsv(fs.readFileSync(lineupsPath, "utf8")).records;

  const lineupsByKamp = new Map();
  for (let i = 0; i < lineupsRaw.length; i++) {
    const r = lineupsRaw[i];
    const kampId = parseIntSafe(r.kampId);
    const side = String(r.side ?? "").trim().toUpperCase();
    if (!kampId || (side !== "HOME" && side !== "AWAY")) continue;
    if (args.kampId && kampId !== args.kampId) continue;

    const bucket = lineupsByKamp.get(kampId) ?? { HOME: [], AWAY: [] };
    bucket[side].push({
      srcIndex: i,
      rowIndex: parseIntSafe(r.rowIndex) ?? i,
      role: String(r.role ?? "").trim(),
      number: String(r.number ?? "").trim(),
      name: String(r.name ?? "").trim(),
      born: String(r.born ?? "").trim(),
      status: statusOrNull(r.status),
    });
    lineupsByKamp.set(kampId, bucket);
  }

  const eventsByKamp = new Map();
  for (let i = 0; i < eventsRaw.length; i++) {
    const r = eventsRaw[i];
    const kampId = parseIntSafe(r.kampId);
    if (!kampId) continue;
    if (args.kampId && kampId !== args.kampId) continue;

    const arr = eventsByKamp.get(kampId) ?? [];
    arr.push({
      srcIndex: i,
      rowIndex: parseIntSafe(r.rowIndex) ?? i,
      period: String(r.period ?? "").trim(),
      time: String(r.time ?? "").trim(),
      side: String(r.side ?? "").trim(),
      number: String(r.number ?? "").trim(),
      goal: String(r.goal ?? "").trim(),
      assist: String(r.assist ?? "").trim(),
      penalty: String(r.penalty ?? "").trim(),
      code: String(r.code ?? "").trim(),
      status: statusOrNull(r.status),
    });
    eventsByKamp.set(kampId, arr);
  }

  const kampIds = Array.from(new Set([...lineupsByKamp.keys(), ...eventsByKamp.keys()])).sort(
    (a, b) => a - b
  );

  if (kampIds.length === 0) {
    console.log("No matches found in input (check kampId filter / headers).");
    await prisma.$disconnect();
    return;
  }

  let totalPlayers = 0;
  let totalEvents = 0;
  let importedMatches = 0;

  function buildPlayers(kampId, side, rows) {
    const sorted = [...rows]
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0) || (a.srcIndex ?? 0) - (b.srcIndex ?? 0))
      .map((r) => ({
        kampId,
        side,
        role: strOrNull(r.role),
        number: strOrNull(r.number),
        name: strOrNull(r.name),
        born: strOrNull(r.born),
        status: r.status ?? "open",
      }))
      .filter(isNonEmptyPlayer)
      .slice(0, 20)
      .map((r, idx) => ({ ...r, rowIndex: idx }));

    return sorted;
  }

  function buildEvents(kampId, rows) {
    const sorted = [...rows]
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0) || (a.srcIndex ?? 0) - (b.srcIndex ?? 0))
      .map((r) => ({
        kampId,
        period: strOrNull(r.period),
        time: strOrNull(r.time),
        side: strOrNull(r.side),
        number: strOrNull(r.number),
        goal: strOrNull(r.goal),
        assist: strOrNull(r.assist),
        penalty: strOrNull(r.penalty),
        code: strOrNull(r.code),
        status: r.status ?? "open",
      }))
      .filter(isNonEmptyEvent)
      .slice(0, 60)
      .map((r, idx) => ({ ...r, rowIndex: idx }));

    return sorted;
  }

  console.log("Import source:");
  console.log("- events:", path.relative(process.cwd(), eventsPath));
  console.log("- lineups:", path.relative(process.cwd(), lineupsPath));
  if (args.kampId) console.log("- kampId filter:", args.kampId);
  console.log("- overwrite:", args.overwrite ? "YES" : "NO");
  console.log("- dry-run:", args.dryRun ? "YES" : "NO");
  console.log();

  for (const kampId of kampIds) {
    const lineupBucket = lineupsByKamp.get(kampId) ?? { HOME: [], AWAY: [] };
    const homeData = buildPlayers(kampId, "HOME", lineupBucket.HOME);
    const awayData = buildPlayers(kampId, "AWAY", lineupBucket.AWAY);
    const eventData = buildEvents(kampId, eventsByKamp.get(kampId) ?? []);

    const playersCount = homeData.length + awayData.length;
    const eventsCount = eventData.length;

    if (args.dryRun) {
      importedMatches += 1;
      totalPlayers += playersCount;
      totalEvents += eventsCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (args.overwrite) {
        await tx.matchProtocolPlayer.deleteMany({ where: { kampId } });
        await tx.matchProtocolEvent.deleteMany({ where: { kampId } });
      }

      if (homeData.length) {
        await tx.matchProtocolPlayer.createMany({ data: homeData });
      }
      if (awayData.length) {
        await tx.matchProtocolPlayer.createMany({ data: awayData });
      }
      if (eventData.length) {
        await tx.matchProtocolEvent.createMany({ data: eventData });
      }
    });

    importedMatches += 1;
    totalPlayers += playersCount;
    totalEvents += eventsCount;

    if (importedMatches % 50 === 0) {
      console.log(`Imported ${importedMatches}/${kampIds.length} matches...`);
    }
  }

  console.log("Done.");
  console.log("- matches:", importedMatches);
  console.log("- players inserted:", totalPlayers);
  console.log("- events inserted:", totalEvents);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
