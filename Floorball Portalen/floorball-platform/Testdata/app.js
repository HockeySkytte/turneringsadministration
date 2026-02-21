// Floorball Shot Plotter (center-origin coordinates)
// Rink size in meters (full)
const RINK_W_M = 40;
const RINK_H_M = 20;
const HALF_W = RINK_W_M / 2; // 20
const HALF_H = RINK_H_M / 2; // 10

// Canvas and state
const canvas = document.getElementById('rink');
const ctx = canvas.getContext('2d');
// App state
let shots = [];
let idCounter = 1;
// Small helpers
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '');
const nowISO = () => new Date().toISOString();
// Background image
const rinkImg = new Image();
rinkImg.src = 'bane.png';
let rinkImgLoaded = false;
rinkImg.onload = () => { rinkImgLoaded = true; resizeCanvas(); };

// UI elements
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const clearPlotBtn = document.getElementById('clearPlotBtn');
const showPlotsBtn = document.getElementById('showPlotsBtn');
const importFileEl = document.getElementById('importFile');
const tbody = document.querySelector('#shotsTable tbody');
// Legend elements
const legendHomeSwatch = document.getElementById('legendHomeSwatch');
const legendAwaySwatch = document.getElementById('legendAwaySwatch');
const legendHomeLabel = document.getElementById('legendHomeLabel');
const legendAwayLabel = document.getElementById('legendAwayLabel');
// Video elements
const addVideoChk = document.getElementById('addVideoChk');
const videoUrlInput = document.getElementById('videoUrl');
const videoWrap = document.getElementById('videoPlayerWrap');
const videoAttach = document.getElementById('videoAttach');
const videoEventNoEl = document.getElementById('videoEventNo');
const attachVideoBtn = document.getElementById('attachVideoBtn');
const nextVideoBtn = document.getElementById('nextVideoBtn');
// Shot Aim elements
const addAimChk = document.getElementById('addAimChk');
const aimWrap = document.getElementById('aimWrap');
const aimAttach = document.getElementById('aimAttach');
const aimEventNoEl = document.getElementById('aimEventNo');
const aimCanvas = document.getElementById('aimCanvas');
const aimImg = document.getElementById('aimImg');
const aimConfirmBtn = document.getElementById('aimConfirmBtn');
const aimClearPlotBtn = document.getElementById('aimClearPlotBtn');
const aimShowPlotsBtn = document.getElementById('aimShowPlotsBtn');
const aimCancelBtn = document.getElementById('aimCancelBtn');

// Metadata controls
const metaForm = document.getElementById('metaForm');
const teamEl = document.getElementById('team');
const periodEl = document.getElementById('period');
const p1El = document.getElementById('p1');
const p2El = document.getElementById('p2');
const homeLineEl = document.getElementById('homeLine');
const awayLineEl = document.getElementById('awayLine');
const playersModeEl = document.getElementById('playersMode');
const homeFEl = document.getElementById('homeF');
const homeDEl = document.getElementById('homeD');
const awayFEl = document.getElementById('awayF');
const awayDEl = document.getElementById('awayD');
const homePlayersEl = document.getElementById('homePlayers');
const awayPlayersEl = document.getElementById('awayPlayers');
const eventEl = document.getElementById('event');
const strengthEl = document.getElementById('strength');
const perspectiveEl = document.getElementById('perspective');

// Metadata persistence helpers
const getMeta = () => ({
  event: (((eventEl && eventEl.value) || 'Shot')).trim(),
  teamSide: (((teamEl && teamEl.value) || 'Home')).trim(),
  period: (((periodEl && periodEl.value) || '1')).trim(),
  strength: (((strengthEl && strengthEl.value) || '5v5')).trim(),
  perspective: (((perspectiveEl && perspectiveEl.value) || 'event')).trim(),
  p1: (((p1El && p1El.value) || '')).trim(),
  p2: (((p2El && p2El.value) || '')).trim(),
  homeLine: (((homeLineEl && homeLineEl.value) || '')).trim(),
  awayLine: (((awayLineEl && awayLineEl.value) || '')).trim(),
  playersMode: (((playersModeEl && playersModeEl.value) || 'full')).trim(),
  homeF: (((homeFEl && homeFEl.value) || '')).trim(),
  homeD: (((homeDEl && homeDEl.value) || '')).trim(),
  awayF: (((awayFEl && awayFEl.value) || '')).trim(),
  awayD: (((awayDEl && awayDEl.value) || '')).trim(),
  homePlayers: (((homePlayersEl && homePlayersEl.value) || '')).trim(),
  awayPlayers: (((awayPlayersEl && awayPlayersEl.value) || '')).trim(),
});
function saveMeta() {
  const meta = getMeta();
  localStorage.setItem('meta', JSON.stringify(meta));
}
function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem('meta') || '{}');
    if (m && typeof m === 'object') {
      if (teamEl) teamEl.value = m.teamSide || 'Home';
      if (periodEl) periodEl.value = m.period || '1';
      if (p1El) p1El.value = m.p1 || '';
      if (p2El) p2El.value = m.p2 || '';
      if (homeLineEl) homeLineEl.value = m.homeLine || '';
      if (awayLineEl) awayLineEl.value = m.awayLine || '';
  if (playersModeEl) playersModeEl.value = m.playersMode || 'full';
  if (homeFEl) homeFEl.value = m.homeF || '';
  if (homeDEl) homeDEl.value = m.homeD || '';
  if (awayFEl) awayFEl.value = m.awayF || '';
  if (awayDEl) awayDEl.value = m.awayD || '';
  if (homePlayersEl) homePlayersEl.value = m.homePlayers || '';
      if (awayPlayersEl) awayPlayersEl.value = m.awayPlayers || '';
  if (eventEl) eventEl.value = m.event || 'Shot';
  if (strengthEl) strengthEl.value = m.strength || '5v5';
  if (perspectiveEl) perspectiveEl.value = m.perspective || 'event';
    }
  } catch {}
}


// Roster helpers (sync with teams.html storage)
const HOME_KEY = 'roster_home_v1';
const AWAY_KEY = 'roster_away_v1';
const TEAMNAMES_KEY = 'roster_teamnames_v1';
const GAME_META_KEY = 'game_meta_v1';
function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } }
function getTeamNames() {
  const t = loadJSON(TEAMNAMES_KEY, { home: 'Home', away: 'Away', homeColor: '#ffcc66', awayColor: '#66ccff' }) || { home: 'Home', away: 'Away', homeColor: '#ffcc66', awayColor: '#66ccff' };
  return { home: t.home || 'Home', away: t.away || 'Away', homeColor: t.homeColor || '#ffcc66', awayColor: t.awayColor || '#66ccff' };
}
function getRosters() {
  const home = loadJSON(HOME_KEY, []) || [];
  const away = loadJSON(AWAY_KEY, []) || [];
  return { home, away };
}
// Special teams storage and helpers
const SPEC_HOME_KEY = 'special_home_v1';
const SPEC_AWAY_KEY = 'special_away_v1';
function getSpecialTeams() {
  const home = loadJSON(SPEC_HOME_KEY, { pp1:'', pp2:'', pk1:'', pk2:'' }) || { pp1:'', pp2:'', pk1:'', pk2:'' };
  const away = loadJSON(SPEC_AWAY_KEY, { pp1:'', pp2:'', pk1:'', pk2:'' }) || { pp1:'', pp2:'', pk1:'', pk2:'' };
  return { home, away };
}
function findNameByNumber(roster, num) {
  if (!num) return '';
  const n = String(num).trim();
  const row = roster.find(r => (r?.num||'').trim() === n);
  return row?.name || '';
}
function numbersForLine(roster, lineStr) {
  const l = (lineStr||'').trim();
  if (!l) return '';
  return roster.filter(r => (r?.line||'').trim() === l).map(r => (r?.num||'').trim()).filter(Boolean).join(' ');
}

function playersForSelection(teamSide, selection) {
  const { home, away } = getRosters();
  const { home: sh, away: sa } = getSpecialTeams();
  const sel = (selection||'').trim().toUpperCase();
  if (!sel) return '';
  if (sel === 'PP1') return (teamSide==='Home'? sh.pp1 : sa.pp1) || '';
  if (sel === 'PP2') return (teamSide==='Home'? sh.pp2 : sa.pp2) || '';
  if (sel === 'PK1') return (teamSide==='Home'? sh.pk1 : sa.pk1) || '';
  if (sel === 'PK2') return (teamSide==='Home'? sh.pk2 : sa.pk2) || '';
  const roster = teamSide === 'Home' ? home : away;
  return numbersForLine(roster, selection);
}

function forwardsDefendersToPlayers(teamSide, fSel, dSel) {
  const f = (fSel||'').toUpperCase();
  const d = (dSel||'').toUpperCase();
  const { home, away } = getRosters();
  const { home: sh, away: sa } = getSpecialTeams();
  const roster = teamSide === 'Home' ? home : away;
  const mapGroup = (sel) => {
    if (!sel) return '';
    if (['PP1','PP2','PK1','PK2'].includes(sel)) return (teamSide==='Home'? sh[sel.toLowerCase()] : sa[sel.toLowerCase()]) || '';
    // Expect F1..F4 or D1..D3 to appear as such in roster line values
    return numbersForLine(roster, sel);
  };
  const pF = mapGroup(f);
  const pD = mapGroup(d);
  return [pF, pD].filter(Boolean).join(' ').trim();
}

function goalieTokenOrNumber(teamSide) {
  const { home, away } = getRosters();
  const roster = teamSide === 'Home' ? home : away;
  const cand = roster.find(r => ['G','GK','GOALIE'].includes((r?.line||'').trim().toUpperCase()) && (r?.num||'').trim());
  if (cand) return (cand.num||'').trim();
  const cand2 = roster.find(r => ((r?.name||'').toUpperCase().includes('(G)') || (r?.name||'').trim().toUpperCase()==='G') && (r?.num||'').trim());
  if (cand2) return (cand2.num||'').trim();
  return 'G';
}

// Return goalie row (num, name) for a given team side based on Team lists
function goalieRow(teamSide) {
  const { home, away } = getRosters();
  const roster = teamSide === 'Home' ? home : away;
  let row = roster.find(r => ['G','GK','GOALIE'].includes((r?.line||'').trim().toUpperCase()) && (r?.num||'').trim());
  if (!row) row = roster.find(r => ((r?.name||'').toUpperCase().includes('(G)') || (r?.name||'').trim().toUpperCase()==='G') && (r?.num||'').trim());
  return row ? { num: (row.num||'').trim(), name: (row.name||'').trim() } : { num: '', name: '' };
}

// Given a team side and a space-separated list of player numbers (may include G),
// return a hyphen-separated list of player names from the roster.
function derivePlayerNames(teamSide, playersStr) {
  const { home, away } = getRosters();
  const roster = teamSide === 'Home' ? home : away;
  const goalie = goalieRow(teamSide);
  const tokens = String(playersStr || '').split(/\s+/).filter(Boolean);
  const names = [];
  for (const t of tokens) {
    const up = t.toUpperCase();
    if (['G','GK','GOALIE'].includes(up)) {
      if (goalie.name) names.push(goalie.name);
      continue;
    }
    const row = roster.find(r => (r?.num || '').trim() === t);
    if (row && row.name) names.push((row.name || '').trim());
  }
  return names.join(' - ');
}

// Persistence for shots
function saveState() {
  localStorage.setItem('shots', JSON.stringify(shots));
  localStorage.setItem('idCounter', String(idCounter));
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('shots') || '[]');
    if (Array.isArray(s)) {
      // Detect and migrate legacy (top-left origin) coordinates if needed
      const looksLegacy = s.length > 0 && s.every(it => typeof it.xM === 'number' && typeof it.yM === 'number' && it.xM >= 0 && it.xM <= RINK_W_M && it.yM >= 0 && it.yM <= RINK_H_M);
      shots = s.map(it => {
        if (looksLegacy) {
          const xM = it.xM - HALF_W;
          const yM = HALF_H - it.yM; // flip so up is positive
          const half = xM < 0 ? 'Left' : 'Right';
          return { ...it, xM, yM, half, zone: zoneFor(xM, yM) };
        }
        return it;
      });
    }
    const idc = parseInt(localStorage.getItem('idCounter') || '1', 10);
    idCounter = Number.isFinite(idc) && idc > 0 ? idc : 1;
  } catch {}
}

function resizeCanvas() {
  // Match drawing buffer to CSS size for sharpness
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRink();
  redrawShots();
}

// Initialize team names into UI
function applyTeamNamesToUI() {
  const names = getTeamNames();
  if (teamEl) {
    for (const opt of teamEl.options) {
      if (opt.value === 'Home') opt.textContent = names.home;
      if (opt.value === 'Away') opt.textContent = names.away;
    }
  }
  // Legend
  if (legendHomeLabel) legendHomeLabel.textContent = names.home || 'Home';
  if (legendAwayLabel) legendAwayLabel.textContent = names.away || 'Away';
  if (legendHomeSwatch) legendHomeSwatch.style.backgroundColor = names.homeColor || '#ffcc66';
  if (legendAwaySwatch) legendAwaySwatch.style.backgroundColor = names.awayColor || '#66ccff';
}

// Populate perspective select with team names (must run after getTeamNames defined)
(() => {
  try {
    if (!perspectiveEl) return;
    const { home, away } = getTeamNames();
    if ([...perspectiveEl.options].length <= 1) {
      const optHome = document.createElement('option'); optHome.value = 'home'; optHome.textContent = home || 'Home'; perspectiveEl.appendChild(optHome);
      const optAway = document.createElement('option'); optAway.value = 'away'; optAway.textContent = away || 'Away'; perspectiveEl.appendChild(optAway);
    }
  } catch {}
})();

function drawRink() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Background image (bane.png) scaled to canvas
  if (rinkImgLoaded) {
    ctx.drawImage(rinkImg, 0, 0, w, h);
  } else {
    // Fallback background color while image loads
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--rink') || '#0a1a3a';
    ctx.fillRect(0, 0, w, h);
  }
}

// Removed overlay helpers; background image only

function clientToMeters(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const xPx = clamp(clientX - rect.left, 0, rect.width);
  const yPx = clamp(clientY - rect.top, 0, rect.height);
  // Center-origin: x in [-20,20], y in [-10,10] with up positive
  const xM = (xPx / rect.width) * RINK_W_M - HALF_W;
  const yM_down = (yPx / rect.height) * RINK_H_M - HALF_H; // -10..10, down positive
  const yM = -yM_down;
  return { xM, yM };
}

function metersToClient(xM, yM) {
  const rect = canvas.getBoundingClientRect();
  const xPx = ((xM + HALF_W) / RINK_W_M) * rect.width;
  const yPx = ((-yM + HALF_H) / RINK_H_M) * rect.height;
  return { xPx, yPx };
}

function zoneFor(xM, yM) {
  // Thirds along X and Y (attacking right)
  const lx = (xM + HALF_W) / RINK_W_M; // 0..1 left->right
  const ly = (-yM + HALF_H) / RINK_H_M; // 0..1 top->bottom
  const zoneX = lx < 1/3 ? 'D' : (lx < 2/3 ? 'N' : 'O');
  const zoneY = ly < 1/3 ? 'Top' : (ly < 2/3 ? 'Middle' : 'Bottom');
  return `${zoneX}-${zoneY}`;
}

function nearestGoalFor(xM, yM) {
  // Goals centered at x=-20 and x=+20, y=0
  const gxL = -HALF_W, gxR = HALF_W, gy = 0;
  const dL = Math.hypot(xM - gxL, yM - gy);
  const dR = Math.hypot(xM - gxR, yM - gy);
  return dL <= dR ? { label: 'Left', x: gxL, y: gy, dist: dL } : { label: 'Right', x: gxR, y: gy, dist: dR };
}

function angleToGoalDeg(xM, yM, goal) {
  // Angle relative to +X axis, with +Y up
  const ang = Math.atan2(goal.y - yM, goal.x - xM);
  const deg = ang * 180 / Math.PI;
  return ((deg % 360) + 360) % 360; // normalize 0..360
}

function addShot(xM, yM) {
  const half = xM < 0 ? 'Left' : 'Right';
  const zone = zoneFor(xM, yM);
  const goal = nearestGoalFor(xM, yM);
  const angleDeg = angleToGoalDeg(xM, yM, goal);
  const meta = getMeta();
  // Resolve names using rosters
  const { home, away } = getRosters();
  const { home: homeName, away: awayName } = getTeamNames();
  const teamSide = meta.teamSide;
  const event = meta.event;
  const p1Name = teamSide === 'Home' ? findNameByNumber(home, meta.p1) : findNameByNumber(away, meta.p1);
  let p2TeamSide = teamSide;
  if (event === 'Block' || event === 'Penalty') p2TeamSide = teamSide === 'Home' ? 'Away' : 'Home';
  const p2Name = p2TeamSide === 'Home' ? findNameByNumber(home, meta.p2) : findNameByNumber(away, meta.p2);
  // Derive players: goalie + selected line or special team (if provided), fallback to numeric line
  let homePlayers, awayPlayers;
  let homeLineLabel = meta.homeLine, awayLineLabel = meta.awayLine;
  if ((meta.playersMode||'full') === 'split') {
    const defHome = (()=>{ const g = goalieTokenOrNumber('Home'); const p = forwardsDefendersToPlayers('Home', meta.homeF, meta.homeD); return [g,p].filter(Boolean).join(' ').trim(); })();
    const defAway = (()=>{ const g = goalieTokenOrNumber('Away'); const p = forwardsDefendersToPlayers('Away', meta.awayF, meta.awayD); return [g,p].filter(Boolean).join(' ').trim(); })();
    homePlayers = meta.homePlayers || defHome;
    awayPlayers = meta.awayPlayers || defAway;
    homeLineLabel = [meta.homeF||'', meta.homeD||''].join('').trim();
    awayLineLabel = [meta.awayF||'', meta.awayD||''].join('').trim();
  } else {
    const autoHomePlayers = numbersForLine(home, meta.homeLine);
    const autoAwayPlayers = numbersForLine(away, meta.awayLine);
    const defHome = (()=>{ const g = goalieTokenOrNumber('Home'); const p = playersForSelection('Home', meta.homeLine) || autoHomePlayers; return [g,p].filter(Boolean).join(' ').trim(); })();
    const defAway = (()=>{ const g = goalieTokenOrNumber('Away'); const p = playersForSelection('Away', meta.awayLine) || autoAwayPlayers; return [g,p].filter(Boolean).join(' ').trim(); })();
    homePlayers = meta.homePlayers || defHome;
    awayPlayers = meta.awayPlayers || defAway;
  }
  const item = {
    id: idCounter++,
    ts: nowISO(),
    xM, yM,
    half,
    zone,
    nearestGoal: goal.label,
    distM: goal.dist,
    angleDeg,
  ...meta,
    teamHome: homeName,
    teamAway: awayName,
    p1Name,
    p2Name,
    homePlayers,
    awayPlayers,
    homeLine: homeLineLabel,
    awayLine: awayLineLabel
  };
  shots.push(item);
  saveState();
  redrawShots();
  renderTable();
  // Default Event Number fields (aim + video) to this shot index
  try {
    const n = shots.length;
    if (videoEventNoEl) videoEventNoEl.value = String(n);
    if (aimEventNoEl) aimEventNoEl.value = String(n);
  } catch {}
}

function redrawShots() {
  drawRink();
  const rect = canvas.getBoundingClientRect();
  const pxPerM = rect.width / RINK_W_M;
  const radius = Math.max(4, Math.min(8, pxPerM * 0.2));
  ctx.lineWidth = 2;
  const { homeColor, awayColor } = getTeamNames();
  for (const s of shots) {
    if (s.id <= plotClearAfterId) continue;
    const { xPx, yPx } = metersToClient(s.xM, s.yM);
    const col = s.teamSide === 'Away' ? awayColor : homeColor;
    // derive rgba from hex
    let r = 255, g = 204, b = 102;
    if (/^#?[0-9a-fA-F]{6}$/.test(col)) {
      const hex = col.replace('#','');
      r = parseInt(hex.slice(0,2),16);
      g = parseInt(hex.slice(2,4),16);
      b = parseInt(hex.slice(4,6),16);
    }
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
    ctx.beginPath();
    ctx.arc(xPx, yPx, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// Clear only the plot markers (keep table data)
// Persisted watermark for Clear Plot
let plotClearAfterId = parseInt(localStorage.getItem('plotClearAfterId_v1')||'0', 10) || 0;
function setPlotClearAfterId(v) {
  plotClearAfterId = v;
  localStorage.setItem('plotClearAfterId_v1', String(v));
}
function clearPlotOnly() {
  const maxId = shots.reduce((m, s) => Math.max(m, s.id||0), 0);
  setPlotClearAfterId(maxId);
  drawRink();
}

function renderTable() {
  tbody.innerHTML = '';
  const curNames = getTeamNames();
  const gm = loadJSON(GAME_META_KEY, { gameId:'', date:'', competition:'' }) || { gameId:'', date:'', competition:'' };
  
  shots.forEach((s, idx) => {
    const tr = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.textContent = String(idx + 1);
    tr.appendChild(tdIdx);

  const tdTs = document.createElement('td');
  tdTs.appendChild(makeEdit('ts', s, v => (v || '').replace(' ', 'T')));
  tr.appendChild(tdTs);

  const tdEvent = document.createElement('td'); tdEvent.appendChild(makeEdit('event', s)); tr.appendChild(tdEvent);

  const tdTeam = document.createElement('td');
  const computedName = s.teamSide === 'Away' ? (curNames.away || 'Away') : (curNames.home || 'Home');
  const teamNameInput = document.createElement('input');
  teamNameInput.type = 'text';
  teamNameInput.value = s.teamName || computedName;
  teamNameInput.className = 'table-edit';
  teamNameInput.addEventListener('blur', () => {
    s.teamName = teamNameInput.value.trim();
    saveState();
  });
  teamNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') teamNameInput.blur(); });
  tdTeam.appendChild(teamNameInput);
    tr.appendChild(tdTeam);

  const tdVenue = document.createElement('td');
  tdVenue.appendChild(makeEdit('teamSide', s));
  tr.appendChild(tdVenue);

  const tdPeriod = document.createElement('td'); tdPeriod.appendChild(makeEdit('period', s)); tr.appendChild(tdPeriod);
  if (!('perspective' in s)) s.perspective = 'event';
  const tdPerspective = document.createElement('td'); tdPerspective.appendChild(makeEdit('perspective', s)); tr.appendChild(tdPerspective);
  const tdStrength = document.createElement('td'); tdStrength.appendChild(makeEdit('strength', s)); tr.appendChild(tdStrength);

  const tdP1 = document.createElement('td'); tdP1.appendChild(makeEdit('p1', s)); tr.appendChild(tdP1);
  const tdP1N = document.createElement('td'); tdP1N.appendChild(makeEdit('p1Name', s)); tr.appendChild(tdP1N);
  const tdP2 = document.createElement('td'); tdP2.appendChild(makeEdit('p2', s)); tr.appendChild(tdP2);
  const tdP2N = document.createElement('td'); tdP2N.appendChild(makeEdit('p2Name', s)); tr.appendChild(tdP2N);

  // Opposing goalie columns (editable; default from opposing roster)
  const oppSide = s.teamSide === 'Home' ? 'Away' : 'Home';
  const gRow = goalieRow(oppSide);
  if (!('gNo' in s) || !s.gNo) s.gNo = gRow.num || '';
  if (!('goalieName' in s) || !s.goalieName) s.goalieName = gRow.name || '';
  const tdGNo = document.createElement('td'); tdGNo.appendChild(makeEdit('gNo', s)); tr.appendChild(tdGNo);
  const tdGName = document.createElement('td'); tdGName.appendChild(makeEdit('goalieName', s)); tr.appendChild(tdGName);
  const tdHL = document.createElement('td'); tdHL.appendChild(makeEdit('homeLine', s)); tr.appendChild(tdHL);
  // Numbers field
  const tdHPNo = document.createElement('td'); tdHPNo.appendChild(makeEdit('homePlayers', s)); tr.appendChild(tdHPNo);
  // Home player names (editable; defaults to derived if not set)
  if (!('homePlayersNames' in s)) s.homePlayersNames = derivePlayerNames('Home', s.homePlayers);
  const tdHPNames = document.createElement('td');
  tdHPNames.appendChild(makeEdit('homePlayersNames', s));
  tr.appendChild(tdHPNames);
  const tdAL = document.createElement('td'); tdAL.appendChild(makeEdit('awayLine', s)); tr.appendChild(tdAL);
  const tdAPNo = document.createElement('td'); tdAPNo.appendChild(makeEdit('awayPlayers', s)); tr.appendChild(tdAPNo);
  if (!('awayPlayersNames' in s)) s.awayPlayersNames = derivePlayerNames('Away', s.awayPlayers);
  const tdAPNames = document.createElement('td');
  tdAPNames.appendChild(makeEdit('awayPlayersNames', s));
  tr.appendChild(tdAPNames);

  const tdX = document.createElement('td'); tdX.appendChild(makeEdit('xM', s)); tr.appendChild(tdX);
  const tdY = document.createElement('td'); tdY.appendChild(makeEdit('yM', s)); tr.appendChild(tdY);
  const tdAimX = document.createElement('td'); tdAimX.appendChild(makeEdit('aimX', s)); tr.appendChild(tdAimX);
  const tdAimY = document.createElement('td'); tdAimY.appendChild(makeEdit('aimY', s)); tr.appendChild(tdAimY);

  // Game metadata columns (read-only from Team lists meta; allow per-row override if needed)
  const tdGameId = document.createElement('td');
  tdGameId.appendChild(makeEdit('gameId', s, undefined));
  if (!s.gameId && gm.gameId) tdGameId.querySelector('input').value = gm.gameId;
  tr.appendChild(tdGameId);

  const tdDate = document.createElement('td');
  tdDate.appendChild(makeEdit('gameDate', s, undefined));
  if (!s.gameDate && gm.date) tdDate.querySelector('input').value = gm.date;
  tr.appendChild(tdDate);

  const tdComp = document.createElement('td');
  tdComp.appendChild(makeEdit('competition', s, undefined));
  if (!s.competition && gm.competition) tdComp.querySelector('input').value = gm.competition;
  tr.appendChild(tdComp);

  // Video URL and Video Time columns
  const tdVUrl = document.createElement('td'); tdVUrl.appendChild(makeEdit('videoUrl', s)); tr.appendChild(tdVUrl);
  const tdVTime = document.createElement('td'); tdVTime.appendChild(makeEdit('videoTime', s)); tr.appendChild(tdVTime);

    const tdHalf = document.createElement('td');
    tdHalf.textContent = s.half; // column removed from UI; keep variable for potential future use

    const tdDel = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'row-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteShot(s.id));
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}

function makeEdit(field, s, transform) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = (field==='xM' || field==='yM' || field==='aimX' || field==='aimY') ? fmt(s[field], 2) : (s[field] ?? '');
  input.className = 'table-edit';
  input.addEventListener('blur', () => {
    let v = input.value.trim();
    if (typeof transform === 'function') v = transform(v);
    if (field==='xM' || field==='yM' || field==='aimX' || field==='aimY') {
      const n = parseFloat(v);
      if (Number.isFinite(n)) s[field] = n;
    } else {
      s[field] = v;
    }
    saveState();
    redrawShots();
    // Keep aim overlay in sync with table edits
    if (field === 'aimX' || field === 'aimY') {
      redrawAimAll();
    }
    // If numbers edited and names not manually set, update default names
    if (field === 'homePlayers' && (!s.homePlayersNames || !s.homePlayersNames.trim())) {
      s.homePlayersNames = derivePlayerNames('Home', s.homePlayers);
      renderTable();
    } else if (field === 'awayPlayers' && (!s.awayPlayersNames || !s.awayPlayersNames.trim())) {
      s.awayPlayersNames = derivePlayerNames('Away', s.awayPlayers);
      renderTable();
    } else if (field === 'homePlayers' || field === 'awayPlayers') {
      // Re-render to reflect any changes
      renderTable();
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

function deleteShot(id) {
  shots = shots.filter(s => s.id !== id);
  saveState();
  redrawShots();
  redrawAimAll();
  renderTable();
}

function undo() {
  if (shots.length === 0) return;
  shots.pop();
  saveState();
  redrawShots();
  redrawAimAll();
  renderTable();
}

function clearAll() {
  if (!confirm('Clear all shots?')) return;
  shots = [];
  idCounter = 1;
  saveState();
  redrawShots();
  redrawAimAll();
  renderTable();
}

async function exportCSV() {
  const header = ['id','timestamp','event','team','venue','team_home','team_away','period','perspective','strength','p1_no','p1_name','p2_no','p2_name','g_no','goalie_name','home_line','home_players','home_players_names','away_line','away_players','away_players_names','x_m','y_m','game_id','game_date','competition','video_url','video_time','aim_x','aim_y'];
  const names = getTeamNames();
  const rows = shots.map(s => {
    const opp = s.teamSide === 'Home' ? 'Away' : 'Home';
    const gDef = goalieRow(opp);
    const g = { num: s.gNo || gDef.num || '', name: s.goalieName || gDef.name || '' };
    return [
  s.id, s.ts, s.event||'', (s.teamName && s.teamName.length ? s.teamName : (s.teamSide==='Away' ? (names.away||'Away') : (names.home||'Home'))), (s.teamSide||''), (s.teamHome||''), (s.teamAway||''), (s.period||''), (s.perspective||'event'), (s.strength||''), s.p1||'', s.p1Name||'', s.p2||'', s.p2Name||'', g.num, g.name, s.homeLine||'', s.homePlayers||'', (s.homePlayersNames||''), s.awayLine||'', s.awayPlayers||'', (s.awayPlayersNames||''),
      fmt(s.xM,3), fmt(s.yM,3), (s.gameId || (loadJSON(GAME_META_KEY, {})?.gameId || '')), (s.gameDate || (loadJSON(GAME_META_KEY, {})?.date || '')), (s.competition || (loadJSON(GAME_META_KEY, {})?.competition || '')),
      (s.videoUrl||''), (Number.isFinite(s.videoTime)?String(s.videoTime):''),
      (Number.isFinite(s.aimX) ? fmt(s.aimX, 2) : ''), (Number.isFinite(s.aimY) ? fmt(s.aimY, 2) : '')
    ];
  });
  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const gm = loadJSON(GAME_META_KEY, { gameId:'' }) || { gameId:'' };
  const gameId = (gm.gameId||'').trim();
  const fileName = `${gameId ? gameId + '_' : ''}shots_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;

  // Prefer native Save As when available
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      await writable.close();
      return; // done
    }
  } catch (err) {
    console.warn('Save picker failed, falling back to download:', err);
  }
  // Fallback to anchor download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Event wiring
canvas.addEventListener('click', (e) => {
  const { xM, yM } = clientToMeters(e.clientX, e.clientY);
  addShot(xM, yM);
});
window.addEventListener('resize', resizeCanvas);
undoBtn.addEventListener('click', undo);
clearBtn.addEventListener('click', clearAll);
exportBtn.addEventListener('click', exportCSV);
if (clearPlotBtn) clearPlotBtn.addEventListener('click', clearPlotOnly);
if (showPlotsBtn) showPlotsBtn.addEventListener('click', () => { setPlotClearAfterId(0); redrawShots(); });
if (importFileEl) importFileEl.addEventListener('change', handleImportCSV);

function handleImportCSV(e) {
  const files = e.target.files ? Array.from(e.target.files) : [];
  if (!files.length) return;
  let done = 0;
  const importedAll = [];
  const processText = (text) => {
    const lines = String(text || '').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const mapRow = (cells) => {
      const get = (n) => (idx(n) >= 0 ? cells[idx(n)] : '').trim();
      return {
        id: Number(get('id')) || (idCounter++),
        ts: get('timestamp') || nowISO(),
        event: get('event') || 'Shot',
        teamSide: get('venue') || get('team') || 'Home',
        teamHome: get('team_home') || '',
        teamAway: get('team_away') || '',
        teamName: get('team') || '',
        period: get('period') || '1',
  strength: get('strength') || '5v5',
  perspective: get('perspective') || 'event',
        p1: get('p1_no'),
        p1Name: get('p1_name'),
        p2: get('p2_no'),
        p2Name: get('p2_name'),
        gNo: get('g_no'),
        goalieName: get('goalie_name'),
        homeLine: get('home_line'),
  homePlayers: get('home_players'),
  homePlayersNames: get('home_players_names') || undefined,
        awayLine: get('away_line'),
  awayPlayers: get('away_players'),
  awayPlayersNames: get('away_players_names') || undefined,
        xM: Number(get('x_m')) || 0,
        yM: Number(get('y_m')) || 0,
        gameId: get('game_id') || '',
        gameDate: get('game_date') || '',
        competition: get('competition') || '',
        videoUrl: get('video_url') || '',
        videoTime: (get('video_time') ? Number(get('video_time')) : undefined),
  // analytics columns removed from CSV I/O: half, zone, nearest_goal, dist_m, angle_deg
        aimX: (get('aim_x') ? Number(get('aim_x')) : undefined),
        aimY: (get('aim_y') ? Number(get('aim_y')) : undefined),
      };
    };
    const imported = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      if (!cells.length) continue;
      const row = mapRow(cells);
      if (Number.isFinite(row.xM) && Number.isFinite(row.yM)) imported.push(row);
    }
    return imported;
  };
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = processText(reader.result || '');
        importedAll.push(...imported);
      } catch (err) {
        alert('Failed to import CSV: ' + (err?.message || String(err)));
      } finally {
        done++;
        if (done >= files.length) {
          shots = shots.concat(importedAll);
          const maxId = shots.reduce((m, s) => Math.max(m, s.id||0), idCounter);
          idCounter = maxId + 1;
          saveState();
          renderTable();
          redrawShots();
          redrawAimAll();
          e.target.value = '';
        }
      }
    };
    reader.readAsText(file);
  });
}
if (metaForm) metaForm.addEventListener('input', saveMeta);
// When line selection changes, auto-fill players from roster
if (homeLineEl) homeLineEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Home');
  const v = playersForSelection('Home', homeLineEl.value);
  if (homePlayersEl) homePlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});
if (awayLineEl) awayLineEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Away');
  const v = playersForSelection('Away', awayLineEl.value);
  if (awayPlayersEl) awayPlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});

function updatePlayersModeUI() {
  const full = document.getElementById('playersFull');
  const split = document.getElementById('playersSplit');
  const mode = (playersModeEl && playersModeEl.value) || 'full';
  if (full && split) {
    if (mode === 'split') { full.style.display = 'none'; split.style.display = ''; }
    else { full.style.display = ''; split.style.display = 'none'; }
  }
}
if (playersModeEl) playersModeEl.addEventListener('change', () => { updatePlayersModeUI(); saveMeta(); });
if (homeFEl) homeFEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Home');
  const v = forwardsDefendersToPlayers('Home', homeFEl.value, homeDEl ? homeDEl.value : '');
  if (homePlayersEl) homePlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});
if (homeDEl) homeDEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Home');
  const v = forwardsDefendersToPlayers('Home', homeFEl ? homeFEl.value : '', homeDEl.value);
  if (homePlayersEl) homePlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});
if (awayFEl) awayFEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Away');
  const v = forwardsDefendersToPlayers('Away', awayFEl.value, awayDEl ? awayDEl.value : '');
  if (awayPlayersEl) awayPlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});
if (awayDEl) awayDEl.addEventListener('change', () => {
  const g = goalieTokenOrNumber('Away');
  const v = forwardsDefendersToPlayers('Away', awayFEl ? awayFEl.value : '', awayDEl.value);
  if (awayPlayersEl) awayPlayersEl.value = [g, v].filter(Boolean).join(' ').trim();
  saveMeta();
});

// Init
loadState();
loadMeta();
applyTeamNamesToUI();
resizeCanvas();
renderTable();
// Update legend and team names if storage changes (e.g., Team lists edited in another tab)
window.addEventListener('storage', (e) => {
  if (!e) return;
  if (e.key === TEAMNAMES_KEY) {
    applyTeamNamesToUI();
    renderTable();
    redrawShots();
    return;
  }
  if ([HOME_KEY, AWAY_KEY, SPEC_HOME_KEY, SPEC_AWAY_KEY].includes(e.key)) {
    // Rosters or special teams changed; update derived names in table
    renderTable();
  }
});

// ---------------- Video controls ----------------
const VIDEO_STATE_KEY = 'video_state_v1';
function saveVideoState() {
  const state = { enabled: !!(addVideoChk && addVideoChk.checked), url: (videoUrlInput && videoUrlInput.value) || '' };
  localStorage.setItem(VIDEO_STATE_KEY, JSON.stringify(state));
}
function loadVideoState() {
  try { return JSON.parse(localStorage.getItem(VIDEO_STATE_KEY) || ''); } catch { return { enabled:false, url:'' }; }
}
function toEmbedUrl(url) {
  const u = String(url||'').trim();
  if (!u) return '';
  // YouTube patterns
  const yt = u.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i);
  if (yt && yt[1]) {
    const origin = encodeURIComponent(location.origin);
    return `https://www.youtube.com/embed/${yt[1]}?rel=0&enablejsapi=1&origin=${origin}`;
  }
  // Vimeo patterns
  const vm = u.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i);
  if (vm && vm[1]) return `https://player.vimeo.com/video/${vm[1]}`;
  return '';
}
function renderVideo() {
  if (!videoWrap) return;
  const enabled = !!(addVideoChk && addVideoChk.checked);
  const url = (videoUrlInput && videoUrlInput.value) || '';
  if (!enabled || !url) { videoWrap.style.display = 'none'; videoWrap.innerHTML=''; return; }
  videoWrap.style.display = '';
  const embed = toEmbedUrl(url);
  if (embed) {
    videoWrap.innerHTML = `<iframe class="video-frame" src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  } else {
    // Fallback to HTML5 video tag
    const safeUrl = url.replace(/"/g, '%22');
    videoWrap.innerHTML = `<video class="video-html5" src="${safeUrl}" controls playsinline></video>`;
  }
}
function initVideo() {
  if (!addVideoChk || !videoUrlInput) return;
  const st = loadVideoState() || { enabled:false, url:'' };
  addVideoChk.checked = !!st.enabled;
  videoUrlInput.value = st.url || '';
  renderVideo();
  addVideoChk.addEventListener('change', () => { saveVideoState(); renderVideo(); });
  videoUrlInput.addEventListener('change', () => { saveVideoState(); renderVideo(); });
  videoUrlInput.addEventListener('blur', () => { saveVideoState(); renderVideo(); });
  // Show/hide attach UI with player
  if (videoAttach) {
    const updateAttachVis = () => { videoAttach.style.display = (addVideoChk.checked && videoUrlInput.value.trim()) ? '' : 'none'; };
    updateAttachVis();
    addVideoChk.addEventListener('change', updateAttachVis);
    videoUrlInput.addEventListener('input', updateAttachVis);
  }
  // Handle attach button
  if (attachVideoBtn) {
    attachVideoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const n = parseInt((videoEventNoEl && videoEventNoEl.value) || '0', 10);
      if (!Number.isFinite(n) || n <= 0 || n > shots.length) return;
      const s = shots[n-1];
      const url = (videoUrlInput && videoUrlInput.value.trim()) || '';
      if (!url) return;
      s.videoUrl = url;
      // Try to capture current playback time if using HTML5 video
      let tSec = undefined;
      try {
        const vid = videoWrap && videoWrap.querySelector('video');
        if (vid && typeof vid.currentTime === 'number') tSec = Math.floor(vid.currentTime);
      } catch {}
      s.videoTime = tSec;
      saveState();
      renderTable();
    });
  }
  // Handle next button
  if (nextVideoBtn) {
    nextVideoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const curN = parseInt((videoEventNoEl && videoEventNoEl.value) || '0', 10);
      const nextN = curN + 1;
      if (!Number.isFinite(nextN) || nextN <= 1 || nextN > shots.length) return;
      // Compute delta between timestamps (in seconds)
      const prev = shots[curN-1];
      const next = shots[nextN-1];
      const tPrev = Date.parse(prev.ts);
      const tNext = Date.parse(next.ts);
      const deltaSec = Number.isFinite(tPrev) && Number.isFinite(tNext) ? Math.max(0, Math.round((tNext - tPrev) / 1000)) : 0;
      const baseVideoSec = Number.isFinite(prev.videoTime) ? prev.videoTime : 0;
      const target = Math.max(0, baseVideoSec + deltaSec - 10);
      // Increment field
      if (videoEventNoEl) videoEventNoEl.value = String(nextN);
      // Seek player
      try {
        const vid = videoWrap && videoWrap.querySelector('video');
        if (vid && typeof vid.currentTime === 'number') {
          vid.currentTime = target;
          return;
        }
        const iframe = videoWrap && videoWrap.querySelector('iframe');
        if (iframe && iframe.src.includes('youtube.com/embed')) {
          // YouTube IFrame API via postMessage
          iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [target, true] }), '*');
          return;
        }
        if (iframe && iframe.src.includes('player.vimeo.com')) {
          // Vimeo Player API postMessage
          iframe.contentWindow && iframe.contentWindow.postMessage({ method: 'setCurrentTime', value: target }, '*');
          return;
        }
      } catch {}
    });
  }
  // Keyboard shortcuts when Add Video is enabled
  const IFRAME_STATE = { time: 0, rate: 1, playing: false, haveTime: false };
  const stepSeek = (dir) => {
    const vid = videoWrap && videoWrap.querySelector('video');
    if (vid) {
      try { vid.currentTime = Math.max(0, (vid.currentTime || 0) + (dir * 3)); } catch {}
      return;
    }
    const iframe = videoWrap && videoWrap.querySelector('iframe');
    if (iframe) {
      IFRAME_STATE.time = Math.max(0, (IFRAME_STATE.time || 0) + (dir * 3));
      // YouTube
      if (iframe.src.includes('youtube.com/embed')) {
        iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event:'command', func:'seekTo', args:[IFRAME_STATE.time, true] }), '*');
        return;
      }
      // Vimeo
      if (iframe.src.includes('player.vimeo.com')) {
        iframe.contentWindow && iframe.contentWindow.postMessage({ method:'setCurrentTime', value: IFRAME_STATE.time }, '*');
        return;
      }
    }
  };
  const togglePlay = () => {
    const vid = videoWrap && videoWrap.querySelector('video');
    if (vid) { if (vid.paused) vid.play(); else vid.pause(); return; }
    const iframe = videoWrap && videoWrap.querySelector('iframe');
    if (iframe) {
      IFRAME_STATE.playing = !IFRAME_STATE.playing;
      if (iframe.src.includes('youtube.com/embed')) {
        const func = IFRAME_STATE.playing ? 'playVideo' : 'pauseVideo';
        iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event:'command', func }), '*');
        return;
      }
      if (iframe.src.includes('player.vimeo.com')) {
        iframe.contentWindow && iframe.contentWindow.postMessage({ method: IFRAME_STATE.playing ? 'play' : 'pause' }, '*');
        return;
      }
    }
  };
  const adjustRate = (dir) => {
    const vid = videoWrap && videoWrap.querySelector('video');
    if (vid) {
      const RATES = [0.5, 1, 2, 4];
      const cur = vid.playbackRate || 1;
      const stepRate = (current, d) => {
        if (d > 0) {
          for (const r of RATES) { if (r > current + 1e-6) return r; }
          return RATES[RATES.length - 1];
        } else {
          for (let i = RATES.length - 1; i >= 0; i--) { const r = RATES[i]; if (r < current - 1e-6) return r; }
          return RATES[0];
        }
      };
      const newRate = stepRate(cur, dir);
      vid.playbackRate = newRate; return;
    }
    const iframe = videoWrap && videoWrap.querySelector('iframe');
    if (iframe) {
      const RATES = [0.5, 1, 2, 4];
      const cur = IFRAME_STATE.rate || 1;
      const stepRate = (current, d) => {
        if (d > 0) {
          for (const r of RATES) { if (r > current + 1e-6) return r; }
          return RATES[RATES.length - 1];
        } else {
          for (let i = RATES.length - 1; i >= 0; i--) { const r = RATES[i]; if (r < current - 1e-6) return r; }
          return RATES[0];
        }
      };
      IFRAME_STATE.rate = stepRate(cur, dir);
      if (iframe.src.includes('youtube.com/embed')) {
        iframe.contentWindow && iframe.contentWindow.postMessage(JSON.stringify({ event:'command', func:'setPlaybackRate', args:[IFRAME_STATE.rate] }), '*');
        return;
      }
      if (iframe.src.includes('player.vimeo.com')) {
        iframe.contentWindow && iframe.contentWindow.postMessage({ method:'setPlaybackRate', value: IFRAME_STATE.rate }, '*');
        return;
      }
    }
  };
  const isTypingTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName && el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (el.isContentEditable);
  };
  document.addEventListener('keydown', (e) => {
    if (!addVideoChk.checked) return;
    if (!videoUrlInput.value.trim()) return;
    if (isTypingTarget(e.target)) return;
    // Shift combos first
    if (e.shiftKey && e.code === 'ArrowRight') {
      e.preventDefault();
      if (nextVideoBtn) nextVideoBtn.click();
      return;
    }
    if (e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      if (attachVideoBtn) attachVideoBtn.click();
      return;
    }
    // Singles
    if (e.code === 'ArrowLeft') { e.preventDefault(); stepSeek(-1); return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); stepSeek(1); return; }
    if (e.code === 'ArrowUp') { e.preventDefault(); adjustRate(1); return; }
    if (e.code === 'ArrowDown') { e.preventDefault(); adjustRate(-1); return; }
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); togglePlay(); return; }
  });
}
initVideo();

// ---------------- Shot Aim controls ----------------
const AIM_STATE_KEY = 'aim_state_v1';
function saveAimState() {
  const state = { enabled: !!(addAimChk && addAimChk.checked) };
  localStorage.setItem(AIM_STATE_KEY, JSON.stringify(state));
}
function loadAimState() {
  try { return JSON.parse(localStorage.getItem(AIM_STATE_KEY) || ''); } catch { return { enabled:false }; }
}
function renderAim() {
  if (!aimWrap || !aimAttach) return;
  const enabled = !!(addAimChk && addAimChk.checked);
  const disp = enabled ? '' : 'none';
  aimWrap.style.display = disp;
  aimAttach.style.display = disp;
  if (enabled) {
    // Force a resize event to align and redraw the overlay
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch {} }, 0);
  }
}
function initAim() {
  if (!addAimChk) return;
  const st = loadAimState() || { enabled:false };
  addAimChk.checked = !!st.enabled;
  renderAim();
  addAimChk.addEventListener('change', () => { saveAimState(); renderAim(); });
  // Draw once on load and on resize to match the image size
  const draw = () => {
    try {
      if (!aimCanvas || !aimImg || !aimWrap) return;
      const imgRect = aimImg.getBoundingClientRect();
      const host = aimCanvas.offsetParent || aimWrap;
      const hostRect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Position canvas exactly over the image within the wrap
      aimCanvas.style.left = `${imgRect.left - hostRect.left}px`;
      aimCanvas.style.top = `${imgRect.top - hostRect.top}px`;
      aimCanvas.style.width = `${imgRect.width}px`;
      aimCanvas.style.height = `${imgRect.height}px`;
      aimCanvas.style.transform = 'none';
      // Set drawing buffer size with DPR for crisp rendering
      aimCanvas.width = Math.max(1, Math.round(imgRect.width * dpr));
      aimCanvas.height = Math.max(1, Math.round(imgRect.height * dpr));
      const c = aimCanvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, imgRect.width, imgRect.height);
      // No visible grid/axes, but we keep a clean canvas
      // Redraw all existing aim dots
      redrawAimAll();
    } catch {}
  };
  window.addEventListener('resize', draw);
  if (aimImg) {
    if (aimImg.complete) draw(); else aimImg.addEventListener('load', draw, { once: true });
  }
}
initAim();

// Aim coordinate helpers
// Image coordinate system: bottom center is (0,0). X in [-100,100], Y in [0,135]
// Use an inner active rectangle within the image to align with the goal frame
// Insets (fractions of image width/height) tuned to the net artwork
// Increase to move dots inward from each side
const AIM_INSETS = { left: 0.0, right: 0.0, top: 0.0, bottom: 0.0 };
function getAimActiveRect() {
  const rect = aimImg.getBoundingClientRect();
  const left = rect.left + rect.width * AIM_INSETS.left;
  const right = rect.right - rect.width * AIM_INSETS.right;
  const top = rect.top + rect.height * AIM_INSETS.top;
  const bottom = rect.bottom - rect.height * AIM_INSETS.bottom;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}
function aimClientToCoords(clientX, clientY) {
  if (!aimImg) return { ax: 0, ay: 0 };
  const a = getAimActiveRect();
  const xPx = clamp(clientX - a.left, 0, a.width);
  const yPx = clamp(clientY - a.top, 0, a.height);
  // Center bottom is (0,0)
  const cx = xPx - a.width / 2;          // left negative, right positive
  const cy = a.height - yPx;              // bottom 0 up positive
  const ax = (cx / (a.width / 2)) * 100;  // -100..100
  const ay = (cy / a.height) * 135;       // 0..135
  return { ax, ay };
}
function clampAim(ax, ay) {
  return { ax: clamp(ax, -100, 100), ay: clamp(ay, 0, 135) };
}
function drawAimDot(ax, ay, teamSide) {
  if (!aimCanvas || !aimImg) return;
  const a = getAimActiveRect();
  const ctx2 = aimCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Map back to pixel position
  const xPx = a.left - (aimCanvas.getBoundingClientRect().left) + a.width / 2 + (ax / 100) * (a.width / 2);
  const yPx = a.top - (aimCanvas.getBoundingClientRect().top) + a.height - (ay / 135) * a.height;
  // Color based on team color, slightly larger than rink plots
  const { homeColor, awayColor } = getTeamNames();
  const col = teamSide === 'Away' ? awayColor : homeColor;
  let r = 255, g = 204, b = 102;
  if (/^#?[0-9a-fA-F]{6}$/.test(col)) {
    const hex = col.replace('#','');
    r = parseInt(hex.slice(0,2),16);
    g = parseInt(hex.slice(2,4),16);
    b = parseInt(hex.slice(4,6),16);
  }
  const radius = 8; // larger than rink plot
  ctx2.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
  ctx2.fillStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  ctx2.arc(xPx, yPx, radius, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.stroke();
}

function redrawAimAll() {
  if (!aimCanvas || !aimImg) return;
  const rect = aimImg.getBoundingClientRect();
  const ctx2 = aimCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2.clearRect(0, 0, rect.width, rect.height);
  // Draw committed aims respecting watermark
  for (const s of shots) {
    if (s.id <= aimPlotClearAfterId) continue;
    if (Number.isFinite(s.aimX) && Number.isFinite(s.aimY)) {
      drawAimDot(s.aimX, s.aimY, s.teamSide);
    }
  }
  // Draw pending preview (non-committed) if any
  if (aimPending && Number.isFinite(aimPending.ax) && Number.isFinite(aimPending.ay)) {
    drawAimDot(aimPending.ax, aimPending.ay, aimPending.side || 'Home');
  }
}

// Handle clicking on the aim image to record aim coords on the chosen event
// Aim plot watermark and pending buffer
let aimPlotClearAfterId = parseInt(localStorage.getItem('aimPlotClearAfterId_v1')||'0', 10) || 0;
function setAimPlotClearAfterId(v) {
  aimPlotClearAfterId = v;
  localStorage.setItem('aimPlotClearAfterId_v1', String(v));
}
let aimPending = null; // { n, ax, ay, side }

if (aimWrap) {
  aimWrap.addEventListener('click', (e) => {
    // Ignore clicks unless enabled and on the image area
    if (!addAimChk || !addAimChk.checked) return;
    const n = parseInt((aimEventNoEl && aimEventNoEl.value) || '0', 10);
    if (!Number.isFinite(n) || n <= 0 || n > shots.length) {
      alert('Please choose a valid Event Number before adding Shot Aim.');
      return;
    }
    if (!aimImg) return;
    const rect = getAimActiveRect();
    // Ignore clicks outside the image rect
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const { ax, ay } = clampAim(...Object.values(aimClientToCoords(e.clientX, e.clientY)));
    const s = shots[n - 1];
    // Buffer as pending until confirmed
    aimPending = { n, ax, ay, side: s.teamSide };
    redrawAimAll();
  });
}

// Confirm, Clear/Show handlers for aim
if (aimConfirmBtn) {
  aimConfirmBtn.addEventListener('click', () => {
    const n = parseInt((aimEventNoEl && aimEventNoEl.value) || '0', 10);
    if (!Number.isFinite(n) || n <= 0 || n > shots.length) return;
    // If user clicked to set a pending aim, use that; otherwise do nothing
    if (!aimPending || aimPending.n !== n) return;
    const s = shots[n - 1];
    s.aimX = aimPending.ax;
    s.aimY = aimPending.ay;
    aimPending = null;
    saveState();
    redrawAimAll();
    renderTable();
  });
}
if (aimClearPlotBtn) {
  aimClearPlotBtn.addEventListener('click', () => {
    const maxId = shots.reduce((m, s) => Math.max(m, s.id||0), 0);
    setAimPlotClearAfterId(maxId);
    redrawAimAll();
  });
}
if (aimShowPlotsBtn) {
  aimShowPlotsBtn.addEventListener('click', () => {
    setAimPlotClearAfterId(0);
    redrawAimAll();
  });
}
if (aimCancelBtn) {
  aimCancelBtn.addEventListener('click', () => {
    aimPending = null;
    redrawAimAll();
  });
}
