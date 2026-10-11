'use strict';
// ---------- Staden: generering, mark, hus ----------
const T = 64;               // rutstorlek i pixlar
const TL = { WATER: 0, ROAD: 1, SIDE: 2, BUILD: 3, GRASS: 4, LOT: 5, PATH: 6, ALLEY: 7 };
let MW = 0, MH = 0, tiles = null, bids = null, xs = [], ys = [], NX = 0, NY = 0;
let buildings = [], trees = [], treeGrid = new Map(), blocks = [];
const LIGHT = { dark: 0, night: 0 };
const WORLD = { lamps: [], alleySpots: [], armorSpots: [], safe: null, hospital: null, police: null, spray: [], garages: [], phones: [], crateSpots: [], heartSpots: [], parked: [] };

function tileAt(tx, ty) { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return TL.WATER; return tiles[ty * MW + tx]; }
function tileAtW(x, y) { return tileAt(Math.floor(x / T), Math.floor(y / T)); }
function solidTile(tx, ty) { const t = tileAt(tx, ty); return t === TL.BUILD || t === TL.WATER; }
function solidW(x, y) { return solidTile(Math.floor(x / T), Math.floor(y / T)); }
function hBand(y) { for (let j = 0; j < NY; j++) if (y >= ys[j] * T && y < (ys[j] + 4) * T) return j; return -1; }
function vBand(x) { for (let i = 0; i < NX; i++) if (x >= xs[i] * T && x < (xs[i] + 4) * T) return i; return -1; }

const ROOFS = [
  ['#8e9096', '#6c6e75'], ['#a68a6d', '#7a634d'], ['#b4674c', '#83493a'], ['#6f918b', '#51706a'],
  ['#9d9c80', '#76755e'], ['#7c81a0', '#5b5f7a'], ['#c4b79c', '#938873'], ['#5f6670', '#454b54'],
  ['#a8a29a', '#7d776f'],
];

function genMap(seed) {
  const R = mulberry32(seed);
  const line = (max) => {
    const a = [3];
    for (;;) {
      const bw = 10 + Math.floor(R() * 7);
      const n = a[a.length - 1] + 4 + bw;
      if (n + 4 + 3 > max) break;
      a.push(n);
    }
    return a;
  };
  xs = line(112); ys = line(112); NX = xs.length; NY = ys.length;
  MW = xs[NX - 1] + 4 + 3; MH = ys[NY - 1] + 4 + 3;
  tiles = new Uint8Array(MW * MH); bids = new Int16Array(MW * MH).fill(-1);
  buildings = []; trees = []; treeGrid = new Map(); blocks = [];
  const set = (x, y, t) => { tiles[y * MW + x] = t; };
  for (let y = 3; y < MH - 3; y++) for (let x = 3; x < MW - 3; x++) set(x, y, TL.SIDE);
  for (const x0 of xs) for (let y = ys[0]; y < ys[NY - 1] + 4; y++) for (let x = x0; x < x0 + 4; x++) set(x, y, TL.ROAD);
  for (const y0 of ys) for (let x = xs[0]; x < xs[NX - 1] + 4; x++) for (let y = y0; y < y0 + 4; y++) set(x, y, TL.ROAD);

  const cxm = MW / 2, cym = MH / 2, dmax = Math.hypot(cxm, cym);
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY - 1; j++)
    blocks.push({ i, j, x0: xs[i] + 4, x1: xs[i + 1], y0: ys[j] + 4, y1: ys[j + 1], type: 'build' });

  // Välj kvarterstyper. Sjukhus och polis hamnar nära mitten.
  const byCenter = blocks.slice().sort((a, b) =>
    Math.hypot((a.x0 + a.x1) / 2 - cxm, (a.y0 + a.y1) / 2 - cym) - Math.hypot((b.x0 + b.x1) / 2 - cxm, (b.y0 + b.y1) / 2 - cym));
  byCenter[1].type = 'hospital';
  byCenter[4].type = 'police';
  byCenter.slice(5, 16).filter(b => b.type === 'build').sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0].type = 'safehouse';
  const rest = blocks.filter(b => b.type === 'build');
  for (let k = rest.length - 1; k > 0; k--) { const r = Math.floor(R() * (k + 1)); [rest[k], rest[r]] = [rest[r], rest[k]]; }
  rest[0].type = 'lot'; rest[1].type = 'lot'; rest[2].type = 'lot'; rest[3].type = 'park'; rest[4].type = 'park';
  for (let k = 5; k < rest.length; k++) { const r = R(); rest[k].type = r < 0.1 ? 'park' : r < 0.18 ? 'lot' : 'build'; }

  function makeBuilding(x0, y0, x1, y1, kind) {
    const id = buildings.length, area = (x1 - x0) * (y1 - y0);
    const d = Math.hypot((x0 + x1) / 2 - cxm, (y0 + y1) / 2 - cym) / dmax;
    let h = (330 - 260 * Math.min(1, d * 1.5)) * (0.55 + R() * 0.6);
    if (area < 14) h *= 0.7;
    h = clamp(h, 48, 360);
    let pal = ROOFS[Math.floor(R() * ROOFS.length)];
    if (kind === 'hospital') { h = 120; pal = ['#e8ebee', '#b4bcc4']; }
    if (kind === 'police') { h = 130; pal = ['#2f4f8f', '#24396a']; }
    if (kind === 'safehouse') { h = 95; pal = ['#3d3048', '#2b2234']; }
    if (kind === 'wall') { h = 34; pal = ['#8c5b45', '#6b4434']; }
    const b = { id, x0: x0 * T, y0: y0 * T, x1: x1 * T, y1: y1 * T, h, roof: pal[0], wall: pal[1], kind: kind || '', det: [], seed: Math.floor(R() * 1e9) };
    const n = kind === 'wall' ? 0 : kind ? 2 : Math.min(7, 1 + Math.floor(area / 8));
    for (let k = 0; k < n; k++) {
      const t = R();
      b.det.push({ u: 0.14 + R() * 0.62, v: 0.14 + R() * 0.62, type: t < 0.45 ? 'ac' : t < 0.7 ? 'vent' : t < 0.88 ? 'sky' : 'tank', s: 0.7 + R() * 0.6 });
    }
    if (!kind && h > 240 && area >= 30) b.heli = true;
    buildings.push(b);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { set(x, y, TL.BUILD); bids[y * MW + x] = id; }
    return b;
  }
  function split(x0, y0, x1, y1, depth) {
    const w = x1 - x0, h = y1 - y0;
    const canV = w >= 7, canH = h >= 7;
    if ((!canV && !canH) || (depth >= 2 && R() < 0.3) || depth > 4) { makeBuilding(x0, y0, x1, y1); return; }
    // gränder: alltid en genomgående gränd i första delningen, ofta fler längre in
    const gap = depth === 0 || R() < 0.6 ? 1 : 0;
    if (canV && (w >= h || !canH)) {
      const s = x0 + 3 + Math.floor(R() * (w - 6 - gap + 1));
      split(x0, y0, s, y1, depth + 1); split(s + gap, y0, x1, y1, depth + 1);
      if (gap) {
        for (let y = y0; y < y1; y++) set(s, y, TL.ALLEY);
        const spot = { x: (s + 0.5) * T, y: ((y0 + y1) / 2) * T };
        WORLD.alleySpots.push(spot);
        if (R() < 0.4) WORLD.crateSpots.push(spot);
      }
    } else {
      const s = y0 + 3 + Math.floor(R() * (h - 6 - gap + 1));
      split(x0, y0, x1, s, depth + 1); split(x0, s + gap, x1, y1, depth + 1);
      if (gap) {
        for (let x = x0; x < x1; x++) set(x, s, TL.ALLEY);
        const spot = { x: ((x0 + x1) / 2) * T, y: (s + 0.5) * T };
        WORLD.alleySpots.push(spot);
        if (R() < 0.4) WORLD.crateSpots.push(spot);
      }
    }
  }
  function addTree(x, y, kind) {
    const t = { x, y, kind, r: kind === 'tree_large' ? 16 : kind === 'tree_small' ? 11 : 0, rot: R() * TAU };
    trees.push(t);
    const key = Math.floor(y / T) * MW + Math.floor(x / T);
    if (!treeGrid.has(key)) treeGrid.set(key, []);
    treeGrid.get(key).push(t);
  }

  let lotN = 0;
  for (const b of blocks) {
    const ix0 = b.x0 + 1, ix1 = b.x1 - 1, iy0 = b.y0 + 1, iy1 = b.y1 - 1;
    if (b.type === 'build') split(ix0, iy0, ix1, iy1, 0);
    else if (b.type === 'hospital' || b.type === 'police') {
      makeBuilding(ix0, iy0, ix1, iy1, b.type);
      const door = { x: ((b.x0 + b.x1) / 2) * T, y: (b.y1 - 0.5) * T };
      if (b.type === 'hospital') { WORLD.hospital = door; WORLD.heartSpots.push({ x: door.x + 96, y: door.y }); }
      else WORLD.police = door;
    } else if (b.type === 'safehouse') {
      // Inhägnad gård med mur, grind mot söder och ett hus i norra delen
      const fx0 = ix0, fx1 = ix1, fy0 = iy0, fy1 = iy1;
      const gx = Math.floor((fx0 + fx1) / 2) - 1;
      makeBuilding(fx0, fy0, fx1, fy0 + 1, 'wall');
      makeBuilding(fx0, fy0 + 1, fx0 + 1, fy1, 'wall');
      makeBuilding(fx1 - 1, fy0 + 1, fx1, fy1, 'wall');
      makeBuilding(fx0 + 1, fy1 - 1, gx, fy1, 'wall');
      makeBuilding(gx + 3, fy1 - 1, fx1 - 1, fy1, 'wall');
      for (let y = fy0 + 1; y < fy1 - 1; y++) for (let x = fx0 + 1; x < fx1 - 1; x++) set(x, y, TL.LOT);
      for (let x = gx; x < gx + 3; x++) set(x, fy1 - 1, TL.LOT);
      const hh = clamp(Math.floor((fy1 - fy0 - 2) / 2) - 1, 2, 4);
      makeBuilding(fx0 + 2, fy0 + 1, fx1 - 2, fy0 + 1 + hh, 'safehouse');
      const yard = { x0: (fx0 + 1) * T, y0: (fy0 + 1 + hh) * T, x1: (fx1 - 1) * T, y1: (fy1 - 1) * T };
      const gate = { x: (gx + 1.5) * T, y: (fy1 - 0.5) * T };
      const ymid = (yard.y0 + yard.y1) / 2;
      b.yard = yard; b.gate = gate;
      WORLD.safe = {
        x0: fx0 * T, y0: fy0 * T, x1: fx1 * T, y1: fy1 * T, yard, gate,
        carSpot: { x: yard.x0 + 60, y: ymid, a: -Math.PI / 2 },
        motos: [0, 1, 2].map(k => ({ x: yard.x1 - 40 - k * 46, y: yard.y0 + 50, a: Math.PI / 2 })),
        tankSpot: { x: yard.x1 - 100, y: ymid + 34, a: -Math.PI / 2 },
        armor: { x: yard.x0 + 60, y: yard.y0 + 36 },
        posts: [
          { x: gate.x - 100, y: yard.y1 - 30, a: Math.PI / 2 },
          { x: gate.x + 100, y: yard.y1 - 30, a: Math.PI / 2 },
          { x: (yard.x0 + yard.x1) / 2, y: yard.y0 + 28, a: Math.PI / 2 },
          { x: yard.x0 + 40, y: yard.y1 - 30, a: Math.PI * 0.75 },
          { x: yard.x1 - 40, y: yard.y1 - 30, a: Math.PI * 0.25 },
        ],
        start: { x: (yard.x0 + yard.x1) / 2 + 40, y: ymid + 10 },
      };
    } else if (b.type === 'park') {
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) set(x, y, TL.GRASS);
      const mx = Math.floor((ix0 + ix1) / 2), my = Math.floor((iy0 + iy1) / 2);
      for (let x = ix0; x < ix1; x++) set(x, my, TL.PATH);
      for (let y = iy0; y < iy1; y++) set(mx, y, TL.PATH);
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
        if (tiles[y * MW + x] !== TL.GRASS) continue;
        const r = R();
        if (r < 0.16) addTree((x + 0.5) * T + (R() - 0.5) * 22, (y + 0.5) * T + (R() - 0.5) * 22, R() < 0.5 ? 'tree_large' : 'tree_small');
        else if (r < 0.24) addTree((x + 0.5) * T + (R() - 0.5) * 30, (y + 0.5) * T + (R() - 0.5) * 30, 'bush');
      }
      WORLD.crateSpots.push({ x: (mx + 0.5) * T, y: (my + 0.5) * T });
    } else { // parkering
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) set(x, y, TL.LOT);
      b.stalls = { x0: ix0 * T, x1: ix1 * T, top: iy0 * T, bottom: iy1 * T, depth: 100 };
      const cx = ((ix0 + ix1) / 2) * T, cy = ((iy0 + iy1) / 2) * T;
      const role = lotN === 0 ? 'spray' : (lotN % 2 === 1 ? 'garage' : (lotN % 4 === 2 ? 'spray' : 'garage'));
      lotN++;
      b.role = role;
      if (role === 'spray') WORLD.spray.push({ x: cx, y: cy, b }); else WORLD.garages.push({ x: cx, y: cy, b });
      for (let x = ix0; x < ix1; x++) {
        if (R() < 0.45) WORLD.parked.push({ x: (x + 0.5) * T, y: iy0 * T + 50, a: Math.PI / 2 });
        if (R() < 0.45) WORLD.parked.push({ x: (x + 0.5) * T, y: iy1 * T - 50, a: -Math.PI / 2 });
      }
      WORLD.crateSpots.push({ x: (ix0 + 0.7) * T, y: cy });
    }
  }

  // telefonkiosker: utspridda på trottoarer
  const cand = blocks.filter(b => b.type === 'build').map(b => ({ x: (b.x0 + 2.5) * T, y: (b.y0 + 0.5) * T }));
  for (let k = cand.length - 1; k > 0; k--) { const r = Math.floor(R() * (k + 1)); [cand[k], cand[r]] = [cand[r], cand[k]]; }
  for (const c of cand) {
    if (WORLD.phones.length >= 5) break;
    if (WORLD.phones.every(p => Math.hypot(p.x - c.x, p.y - c.y) > 1600)) WORLD.phones.push({ x: c.x, y: c.y, cool: 0 });
  }
  // några hjärtan på trottoarer
  for (let k = 0; k < 4; k++) { const c = cand[(k * 7 + 3) % cand.length]; WORLD.heartSpots.push({ x: c.x + 128, y: c.y }); }
  // gatlyktor i hörnen och mitt på sidorna av varje kvarter
  for (const bl of blocks) {
    const L = (bl.x0 + 0.25) * T, Rr = (bl.x1 - 0.25) * T, U = (bl.y0 + 0.25) * T, D = (bl.y1 - 0.25) * T;
    const mx = ((bl.x0 + bl.x1) / 2) * T, my = ((bl.y0 + bl.y1) / 2) * T;
    for (const [x, y] of [[L, U], [Rr, U], [L, D], [Rr, D], [mx, U], [mx, D], [L, my], [Rr, my]]) WORLD.lamps.push({ x, y });
  }
  // skyddsvästar: en i safehouset och några i gränder utspridda över stan
  if (WORLD.safe) WORLD.armorSpots.push(WORLD.safe.armor);
  const al = WORLD.alleySpots.slice();
  for (let k = al.length - 1; k > 0; k--) { const r = Math.floor(R() * (k + 1)); [al[k], al[r]] = [al[r], al[k]]; }
  for (const a of al) {
    if (WORLD.armorSpots.length >= 5) break;
    if (WORLD.armorSpots.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 1800) && WORLD.crateSpots.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 100)) WORLD.armorSpots.push(a);
  }
}

// ---------- Markrendering i bitar (chunks) ----------
const CH = 512, CHT = CH / T, CHUNK_MAX = 90;
const chunks = new Map();
let frameNo = 0;

function getChunk(cx, cy) {
  const key = cx * 1000 + cy;
  let c = chunks.get(key);
  if (!c) {
    c = renderChunk(cx, cy);
    chunks.set(key, c);
    if (chunks.size > CHUNK_MAX) {
      let oldK = null, oldU = Infinity;
      for (const [k, v] of chunks) if (v.used < oldU) { oldU = v.used; oldK = k; }
      chunks.delete(oldK);
    }
  }
  c.used = frameNo;
  return c;
}

function renderChunk(cx, cy) {
  const cv = document.createElement('canvas');
  cv.width = CH; cv.height = CH;
  const g = cv.getContext('2d');
  const x0 = cx * CH, y0 = cy * CH;
  g.save();
  g.translate(-x0, -y0);
  const tx0 = cx * CHT, ty0 = cy * CHT;
  for (let ty = ty0; ty < ty0 + CHT; ty++) for (let tx = tx0; tx < tx0 + CHT; tx++) drawTile(g, tx, ty);
  drawMarkings(g, x0, y0);
  drawLots(g, x0, y0);
  drawLampPosts(g, x0, y0);
  drawShadowsInChunk(g, x0, y0);
  g.restore();
  return { cv, g, x0, y0, used: frameNo };
}

function drawTile(g, tx, ty) {
  const t = tileAt(tx, ty), px = tx * T, py = ty * T;
  switch (t) {
    case TL.WATER: {
      g.drawImage(IMG.water, px, py, T, T);
      g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const hx = px + 8 + hash2(tx * 3 + k, ty) * 40, hy = py + 10 + hash2(tx, ty * 5 + k) * 44;
        g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + 6, hy - 4, hx + 12, hy); g.stroke();
      }
      g.fillStyle = 'rgba(10,30,50,0.35)';
      if (tileAt(tx - 1, ty) !== TL.WATER) g.fillRect(px, py, 9, T);
      if (tileAt(tx + 1, ty) !== TL.WATER) g.fillRect(px + T - 9, py, 9, T);
      if (tileAt(tx, ty - 1) !== TL.WATER) g.fillRect(px, py, T, 9);
      if (tileAt(tx, ty + 1) !== TL.WATER) g.fillRect(px, py + T - 9, T, 9);
      break;
    }
    case TL.ROAD: case TL.LOT: {
      g.fillStyle = t === TL.LOT ? '#565656' : '#474747';
      g.fillRect(px, py, T, T);
      for (let k = 0; k < 7; k++) {
        const h = hash2(tx * 13 + k, ty * 7 - k);
        g.fillStyle = h < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
        g.fillRect(px + hash2(tx + k * 3, ty) * 60, py + hash2(tx, ty + k * 5) * 60, 3 + h * 4, 2 + h * 3);
      }
      // asfaltkant mot vatten
      if (t === TL.ROAD) {
        g.fillStyle = '#7d8a8e';
        if (tileAt(tx - 1, ty) === TL.WATER) g.fillRect(px, py, 6, T);
        if (tileAt(tx + 1, ty) === TL.WATER) g.fillRect(px + T - 6, py, 6, T);
        if (tileAt(tx, ty - 1) === TL.WATER) g.fillRect(px, py, T, 6);
        if (tileAt(tx, ty + 1) === TL.WATER) g.fillRect(px, py + T - 6, T, 6);
      }
      break;
    }
    case TL.SIDE: {
      g.drawImage(IMG.concrete, px, py, T, T);
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(px + 31, py, 2, T); g.fillRect(px, py + 31, T, 2);
      g.fillStyle = '#6a787d';
      if (tileAt(tx - 1, ty) === TL.ROAD) g.fillRect(px, py, 5, T);
      if (tileAt(tx + 1, ty) === TL.ROAD) g.fillRect(px + T - 5, py, 5, T);
      if (tileAt(tx, ty - 1) === TL.ROAD) g.fillRect(px, py, T, 5);
      if (tileAt(tx, ty + 1) === TL.ROAD) g.fillRect(px, py + T - 5, T, 5);
      break;
    }
    case TL.GRASS: g.drawImage(IMG.grass, px, py, T, T); break;
    case TL.PATH: g.drawImage(IMG.dirt, px, py, T, T); break;
    case TL.ALLEY: {
      g.fillStyle = '#3b3d42'; g.fillRect(px, py, T, T);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
        const h = hash2(tx * 31 + c, ty * 17 + r);
        g.fillStyle = h < 0.33 ? '#44474d' : h < 0.66 ? '#36383d' : '#3f4146';
        g.fillRect(px + c * 16 + (r % 2) * 8 - 8, py + r * 8, 15, 7);
      }
      const h = hash2(tx, ty * 3);
      if (h < 0.25) { g.fillStyle = 'rgba(90,120,150,0.35)'; g.beginPath(); g.ellipse(px + 20 + h * 80, py + 32, 14, 7, 0.3, 0, TAU); g.fill(); }
      else if (h < 0.45) { g.fillStyle = 'rgba(200,190,160,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(px + hash2(tx + k, ty) * 56, py + hash2(tx, ty + k) * 56, 5, 3); }
      break;
    }
    case TL.BUILD: g.fillStyle = '#2b2d31'; g.fillRect(px, py, T, T); break;
  }
}

function drawMarkings(g, cx0, cy0) {
  const cx1 = cx0 + CH, cy1 = cy0 + CH;
  const Y = '#e3bd26', Wt = '#e4e4e4';
  for (let j = 0; j < NY; j++) {
    const y0 = ys[j] * T;
    if (y0 > cy1 || y0 + 4 * T < cy0) continue;
    for (let i = 0; i < NX - 1; i++) {
      const xa = (xs[i] + 4) * T, xb = xs[i + 1] * T;
      if (xa > cx1 || xb < cx0) continue;
      g.fillStyle = Y;
      g.fillRect(xa, y0 + 2 * T - 5, xb - xa, 3); g.fillRect(xa, y0 + 2 * T + 2, xb - xa, 3);
      g.fillStyle = Wt;
      for (let x = xa + 72; x < xb - 72; x += 56) { g.fillRect(x, y0 + T - 1.5, 28, 3); g.fillRect(x, y0 + 3 * T - 1.5, 28, 3); }
      for (let k = 0; k < 9; k++) { g.fillRect(xa + 8, y0 + 8 + k * 28, 40, 14); g.fillRect(xb - 48, y0 + 8 + k * 28, 40, 14); }
      g.fillRect(xb - 60, y0 + 2 * T + 6, 5, 2 * T - 12);
      g.fillRect(xa + 55, y0 + 6, 5, 2 * T - 12);
    }
  }
  for (let i = 0; i < NX; i++) {
    const x0 = xs[i] * T;
    if (x0 > cx1 || x0 + 4 * T < cx0) continue;
    for (let j = 0; j < NY - 1; j++) {
      const ya = (ys[j] + 4) * T, yb = ys[j + 1] * T;
      if (ya > cy1 || yb < cy0) continue;
      g.fillStyle = Y;
      g.fillRect(x0 + 2 * T - 5, ya, 3, yb - ya); g.fillRect(x0 + 2 * T + 2, ya, 3, yb - ya);
      g.fillStyle = Wt;
      for (let y = ya + 72; y < yb - 72; y += 56) { g.fillRect(x0 + T - 1.5, y, 3, 28); g.fillRect(x0 + 3 * T - 1.5, y, 3, 28); }
      for (let k = 0; k < 9; k++) { g.fillRect(x0 + 8 + k * 28, ya + 8, 14, 40); g.fillRect(x0 + 8 + k * 28, yb - 48, 14, 40); }
      g.fillRect(x0 + 6, yb - 60, 2 * T - 12, 5);
      g.fillRect(x0 + 2 * T + 6, ya + 55, 2 * T - 12, 5);
    }
  }
}

function drawLots(g, cx0, cy0) {
  for (const b of blocks) {
    if (b.yard) {
      const y = b.yard, cx = (y.x0 + y.x1) / 2, cy = (y.y0 + y.y1) / 2;
      if (y.x0 > cx0 + CH || y.x1 < cx0 || y.y0 > cy0 + CH || y.y1 + T < cy0) continue;
      g.save();
      g.fillStyle = 'rgba(60,30,80,0.35)'; g.fillRect(y.x0, y.y0, y.x1 - y.x0, y.y1 - y.y0 + T);
      g.strokeStyle = 'rgba(180,92,255,0.75)'; g.lineWidth = 8;
      g.beginPath(); g.arc(cx, cy, Math.min(y.x1 - y.x0, y.y1 - y.y0) * 0.36, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(217,180,74,0.85)'; g.font = 'bold 54px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GK', cx, cy - 4);
      g.font = 'bold 15px Arial, sans-serif'; g.fillStyle = 'rgba(230,210,255,0.8)';
      g.fillText('GAUTE KNUTTERS', cx, cy + 34);
      // grind: gul-svart rand
      const gt = b.gate;
      for (let k = -6; k < 6; k++) { g.fillStyle = k % 2 ? '#111' : '#f2c230'; g.fillRect(gt.x + k * 16, gt.y + 24, 16, 8); }
      g.restore();
      continue;
    }
    if (!b.stalls) continue;
    const s = b.stalls;
    if (s.x0 > cx0 + CH || s.x1 < cx0 || s.top > cy0 + CH || s.bottom < cy0) continue;
    g.fillStyle = 'rgba(240,240,240,0.75)';
    for (let x = s.x0; x <= s.x1; x += T) { g.fillRect(x - 1, s.top, 3, s.depth); g.fillRect(x - 1, s.bottom - s.depth, 3, s.depth); }
    g.fillRect(s.x0, s.top + s.depth, s.x1 - s.x0, 3);
    g.fillRect(s.x0, s.bottom - s.depth - 3, s.x1 - s.x0, 3);
    const cx = (s.x0 + s.x1) / 2, cy = (s.top + s.bottom) / 2;
    if (b.role === 'spray') {
      g.save();
      g.fillStyle = 'rgba(255,210,63,0.18)'; g.fillRect(cx - 110, cy - 70, 220, 140);
      g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.setLineDash([18, 12]); g.strokeRect(cx - 110, cy - 70, 220, 140); g.setLineDash([]);
      g.fillStyle = '#ffd23f'; g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('LACK & FIX', cx, cy - 18); g.font = 'bold 18px Arial, sans-serif'; g.fillText('$250 – nollställer polisen', cx, cy + 20);
      g.restore();
    } else if (b.role === 'garage') {
      g.save();
      g.fillStyle = 'rgba(80,200,255,0.14)'; g.fillRect(cx - 110, cy - 70, 220, 140);
      g.strokeStyle = '#5bc8ff'; g.lineWidth = 6; g.strokeRect(cx - 110, cy - 70, 220, 140);
      g.fillStyle = '#5bc8ff'; g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GARAGE', cx, cy);
      g.restore();
    }
  }
}

function drawShadowsInChunk(g, cx0, cy0) {
  g.fillStyle = 'rgba(0,0,0,0.26)';
  g.beginPath();
  for (const b of buildings) {
    const s = clamp(b.h * 0.32, 14, 110);
    if (b.x0 > cx0 + CH || b.x1 + s < cx0 || b.y0 > cy0 + CH || b.y1 + s < cy0) continue;
    g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y0); g.lineTo(b.x1 + s, b.y0 + s);
    g.lineTo(b.x1 + s, b.y1 + s); g.lineTo(b.x0 + s, b.y1 + s); g.lineTo(b.x0, b.y1); g.closePath();
  }
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (const t of trees) {
    if (t.x < cx0 - 120 || t.x > cx0 + CH + 120 || t.y < cy0 - 120 || t.y > cy0 + CH + 120) continue;
    const r = t.kind === 'tree_large' ? 50 : t.kind === 'tree_small' ? 34 : 18;
    g.beginPath(); g.ellipse(t.x + r * 0.35, t.y + r * 0.35, r, r * 0.9, 0, 0, TAU); g.fill();
  }
}

function drawGround(ctx, v) {
  const cx0 = Math.floor(v.x0 / CH), cx1 = Math.floor(v.x1 / CH), cy0 = Math.floor(v.y0 / CH), cy1 = Math.floor(v.y1 / CH);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = getChunk(cx, cy);
    ctx.drawImage(c.cv, c.x0, c.y0, CH + 0.5, CH + 0.5);
  }
}

// Ritar något permanent på marken (blod, sladdmärken, brännmärken)
function decal(x, y, r, fn) {
  const cx0 = Math.floor((x - r) / CH), cx1 = Math.floor((x + r) / CH), cy0 = Math.floor((y - r) / CH), cy1 = Math.floor((y + r) / CH);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = chunks.get(cx * 1000 + cy);
    if (!c) continue;
    c.g.save(); c.g.translate(-c.x0, -c.y0); fn(c.g); c.g.restore();
  }
}

// ---------- Hus i fejk-3D (som GTA2) ----------
function drawBuildings(ctx, v, cx, cy, F) {
  const list = [];
  for (const b of buildings) {
    if (b.x1 < v.x0 - 400 || b.x0 > v.x1 + 400 || b.y1 < v.y0 - 400 || b.y0 > v.y1 + 400) continue;
    const nx = clamp(cx, b.x0, b.x1), ny = clamp(cy, b.y0, b.y1);
    b._d = dist2(nx, ny, cx, cy);
    list.push(b);
  }
  list.sort((a, b) => b._d - a._d);
  for (const b of list) drawBuilding(ctx, b, cx, cy, F);
}

function drawBuilding(g, b, cx, cy, F) {
  const k = F / (F - b.h);
  const X0 = cx + (b.x0 - cx) * k, X1 = cx + (b.x1 - cx) * k, Y0 = cy + (b.y0 - cy) * k, Y1 = cy + (b.y1 - cy) * k;
  if (cy > b.y1) wall(g, b, b.x0, b.y1, b.x1, b.y1, X0, Y1, X1, Y1, 0.80, 1);
  if (cy < b.y0) wall(g, b, b.x0, b.y0, b.x1, b.y0, X0, Y0, X1, Y0, 0.97, 2);
  if (cx > b.x1) wall(g, b, b.x1, b.y0, b.x1, b.y1, X1, Y0, X1, Y1, 0.64, 3);
  if (cx < b.x0) wall(g, b, b.x0, b.y0, b.x0, b.y1, X0, Y0, X0, Y1, 0.88, 4);
  const w = X1 - X0, h = Y1 - Y0;
  g.fillStyle = b.roof; g.fillRect(X0, Y0, w, h);
  if (b.kind === 'wall') { g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = X0 + 10 * k; x < X1; x += 22 * k) g.fillRect(x, Y0, 2 * k, h); for (let y = Y0 + 10 * k; y < Y1; y += 22 * k) g.fillRect(X0, y, w, 2 * k); if (LIGHT.dark > 0.01) { g.fillStyle = `rgba(6,10,26,${LIGHT.dark})`; g.fillRect(X0, Y0, w, h); } return; }
  const p = 7 * k;
  g.strokeStyle = shade(b.roof, 0.74); g.lineWidth = p;
  g.strokeRect(X0 + p / 2, Y0 + p / 2, w - p, h - p);
  g.strokeStyle = shade(b.roof, 1.12); g.lineWidth = 1.5 * k;
  g.strokeRect(X0 + p + 1, Y0 + p + 1, w - 2 * p - 2, h - 2 * p - 2);
  for (const d of b.det) {
    const x = X0 + w * d.u, y = Y0 + h * d.v, s = d.s * k;
    if (d.type === 'ac') {
      g.fillStyle = shade(b.roof, 0.6); g.fillRect(x + 3 * s, y + 3 * s, 26 * s, 20 * s);
      g.fillStyle = '#c4c8cc'; g.fillRect(x, y, 26 * s, 20 * s);
      g.fillStyle = '#80868c'; g.beginPath(); g.arc(x + 13 * s, y + 10 * s, 7 * s, 0, TAU); g.fill();
      g.strokeStyle = '#5c6166'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(x + 6 * s, y + 10 * s); g.lineTo(x + 20 * s, y + 10 * s); g.stroke();
    } else if (d.type === 'vent') {
      g.fillStyle = '#5d6166'; g.beginPath(); g.arc(x, y, 7 * s, 0, TAU); g.fill();
      g.fillStyle = '#2f3236'; g.beginPath(); g.arc(x, y, 4 * s, 0, TAU); g.fill();
    } else if (d.type === 'sky') {
      g.fillStyle = shade(b.roof, 0.65); g.fillRect(x - 2 * s, y - 2 * s, 36 * s, 24 * s);
      g.fillStyle = '#8fbad6'; g.fillRect(x, y, 32 * s, 20 * s);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3 * s, y + 3 * s, 10 * s, 14 * s);
    } else {
      g.fillStyle = '#8a6b4c'; g.beginPath(); g.arc(x, y, 15 * s, 0, TAU); g.fill();
      g.strokeStyle = '#5e4632'; g.lineWidth = 2 * s; g.beginPath(); g.arc(x, y, 10 * s, 0, TAU); g.stroke();
    }
  }
  const mx = X0 + w / 2, my = Y0 + h / 2;
  if (b.heli) {
    g.strokeStyle = '#f2c230'; g.lineWidth = 4 * k; g.beginPath(); g.arc(mx, my, Math.min(w, h) * 0.22, 0, TAU); g.stroke();
    g.fillStyle = '#f2c230'; g.font = `bold ${Math.round(Math.min(w, h) * 0.22)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', mx, my);
  }
  if (b.kind === 'hospital') {
    const s = Math.min(w, h) * 0.32;
    g.fillStyle = '#d7263d'; g.fillRect(mx - s / 2, my - s / 6, s, s / 3); g.fillRect(mx - s / 6, my - s / 2, s / 3, s);
    g.fillStyle = '#7a8590'; g.font = `bold ${Math.round(18 * k)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SJUKHUS', mx, Y1 - 22 * k);
  }
  if (b.kind === 'safehouse') {
    let fs = h * 0.3;
    g.font = `bold ${Math.round(fs)}px Impact, Arial Black, sans-serif`;
    const tw = g.measureText('GAUTE KNUTTERS').width;
    if (tw > w * 0.8) { fs *= (w * 0.8) / tw; g.font = `bold ${Math.round(fs)}px Impact, Arial Black, sans-serif`; }
    g.fillStyle = '#d9b44a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAUTE KNUTTERS', mx, my);
  }
  if (b.kind === 'police') {
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(Math.min(w, h) * 0.16)}px Impact, Arial Black, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLIS', mx, my);
    g.fillStyle = (Math.floor(performance.now() / 400) % 2) ? '#5aa9ff' : '#1d46b3';
    g.beginPath(); g.arc(mx, Y0 + 26 * k, 8 * k, 0, TAU); g.fill();
  }
  if (LIGHT.dark > 0.01) { g.fillStyle = `rgba(6,10,26,${LIGHT.dark})`; g.fillRect(X0, Y0, w, h); }
}

function wall(g, b, ax, ay, bx, by, AX, AY, BX, BY, f, side) {
  g.fillStyle = shade(b.wall, f);
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(BX, BY); g.lineTo(AX, AY); g.closePath(); g.fill();
  if (LIGHT.dark > 0.01) { g.fillStyle = `rgba(6,10,26,${LIGHT.dark})`; g.fill(); }
  if (b.kind === 'wall') return;
  const depth = Math.hypot(AX - ax, AY - ay);
  if (depth < 9) return;
  const floors = clamp(Math.round(b.h / 44), 1, 8);
  const len = Math.hypot(bx - ax, by - ay);
  const cols = Math.max(1, Math.floor(len / 40));
  const dark = new Path2D(), lit = new Path2D();
  for (let fl = 0; fl < floors; fl++) {
    const t0 = (fl + 0.3) / floors, t1 = (fl + 0.74) / floors;
    for (let c = 0; c < cols; c++) {
      const s0 = (c + 0.22) / cols, s1 = (c + 0.78) / cols;
      const P = (s, t) => {
        const x1 = ax + (bx - ax) * s, y1 = ay + (by - ay) * s;
        const x2 = AX + (BX - AX) * s, y2 = AY + (BY - AY) * s;
        return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      };
      const p1 = P(s0, t0), p2 = P(s1, t0), p3 = P(s1, t1), p4 = P(s0, t1);
      const path = hash2(b.seed % 100000 + fl * 31 + side * 977, c * 7 + side) < 0.14 + 0.36 * LIGHT.night ? lit : dark;
      path.moveTo(p1[0], p1[1]); path.lineTo(p2[0], p2[1]); path.lineTo(p3[0], p3[1]); path.lineTo(p4[0], p4[1]); path.closePath();
    }
  }
  g.fillStyle = 'rgba(28,40,56,0.72)'; g.fill(dark);
  g.fillStyle = LIGHT.night > 0.3 ? 'rgba(255,224,140,0.95)' : 'rgba(245,214,130,0.85)'; g.fill(lit);
}

function drawTrees(ctx, v, cx, cy, F) {
  for (const t of trees) {
    if (t.x < v.x0 - 150 || t.x > v.x1 + 150 || t.y < v.y0 - 150 || t.y > v.y1 + 150) continue;
    const h = t.kind === 'bush' ? 10 : t.kind === 'tree_small' ? 40 : 60;
    const k = F / (F - h);
    const x = cx + (t.x - cx) * k, y = cy + (t.y - cy) * k;
    const img = IMG[t.kind];
    const sz = (t.kind === 'tree_large' ? 116 : t.kind === 'tree_small' ? 80 : 46) * k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t.rot);
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
}

// ---------- Minikarta ----------
let minimapCv = null;
function buildMinimap() {
  const S = 3;
  minimapCv = document.createElement('canvas');
  minimapCv.width = MW * S; minimapCv.height = MH * S;
  const g = minimapCv.getContext('2d');
  const col = { [TL.WATER]: '#1d4b6e', [TL.ROAD]: '#5b5b5b', [TL.SIDE]: '#98a6ab', [TL.GRASS]: '#3f8d4a', [TL.LOT]: '#6c6c6c', [TL.PATH]: '#9a7a4e', [TL.ALLEY]: '#44464c' };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = tiles[y * MW + x];
    if (t === TL.BUILD) g.fillStyle = shade(buildings[bids[y * MW + x]].roof, 0.8);
    else g.fillStyle = col[t];
    g.fillRect(x * S, y * S, S, S);
  }
}

function drawLampPosts(g, cx0, cy0) {
  for (const l of WORLD.lamps) {
    if (l.x < cx0 - 10 || l.x > cx0 + CH + 10 || l.y < cy0 - 10 || l.y > cy0 + CH + 10) continue;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(l.x + 3, l.y + 3, 6, 0, TAU); g.fill();
    g.fillStyle = '#3b4046'; g.beginPath(); g.arc(l.x, l.y, 5.5, 0, TAU); g.fill();
    g.fillStyle = '#d9d2b0'; g.beginPath(); g.arc(l.x, l.y, 2.5, 0, TAU); g.fill();
  }
}
