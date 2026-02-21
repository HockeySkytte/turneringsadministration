/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

function safeWriteFileSync(targetPath, content, encoding = "utf8") {
  try {
    fs.writeFileSync(targetPath, content, encoding);
    return { path: targetPath, fallback: false };
  } catch (err) {
    const code = err?.code;
    if (code !== "EBUSY" && code !== "EPERM") throw err;

    const parsed = path.parse(targetPath);
    const ts = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const altPath = path.join(parsed.dir, `${parsed.name}.${ts}.new${parsed.ext}`);
    fs.writeFileSync(altPath, content, encoding);
    return { path: altPath, fallback: true };
  }
}

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
      if (row.length === 1 && row[0] === "") {
        row = [];
        continue;
      }
      rows.push(row);
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

function toCsv(rows, header) {
  function esc(v) {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  }

  const out = [];
  out.push(header.join(","));
  for (const r of rows) {
    out.push(header.map((h) => esc(r[h] ?? "")).join(","));
  }
  return out.join("\n") + "\n";
}

function parseIntSafe(v) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function formatMmSsFromSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

function normalizeSideHU(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "H") return "HOME";
  if (s === "U") return "AWAY";
  return "";
}

function normalizeSideFromTeamId(mapping, kampId, teamId) {
  const arr = mapping.get(kampId) ?? [];
  const idx = arr.indexOf(teamId);
  if (idx === 0) return "HOME";
  if (idx === 1) return "AWAY";
  return "";
}

function flipSide(side) {
  if (side === "HOME") return "AWAY";
  if (side === "AWAY") return "HOME";
  return side;
}

function normalizeNameKey(value) {
  const s = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("da-DK");
  if (!s) return "";
  try {
    // Make matching more robust across exports (diacritics/casing differences).
    return s.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  } catch {
    return s;
  }
}

function main() {
  const cwd = process.cwd();
  const inLineupsPath = path.join(cwd, "Testdata", "Lineups.csv");
  const inEventsPath = path.join(cwd, "Testdata", "Events.csv");
  const outLineupsPath = path.join(cwd, "Testdata", "Lineups_updated.csv");
  const outEventsPath = path.join(cwd, "Testdata", "Events_updated.csv");
  const outLineupsLatestPath = path.join(cwd, "Testdata", "Lineups_updated.latest.csv");
  const outEventsLatestPath = path.join(cwd, "Testdata", "Events_updated.latest.csv");
  const outUnmatchedAssistsPath = path.join(cwd, "Testdata", "Assists_unmatched.csv");

  if (!fs.existsSync(inLineupsPath)) throw new Error("Missing input: " + inLineupsPath);
  if (!fs.existsSync(inEventsPath)) throw new Error("Missing input: " + inEventsPath);

  // -------- Lineups -> matchProtocolPlayer CSV --------
  const lineupsText = fs.readFileSync(inLineupsPath, "utf8");
  const lineups = parseCsv(lineupsText).records;

  const lineupRows = [];
  const lineupIndexByKampSide = new Map();
  const lineupNoByKampSideName = new Map();

  for (const r of lineups) {
    const kampId = parseIntSafe(r["KampID"]);
    if (!kampId) continue;

    const side = normalizeSideHU(r["H/U"]);
    if (!side) continue;

    const nameKey = normalizeNameKey(r["Spiller"]);
    const numberRaw = String(r["Nummer"] ?? "").trim();
    if (nameKey && numberRaw) {
      const k = `${kampId}:${side}:${nameKey}`;
      if (!lineupNoByKampSideName.has(k)) lineupNoByKampSideName.set(k, numberRaw);
      const kAny = `${kampId}:*:${nameKey}`;
      if (!lineupNoByKampSideName.has(kAny)) lineupNoByKampSideName.set(kAny, numberRaw);
    }

    const key = `${kampId}:${side}`;
    const idx = lineupIndexByKampSide.get(key) ?? 0;
    lineupIndexByKampSide.set(key, idx + 1);

    lineupRows.push({
      kampId: String(kampId),
      side,
      rowIndex: String(idx),
      role: "",
      number: String(r["Nummer"] ?? "").trim(),
      name: String(r["Spiller"] ?? "").trim(),
      born: "",
    });
  }

  const lineupsCsv = toCsv(lineupRows, ["kampId", "side", "rowIndex", "role", "number", "name", "born"]);
  const lineupsWrite = safeWriteFileSync(outLineupsPath, lineupsCsv, "utf8");
  if (lineupsWrite.fallback) {
    safeWriteFileSync(outLineupsLatestPath, lineupsCsv, "utf8");
  }

  // -------- Events -> matchProtocolEvent CSV --------
  const eventsText = fs.readFileSync(inEventsPath, "utf8");
  const eventsRaw = parseCsv(eventsText).records;

  // Determine HOME/AWAY mapping per kampId from first-seen distinct teamid.
  const teamIdOrderByKamp = new Map();
  for (const r of eventsRaw) {
    const kampId = parseIntSafe(r["KampID"]);
    const teamId = parseIntSafe(r["teamid"]);
    if (!kampId || !teamId) continue;

    const arr = teamIdOrderByKamp.get(kampId) ?? [];
    if (!arr.includes(teamId)) {
      arr.push(teamId);
      teamIdOrderByKamp.set(kampId, arr);
    }
  }

  // Pair assists with goals by collecting *all* assists first.
  // Old data sometimes has Goal rows before Assist rows for the same timestamp.
  // Map key: (kampId, period, timeSecTotal, teamId) -> assist rows.
  const assistsByKey = new Map();

  function assistKey(kampId, period, timeSecTotal, teamId) {
    return `${kampId}|${period}|${timeSecTotal}|${teamId}`;
  }

  function pushAssist(key, assist) {
    const arr = assistsByKey.get(key) ?? [];
    arr.push(assist);
    assistsByKey.set(key, arr);
  }

  function takeNearestAssist(key, goalIndex) {
    const arr = assistsByKey.get(key);
    if (!arr?.length) return null;

    // Prefer assists with an explicit player number; fall back to blank numbers.
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestBefore = false;
    let bestI = Number.POSITIVE_INFINITY;

    for (let j = 0; j < arr.length; j++) {
      const a = arr[j];
      const dist = Math.abs(a.i - goalIndex);
      const numberPenalty = a.number ? 0 : 100000;
      const score = dist + numberPenalty;
      const before = a.i <= goalIndex;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = j;
        bestBefore = before;
        bestI = a.i;
        continue;
      }

      if (score === bestScore) {
        // Tie-break: prefer an assist before the goal, then earlier in the file.
        if (before && !bestBefore) {
          bestIdx = j;
          bestBefore = before;
          bestI = a.i;
        } else if (before === bestBefore && a.i < bestI) {
          bestIdx = j;
          bestI = a.i;
        }
      }
    }

    if (bestIdx < 0) return null;
    const chosen = arr.splice(bestIdx, 1)[0];
    if (arr.length) assistsByKey.set(key, arr);
    else assistsByKey.delete(key);
    return chosen;
  }

  const produced = [];
  let unmatchedAssistCount = 0;
  let usedAssistCount = 0;
  let usedBlankAssistCount = 0;

  // Score per kamp
  const scoreByKamp = new Map();
  function bumpScore(kampId, scoringSide) {
    const cur = scoreByKamp.get(kampId) ?? { home: 0, away: 0 };
    if (scoringSide === "HOME") cur.home += 1;
    else if (scoringSide === "AWAY") cur.away += 1;
    scoreByKamp.set(kampId, cur);
    return `${cur.home}-${cur.away}`;
  }

  // First pass: collect all assists so Goals can match even when Assist rows come later.
  for (let i = 0; i < eventsRaw.length; i++) {
    const r = eventsRaw[i];
    const kampId = parseIntSafe(r["KampID"]);
    const period = parseIntSafe(r["Periode"]);
    const teamId = parseIntSafe(r["teamid"]);
    const timeSecTotal = parseIntSafe(r["Tid"]);
    const type = String(r["Event"] ?? "").trim();

    if (!kampId || !period || !teamId || timeSecTotal == null) continue;
    if (type !== "Assist") continue;

    const sideBase = normalizeSideFromTeamId(teamIdOrderByKamp, kampId, teamId);
    const nameKey = normalizeNameKey(r["Spiller"]);

    let assistNumber = String(r["Nummer"] ?? "").trim();
    if (!assistNumber && nameKey) {
      assistNumber =
        (sideBase && lineupNoByKampSideName.get(`${kampId}:${sideBase}:${nameKey}`)) ||
        lineupNoByKampSideName.get(`${kampId}:*:${nameKey}`) ||
        "";
    }

    const key = assistKey(kampId, period, timeSecTotal, teamId);
    pushAssist(key, {
      i,
      kampId,
      period,
      teamId,
      timeSecTotal,
      number: assistNumber,
      name: String(r["Spiller"] ?? "").trim(),
    });
  }

  // First pass: build produced events in source order, with goal events merged with assist when available.
  for (let i = 0; i < eventsRaw.length; i++) {
    const r = eventsRaw[i];
    const kampId = parseIntSafe(r["KampID"]);
    const period = parseIntSafe(r["Periode"]);
    const teamId = parseIntSafe(r["teamid"]);
    const timeSecTotal = parseIntSafe(r["Tid"]);
    const type = String(r["Event"] ?? "").trim();

    if (!kampId || !period || !teamId || timeSecTotal == null) continue;

    const sideBase = normalizeSideFromTeamId(teamIdOrderByKamp, kampId, teamId);

    // Convert to period time (assume 20 min periods).
    const offset = (period - 1) * 1200;
    const timeSecPeriod = timeSecTotal >= offset ? timeSecTotal - offset : timeSecTotal;
    const time = formatMmSsFromSeconds(timeSecPeriod);

    const key = assistKey(kampId, period, timeSecTotal, teamId);

    if (type === "Assist") continue;

    if (type === "Goal") {
      const assist = takeNearestAssist(key, i);
      if (assist) {
        usedAssistCount += 1;
        if (!assist.number) usedBlankAssistCount += 1;
      }

      const scoringSide = sideBase;
      const score = bumpScore(kampId, scoringSide);

      const nameKey = normalizeNameKey(r["Spiller"]);
      let scorerNumber = String(r["Nummer"] ?? "").trim();
      if (!scorerNumber && nameKey) {
        scorerNumber =
          (scoringSide && lineupNoByKampSideName.get(`${kampId}:${scoringSide}:${nameKey}`)) ||
          lineupNoByKampSideName.get(`${kampId}:*:${nameKey}`) ||
          "";
      }

      produced.push({
        kampId,
        sortKey: { period, timeSecTotal, i },
        period: String(period),
        time,
        side: scoringSide,
        number: scorerNumber,
        goal: score,
        assist: assist?.number ?? "",
        penalty: "",
        code: "",
      });
      continue;
    }

    if (type === "Own Goal") {
      const scoringSide = flipSide(sideBase);
      const score = bumpScore(kampId, scoringSide);

      produced.push({
        kampId,
        sortKey: { period, timeSecTotal, i },
        period: String(period),
        time,
        side: scoringSide,
        number: "",
        goal: score,
        assist: "",
        penalty: "",
        code: "",
      });
      continue;
    }

    if (type === "Penalty") {
      const codeRaw = parseIntSafe(r["number"]);
      const code = codeRaw != null ? String(codeRaw) : "";
      const penalty = codeRaw != null ? (codeRaw < 400 ? "2" : codeRaw > 500 ? "4" : "") : "";

      const nameKey = normalizeNameKey(r["Spiller"]);
      let playerNumber = String(r["Nummer"] ?? "").trim();
      if (!playerNumber && nameKey) {
        playerNumber =
          (sideBase && lineupNoByKampSideName.get(`${kampId}:${sideBase}:${nameKey}`)) ||
          lineupNoByKampSideName.get(`${kampId}:*:${nameKey}`) ||
          "";
      }

      produced.push({
        kampId,
        sortKey: { period, timeSecTotal, i },
        period: String(period),
        time,
        side: sideBase,
        number: playerNumber,
        goal: "",
        assist: "",
        penalty,
        code,
      });
      continue;
    }

    if (type === "Time-Out") {
      produced.push({
        kampId,
        sortKey: { period, timeSecTotal, i },
        period: String(period),
        time,
        side: sideBase,
        number: "",
        goal: "",
        assist: "",
        penalty: "",
        code: "401",
      });
      continue;
    }

    // Unknown event type: keep something minimal so it doesn't get lost.
    const nameKey = normalizeNameKey(r["Spiller"]);
    let playerNumber = String(r["Nummer"] ?? "").trim();
    if (!playerNumber && nameKey) {
      playerNumber =
        (sideBase && lineupNoByKampSideName.get(`${kampId}:${sideBase}:${nameKey}`)) ||
        lineupNoByKampSideName.get(`${kampId}:*:${nameKey}`) ||
        "";
    }

    produced.push({
      kampId,
      sortKey: { period, timeSecTotal, i },
      period: String(period),
      time,
      side: sideBase,
      number: playerNumber,
      goal: "",
      assist: "",
      penalty: "",
      code: "",
    });
  }

  for (const q of assistsByKey.values()) {
    unmatchedAssistCount += q.length;
  }

  // Sort by kampId then by time within match for stable rowIndex assignment.
  produced.sort((a, b) => {
    if (a.kampId !== b.kampId) return a.kampId - b.kampId;
    if (a.sortKey.period !== b.sortKey.period) return a.sortKey.period - b.sortKey.period;
    if (a.sortKey.timeSecTotal !== b.sortKey.timeSecTotal) return a.sortKey.timeSecTotal - b.sortKey.timeSecTotal;
    return a.sortKey.i - b.sortKey.i;
  });

  // Assign rowIndex per kampId.
  const eventIdxByKamp = new Map();
  const eventRows = [];

  for (const e of produced) {
    const idx = eventIdxByKamp.get(e.kampId) ?? 0;
    eventIdxByKamp.set(e.kampId, idx + 1);

    eventRows.push({
      kampId: String(e.kampId),
      rowIndex: String(idx),
      period: e.period,
      time: e.time,
      side: e.side,
      number: e.number,
      goal: e.goal,
      assist: e.assist,
      penalty: e.penalty,
      code: e.code,
    });
  }

  const eventsCsv = toCsv(eventRows, [
    "kampId",
    "rowIndex",
    "period",
    "time",
    "side",
    "number",
    "goal",
    "assist",
    "penalty",
    "code",
  ]);

  const eventsWrite = safeWriteFileSync(outEventsPath, eventsCsv, "utf8");
  if (eventsWrite.fallback) {
    safeWriteFileSync(outEventsLatestPath, eventsCsv, "utf8");
  }

  // Optional: list unmatched assists for manual review.
  const unmatchedAssists = [];
  for (const arr of assistsByKey.values()) {
    for (const a of arr) unmatchedAssists.push(a);
  }
  if (unmatchedAssists.length) {
    const rows = unmatchedAssists
      .map((a) => {
        const sideBase = normalizeSideFromTeamId(teamIdOrderByKamp, a.kampId, a.teamId);
        const offset = (a.period - 1) * 1200;
        const timeSecPeriod = a.timeSecTotal >= offset ? a.timeSecTotal - offset : a.timeSecTotal;
        const time = formatMmSsFromSeconds(timeSecPeriod);

        return {
          kampId: String(a.kampId),
          period: String(a.period),
          time,
          side: sideBase,
          teamId: String(a.teamId),
          timeSecTotal: String(a.timeSecTotal),
          assistNumber: String(a.number ?? ""),
          assistName: String(a.name ?? ""),
        };
      })
      .sort((x, y) => {
        const ak = Number.parseInt(x.kampId, 10);
        const bk = Number.parseInt(y.kampId, 10);
        if (ak !== bk) return ak - bk;
        const ap = Number.parseInt(x.period, 10);
        const bp = Number.parseInt(y.period, 10);
        if (ap !== bp) return ap - bp;
        const at = Number.parseInt(x.timeSecTotal, 10);
        const bt = Number.parseInt(y.timeSecTotal, 10);
        return at - bt;
      });

    safeWriteFileSync(
      outUnmatchedAssistsPath,
      toCsv(rows, [
        "kampId",
        "period",
        "time",
        "side",
        "teamId",
        "timeSecTotal",
        "assistNumber",
        "assistName",
      ]),
      "utf8"
    );
  }

  console.log("Wrote:");
  console.log(
    "-",
    path.relative(cwd, lineupsWrite.path),
    "(" + lineupRows.length + " rows)" + (lineupsWrite.fallback ? " [fallback: file locked]" : "")
  );
  console.log(
    "-",
    path.relative(cwd, eventsWrite.path),
    "(" + eventRows.length + " rows)" + (eventsWrite.fallback ? " [fallback: file locked]" : "")
  );
  console.log("Assist merge:");
  console.log("- used:", usedAssistCount);
  if (usedBlankAssistCount) console.log("- used blank-number assists:", usedBlankAssistCount);
  if (unmatchedAssistCount) {
    console.log("Warning: Unmatched assist rows:", unmatchedAssistCount);
    console.log("- see:", path.relative(cwd, outUnmatchedAssistsPath));
  }
}

main();
