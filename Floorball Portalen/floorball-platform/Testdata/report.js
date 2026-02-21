// Report logic: team filter, adjusted coordinates (Adj_X/Adj_Y), shot map, and heat map
(function() {
  const TEAMNAMES_KEY = 'roster_teamnames_v1';
  const HOME_ROSTER_KEY = 'roster_home_v1';
  const AWAY_ROSTER_KEY = 'roster_away_v1';
  const $ = (sel) => document.querySelector(sel);

  // UI refs
  const teamSel = $('#reportTeam');
  const gameSel = $('#reportGame');
  const playerSel = $('#reportPlayer');
  const eventSel = $('#reportEvent');
  const periodSel = $('#reportPeriod');
  const strengthSel = $('#reportStrength');
  const perspectiveSel = $('#reportPerspective');
  const goalieSel = $('#reportGoalie');
  const onFieldSel = $('#reportOnFieldSel');
  const eventLegend = document.getElementById('eventLegend');
  // Canvases
  const shotCanvas = document.getElementById('reportRink');
  const shotCtx = shotCanvas.getContext('2d');
  const heatCanvas = document.getElementById('heatRink');
  const heatCtx = heatCanvas ? heatCanvas.getContext('2d') : null;
  const heatLegend = document.getElementById('heatLegend');
  const heatLegendRow = document.getElementById('heatLegendRow');
  // Table and video
  const tableContainer = document.getElementById('eventsTable');
  // Report -> Table sub-tabs and wrappers
  const tabTblSkatersInd = document.getElementById('tabTblSkatersInd');
  const tabTblSkatersOn = document.getElementById('tabTblSkatersOn');
  const tabTblGoalies = document.getElementById('tabTblGoalies');
  const tabTblTeams = document.getElementById('tabTblTeams');
  const panelTblSkatersInd = document.getElementById('panelTblSkatersInd');
  const panelTblSkatersOn = document.getElementById('panelTblSkatersOn');
  const panelTblGoalies = document.getElementById('panelTblGoalies');
  const panelTblTeams = document.getElementById('panelTblTeams');
  const skatersIndTableWrap = document.getElementById('skatersIndTableWrap');
  const skatersOnTableWrap = document.getElementById('skatersOnTableWrap');
  const goaliesTableWrap = document.getElementById('goaliesTableWrap');
  const teamsTableWrap = document.getElementById('teamsTableWrap');
  const inpVideoPre = document.getElementById('inpVideoPre');
  const inpVideoPost = document.getElementById('inpVideoPost');
  const videoEl = document.getElementById('gameVideo');
  const btnPrevEvent = document.getElementById('btnPrevEvent');
  const btnNextEvent = document.getElementById('btnNextEvent');
  const chkPlayAll = document.getElementById('chkPlayAll');
  // Track last rendered rows to support navigation and play-all
  let lastTableRows = [];
  let currentRowIndex = -1;
  let currentTimeUpdateHandler = null;
  let controlsWired = false;
  // Heat sub-tabs
  const tabHeatCounts = document.getElementById('tabHeatCounts');
  const tabHeatDiff = document.getElementById('tabHeatDiff');
  const tabHeatZones = document.getElementById('tabHeatZones');
  let heatMode = 'zones'; // 'counts' | 'diff' | 'zones'
  // Zones metric (single-select buttons)
  const zonesMetricButtons = Array.from(document.querySelectorAll('#zonesMetricRow .metric-btn'));
  let zonesMetric = 'corsi'; // 'corsi'|'fenwick'|'shots'|'goals'|'shpct'
  // Zones selection state (paired O/D by index 1..22)
  let selectedZoneIndex = null; // null = no filter
  let zonePairs = null; // built from GeoJSON: [{O:[rings], D:[rings]}]

  // Rink constants (meters)
  const RINK_W_M = 40, RINK_H_M = 20, HALF_W = 20, HALF_H = 10;

  // Background image
  const rinkImg = new Image(); rinkImg.src = 'bane.png';
  let rinkLoaded = false; rinkImg.onload = () => { rinkLoaded = true; resize(); };

  // Helpers
  function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } }
  function getTeamNames() {
    const t = loadJSON(TEAMNAMES_KEY, { home: 'Home', away: 'Away' }) || { home: 'Home', away: 'Away' };
    return { home: t.home || 'Home', away: t.away || 'Away', homeColor: t.homeColor || '#ffcc66', awayColor: t.awayColor || '#66ccff' };
  }
  function getShots() { try { return JSON.parse(localStorage.getItem('shots') || '[]') || []; } catch { return []; } }
  // Invert strength string like '5v4' -> '4v5'; leave symmetrical (5v5) or non-matching strings unchanged
  function invertStrength(str) {
    const m = /^\s*(\d+)\s*[vV]\s*(\d+)\s*$/.exec(str||'');
    if (!m) return str;
    const a = m[1], b = m[2];
    if (a === b) return str; // symmetrical
    return `${b}v${a}`;
  }
  const uniqueSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
  const parseDateISO = (d) => { const t = Date.parse(d || ''); return Number.isFinite(t) ? t : 0; };
  function gameLabel(s) {
    const date = s.gameDate || s.date || '';
    const ht = s.teamHome || 'Home';
    const at = s.teamAway || 'Away';
    if (!date && !ht && !at) return '';
    return `${date} - ${ht} vs ${at}`.trim();
  }

  // Filters population
  function populateFilters() {
    const all = getShots();
    // Games newest first
    const gamesMap = new Map();
    for (const s of all) {
      const label = gameLabel(s); if (!label) continue;
      const key = `${s.gameDate||''}|${s.teamHome||''}|${s.teamAway||''}`;
      const ts = parseDateISO(s.gameDate||s.date);
      const cur = gamesMap.get(key);
      if (!cur || ts > cur.ts) gamesMap.set(key, { label, ts });
    }
    const games = Array.from(gamesMap.values()).sort((a,b)=>b.ts-a.ts).map(x=>x.label);
    const setOpts = (sel, list, first='(All)') => { if (!sel) return; sel.innerHTML=''; const mk=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;}; sel.appendChild(mk('', first)); list.forEach(v=>sel.appendChild(mk(v,v))); };
    setOpts(gameSel, games);
    setOpts(playerSel, uniqueSorted(all.map(s=>s.p1Name||'')));
    setOpts(eventSel, uniqueSorted(all.map(s=>s.event||'')));
    setOpts(periodSel, uniqueSorted(all.map(s=>s.period||'')));
    if (perspectiveSel) {
      const names = getTeamNames();
      perspectiveSel.innerHTML = `<option value="event">Event Team</option><option value="home">${names.home||'Home'}</option><option value="away">${names.away||'Away'}</option>`;
    }
    setOpts(strengthSel, uniqueSorted(all.map(s=>s.strength||'')));
    setOpts(goalieSel, uniqueSorted(all.map(s=>s.goalieName||'')));
    if (onFieldSel) {
      const names = uniqueSorted([...all.flatMap(s=>String(s.homePlayersNames||'').split(/\s*-\s*/)), ...all.flatMap(s=>String(s.awayPlayersNames||'').split(/\s*-\s*/))].filter(Boolean));
      onFieldSel.innerHTML=''; const mk=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;}; onFieldSel.appendChild(mk('', '(All)')); names.forEach(n=>onFieldSel.appendChild(mk(n,n)));
    }
  }

  function populateTeamOptions() {
    const { home, away } = getTeamNames();
    teamSel.innerHTML='';
    const mk=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;};
    teamSel.appendChild(mk('Home', home));
    teamSel.appendChild(mk('Away', away));
    teamSel.value = 'Home';
  }

  // Canvas sizing
  function resize() {
    // First, size rink wrappers so each half is square: height = (wrapperWidth - gutter)/2
    sizeRinkWrappers();
    const dpr = window.devicePixelRatio || 1;
    if (shotCanvas) {
      const r = shotCanvas.getBoundingClientRect();
      shotCanvas.width = Math.max(1, Math.round(r.width * dpr));
      shotCanvas.height = Math.max(1, Math.round(r.height * dpr));
      shotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (heatCanvas && heatCtx) {
      const r = heatCanvas.getBoundingClientRect();
      heatCanvas.width = Math.max(1, Math.round(r.width * dpr));
      heatCanvas.height = Math.max(1, Math.round(r.height * dpr));
      heatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    redrawVisible();
  }
  window.addEventListener('resize', resize);

  function sizeRinkWrappers() {
    try {
  const shotWrap = document.querySelector('#panelShotMap .report-rink');
      if (shotWrap && shotCanvas) {
        const ww = shotWrap.getBoundingClientRect().width;
        const gutter = currentGutterPx(shotCanvas);
        const half = Math.max(120, Math.floor((ww - gutter) / 2));
        shotWrap.style.height = `${half}px`;
      }
  const heatWrap = document.querySelector('#panelHeatMap .report-rink');
      if (heatWrap && heatCanvas) {
        const ww = heatWrap.getBoundingClientRect().width;
        const gutter = currentGutterPx(heatCanvas);
        const half = Math.max(120, Math.floor((ww - gutter) / 2));
        heatWrap.style.height = `${half}px`;
      }
    } catch {}
  }

  // Drawing helpers
  function drawRink(ctx, w, h, gutterPx=0) {
    ctx.clearRect(0,0,w,h);
    if (!rinkLoaded) return;
    if (!gutterPx || gutterPx <= 0 || gutterPx >= w*0.8) {
      ctx.drawImage(rinkImg, 0, 0, w, h);
      return;
    }
    const leftW = Math.max(0, (w - gutterPx)/2);
    const rightX = leftW + gutterPx;
    const srcHalfW = rinkImg.width/2;
    // Left half
    ctx.drawImage(rinkImg, 0, 0, srcHalfW, rinkImg.height, 0, 0, leftW, h);
    // Right half
    ctx.drawImage(rinkImg, srcHalfW, 0, srcHalfW, rinkImg.height, rightX, 0, leftW, h);
  }
  function currentGutterPx(canvas) {
    const w = canvas?.clientWidth || 0;
    // Use a 240px gutter on wider canvases; fallback to no gutter on narrow
    return w >= 720 ? 240 : 0;
  }
  function xMetersToPx(xM, targetCanvas, gutterPx=0) {
    const rect = targetCanvas.getBoundingClientRect();
    const w = rect.width;
    if (!gutterPx || gutterPx <= 0 || gutterPx >= w*0.8) {
      return ((xM + HALF_W) / RINK_W_M) * w;
    }
    const halfWpx = Math.max(0, (w - gutterPx)/2);
    if (xM < 0) {
      // Map [-20..0] -> [0..halfWpx]
      const t = (xM + HALF_W) / HALF_W; // 0..1
      return t * halfWpx;
    }
    // Map [0..20] -> [halfWpx+gutter .. w]
    const t = xM / HALF_W; // 0..1
    return (halfWpx + gutterPx) + t * halfWpx;
  }
  function yMetersToPx(yM, targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    return ((-yM + HALF_H) / RINK_H_M) * rect.height;
  }
  // Side-aware mapper so x=0 can map to left or right edge explicitly
  function xMetersToPxSide(xM, targetCanvas, gutterPx=0, prefer='auto') {
    const rect = targetCanvas.getBoundingClientRect();
    const w = rect.width;
    if (!gutterPx || gutterPx <= 0 || gutterPx >= w*0.8) {
      return ((xM + HALF_W) / RINK_W_M) * w;
    }
    const halfWpx = Math.max(0, (w - gutterPx)/2);
    const useLeft = (xM < 0) || (xM === 0 && prefer === 'left');
    if (useLeft) {
      const t = (xM + HALF_W) / HALF_W; // [-20..0] -> [0..1]
      return t * halfWpx;
    } else { // right
      const t = xM / HALF_W; // [0..20] -> [0..1]
      return (halfWpx + gutterPx) + t * halfWpx;
    }
  }
  function cellMetersToRect(x0M, x1M, y0M, y1M, canvas, gutterPx=0) {
    // Ensure 0-boundary alignment: map 0 to left for left cells and to right for right cells
    const prefer0ForLeft = (x0M < 0 && x1M === 0) ? 'left' : 'auto';
    const prefer0ForRight = (x0M === 0 && x1M > 0) ? 'right' : 'auto';
    const x0 = xMetersToPxSide(x0M, canvas, gutterPx, prefer0ForRight);
    const x1 = xMetersToPxSide(x1M, canvas, gutterPx, prefer0ForLeft);
    const y0 = yMetersToPx(y0M, canvas);
    const y1 = yMetersToPx(y1M, canvas);
    const xx = Math.min(x0,x1), yy = Math.min(y0,y1);
    const ww = Math.max(1, Math.ceil(Math.abs(x1-x0)));
    const hh = Math.max(1, Math.ceil(Math.abs(y1-y0)));
    return { xx, yy, ww, hh };
  }
  function metersToClient(xM, yM, targetCanvas, gutterPx=0) {
    const xPx = xMetersToPx(xM, targetCanvas, gutterPx);
    const yPx = yMetersToPx(yM, targetCanvas);
    return { xPx, yPx };
  }

  // Orientation helpers
  function buildSignMap(shots, teamSide) {
    const byKey = new Map();
    for (const s of shots) {
      if ((s.teamSide||'Home') !== teamSide) continue;
      const k = (s.gameId||'') + '|' + (s.period || '1');
      const arr = byKey.get(k) || []; arr.push(s); byKey.set(k, arr);
    }
    const sign = new Map();
    for (const [k, arr] of byKey) {
      const sumX = arr.reduce((acc, s)=>acc + (Number(s.xM)||0), 0);
      sign.set(k, sumX >= 0 ? 1 : -1);
    }
    return sign;
  }
  function computeAdj(shots, teamSide, signByKey, wantTeam=true) {
    const out = [];
    for (const s of shots) {
      const isTeam = (s.teamSide||'Home') === teamSide;
      if (wantTeam && !isTeam) continue;
      if (!wantTeam && isTeam) continue;
      const k = (s.gameId||'') + '|' + (s.period||'1');
      const sgn = signByKey.get(k) || 1;
      const eff = sgn;
      out.push({ ...s, adjX: eff>0 ? s.xM : -s.xM, adjY: eff>0 ? s.yM : -s.yM });
    }
    return out;
  }
  function applyFilters(shots) {
    const g = gameSel?.value || '';
    const p1 = playerSel?.value || '';
    const ev = eventSel?.value || '';
    const pr = periodSel?.value || '';
  const st = strengthSel?.value || '';
  const persp = perspectiveSel?.value || 'event';
    const gl = goalieSel?.value || '';
    const of = onFieldSel?.value || '';
    const hasName = (namesStr, name) => String(namesStr||'').split(/\s*-\s*/).some(x=>x.trim()===name);
    return shots.filter(s=>{
      if (g && gameLabel(s) !== g) return false;
      if (p1 && (s.p1Name||'') !== p1) return false;
      if (ev && (s.event||'') !== ev) return false;
      if (pr && (s.period||'') !== pr) return false;
      if (st) {
        const raw = (s.strength||'').trim();
        const teamSide = s.teamSide || 'Home';
        let adj = raw;
        if (persp === 'home' || persp === 'away') {
          const perspectiveSide = (persp==='home') ? 'Home' : 'Away';
          if (teamSide !== perspectiveSide) adj = invertStrength(raw);
        }
        // event perspective uses raw
        if (adj !== st) return false;
      }
      if (gl && (s.goalieName||'') !== gl) return false;
      if (of) {
        const hp = String(s.homePlayersNames||'');
        const ap = String(s.awayPlayersNames||'');
        if (!(hasName(hp, of) || hasName(ap, of))) return false;
      }
      return true;
    });
  }
  function applyOrientationScope(all) {
    const g = gameSel?.value || '';
    if (!g) return all;
    return all.filter(s=>gameLabel(s)===g);
  }

  // Build and render events table (Team, Event, Player)
  function renderEventsTable() {
    if (!tableContainer) return;
    // Clear and rebuild rows list
    lastTableRows = [];
    // Note: Team filter is intentionally NOT applied to the Video table (use all other filters)
    const allShots = getShots();
    const filtered = applyFilters(allShots);
    const orientScope = applyOrientationScope(filtered);
    // Define row data: when available, use s.teamSide, s.event, s.p1Name
  const names = getTeamNames();
    const rows = orientScope.map(s=>({
      team: (s.teamSide||'Home') === 'Home' ? (names.home || 'Home') : (names.away || 'Away'),
      event: s.event || '',
      player: s.p1Name || '',
      time: Number(s.videoTime || s.ms || s.t || 0), // seconds preferred; fallback
      url: s.videoUrl || s.videoURL || s.url || '',
    }));
    // Create table
    const tbl = document.createElement('table');
    tbl.className = 'events-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Team</th><th>Event</th><th>Player</th></tr>';
    const tbody = document.createElement('tbody');
    rows.forEach((r, idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.team}</td><td>${r.event}</td><td>${r.player}</td>`;
      tr.style.cursor = 'pointer';
      lastTableRows.push({ row: tr, data: r });
      tr.addEventListener('click', ()=>{
        // Play from 7s before to 3s after; requires videoTime in seconds
        if (!videoEl) return;
        // Update video source if provided and different
        if (r.url) {
          // if no source or different source, set it
          const curSrc = videoEl.currentSrc || (videoEl.querySelector('source')?.src) || videoEl.src || '';
          if (!curSrc || (curSrc !== r.url)) {
            videoEl.src = r.url;
          }
        }
        const start = Math.max(0, (r.time||0) - 7);
        const end = Math.max(start, (r.time||0) + 3);
        try {
          // Update row highlight
          Array.from(tbody.children).forEach(row=>row.classList.remove('playing'));
          tr.classList.add('playing');
          currentRowIndex = idx;

          videoEl.currentTime = start;
          const playPromise = videoEl.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(()=>{});
          }
          // Stop at end window
          if (currentTimeUpdateHandler) {
            videoEl.removeEventListener('timeupdate', currentTimeUpdateHandler);
            currentTimeUpdateHandler = null;
          }
          currentTimeUpdateHandler = ()=>{
            if (videoEl.currentTime >= end) {
              videoEl.pause();
              if (currentTimeUpdateHandler) videoEl.removeEventListener('timeupdate', currentTimeUpdateHandler);
              currentTimeUpdateHandler = null;
              tr.classList.remove('playing');
              // If Play All is checked, auto-advance to next if available
              if (chkPlayAll?.checked) {
                const nextIdx = currentRowIndex + 1;
                if (nextIdx < lastTableRows.length) {
                  playByIndex(nextIdx);
                } else {
                  currentRowIndex = -1;
                }
              }
            }
          };
          videoEl.addEventListener('timeupdate', currentTimeUpdateHandler);
        } catch {}
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(thead); tbl.appendChild(tbody);
    tableContainer.innerHTML = '';
    tableContainer.appendChild(tbl);
  }

  // ---- Tables helpers and renderers ----
  function getRosters() {
    let home = [], away = [];
    try { home = JSON.parse(localStorage.getItem(HOME_ROSTER_KEY) || '[]') || []; } catch {}
    try { away = JSON.parse(localStorage.getItem(AWAY_ROSTER_KEY) || '[]') || []; } catch {}
    return { home, away };
  }
  function goalieRowFromRoster(side) {
    const { home, away } = getRosters();
    const roster = side === 'Home' ? home : away;
    if (!Array.isArray(roster)) return { num: '', name: '' };
    let row = roster.find(r => ['G','GK','GOALIE'].includes((r?.line||'').trim().toUpperCase()) && (r?.num||'').trim());
    if (!row) row = roster.find(r => ((r?.name||'').toUpperCase().includes('(G)')) && (r?.num||'').trim());
    return row ? { num: (row.num||'').trim(), name: (row.name||'').trim() } : { num: '', name: '' };
  }
  function playersTokensToNumbers(side, playersStr) {
    const toks = String(playersStr||'').split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const g = goalieRowFromRoster(side);
    const out = [];
    for (const t of toks) {
      const up = String(t).trim().toUpperCase();
      if (['G','GK','GOALIE'].includes(up)) {
        if (g.num) out.push(g.num);
      } else {
        out.push(t);
      }
    }
    return Array.from(new Set(out));
  }
  function getGameKey(s) { return (s.gameId && s.gameId.trim()) || gameLabel(s) || ''; }

  // Shared aggregation for skaters returning map keyed by name+side
  function aggregateSkaters() {
    const all = getShots();
    const filtered = applyFilters(all);
    const { home: homeName, away: awayName } = getTeamNames();
    const { home: homeRoster, away: awayRoster } = getRosters();
    const rosterNumByName = (side)=>{
      const map = new Map();
      (side==='Home'? homeRoster:awayRoster).forEach(r=>{
        const nm=(r?.name||'').trim(); const num=(r?.num||'').trim(); if (nm) map.set(nm.toLowerCase(), num);
      });
      return map;
    };
    const numByNameHome = rosterNumByName('Home');
    const numByNameAway = rosterNumByName('Away');
    const teamNameBySide = (side)=> side==='Home' ? (homeName||'Home') : (awayName||'Away');
    const parseNames = (s)=> String(s||'').split(/\s*-\s*/).map(x=>x.trim()).filter(Boolean);
    const map = new Map();
    const keyOf = (side, name)=> side+'|'+String(name||'').trim().toLowerCase();
    const displayNum = (side, name)=>{
      const k = String(name||'').trim().toLowerCase();
      return side==='Home' ? (numByNameHome.get(k)||'') : (numByNameAway.get(k)||'');
    };
    const getByName = (side, name)=>{
      const nameTrim = String(name||'').trim(); if (!nameTrim) return null;
      const key = keyOf(side, nameTrim);
      if (!map.has(key)) map.set(key, { side, num: displayNum(side, nameTrim), name: nameTrim, team: teamNameBySide(side),
        gp: new Set(), Goals:0, Assists:0, Points:0, PenTaken:0, PenDrawn:0, Shots:0, Misses:0, ShotsBlocked:0, Blocks:0,
        CF:0, CA:0, FF:0, FA:0, SF:0, SA:0, GF:0, GA:0 });
      return map.get(key);
    };
    const addGP = (st, s) => { if (!st) return; const gk = getGameKey(s); if (gk) st.gp.add(gk); };
    const isC = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Block' || ev==='Goal';
    const isF = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Goal';
    const isS = (ev)=> ev==='Shot' || ev==='Goal';
    const isG = (ev)=> ev==='Goal';
    for (const s of filtered) {
      const side = s.teamSide || 'Home';
      const opp = side==='Home' ? 'Away' : 'Home';
      // Direct contributors via names
      const p1n = (s.p1Name||'').trim();
      const p2n = (s.p2Name||'').trim();
      if (p1n) {
        const shooter = getByName(side, p1n);
        if (s.event==='Goal') { shooter.Goals++; shooter.Points++; }
        if (s.event==='Shot' || s.event==='Goal') shooter.Shots++;
        if (s.event==='Miss') shooter.Misses++;
        if (s.event==='Block') shooter.ShotsBlocked++;
        addGP(shooter, s);
      }
      if (s.event==='Goal' && p2n) {
        const asst = getByName(side, p2n); if (asst) { asst.Assists++; asst.Points++; addGP(asst, s); }
      }
      if (s.event==='Block' && p2n) { const blk = getByName(opp, p2n); if (blk){ blk.Blocks++; addGP(blk, s);} }
      if (s.event==='Penalty') {
        if (p1n) { const p = getByName(side, p1n); if (p){ p.PenTaken++; addGP(p, s);} }
        if (p2n) { const q = getByName(opp, p2n); if (q){ q.PenDrawn++; addGP(q, s);} }
      }
      // On-ice names lists
      const homeNames = new Set(parseNames(s.homePlayersNames));
      const awayNames = new Set(parseNames(s.awayPlayersNames));
      const bumpSide = (kSide, forTeam) => {
        const arr = (kSide==='Home'? homeNames : awayNames);
        arr.forEach(nm => {
          const st = getByName(kSide, nm); if (!st) return; addGP(st, s);
          if (isC(s.event)) { if (forTeam===kSide) st.CF++; else st.CA++; }
          if (isF(s.event)) { if (forTeam===kSide) st.FF++; else st.FA++; }
          if (isS(s.event)) { if (forTeam===kSide) st.SF++; else st.SA++; }
          if (isG(s.event)) { if (forTeam===kSide) st.GF++; else st.GA++; }
        });
      };
      bumpSide('Home', side);
      bumpSide('Away', side);
    }
    return map;
  }

  function renderSkatersIndividualTable() {
    if (!skatersIndTableWrap) return;
    const map = aggregateSkaters();
    const rows = Array.from(map.values()).filter(r=>r.name).sort((a,b)=> a.name.localeCompare(b.name));
    const tbl = document.createElement('table'); tbl.className='stats-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>'+
      '<th>#</th><th>Name</th><th>Team</th><th>GP</th>'+
      '<th>G</th><th>A</th><th>P</th><th>PEN taken</th><th>PEN drawn</th>'+
      '<th>Shots</th><th>Misses</th><th>Shots in block</th><th>Blocks</th><th>Sh%</th>'+
      '</tr>';
    const tbody = document.createElement('tbody');
    const pct = (a,b)=> (a+b)>0 ? (a/(a+b))*100 : null;
    for (const r of rows) {
      const shPct = r.Shots>0 ? (r.Goals/r.Shots)*100 : null;
      const tr = document.createElement('tr');
      const cells = [r.num||'', r.name, r.team, r.gp.size,
        r.Goals, r.Assists, r.Points, r.PenTaken, r.PenDrawn,
        r.Shots, r.Misses, r.ShotsBlocked, r.Blocks, formatMetric(shPct)
      ];
      tr.innerHTML = '<td>'+cells.join('</td><td>')+'</td>';
      tbody.appendChild(tr);
    }
    tbl.appendChild(thead); tbl.appendChild(tbody);
    // Enhance spacing and sorting
    applyTableEnhancements(tbl);
    skatersIndTableWrap.innerHTML=''; skatersIndTableWrap.appendChild(tbl);
  }

  function renderSkatersOnFieldTable() {
    if (!skatersOnTableWrap) return;
    const pct = (a,b)=> (a+b)>0 ? (a/(a+b))*100 : null;
    const map = aggregateSkaters();
    const rows = Array.from(map.values()).filter(r=>r.name).sort((a,b)=> a.name.localeCompare(b.name));
    const tbl = document.createElement('table'); tbl.className='stats-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>'+
      '<th>#</th><th>Name</th><th>Team</th>'+
      '<th>CF</th><th>CA</th><th>CF%</th><th>FF</th><th>FA</th><th>FF%</th>'+
      '<th>SF</th><th>SA</th><th>SF%</th><th>GF</th><th>GA</th><th>GF%</th><th>PDO</th>'+
      '</tr>';
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const cfPct = pct(r.CF,r.CA); const ffPct = pct(r.FF,r.FA); const sfPct = pct(r.SF,r.SA); const gfPct = pct(r.GF,r.GA);
      const svPct = r.SA>0 ? ((r.SA - r.GA)/r.SA)*100 : (r.GA===0 ? 100 : null);
      const shPct = r.Shots>0 ? (r.Goals/r.Shots)*100 : null; // shooter perspective
      const pdo = (shPct||0) + (svPct||0);
      const tr = document.createElement('tr');
      const cells = [r.num||'', r.name, r.team,
        r.CF, r.CA, formatMetric(cfPct), r.FF, r.FA, formatMetric(ffPct),
        r.SF, r.SA, formatMetric(sfPct), r.GF, r.GA, formatMetric(gfPct), formatMetric(pdo)
      ];
      tr.innerHTML = '<td>'+cells.join('</td><td>')+'</td>';
      tbody.appendChild(tr);
    }
    tbl.appendChild(thead); tbl.appendChild(tbody);
    applyTableEnhancements(tbl, { highlightAdvanced:true });
    skatersOnTableWrap.innerHTML=''; skatersOnTableWrap.appendChild(tbl);
  }

  function renderGoaliesTable() {
    if (!goaliesTableWrap) return;
    const all = getShots();
    const filtered = applyFilters(all);
    const { home: homeName, away: awayName } = getTeamNames();
    const { home: homeRoster, away: awayRoster } = getRosters();
    const teamNameBySide = (side)=> side==='Home' ? (homeName||'Home') : (awayName||'Away');
    const nameFromRoster = (side, num)=>{
      const r = (side==='Home'? homeRoster:awayRoster).find(x => (x?.num||'').trim()===String(num).trim());
      return r?.name || '';
    };
    const map = new Map();
    const get = (side, num)=>{
      const key = side+'|'+String(num||'').trim();
      if (!map.has(key)) map.set(key, { side, num: String(num||'').trim(), name: nameFromRoster(side,num)||'', team: teamNameBySide(side), gp: new Set(), SA:0, GA:0 });
      return map.get(key);
    };
    for (const s of filtered) {
      if (!(s.event==='Shot' || s.event==='Goal')) continue;
      const sideAct = s.teamSide || 'Home';
      const sideGoalie = sideAct==='Home' ? 'Away' : 'Home';
      const num = (s.gNo||'').toString().trim(); if (!num) continue;
      const g = get(sideGoalie, num);
      g.SA += 1; if (s.event==='Goal') g.GA += 1; const gk = getGameKey(s); if (gk) g.gp.add(gk);
      if (!g.name && s.goalieName) g.name = s.goalieName;
    }
    const rows = Array.from(map.values()).filter(r=>r.num).sort((a,b)=>{
      if (a.side!==b.side) return a.side==='Home' ? -1 : 1;
      const na = parseInt(a.num,10), nb = parseInt(b.num,10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na-nb; return String(a.num).localeCompare(String(b.num));
    });
    const tbl = document.createElement('table'); tbl.className='stats-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>#</th><th>Name</th><th>Team</th><th>GP</th><th>SA</th><th>GA</th><th>Sv%</th></tr>';
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const svPct = r.SA>0 ? ((r.SA - r.GA)/r.SA)*100 : (r.GA===0 ? 100 : null);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.num}</td><td>${r.name||''}</td><td>${r.team}</td><td>${r.gp.size}</td><td>${r.SA}</td><td>${r.GA}</td><td>${formatMetric(svPct)}</td>`;
      tbody.appendChild(tr);
    }
    tbl.appendChild(thead); tbl.appendChild(tbody);
    applyTableEnhancements(tbl);
    goaliesTableWrap.innerHTML=''; goaliesTableWrap.appendChild(tbl);
  }

  function renderTeamsTable() {
    if (!teamsTableWrap) return;
    const all = getShots();
    const filtered = applyFilters(all);
    const { home: homeName, away: awayName } = getTeamNames();
    const teams = [ { side:'Home', name: homeName||'Home' }, { side:'Away', name: awayName||'Away' } ];
    const isC = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Block' || ev==='Goal';
    const isF = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Goal';
    const isS = (ev)=> ev==='Shot' || ev==='Goal';
    const isG = (ev)=> ev==='Goal';
    const rows = teams.map(t => {
      const evFor = filtered.filter(s=> (s.teamSide||'Home')===t.side);
      const evOpp = filtered.filter(s=> (s.teamSide||'Home')!==t.side);
      const CF = evFor.filter(s=>isC(s.event)).length;
      const CA = evOpp.filter(s=>isC(s.event)).length;
      const FF = evFor.filter(s=>isF(s.event)).length;
      const FA = evOpp.filter(s=>isF(s.event)).length;
      const SF = evFor.filter(s=>isS(s.event)).length;
      const SA = evOpp.filter(s=>isS(s.event)).length;
      const GF = evFor.filter(s=>isG(s.event)).length;
      const GA = evOpp.filter(s=>isG(s.event)).length;
      const PenTaken = filtered.filter(s=>s.event==='Penalty' && (s.teamSide||'Home')===t.side).length;
      const { home: homeRoster, away: awayRoster } = getRosters();
      const isP2Team = (s)=>{
        const n = (s.p2||'').toString().trim(); if (!n) return false;
        const found = (t.side==='Home'? homeRoster:awayRoster).some(r => (r?.num||'').trim()===n);
        if (found) return true;
        if (s.event==='Penalty' && (s.teamSide||'Home') !== t.side) return true;
        return false;
      };
      const PenDrawn = filtered.filter(s=>s.event==='Penalty' && isP2Team(s)).length;
      const CF_pct = (CF+CA)>0 ? (CF/(CF+CA))*100 : null;
      const FF_pct = (FF+FA)>0 ? (FF/(FF+FA))*100 : null;
      const SF_pct = (SF+SA)>0 ? (SF/(SF+SA))*100 : null;
      const GF_pct = (GF+GA)>0 ? (GF/(GF+GA))*100 : null;
      const Sh_pct = SF>0 ? (GF/SF)*100 : null;
      const Sv_pct = SA>0 ? ((SA-GA)/SA)*100 : (GA===0 ? 100 : null);
      const PDO = (Sh_pct||0) + (Sv_pct||0);
      const gpSet = new Set(filtered.map(getGameKey).filter(Boolean));
      return { Team: t.name, GP: gpSet.size, CF, CA, CF_pct, FF, FA, FF_pct, SF, SA, SF_pct, GF, GA, GF_pct, PenTaken, PenDrawn, Sh_pct, Sv_pct, PDO };
    });
    const tbl = document.createElement('table'); tbl.className='stats-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Team</th><th>GP</th><th>CF</th><th>CA</th><th>CF%</th><th>FF</th><th>FA</th><th>FF%</th><th>SF</th><th>SA</th><th>SF%</th><th>GF</th><th>GA</th><th>GF%</th><th>PEN taken</th><th>PEN drawn</th><th>Sh%</th><th>Sv%</th><th>PDO</th></tr>';
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>'+[
        r.Team, r.GP, r.CF, r.CA, formatMetric(r.CF_pct), r.FF, r.FA, formatMetric(r.FF_pct), r.SF, r.SA, formatMetric(r.SF_pct), r.GF, r.GA, formatMetric(r.GF_pct), r.PenTaken, r.PenDrawn, formatMetric(r.Sh_pct), formatMetric(r.Sv_pct), formatMetric(r.PDO)
      ].join('</td><td>')+'</td>';
      tbody.appendChild(tr);
    }
    tbl.appendChild(thead); tbl.appendChild(tbody);
    applyTableEnhancements(tbl, { highlightAdvanced:true });
    teamsTableWrap.innerHTML=''; teamsTableWrap.appendChild(tbl);
  }

  // Add spacing and sortable headers to generated tables
  function applyTableEnhancements(tbl, opts={}) {
    if (!tbl) return;
    // More spacing between columns
    tbl.style.borderCollapse = 'separate';
    tbl.style.borderSpacing = '14px 6px';
    // Make headers clickable to sort
    const thead = tbl.querySelector('thead'); const tbody = tbl.querySelector('tbody');
    if (!thead || !tbody) return;
    const ths = Array.from(thead.querySelectorAll('th'));
    const getCellVal = (td) => {
      const txt = (td?.textContent||'').trim();
      if (!txt) return { type:'empty', value:'' };
      const pctMatch = txt.endsWith('%');
      const num = parseFloat(pctMatch ? txt.slice(0,-1) : txt);
      if (!Number.isNaN(num)) return { type: pctMatch? 'percent':'number', value: num };
      return { type:'text', value: txt.toLowerCase() };
    };
    const doSort = (colIdx, dir) => {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const keyed = rows.map(r => { const td = r.children[colIdx]; const v = getCellVal(td); return { r, v }; });
      const type = keyed.find(k=>k.v.type!=='empty')?.v.type || 'text';
      const cmp = (a,b)=>{
        const va=a.v.value, vb=b.v.value;
        if (type==='number' || type==='percent') {
          const aa = (typeof va==='number')? va : -Infinity;
          const bb = (typeof vb==='number')? vb : -Infinity;
          return dir==='asc' ? (aa-bb) : (bb-aa);
        }
        // text
        return dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      };
      keyed.sort(cmp);
      // Clear and re-append
      const frag = document.createDocumentFragment();
      keyed.forEach(k => frag.appendChild(k.r));
      tbody.innerHTML=''; tbody.appendChild(frag);
      // Mark header state
      ths.forEach((th,i)=>{ th.dataset.sort=''; if (i===colIdx) th.dataset.sort = dir; });
      // Update glyphs
      ths.forEach(th=>{
        const base = (th.textContent||'').replace(/[\s▲▼]*$/,'');
        th.textContent = base; // reset
      });
      const activeTh = ths[colIdx];
      if (activeTh) {
        const base = (activeTh.textContent||'').replace(/[\s▲▼]*$/,'');
        activeTh.textContent = base + (dir==='asc' ? ' ▲' : ' ▼');
      }
    };
    ths.forEach((th, idx)=>{
      th.style.cursor = 'pointer'; th.title = 'Click to sort';
      th.addEventListener('click', ()=>{
        const prevIdx = Number(tbl.dataset.sortCol||'-1');
        const prevDir = tbl.dataset.sortDir || '';
        let dir;
        if (prevIdx === idx) dir = prevDir === 'asc' ? 'desc' : 'asc';
        else {
          // Default: numbers/percents DESC, text ASC
          const sample = (tbody.querySelector('tr')?.children[idx]) || null;
          const t = getCellVal(sample).type;
          dir = (t==='number' || t==='percent') ? 'desc' : 'asc';
        }
        tbl.dataset.sortCol = String(idx); tbl.dataset.sortDir = dir;
        doSort(idx, dir);
      });
    });
    // Initial alignments: center all except Name and Team columns
    const headerNames = ths.map(th=> (th.textContent||'').trim().replace(/[▲▼]$/,''));
    const nameCols = new Set(['Name','Team']);
    const centerIdx = headerNames.map((h,i)=> nameCols.has(h)? -1 : i).filter(i=>i>=0);
    const applyAlign = ()=>{
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.forEach(r=>{
        centerIdx.forEach(i=>{ const td=r.children[i]; if(td) td.style.textAlign='center'; });
        headerNames.forEach((h,i)=>{ if(nameCols.has(h)){ const td=r.children[i]; if(td) td.style.textAlign='left'; }});
      });
      // Header
      ths.forEach((th,i)=>{ th.style.textAlign = nameCols.has(headerNames[i]) ? 'left':'center'; });
    };
    applyAlign();
    // Optional highlighting of CF%, FF%, SF%, GF%, PDO columns
    if (opts.highlightAdvanced) {
      // headerNames already defined
      const targets = ['CF%','FF%','SF%','GF%','PDO'];
      const idxs = headerNames.map((h,i)=> targets.includes(h)? i : -1).filter(i=>i>=0);
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const lerp = (a,b,t)=>a+(b-a)*t; const clamp01=x=>Math.max(0,Math.min(1,x));
      const colorScalePct = (p)=>{ const r0=[255,60,60], r1=[255,255,255], r2=[30,144,255]; if(p<=50){const t=clamp01((p-30)/20);return [Math.round(lerp(r0[0],r1[0],t)),Math.round(lerp(r0[1],r1[1],t)),Math.round(lerp(r0[2],r1[2],t))];} const t=clamp01((p-50)/20);return [Math.round(lerp(r1[0],r2[0],t)),Math.round(lerp(r1[1],r2[1],t)),Math.round(lerp(r1[2],r2[2],t))]; };
      const colorScalePDO = (v)=>{ const r0=[255,60,60], r1=[255,255,255], r2=[30,144,255]; if(v<=100){const t=clamp01((v-90)/10);return [Math.round(lerp(r0[0],r1[0],t)),Math.round(lerp(r0[1],r1[1],t)),Math.round(lerp(r0[2],r1[2],t))];} const t=clamp01((v-100)/10);return [Math.round(lerp(r1[0],r2[0],t)),Math.round(lerp(r1[1],r2[1],t)),Math.round(lerp(r1[2],r2[2],t))]; };
      rows.forEach(r=>{
        idxs.forEach(i=>{
          const td = r.children[i]; if (!td) return; const raw=(td.textContent||'').trim(); if(!raw) return;
          let val = parseFloat(raw.replace('%',''));
          if (Number.isNaN(val)) return;
            let rgb;
            if (headerNames[i]==='PDO') rgb = colorScalePDO(val);
            else rgb = colorScalePct(val); // percentages
            td.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            td.style.color = '#000'; td.style.borderRadius='6px';
        });
      });
    }
  }

  function renderActiveTableTab() {
    if (panelTblSkatersInd && panelTblSkatersInd.classList.contains('active')) renderSkatersIndividualTable();
    else if (panelTblSkatersOn && panelTblSkatersOn.classList.contains('active')) renderSkatersOnFieldTable();
    else if (panelTblGoalies && panelTblGoalies.classList.contains('active')) renderGoaliesTable();
    else if (panelTblTeams && panelTblTeams.classList.contains('active')) renderTeamsTable();
  }

  // Ensure Video tab has a player element if not present
  function ensureVideoPlayer() {
    const videoPanel = document.getElementById('panelVideo');
    if (!videoPanel) return;
    let vid = document.getElementById('gameVideo');
    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'gameVideo';
      vid.controls = true;
      vid.style.width = '100%';
      vid.style.maxHeight = '60vh';
      videoPanel.appendChild(vid);
    }
  }

  // Playback helpers
  function playByIndex(index) {
    if (!lastTableRows.length) return;
    if (index < 0) index = 0;
    if (index >= lastTableRows.length) index = lastTableRows.length - 1;
    const { row, data } = lastTableRows[index];
    // Simulate a click to reuse logic
    row.click();
    // Ensure visibility
    row.scrollIntoView({ block: 'nearest' });
  }
  function playPrev() { if (currentRowIndex <= 0) playByIndex(0); else playByIndex(currentRowIndex - 1); }
  function playNext() { if (currentRowIndex < 0) playByIndex(0); else playByIndex(currentRowIndex + 1); }
  function togglePlayPause() { if (!videoEl) return; if (videoEl.paused) videoEl.play().catch(()=>{}); else videoEl.pause(); }
  const rates = [0.5, 1, 2, 4];
  function bumpRate(delta) {
    if (!videoEl) return;
    const cur = videoEl.playbackRate || 1;
    let idx = rates.indexOf(cur);
    if (idx === -1) idx = rates.indexOf(1);
    idx = Math.min(rates.length-1, Math.max(0, idx + delta));
    videoEl.playbackRate = rates[idx];
  }

  // Shot Map
  function drawShotMap() {
    const w = shotCanvas.clientWidth, h = shotCanvas.clientHeight;
    const gutter = currentGutterPx(shotCanvas);
    drawRink(shotCtx, w, h, gutter);
    const teamSide = teamSel.value || 'Home';
    const allShots = getShots();
  const orientScope = applyOrientationScope(allShots);
  const signMap = buildSignMap(orientScope.length ? orientScope : allShots, teamSide);
    const filtered = applyFilters(allShots);
    const adj = computeAdj(filtered, teamSide, signMap, true);
    const adjOpp = computeAdj(filtered, teamSide, signMap, false);

    const rect = shotCanvas.getBoundingClientRect();
    const pxPerM = rect.width / RINK_W_M;
    const radius = Math.max(4, Math.min(8, pxPerM * 0.2));
    shotCtx.lineWidth = 2;
    const names = getTeamNames();
    const colSelf = teamSide==='Away' ? (names.awayColor||'#66ccff') : (names.homeColor||'#ffcc66');
    const colOpp = teamSide==='Away' ? (names.homeColor||'#ffcc66') : (names.awayColor||'#66ccff');
    const parseCol = (c)=>{ let r=255,g=204,b=102; if(/^#?[0-9a-fA-F]{6}$/.test(c||'')){const h=(c||'').replace('#','');r=parseInt(h.slice(0,2),16);g=parseInt(h.slice(2,4),16);b=parseInt(h.slice(4,6),16);} return {r,g,b}; };
    const selfRGB = parseCol(colSelf), oppRGB = parseCol(colOpp);
    const eventShapes = { Goal:'star', Shot:'circle', Miss:'triangle', Block:'square', Penalty:'diamond' };
    // Legend
    if (eventLegend) {
      eventLegend.innerHTML='';
      for (const label of ['Goal','Shot','Miss','Block','Penalty']) {
        const item=document.createElement('div'); item.className='legend-item';
        const mini=document.createElement('canvas'); mini.width=mini.height=18; const mctx=mini.getContext('2d'); mctx.translate(9,9); mctx.lineWidth=2; mctx.strokeStyle='#e6e8ee';
        drawShape(mctx, eventShapes[label]||'circle', 6);
        const sw=document.createElement('span'); sw.className='legend-swatch'; sw.style.border='none'; sw.style.background='transparent'; sw.style.width='18px'; sw.style.height='18px'; sw.appendChild(mini);
        const lbl=document.createElement('span'); lbl.className='legend-label'; lbl.textContent=label;
        item.appendChild(sw); item.appendChild(lbl); eventLegend.appendChild(item);
      }
    }
    function drawShape(g, shape, r) {
      if (shape==='circle'){ g.beginPath(); g.arc(0,0,r,0,Math.PI*2); g.stroke(); return; }
      if (shape==='square'){ const rr=r*0.8; g.beginPath(); g.rect(-rr,-rr,2*rr,2*rr); g.stroke(); return; }
      if (shape==='triangle'){ g.beginPath(); g.moveTo(0,-r); g.lineTo(r,r); g.lineTo(-r,r); g.closePath(); g.stroke(); return; }
      if (shape==='diamond'){ g.beginPath(); g.moveTo(0,-r); g.lineTo(r,0); g.lineTo(0,r); g.lineTo(-r,0); g.closePath(); g.stroke(); return; }
      if (shape==='star'){ g.beginPath(); for(let i=0;i<10;i++){ const a=(i*36-90)*Math.PI/180; const rr=(i%2? r*0.5 : r); const x=Math.cos(a)*rr, y=Math.sin(a)*rr; i? g.lineTo(x,y): g.moveTo(x,y);} g.closePath(); g.stroke(); return; }
      g.beginPath(); g.arc(0,0,r,0,Math.PI*2); g.stroke();
    }
  const drawSet = (arr, rgb) => { for (const s of arr){ const {xPx,yPx}=metersToClient(s.adjX,s.adjY,shotCanvas,gutter); shotCtx.save(); shotCtx.translate(xPx,yPx); shotCtx.strokeStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},0.95)`; drawShape(shotCtx, eventShapes[s.event]||'circle', radius); shotCtx.restore(); } };
    drawSet(adj, selfRGB); drawSet(adjOpp, oppRGB);

    // KPIs for Shot Map
    renderKpis('shotKpis', filtered, teamSide);
  }

  // Heat Map (Counts/Differentials/Zones)
  // ----- Zones (polygons) helpers -----
  function drawZonesGridLines(ctx, canvasRef, gutterPx) {
    const segs = [
      [[-16.5,-10],[-16.5,10]], [[-12.5,-10],[-12.5,10]], [[-8.5,-10],[-8.5,10]], [[-4.5,-10],[-4.5,10]],
      [[0,-10],[0,10]], [[4.5,-10],[4.5,10]], [[8.5,-10],[8.5,10]], [[12.5,-10],[12.5,10]], [[16.5,-10],[16.5,10]],
      [[-16.5,1.5],[0,5.62]], [[-16.5,-1.5],[0,-5.62]], [[16.5,1.5],[0,5.62]], [[16.5,-1.5],[0,-5.62]],
      [[-16.5,5],[-4.5,8]], [[-16.5,-5],[-4.5,-8]], [[16.5,5],[4.5,8]], [[16.5,-5],[4.5,-8]],
      [[-12.5,0],[12.5,0]], [[-13,10],[13,10]], [[-13,-10],[13,-10]], [[-20,7],[-20,-7]], [[20,7],[20,-7]],
      [[-20,7],[-17,10]], [[-20,-7],[-17,-10]], [[20,7],[17,10]], [[20,-7],[17,-10]],
    ];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    const EPS = 1e-6;
    for (const [[x1,y1],[x2,y2]] of segs) {
      const crossesCenter = (x1 < 0 && x2 > 0) || (x1 > 0 && x2 < 0) || (x1 === 0 && x2 !== 0) || (x2 === 0 && x1 !== 0);
      if (!crossesCenter) {
        const px1 = xMetersToPx(x1, canvasRef, gutterPx);
        const py1 = yMetersToPx(y1, canvasRef);
        const px2 = xMetersToPx(x2, canvasRef, gutterPx);
        const py2 = yMetersToPx(y2, canvasRef);
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      } else {
        // Find intersection with x=0
        let xa = x1, ya = y1, xb = x2, yb = y2;
        // Parametric t where x=0 between points
        const denom = (xb - xa);
        if (Math.abs(denom) < 1e-12) {
          // Vertical at x=0: draw two epsilon-shifted tiny lines to each side
          const pxL = xMetersToPx(-EPS, canvasRef, gutterPx);
          const pxR = xMetersToPx(+EPS, canvasRef, gutterPx);
          const pyA = yMetersToPx(ya, canvasRef);
          const pyB = yMetersToPx(yb, canvasRef);
          ctx.beginPath(); ctx.moveTo(pxL, pyA); ctx.lineTo(pxL, pyB); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(pxR, pyA); ctx.lineTo(pxR, pyB); ctx.stroke();
          continue;
        }
        const t = (0 - xa) / denom;
        const y0 = ya + t * (yb - ya);
        // Left segment (negative x side)
        if (xa < 0 || xb < 0) {
          const [xL1,yL1] = xa < 0 ? [xa, ya] : [ -EPS, y0 ];
          const [xL2,yL2] = xa < 0 ? [ -EPS, y0 ] : [xb, yb];
          const px1 = xMetersToPx(xL1, canvasRef, gutterPx);
          const py1 = yMetersToPx(yL1, canvasRef);
          const px2 = xMetersToPx(xL2, canvasRef, gutterPx);
          const py2 = yMetersToPx(yL2, canvasRef);
          ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
        }
        // Right segment (positive x side)
        if (xa > 0 || xb > 0) {
          const [xR1,yR1] = xa > 0 ? [xa, ya] : [ +EPS, y0 ];
          const [xR2,yR2] = xa > 0 ? [ +EPS, y0 ] : [xb, yb];
          const px1 = xMetersToPx(xR1, canvasRef, gutterPx);
          const py1 = yMetersToPx(yR1, canvasRef);
          const px2 = xMetersToPx(xR2, canvasRef, gutterPx);
          const py2 = yMetersToPx(yR2, canvasRef);
          ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Rounded boundary curves (quarter arcs), radius 3 m at centers (±17, ±7)
    const arc = (cx, cy, r, startDeg, endDeg) => {
      const cpx = xMetersToPx(cx, canvasRef, gutterPx);
      const cpy = yMetersToPx(cy, canvasRef);
      const rpx = Math.abs(xMetersToPx(cx + r, canvasRef, gutterPx) - cpx);
      ctx.beginPath();
      ctx.arc(cpx, cpy, rpx, (startDeg*Math.PI)/180, (endDeg*Math.PI)/180, startDeg > endDeg);
      ctx.stroke();
    };
    ctx.save();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    // Top-left: (-20,7) -> (-17,10) around center (-17,7)
    arc(-17, 7, 3, 180, 90);
    // Bottom-left: (-17,-10) -> (-20,-7) around center (-17,-7)
    arc(-17, -7, 3, -90, 180);
    // Top-right: (17,10) -> (20,7) around center (17,7)
    arc(17, 7, 3, 90, 0);
    // Bottom-right: (20,-7) -> (17,-10) around center (17,-7)
    arc(17, -7, 3, 0, -90);
    ctx.restore();
  }
  let zonesPolyGeo = null; let zonesPolyLoadStarted = false;
  function ensureZonesPolygonsLoaded() {
    if (zonesPolyGeo || zonesPolyLoadStarted) return;
    zonesPolyLoadStarted = true;
    // Prefer external file (so edits to floorball_zones.geojson take effect), fallback to inline for file://
    const tryInline = ()=>{
      try {
        const inline = document.getElementById('zonesInline');
        if (inline && inline.textContent && inline.textContent.trim().startsWith('{')) {
          zonesPolyGeo = JSON.parse(inline.textContent);
          try { console.info('Zones: using inline embedded GeoJSON (zonesInline).'); } catch {}
          redrawVisible();
          return true;
        }
      } catch {}
      return false;
    };
    const url = 'floorball_zones.geojson?ts=' + Date.now();
    try {
      fetch(url, { cache: 'no-cache' })
        .then(r=> r.ok ? r.json() : Promise.reject(new Error('zones geojson fetch failed')))
        .then(d=>{ zonesPolyGeo = d; try { console.info('Zones: loaded from floorball_zones.geojson'); } catch {} redrawVisible(); })
        .catch((err)=>{ try { console.warn('Zones: failed to fetch floorball_zones.geojson, falling back to inline if present.', err); } catch {} if (!tryInline()) { zonesPolyLoadStarted = false; } });
    } catch {
      if (!tryInline()) { zonesPolyLoadStarted = false; }
    }
  }

  // Build zone pairs map for hit-testing and filtering
  function buildZonePairs() {
    if (!zonesPolyGeo || !Array.isArray(zonesPolyGeo.features)) { zonePairs = null; return; }
    const pairs = Array.from({ length: 22 }, ()=>({ O: [], D: [] }));
    for (const f of zonesPolyGeo.features) {
      const id = (f.properties && (f.properties.id || f.properties.zone || f.properties.name)) || '';
      if (!id || typeof id !== 'string' || id.length < 2) continue;
      const sideChar = id[0].toUpperCase();
      const idxNum = parseInt(id.slice(1), 10);
      if (!Number.isInteger(idxNum) || idxNum < 1 || idxNum > 22) continue;
      if (!f.geometry || f.geometry.type !== 'Polygon') continue;
      const rings = f.geometry.coordinates || [];
      if (!Array.isArray(rings) || !rings.length) continue;
      if (sideChar === 'O') pairs[idxNum-1].O.push(...rings);
      else if (sideChar === 'D') pairs[idxNum-1].D.push(...rings);
    }
    zonePairs = pairs;
  }
  // Clip polygon with half-plane a*x + b*y <= c
  function clipWithHalfPlane(poly, a, b, c) {
    if (!poly || poly.length === 0) return [];
    const inside = (p) => (a * p[0] + b * p[1]) <= c + 1e-9;
    const intersect = (p, q) => {
      const ax = p[0], ay = p[1], bx = q[0], by = q[1];
      const dx = bx - ax, dy = by - ay;
      const den = a * dx + b * dy;
      if (Math.abs(den) < 1e-12) return q; // parallel; return endpoint to avoid NaN
      const t = (c - a * ax - b * ay) / den;
      return [ax + t * dx, ay + t * dy];
    };
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);
      if (currIn) {
        if (!prevIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect(prev, curr));
      }
    }
    return out;
  }
  function clipWithAll(poly, planes) {
    let out = poly;
    for (const [a,b,c] of planes) {
      out = clipWithHalfPlane(out, a, b, c);
      if (out.length < 3) return [];
    }
    return out;
  }
  function polygonArea(poly) {
    let a = 0;
    for (let i=0;i<poly.length;i++){ const [x1,y1]=poly[i]; const [x2,y2]=poly[(i+1)%poly.length]; a += x1*y2 - x2*y1; }
    return 0.5*a;
  }
  function polygonCentroid(poly) {
    let A = 0, cx = 0, cy = 0;
    for (let i=0;i<poly.length;i++){
      const [x1,y1]=poly[i]; const [x2,y2]=poly[(i+1)%poly.length]; const f = x1*y2 - x2*y1; A += f; cx += (x1+x2)*f; cy += (y1+y2)*f;
    }
    A *= 0.5; if (Math.abs(A) < 1e-9) return [poly[0][0], poly[0][1]];
    return [cx/(6*A), cy/(6*A)];
  }
  // Build a rounded-rectangle rink boundary polygon (meters) with dense arc points
  function buildRinkBoundary(radius=3, w=40, h=20, arcPtsPerCorner=64) {
    const hw = w/2, hh = h/2, r = radius;
    const pts = [];
    // Top edge (left to right): from (-hw+r, hh) to (hw-r, hh)
    pts.push([-hw + r, hh]);
    // Top-right arc: center (hw-r, hh-r), angles 90->0 deg
    const arc = (cx, cy, startDeg, endDeg) => {
      const dir = endDeg < startDeg ? -1 : 1;
      const steps = Math.max(arcPtsPerCorner, 8);
      for (let i=1;i<=steps;i++){
        const t = i/steps; const ang = (startDeg + dir * t * (endDeg - startDeg)) * Math.PI/180;
        pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
      }
    };
    arc(hw - r, hh - r, 90, 0);
    // Right edge: (hw, hh-r) to (hw, -hh+r)
    pts.push([hw, hh - r], [hw, -hh + r]);
    // Bottom-right arc: center (hw-r, -hh+r), angles 0->-90 deg
    arc(hw - r, -hh + r, 0, -90);
    // Bottom edge: (hw-r, -hh) to (-hw+r, -hh)
    pts.push([hw - r, -hh], [-hw + r, -hh]);
    // Bottom-left arc: center (-hw+r, -hh+r), angles -90->-180
    arc(-hw + r, -hh + r, -90, -180);
    // Left edge: (-hw, -hh+r) to (-hw, hh-r)
    pts.push([-hw, -hh + r], [-hw, hh - r]);
    // Top-left arc: center (-hw+r, hh-r), angles 180->90
    arc(-hw + r, hh - r, 180, 90);
    // Close to starting straight already continuous
    return pts;
  }
  function generateZonesPolygons() {
    const rinkPoly = buildRinkBoundary(3, 40, 20, 192); // extra-dense arcs for smoother corners
    const edges = [0, 4.5, 8.5, 12.5, 16.5, 20];
    const m = 0.25;
    const makePlanes = (S, colL, colR, band) => {
      const planes = [];
      // Column: S*x between [colL, colR] -> left: -S*x <= -colL, right: S*x <= colR
      planes.push([-S, 0, -colL]);
      planes.push([ S, 0,  colR]);
      if (band.top) planes.push([0, -1, 0]); // y >= 0 -> -y <= 0
      if (band.bottom) planes.push([0,  1, 0]); // y <= 0 -> y <= 0
      // Diagonal bands (move away from center)
      // Top family: y =  m*S*x + b
      if (band.tLowerB !== undefined) planes.push([  m*S, -1, -band.tLowerB ]);
      if (band.tUpperB !== undefined) planes.push([ -m*S,  1,  band.tUpperB ]);
      // Bottom family: y = -m*S*x + b
      if (band.bLowerB !== undefined) planes.push([ -m*S, -1, -band.bLowerB ]);
      if (band.bUpperB !== undefined) planes.push([  m*S,  1,  band.bUpperB ]);
      return planes;
    };
    const bands = [
      { key: 'T3', top: true, tLowerB: 5 },
      { key: 'T2', top: true, tLowerB: 0, tUpperB: 5 },
      { key: 'T1', top: true, tLowerB: -5, tUpperB: 0 },
      { key: 'B1', bottom: true, bLowerB: 0 }, // between diag(b=0) and y=0 implicitly via bottom:true, bUpper via y<=0
      { key: 'B2', bottom: true, bLowerB: -5, bUpperB: 0 },
      { key: 'B3', bottom: true, bUpperB: -5 }, // below diag(b=-5)
    ];
    const sides = [ {S:1, side:'O'}, {S:-1, side:'D'} ];
    const all = [];
    for (const {S, side} of sides) {
      for (let ci=0; ci<edges.length-1; ci++) {
        const L = edges[ci], R = edges[ci+1];
        for (const band of bands) {
          const planes = makePlanes(S, L, R, band);
          const poly = clipWithAll(rinkPoly, planes);
          if (poly.length >= 3 && Math.abs(polygonArea(poly)) > 1e-3) {
            const c = polygonCentroid(poly);
            all.push({ side, S, col: ci, band: band.key, poly, centroid: c });
          }
        }
      }
    }
    // Build explicit behind-net polygon per side using only column+boundary (no diagonal bands)
    const result = { O: [], D: [] };
    for (const {S, side} of sides) {
  // planes: S*x in [16.5, 20]; include corner arcs
  const planesBehind = [ [-S, 0, -16.5], [ S, 0, 20] ];
      const behind = clipWithAll(rinkPoly, planesBehind);
      if (behind.length >= 3) {
        const cz = polygonCentroid(behind);
        result[side].push({ side, S, col: 4, band: 'BEHIND', poly: behind, centroid: cz, label: side + '01' });
      }
      // Remaining candidates from computed grid, excluding col 4
      const items = all.filter(z=>z.side===side && z.col!==4);
      // Sort deterministic: deeper column first (col 3 -> 0), band order and |y|
      const bandOrder = {T3:0,T2:1,T1:2,B1:3,B2:4,B3:5};
      items.sort((a,b)=> (b.col - a.col) || (bandOrder[a.band]-bandOrder[b.band]) || (Math.abs(a.centroid[1]) - Math.abs(b.centroid[1])) );
      let n = 2;
      for (const it of items) {
        if (result[side].length >= 22) break;
        it.label = side + String(n).padStart(2,'0'); n++;
        result[side].push(it);
      }
      // Ensure exactly 22
      if (result[side].length > 22) result[side] = result[side].slice(0,22);
    }
    return result;
  }
  function drawZonesPolygons(ctx, canvasRef, gutterPx, featureAgg) {
    // Only render from the authoritative GeoJSON; no procedural fallback
    ensureZonesPolygonsLoaded();
    if (zonesPolyGeo && Array.isArray(zonesPolyGeo.features)) {
      if (!zonePairs) buildZonePairs();
      ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      const toPxSide = (side, x, y)=>[ xMetersToPxSide(x, canvasRef, gutterPx, side==='D'?'left':'right'), yMetersToPx(y, canvasRef) ];
      const isSelected = (id)=>{
        if (selectedZoneIndex == null) return false;
        if (!id) return false;
        const idx = parseInt(String(id).slice(1), 10);
        return idx === selectedZoneIndex;
      };
      // Determine min/max for color scaling from featureAgg
      let vMin = Infinity, vMax = -Infinity;
      if (featureAgg && Array.isArray(featureAgg.values)) {
        for (const v of featureAgg.values){ if (v==null || Number.isNaN(v)) continue; if (v<vMin) vMin=v; if (v>vMax) vMax=v; }
        if (!Number.isFinite(vMin)) vMin = 0; if (!Number.isFinite(vMax)) vMax = 0;
      } else { vMin = vMax = 0; }
      const norm = (v)=>{
        if (!Number.isFinite(v)) return 0;
        if (vMax===vMin) return vMax!==0 ? 1 : 0;
        return Math.max(0, Math.min(1, (v - vMin)/(vMax - vMin)));
      };
      // Color scale (all metrics use red scale per request)
      const colorFor = (val)=>{
        const t = norm(val);
        const r = 255; const g = Math.round(120 - 60*t); const b = Math.round(120 - 60*t); const a = 0.18 + 0.54*t;
        return `rgba(${r},${g},${b},${a})`;
      };
      for (let fi=0; fi<zonesPolyGeo.features.length; fi++) {
        const f = zonesPolyGeo.features[fi];
        const id = (f.properties && (f.properties.id || f.properties.zone || f.properties.name)) || '';
        let side = (f.properties && f.properties.side) || '';
        if (!side && typeof id === 'string' && id.length) {
          side = id[0] === 'D' ? 'D' : (id[0] === 'O' ? 'O' : '');
        }
        if (!side) side = 'O';
        if (!f.geometry || f.geometry.type !== 'Polygon') continue;
        const rings = f.geometry.coordinates || [];
        const sel = isSelected(id);
        const val = (featureAgg && Array.isArray(featureAgg.values)) ? featureAgg.values[fi] : null;
        const baseFill = colorFor(val);
        const fill = sel ? baseFill.replace(/,0\.(\d+)\)/,',0.85)') : baseFill;
        const stroke = sel ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.35)';
        ctx.strokeStyle = stroke;
        for (const ring of rings) {
          if (!Array.isArray(ring) || ring.length < 3) continue;
          ctx.beginPath();
          const [x0,y0] = toPxSide(side, ring[0][0], ring[0][1]); ctx.moveTo(x0,y0);
          for (let i=1;i<ring.length;i++){ const [xm,ym]=ring[i]; const [xp,yp]=toPxSide(side, xm, ym); ctx.lineTo(xp,yp);} ctx.closePath();
          ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
        }
        // no labels per request
        // Draw label with value at centroid
        if (featureAgg && Array.isArray(featureAgg.values)) {
          const value = featureAgg.values[fi];
          if (value != null && !Number.isNaN(value) && rings.length>0) {
            // centroid in meters using outer ring (0)
            const c = polygonCentroid(rings[0]);
            const [cx, cy] = toPxSide(side, c[0], c[1]);
            const text = `${formatMetric(value)}`;
            ctx.save();
            ctx.font = '12px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#e6e8ee';
            ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
            ctx.strokeText(text, cx, cy);
            ctx.fillText(text, cx, cy);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
  }

  // Compute per-feature values for coloring (Offensive=for, Defensive=against)
  function computeZoneFeatureValues(events, metricKey, teamSide, signByKey) {
    if (!zonesPolyGeo || !Array.isArray(zonesPolyGeo.features)) return { values: [], min: 0, max: 0, labelKeys: [] };
    const feats = zonesPolyGeo.features;
    const aggs = Array.from({length: feats.length}, ()=>({ CF:0, FF:0, SF:0, GF:0 }));
    const sideOf = (f)=>{
      const id = (f.properties && (f.properties.id || f.properties.zone || f.properties.name)) || '';
      let s = (f.properties && f.properties.side) || '';
      if (!s && typeof id==='string' && id.length) s = id[0]==='D'?'D':(id[0]==='O'?'O':'');
      return s || 'O';
    };
    const ringsOf = (f)=> (f.geometry && f.geometry.type==='Polygon' && Array.isArray(f.geometry.coordinates)) ? f.geometry.coordinates : [];
    // Scan events: assign to the first feature ring that contains the point, with side-specific team filter
    for (const e of events) {
      // Adjust coordinates into team-oriented frame so Offensive zones are at x>0
      const k = (e.gameId||'') + '|' + (e.period||'1');
      const sgn = signByKey?.get(k) ?? 1;
      const x = Number(sgn>0 ? e.xM : -e.xM), y = Number(sgn>0 ? e.yM : -e.yM);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const isTeam = (e.teamSide||'Home') === teamSide;
      for (let i=0;i<feats.length;i++) {
        const f = feats[i]; const side = sideOf(f);
        // Offensive zones: only team events; Defensive zones: only opponent events
        if ((side==='O' && !isTeam) || (side==='D' && isTeam)) continue;
        const rings = ringsOf(f); if (!rings.length) continue;
        let inside = false; for (const ring of rings) { if (pointInRing(ring, x, y)) { inside = true; break; } }
        if (!inside) continue;
        const ev = e.event;
        const isC = ev==='Shot' || ev==='Miss' || ev==='Block' || ev==='Goal';
        const isF = ev==='Shot' || ev==='Miss' || ev==='Goal';
        const isS = ev==='Shot' || ev==='Goal';
        const isG = ev==='Goal';
        if (isC) aggs[i].CF += 1;
        if (isF) aggs[i].FF += 1;
        if (isS) aggs[i].SF += 1;
        if (isG) aggs[i].GF += 1;
        break; // counted into one feature only
      }
    }
    // Compute values per feature and label keys
    const values = new Array(feats.length).fill(null);
    const labelKeys = new Array(feats.length).fill('');
    const labelMap = {
      corsi:   { O: 'CF', D: 'CA' },
      fenwick: { O: 'FF', D: 'FA' },
      shots:   { O: 'SF', D: 'SA' },
      goals:   { O: 'GF', D: 'GA' },
      shpct:   { O: 'Sh%', D: 'Sh%' },
    };
    for (let i=0;i<feats.length;i++) {
      const side = sideOf(feats[i]);
      const a = aggs[i];
      if (metricKey==='corsi') values[i] = a.CF;
      else if (metricKey==='fenwick') values[i] = a.FF;
      else if (metricKey==='shots') values[i] = a.SF;
      else if (metricKey==='goals') values[i] = a.GF;
      else values[i] = a.SF>0 ? (a.GF/a.SF)*100 : null; // shpct
      labelKeys[i] = (labelMap[metricKey] || labelMap['corsi'])[side] || '';
    }
    let minV = Infinity, maxV = -Infinity; for (const v of values){ if (v==null || Number.isNaN(v)) continue; if (v<minV) minV=v; if (v>maxV) maxV=v; }
    if (!Number.isFinite(minV)) minV = 0; if (!Number.isFinite(maxV)) maxV = 0;
    return { values, min: minV, max: maxV, labelKeys };
  }

  // --- Zones hit testing and KPI filtering ---
  function pointInRing(ring, x, y) {
    // Ray casting in meters
    let inside = false; const n = ring.length;
    for (let i=0, j=n-1; i<n; j=i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi>y) !== (yj>y)) && (x < (xj - xi) * (y - yi) / ((yj - yi)||1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function pointInZoneIndex(idx, xM, yM) {
    if (!zonePairs || idx==null || idx<1 || idx>22) return false;
    const zp = zonePairs[idx-1];
    // Check both sides' rings
    for (const ring of zp.O) { if (pointInRing(ring, xM, yM)) return true; }
    for (const ring of zp.D) { if (pointInRing(ring, xM, yM)) return true; }
    return false;
  }
  function pxToMeters(canvas, gutterPx, xPx, yPx) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    let xM = null;
    if (!gutterPx || gutterPx <= 0 || gutterPx >= w*0.8) {
      xM = (xPx / w) * RINK_W_M - HALF_W;
    } else {
      const halfWpx = Math.max(0, (w - gutterPx)/2);
      if (xPx < halfWpx) {
        // left half maps to [-20..0]
        const t = xPx / halfWpx; xM = -HALF_W + t * HALF_W;
      } else if (xPx > halfWpx + gutterPx) {
        const t = (xPx - (halfWpx + gutterPx)) / halfWpx; xM = 0 + t * HALF_W;
      } else {
        // in the gutter: no mapping
        xM = null;
      }
    }
    const yM = HALF_H - (yPx / h) * RINK_H_M;
    return { xM, yM };
  }
  function drawHeat() {
    if (!heatCanvas || !heatCtx) return;
    const rectH = heatCanvas.getBoundingClientRect(); if (rectH.width===0 || rectH.height===0) return;
    const w = heatCanvas.clientWidth, h = heatCanvas.clientHeight;
    const gutter = currentGutterPx(heatCanvas);
    drawRink(heatCtx, w, h, gutter);
    const teamSide = teamSel.value || 'Home';
    const allShots = getShots();
    const orientScope = applyOrientationScope(allShots);
    const signMap = buildSignMap(orientScope.length ? orientScope : allShots, teamSide);
    const filtered = applyFilters(allShots);
    let adjFor = computeAdj(filtered, teamSide, signMap, true);
    let adjOpp = computeAdj(filtered, teamSide, signMap, false);

    const cellM = 1; // 1x1 meters
    const cellsX = Math.ceil(RINK_W_M / cellM);
    const cellsY = Math.ceil(RINK_H_M / cellM);
  const pyPerM = rectH.height / RINK_H_M;
  const ch = pyPerM * cellM;

    if (heatMode === 'zones') {
  // Prepare values for per-zone coloring based on selected metric (per feature, side-aware)
  const zoneAgg = computeZoneFeatureValues(filtered, zonesMetric, teamSide, signMap);
  // Draw authoritative zone polygons with coloring and labels
  drawZonesPolygons(heatCtx, heatCanvas, gutter, zoneAgg);
      // If zones not yet available, draw a small hint on the canvas to indicate loading/path issue
      if (!zonesPolyGeo) {
        heatCtx.save();
        heatCtx.fillStyle = 'rgba(0,0,0,0.55)';
        heatCtx.font = '13px Inter, system-ui, sans-serif';
        heatCtx.textAlign = 'center';
        heatCtx.textBaseline = 'middle';
        const cx = heatCanvas.clientWidth / 2; const cy = heatCanvas.clientHeight / 2;
        heatCtx.fillText('Zones file not loaded. Serve via http:// and ensure floorball_zones.geojson is reachable.', cx, cy);
        heatCtx.restore();
      }
      if (heatLegend) {
        const lctx = heatLegend.getContext('2d'); const wL = heatLegend.width, hL = heatLegend.height;
        const grad = lctx.createLinearGradient(0,0,wL,0);
        grad.addColorStop(0,'rgba(255,120,120,0.18)');
        grad.addColorStop(1,'rgba(255,60,60,0.72)');
        lctx.clearRect(0,0,wL,hL); lctx.fillStyle = grad; lctx.fillRect(0,0,wL,hL);
        lctx.fillStyle='#e6e8ee'; lctx.font='10px Inter, sans-serif'; lctx.textBaseline='top';
        lctx.textAlign='left'; lctx.fillText(`MIN ${formatMetric(zoneAgg.min)}`, 4, 2);
        lctx.textAlign='right'; lctx.fillText(`MAX ${formatMetric(zoneAgg.max)}`, wL-4, 2);
      }
      // KPIs filtered by selected zone pair (if any)
      let eventsForKpi = filtered;
      if (selectedZoneIndex != null && zonePairs) {
        eventsForKpi = filtered.filter(e=>{
          const x = Number(e.xM); const y = Number(e.yM);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          return pointInZoneIndex(selectedZoneIndex, x, y);
        });
      }
      renderKpis('heatKpis', eventsForKpi, teamSide);
      return;
    }

    if (heatMode === 'diff') {
      // Metric-driven differentials: For - Against per cell for selected metric
      // Mirror opponent into offensive frame so both compare in same end
      adjOpp = adjOpp.map(s => ({...s, adjX: -s.adjX, adjY: -s.adjY}));
      // Grids hold counts per metric; for shpct we need GF/SF pairs
      const gridFor = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const gridOpp = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const gfFor = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const sfFor = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const gfOpp = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const sfOpp = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
      const isC = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Block' || ev==='Goal';
      const isF = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Goal';
      const isS = (ev)=> ev==='Shot' || ev==='Goal';
      const isG = (ev)=> ev==='Goal';
      const bump = (arr,y,x,delta=1)=>{ if(y>=0&&y<cellsY&&x>=0&&x<cellsX) arr[y][x]+=delta; };
      for (const s of adjFor) {
        const x=Math.floor((s.adjX+HALF_W)/cellM), y=Math.floor((-s.adjY+HALF_H)/cellM);
        if (zonesMetric==='corsi' && isC(s.event)) bump(gridFor,y,x,1);
        else if (zonesMetric==='fenwick' && isF(s.event)) bump(gridFor,y,x,1);
        else if (zonesMetric==='shots' && isS(s.event)) { bump(gridFor,y,x,1); bump(sfFor,y,x,1); if (isG(s.event)) bump(gfFor,y,x,1); }
        else if (zonesMetric==='goals' && isG(s.event)) { bump(gridFor,y,x,1); bump(gfFor,y,x,1); bump(sfFor,y,x,1); }
        else if (zonesMetric==='shpct' && isS(s.event)) { bump(sfFor,y,x,1); if (isG(s.event)) bump(gfFor,y,x,1); }
      }
      for (const s of adjOpp) {
        const x=Math.floor((s.adjX+HALF_W)/cellM), y=Math.floor((-s.adjY+HALF_H)/cellM);
        if (zonesMetric==='corsi' && isC(s.event)) bump(gridOpp,y,x,1);
        else if (zonesMetric==='fenwick' && isF(s.event)) bump(gridOpp,y,x,1);
        else if (zonesMetric==='shots' && isS(s.event)) { bump(gridOpp,y,x,1); bump(sfOpp,y,x,1); if (isG(s.event)) bump(gfOpp,y,x,1); }
        else if (zonesMetric==='goals' && isG(s.event)) { bump(gridOpp,y,x,1); bump(gfOpp,y,x,1); bump(sfOpp,y,x,1); }
        else if (zonesMetric==='shpct' && isS(s.event)) { bump(sfOpp,y,x,1); if (isG(s.event)) bump(gfOpp,y,x,1); }
      }
  let minVal = 0, maxVal = 0;
      const cellVal = (y,x)=>{
        if (zonesMetric==='shpct') {
          const fPct = sfFor[y][x]>0 ? (gfFor[y][x]/sfFor[y][x])*100 : null;
          const oPct = sfOpp[y][x]>0 ? (gfOpp[y][x]/sfOpp[y][x])*100 : null;
          if (fPct==null && oPct==null) return null;
          const diff = (fPct||0) - (oPct||0);
          return diff;
        }
        const d = gridFor[y][x] - gridOpp[y][x];
        return d;
      };
      // Determine symmetric legend range
      for (let y=0;y<cellsY;y++) for (let x=0;x<cellsX;x++){
        const v = cellVal(y,x); if (v==null) continue; if (v<minVal) minVal=v; if (v>maxVal) maxVal=v; };
      const m = Math.max(Math.abs(minVal), Math.abs(maxVal));
      const minSym = -m, maxSym = m;
      for (let y=0;y<cellsY;y++) {
        for (let x=0;x<cellsX;x++) {
          const v = cellVal(y,x);
          // Transparent for non-events (no data or zero differential)
          if (v == null || v === 0 || m === 0) continue;
          if (v>0) {
            const t = Math.min(1, v / maxSym);
            const rr = 255, gg = Math.round(255*(1-t)), bb = Math.round(255*(1-t));
            heatCtx.fillStyle = `rgb(${rr},${gg},${bb})`;
          } else { // v < 0 -> blue side
            const t = Math.min(1, (-v) / (-minSym));
            const wb = { r: 255, g: 255, b: 255 }, bb2 = { r: 30, g: 144, b: 255 };
            const rr = Math.round(wb.r + (bb2.r - wb.r) * t);
            const gg = Math.round(wb.g + (bb2.g - wb.g) * t);
            const bb = Math.round(wb.b + (bb2.b - wb.b) * t);
            heatCtx.fillStyle = `rgb(${rr},${gg},${bb})`;
          }
          const x0M = -HALF_W + x*cellM;
          const x1M = x0M + cellM;
          const y0M = HALF_H - y*cellM;
          const y1M = y0M - cellM;
          const rectCell = cellMetersToRect(x0M, x1M, y0M, y1M, heatCanvas, gutter);
          heatCtx.fillRect(rectCell.xx, rectCell.yy, rectCell.ww, rectCell.hh);
        }
      }
      if (heatLegend) {
        const lctx = heatLegend.getContext('2d'); const wL = heatLegend.width, hL = heatLegend.height;
        const grad = lctx.createLinearGradient(0,0,wL,0);
        grad.addColorStop(0,'rgb(30,144,255)');
        grad.addColorStop(0.5,'rgb(255,255,255)');
        grad.addColorStop(1,'rgb(255,60,60)');
        lctx.clearRect(0,0,wL,hL); lctx.fillStyle = grad; lctx.fillRect(0,0,wL,hL);
        lctx.fillStyle='#e6e8ee'; lctx.font='10px Inter, sans-serif'; lctx.textBaseline='top';
        lctx.textAlign='left'; lctx.fillText(`MIN ${formatMetric(minSym)}`, 4, 2);
        lctx.textAlign='right'; lctx.fillText(`MAX ${formatMetric(maxSym)}`, wL-4, 2);
      }
      // KPIs
      renderKpis('heatKpis', filtered, teamSide);
      return;
    }

    // Counts mode
    // Metric-driven density across both teams combined
    const grid = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
    const gfTot = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
    const sfTot = Array.from({length: cellsY}, ()=>Array(cellsX).fill(0));
    const isC = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Block' || ev==='Goal';
    const isF = (ev)=> ev==='Shot' || ev==='Miss' || ev==='Goal';
    const isS = (ev)=> ev==='Shot' || ev==='Goal';
    const isG = (ev)=> ev==='Goal';
    const bump = (arr,y,x,delta=1)=>{ if(y>=0&&y<cellsY&&x>=0&&x<cellsX) arr[y][x]+=delta; };
    const visit = (arr)=>{
      for (const s of arr) {
        const x=Math.floor((s.adjX+HALF_W)/cellM), y=Math.floor((-s.adjY+HALF_H)/cellM);
        if (zonesMetric==='corsi' && isC(s.event)) bump(grid,y,x,1);
        else if (zonesMetric==='fenwick' && isF(s.event)) bump(grid,y,x,1);
        else if (zonesMetric==='shots' && isS(s.event)) { bump(grid,y,x,1); bump(sfTot,y,x,1); if (isG(s.event)) bump(gfTot,y,x,1); }
        else if (zonesMetric==='goals' && isG(s.event)) { bump(grid,y,x,1); bump(gfTot,y,x,1); bump(sfTot,y,x,1); }
        else if (zonesMetric==='shpct' && isS(s.event)) { bump(sfTot,y,x,1); if (isG(s.event)) bump(gfTot,y,x,1); }
      }
    };
    visit(adjFor); visit(adjOpp);
    let maxD = 0; let minD = Infinity;
    // For shpct, we will render percentages 0..100 and get min/max over non-null
    if (zonesMetric==='shpct') {
      let minP = Infinity, maxP = -Infinity;
      for (let y=0;y<cellsY;y++) for (let x=0;x<cellsX;x++){ const denom = sfTot[y][x]; if (denom<=0) continue; const pct = (gfTot[y][x]/denom)*100; if (pct<minP) minP=pct; if (pct>maxP) maxP=pct; }
      if (!Number.isFinite(minP)) { minP = 0; maxP = 0; }
      for (let y=0;y<cellsY;y++) {
        for (let x=0;x<cellsX;x++) {
          const denom = sfTot[y][x]; if (denom<=0) continue; const pct = (gfTot[y][x]/denom)*100;
          const t = (maxP===minP) ? 1 : (pct - minP) / (maxP - minP);
          const rr = 255, gg = Math.round(80+60*(1-t)), bb = Math.round(80+60*(1-t)); const aa = 0.15 + 0.55*t;
          heatCtx.fillStyle = `rgba(${rr},${gg},${bb},${aa})`;
          const x0M = -HALF_W + x*cellM; const x1M = x0M + cellM; const y0M = HALF_H - y*cellM; const y1M = y0M - cellM;
          const rectCell = cellMetersToRect(x0M, x1M, y0M, y1M, heatCanvas, gutter);
          heatCtx.fillRect(rectCell.xx, rectCell.yy, rectCell.ww, rectCell.hh);
        }
      }
      if (heatLegend) {
        const lctx = heatLegend.getContext('2d'); const wL = heatLegend.width, hL = heatLegend.height;
        const grad = lctx.createLinearGradient(0,0,wL,0);
        grad.addColorStop(0,'rgba(255,120,120,0.15)');
        grad.addColorStop(1,'rgba(255,60,60,0.7)');
        lctx.clearRect(0,0,wL,hL); lctx.fillStyle=grad; lctx.fillRect(0,0,wL,hL);
        lctx.fillStyle='#e6e8ee'; lctx.font='10px Inter, sans-serif'; lctx.textAlign='left'; lctx.textBaseline='top';
        lctx.fillText(`MIN ${formatMetric(minP)}`, 4, 2); lctx.textAlign='right'; lctx.fillText(`MAX ${formatMetric(maxP)}`, wL-4, 2);
      }
    } else {
      for (let y=0;y<cellsY;y++) for (let x=0;x<cellsX;x++){ const v=grid[y][x]; maxD = Math.max(maxD, v); if (v>0) minD = Math.min(minD, v); }
      if (!Number.isFinite(minD)) minD = 0;
      for (let y=0;y<cellsY;y++) {
        for (let x=0;x<cellsX;x++) {
          const d = grid[y][x]; if (d<=0) continue; const t = maxD>0 ? d/maxD : 0;
          const rr = 255, gg = Math.round(80+60*(1-t)), bb = Math.round(80+60*(1-t)); const aa = 0.15 + 0.55*t;
          heatCtx.fillStyle = `rgba(${rr},${gg},${bb},${aa})`;
          const x0M = -HALF_W + x*cellM; const x1M = x0M + cellM; const y0M = HALF_H - y*cellM; const y1M = y0M - cellM;
          const rectCell = cellMetersToRect(x0M, x1M, y0M, y1M, heatCanvas, gutter);
          heatCtx.fillRect(rectCell.xx, rectCell.yy, rectCell.ww, rectCell.hh);
        }
      }
      if (heatLegend) {
        const lctx = heatLegend.getContext('2d'); const wL = heatLegend.width, hL = heatLegend.height;
        const grad = lctx.createLinearGradient(0,0,wL,0);
        grad.addColorStop(0,'rgba(255,120,120,0.15)');
        grad.addColorStop(1,'rgba(255,60,60,0.7)');
        lctx.clearRect(0,0,wL,hL); lctx.fillStyle=grad; lctx.fillRect(0,0,wL,hL);
        lctx.fillStyle = '#e6e8ee'; lctx.font = '10px Inter, sans-serif'; lctx.textAlign = 'left'; lctx.textBaseline = 'top';
        lctx.fillText(`MIN ${minD}`, 4, 2); lctx.textAlign = 'right'; lctx.fillText(`MAX ${maxD}`, wL-4, 2);
      }
    }
    // KPIs for counts
    renderKpis('heatKpis', filtered, teamSide);
  }

  // --- KPI rendering ---
  function renderKpis(containerId, events, teamSide) {
    const host = document.getElementById(containerId);
    if (!host) return;
    // build metrics
    const metrics = computeMetrics(events, teamSide);
    host.innerHTML = '';
    const stack = document.createElement('div'); stack.className = 'kpi-stack';
    const lerp = (a,b,t)=>a+(b-a)*t;
    const clamp01 = (x)=>Math.max(0,Math.min(1,x));
    function colorScalePct(p) { // p in 0..1 for CF% etc, mid at 0.5; red->white->blue
      const r0=[255,60,60], r1=[255,255,255], r2=[30,144,255];
      if (p<=0.5){ const t=clamp01((p-0.3)/(0.2)); const tt=isFinite(t)?t:0; return [Math.round(lerp(r0[0],r1[0],tt)),Math.round(lerp(r0[1],r1[1],tt)),Math.round(lerp(r0[2],r1[2],tt))]; }
      else { const t=clamp01((p-0.5)/(0.2)); const tt=isFinite(t)?t:0; return [Math.round(lerp(r1[0],r2[0],tt)),Math.round(lerp(r1[1],r2[1],tt)),Math.round(lerp(r1[2],r2[2],tt))]; }
    }
    function colorScalePDO(v) { // v around 100 (90 -> red, 100 -> white, 110 -> blue)
      const r0=[255,60,60], r1=[255,255,255], r2=[30,144,255];
      if (v<=100){ const t=clamp01((v-90)/10); const tt=isFinite(t)?t:0; return [Math.round(lerp(r0[0],r1[0],tt)),Math.round(lerp(r0[1],r1[1],tt)),Math.round(lerp(r0[2],r1[2],tt))]; }
      else { const t=clamp01((v-100)/10); const tt=isFinite(t)?t:0; return [Math.round(lerp(r1[0],r2[0],tt)),Math.round(lerp(r1[1],r2[1],tt)),Math.round(lerp(r1[2],r2[2],tt))]; }
    }
    function styleHighlight(name, value) {
      // Apply gradient background and black text for specific metrics
      let bg = null; let txt = '#000';
      if (['CF%','FF%','SF%','GF%'].includes(name)) {
        const p = typeof value==='number' ? (value/100) : null; // convert percent to 0..1
        if (p!=null) {
          const c = colorScalePct(p); bg = `rgb(${c[0]},${c[1]},${c[2]})`;
        }
      } else if (name==='PDO') {
        const v = typeof value==='number' ? value : null; // PDO around 100
        if (v!=null) { const c = colorScalePDO(v); bg = `rgb(${c[0]},${c[1]},${c[2]})`; }
      }
      return { bg, txt };
    }
    const makeCard = (titleText, entries) => {
      const card = document.createElement('div'); card.className = 'kpi-card';
      const title = document.createElement('div'); title.className='kpi-title'; title.textContent = titleText;
      const row = document.createElement('div'); row.className='kpi-row';
      for (const [name, value] of entries) {
        const item = document.createElement('div'); item.className='kpi-item';
        const nm = document.createElement('div'); nm.className='kpi-name'; nm.textContent = name;
        const val = document.createElement('div'); val.className='kpi-value'; val.textContent = formatMetric(value);
        const hl = styleHighlight(name, value);
        if (hl.bg) { val.style.background = hl.bg; val.style.color = hl.txt; val.style.borderRadius = '6px'; }
        item.appendChild(nm); item.appendChild(val); row.appendChild(item);
      }
      card.appendChild(title); card.appendChild(row);
      return card;
    };
    // Five grouped cards of threes each
    stack.appendChild(makeCard('Corsi', [ ['CA', metrics.CA], ['CF%', metrics.CF_pct], ['CF', metrics.CF] ]));
    stack.appendChild(makeCard('Fenwick', [ ['FA', metrics.FA], ['FF%', metrics.FF_pct], ['FF', metrics.FF] ]));
    stack.appendChild(makeCard('Shots', [ ['SA', metrics.SA], ['SF%', metrics.SF_pct], ['SF', metrics.SF] ]));
    stack.appendChild(makeCard('Goals', [ ['GA', metrics.GA], ['GF%', metrics.GF_pct], ['GF', metrics.GF] ]));
  stack.appendChild(makeCard('Shooting / Goaltending', [ ['Sv%', metrics.Sv_pct], ['PDO', metrics.PDO], ['Sh%', metrics.Sh_pct] ]));
    host.appendChild(stack);
  }

  function formatMetric(v) {
    if (v == null || Number.isNaN(v)) return '—';
    if (typeof v === 'number' && Math.abs(v) < 1 && v !== 0) return v.toFixed(3);
    if (typeof v === 'number' && Math.abs(v) >= 1000) return Math.round(v).toString();
    if (typeof v === 'number' && Number.isInteger(v)) return String(v);
    if (typeof v === 'number') return v.toFixed(1);
    return String(v);
  }

  function computeMetrics(events, teamSide) {
    // Team events vs Opponent events based on teamSide
    const isTeam = (s)=> (s.teamSide||'Home') === teamSide;
    const isOpp = (s)=> !isTeam(s);
    const isCorsi = (s)=> ['Shot','Miss','Block','Goal'].includes(s.event);
    const isFenwick = (s)=> ['Shot','Miss','Goal'].includes(s.event);
    const isShot = (s)=> ['Shot','Goal'].includes(s.event);
    const isGoal = (s)=> s.event === 'Goal';

    // Raw counts
    const CF = events.filter(s=>isTeam(s) && isCorsi(s)).length;
    const CA = events.filter(s=>isOpp(s) && isCorsi(s)).length;
    const FF = events.filter(s=>isTeam(s) && isFenwick(s)).length;
    const FA = events.filter(s=>isOpp(s) && isFenwick(s)).length;
    const SF = events.filter(s=>isTeam(s) && isShot(s)).length;
    const SA = events.filter(s=>isOpp(s) && isShot(s)).length;
    const GF = events.filter(s=>isTeam(s) && isGoal(s)).length;
    const GA = events.filter(s=>isOpp(s) && isGoal(s)).length;

    // Rates/percentages
    const CF_pct = (CF + CA) > 0 ? (CF / (CF + CA)) * 100 : null;
    const FF_pct = (FF + FA) > 0 ? (FF / (FF + FA)) * 100 : null;
    const SF_pct = (SF + SA) > 0 ? (SF / (SF + SA)) * 100 : null;
    const GF_pct = (GF + GA) > 0 ? (GF / (GF + GA)) * 100 : null;
    const Sh_pct = SF > 0 ? (GF / SF) * 100 : null;
    // Save pct requires shots against (opponent shots on target). We'll consider SA as shots against on net (approx).
    const Sv_pct = SA > 0 ? ((SA - GA) / SA) * 100 : (GA === 0 ? 100 : null);
    // PDO = Sh% + Sv% (both as percentages)
    const PDO = (Sh_pct ?? 0) + (Sv_pct ?? 0);

    return { CF, CA, FF, FA, SF, SA, GF, GA,
      CF_pct, FF_pct, SF_pct, GF_pct, Sh_pct, Sv_pct, PDO };
  }

  // Zones overlay drawing (in rink meters): anchored at goal lines x=±16.5 and mirrored symmetrically
  function drawZonesOverlay(g, wPx, hPx, gutterPx=0, canvasRef=null) {
    const toPx = (xM, yM) => {
      const x = canvasRef ? xMetersToPx(xM, canvasRef, gutterPx) : ((xM + HALF_W) / RINK_W_M) * wPx;
      const y = ((-yM + HALF_H) / RINK_H_M) * hPx;
      return [x,y];
    };
    const GL = 16.5; // goal line x in meters
    const RINK_XMAX = HALF_W; // 20m
    g.save();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,80,80,0.9)';

    // Helper to draw a line in meters
    const lineM = (x0,y0,x1,y1) => { g.beginPath(); const [a,b]=toPx(x0,y0), [c,d]=toPx(x1,y1); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); };

    // Goal lines (exactly x=±16.5)
    lineM( GL, -HALF_H, GL, HALF_H);
    lineM(-GL, -HALF_H,-GL, HALF_H);

    // Center vertical (Royal Road)
    lineM(0, -HALF_H, 0, HALF_H);

    // Define base segments for RIGHT offensive end (x>0), then mirror to LEFT (x<0)
    // Wedge boundaries from center toward goal line edges
    const rightSegments = [
      // Outer wedge from center to near top/bottom of goal line
      [0, 0, GL,  9],
      [0, 0, GL, -9],
      // Low-slot boundaries (tighter near net)
      [0,  4, GL,  2],
      [0, -4, GL, -2],
      // High-slot boundaries
      [0,  8, GL,  6],
      [0, -8, GL, -6],
      // Near-board slants to corners (inside offensive zone)
      [GL,  8,  RINK_XMAX, 10],
      [GL, -8,  RINK_XMAX,-10],
      // Horizontal bands within offensive zone (y = ±4, ±8 from x=0 to goal line)
      [0,  4, GL,  4],
      [0, -4, GL, -4],
      [0,  8, GL,  8],
      [0, -8, GL, -8],
    ];

    // Draw right end
    for (const [x0,y0,x1,y1] of rightSegments) lineM(x0,y0,x1,y1);
    // Draw left mirrored end
    for (const [x0,y0,x1,y1] of rightSegments) lineM(-x0,y0,-x1,y1);

    g.restore();
  }

  function redrawVisible() {
    if (document.getElementById('panelShotMap')?.classList.contains('active')) drawShotMap();
    if (document.getElementById('panelHeatMap')?.classList.contains('active')) drawHeat();
    if (document.getElementById('panelVideo')?.classList.contains('active')) {
      renderEventsTable();
    }
  }

  // Init
  function init() {
    populateTeamOptions();
    populateFilters();
    resize();
    teamSel.addEventListener('change', redrawVisible);
  [gameSel, playerSel, eventSel, periodSel, perspectiveSel, strengthSel, goalieSel, onFieldSel].forEach(el=>{ if (el) el.addEventListener('change', ()=>{ redrawVisible(); if (document.getElementById('panelTable')?.classList.contains('active')) renderActiveTableTab(); }); });
    // When filters change, also stop any playing video and reset index
    [gameSel, playerSel, eventSel, periodSel, perspectiveSel, strengthSel, goalieSel, onFieldSel].forEach(el=>{
      if (el) el.addEventListener('change', ()=>{
        try {
          if (videoEl && !videoEl.paused) videoEl.pause();
          currentRowIndex = -1;
        } catch {}
      });
    });
    window.addEventListener('storage', (e)=>{
      if (e.key==='shots' || e.key===TEAMNAMES_KEY || e.key===HOME_ROSTER_KEY || e.key===AWAY_ROSTER_KEY) {
        populateFilters(); redrawVisible();
        if (document.getElementById('panelTable')?.classList.contains('active')) renderActiveTableTab();
      }
    });
    // Tabs
    const tabs = [
      { btn: document.getElementById('tabShotMap'), panel: document.getElementById('panelShotMap'), onShow: ()=>{ resize(); drawShotMap(); } },
      { btn: document.getElementById('tabHeatMap'), panel: document.getElementById('panelHeatMap'), onShow: ()=>{ resize(); drawHeat(); } },
      { btn: document.getElementById('tabShotAim'), panel: document.getElementById('panelShotAim') },
  { btn: document.getElementById('tabTable'), panel: document.getElementById('panelTable'), onShow: ()=>{ renderActiveTableTab(); } },
      { btn: document.getElementById('tabVideo'), panel: document.getElementById('panelVideo'), onShow: ()=>{
          ensureVideoPlayer();
          renderEventsTable();
          // Attach control handlers
          if (!controlsWired) {
            document.getElementById('btnPrevEvent')?.addEventListener('click', playPrev);
            document.getElementById('btnNextEvent')?.addEventListener('click', playNext);
            controlsWired = true;
          }
          // Keyboard shortcuts only active when Video tab is visible
          const onKey = (e)=>{
            const isVideoActive = document.getElementById('panelVideo')?.classList.contains('active');
            if (!isVideoActive) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); playPrev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); playNext(); }
            else if (e.key === ' ') { e.preventDefault(); togglePlayPause(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); bumpRate(+1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); bumpRate(-1); }
          };
          window.addEventListener('keydown', onKey, { once: true });
        } },
    ];
    let videoKeyHandler = null;
    const activate = (idx)=>{
      tabs.forEach((t,i)=>{
        if (!t.btn || !t.panel) return;
        if (i===idx) {
          t.btn.classList.add('active'); t.btn.setAttribute('aria-selected','true'); t.panel.classList.add('active'); requestAnimationFrame(()=>{ if (t.onShow) t.onShow(); });
        } else {
          t.btn.classList.remove('active'); t.btn.setAttribute('aria-selected','false'); t.panel.classList.remove('active');
        }
      });
      // Maintain keyboard handler for Video tab while active
      if (document.getElementById('panelVideo')?.classList.contains('active')) {
        if (!videoKeyHandler) {
          videoKeyHandler = (e)=>{
            const isVideoActive = document.getElementById('panelVideo')?.classList.contains('active');
            if (!isVideoActive) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); playPrev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); playNext(); }
            else if (e.key === ' ') { e.preventDefault(); togglePlayPause(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); bumpRate(+1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); bumpRate(-1); }
          };
          window.addEventListener('keydown', videoKeyHandler);
        }
      } else if (videoKeyHandler) {
        window.removeEventListener('keydown', videoKeyHandler);
        videoKeyHandler = null;
      }
    };
    tabs.forEach((t,i)=>{ if (t?.btn) t.btn.addEventListener('click', ()=>activate(i)); });
    // Table sub-tabs wiring
    if (tabTblSkatersInd && tabTblSkatersOn && tabTblGoalies && tabTblTeams) {
      const setActiveTbl = (who)=>{
        const pairs = [
          { btn: tabTblSkatersInd, panel: panelTblSkatersInd, fn: renderSkatersIndividualTable },
          { btn: tabTblSkatersOn, panel: panelTblSkatersOn, fn: renderSkatersOnFieldTable },
          { btn: tabTblGoalies, panel: panelTblGoalies, fn: renderGoaliesTable },
          { btn: tabTblTeams, panel: panelTblTeams, fn: renderTeamsTable },
        ];
        pairs.forEach(p=>{
          const on = (p.btn===who);
          p.btn.classList.toggle('active', on); p.btn.setAttribute('aria-selected', on?'true':'false');
          if (p.panel) p.panel.classList.toggle('active', on);
          if (on && typeof p.fn==='function') p.fn();
        });
      };
      tabTblSkatersInd.addEventListener('click', ()=>setActiveTbl(tabTblSkatersInd));
      tabTblSkatersOn.addEventListener('click', ()=>setActiveTbl(tabTblSkatersOn));
      tabTblGoalies.addEventListener('click', ()=>setActiveTbl(tabTblGoalies));
      tabTblTeams.addEventListener('click', ()=>setActiveTbl(tabTblTeams));
    }
    // Heat sub-tabs wiring
    if (tabHeatCounts && tabHeatDiff && tabHeatZones) {
      const setHeatActive = (mode) => {
        heatMode = mode;
        if (mode==='counts') {
          tabHeatCounts.classList.add('active'); tabHeatCounts.setAttribute('aria-selected','true');
          tabHeatDiff.classList.remove('active'); tabHeatDiff.setAttribute('aria-selected','false');
          tabHeatZones.classList.remove('active'); tabHeatZones.setAttribute('aria-selected','false');
        } else if (mode==='diff') {
          tabHeatDiff.classList.add('active'); tabHeatDiff.setAttribute('aria-selected','true');
          tabHeatCounts.classList.remove('active'); tabHeatCounts.setAttribute('aria-selected','false');
          tabHeatZones.classList.remove('active'); tabHeatZones.setAttribute('aria-selected','false');
        } else { // zones
          tabHeatZones.classList.add('active'); tabHeatZones.setAttribute('aria-selected','true');
          tabHeatCounts.classList.remove('active'); tabHeatCounts.setAttribute('aria-selected','false');
          tabHeatDiff.classList.remove('active'); tabHeatDiff.setAttribute('aria-selected','false');
        }
        // Keep metric selector visible in all heat modes (Zones, Counts, Differentials)
        drawHeat();
      };
      tabHeatCounts.addEventListener('click', ()=>setHeatActive('counts'));
      tabHeatDiff.addEventListener('click', ()=>setHeatActive('diff'));
      tabHeatZones.addEventListener('click', ()=>setHeatActive('zones'));
    }

    // Zones metric buttons wiring
    if (zonesMetricButtons && zonesMetricButtons.length) {
      zonesMetricButtons.forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const m = btn.getAttribute('data-metric') || 'corsi';
          if (zonesMetric === m) return;
          zonesMetric = m;
          // toggle active visuals
          zonesMetricButtons.forEach(b=>{ const on = (b===btn); b.classList.toggle('active', on); b.setAttribute('aria-selected', on? 'true':'false'); });
          // Redraw in any heat mode, since metric selection drives all
          drawHeat();
        });
      });
    }

    // Click to select zones in Zones mode
    if (heatCanvas) {
      heatCanvas.addEventListener('click', (ev)=>{
        if (heatMode !== 'zones') return;
        if (!zonesPolyGeo) return; // not yet loaded
        if (!zonePairs) buildZonePairs();
        const gutter = currentGutterPx(heatCanvas);
        const xPx = ev.offsetX; const yPx = ev.offsetY;
        const { xM, yM } = pxToMeters(heatCanvas, gutter, xPx, yPx);
        if (xM == null) return; // clicked in gutter
        // Find the first zone index that contains the point
        let foundIdx = null;
        for (let i=1;i<=22;i++) { if (pointInZoneIndex(i, xM, yM)) { foundIdx = i; break; } }
        // Toggle selection
        if (foundIdx === selectedZoneIndex) selectedZoneIndex = null; else selectedZoneIndex = foundIdx;
        redrawVisible();
      });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
