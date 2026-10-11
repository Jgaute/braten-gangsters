'use strict';
// ---------- Bilar, fotgängare, fysik och AI ----------
let nextId = 1;
let cars = [], peds = [], particles = [], tracers = [];
const CAR_SCALE = 0.6;
const MODELS = {
  1: { name: 'Sportbil', max: 640, acc: 480, grip: 9.0, turn: 2.9, mass: 1.0, hp: 90 },
  2: { name: 'Kompakt', max: 480, acc: 390, grip: 8.5, turn: 3.1, mass: 0.8, hp: 80 },
  3: { name: 'Sedan', max: 540, acc: 410, grip: 8.0, turn: 2.7, mass: 1.1, hp: 110 },
  4: { name: 'Pickup', max: 460, acc: 340, grip: 7.0, turn: 2.4, mass: 1.5, hp: 150 },
  5: { name: 'Coupé', max: 590, acc: 445, grip: 8.6, turn: 2.8, mass: 1.0, hp: 100 },
  6: { name: 'Motorcykel', max: 680, acc: 560, grip: 9.5, turn: 3.3, mass: 0.5, hp: 60 },
  7: { name: 'Knutter GT', max: 830, acc: 660, grip: 10.5, turn: 3.0, mass: 2.0, hp: 320 },
  8: { name: 'Stridsvagn', max: 165, acc: 150, grip: 16, turn: 1.4, mass: 8.0, hp: 2500, tracks: true },
};
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // Ö S V N
const DIR_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ===== Bilar =====
function makeCar(x, y, a, o = {}) {
  const police = !!o.police;
  const color = police ? 'blue' : (o.color || pick(CAR_COLORS));
  const model = police ? 3 : (o.model || ri(1, 5));
  const key = police ? 'police' : (o.key || `car_${color}_${model}`);
  const img = IMG[key];
  const m = MODELS[model];
  const c = {
    kind: 'car', id: nextId++, x, y, a, vx: 0, vy: 0, vf: 0, spin: 0, color, model, m, key, img,
    w: img.width * (o.scale || CAR_SCALE), l: img.height * (o.scale || CAR_SCALE),
    maxHp: m.hp * (police ? 1.5 : 1), hp: 0, driver: null, ai: null, police, dead: false, burn: 0, deadT: 0,
    slip: 0, input: { thr: 0, steer: 0, hb: false }, copsInside: police ? 2 : 0, siren: false,
    persist: !!o.persist, sndT: 0, wheels: null, honkT: 0, missionMark: false, crimeT: 0,
  };
  c.hp = c.maxHp;
  cars.push(c);
  return c;
}

function setCarColor(c, color) {
  if (c.police || c.special) return;
  c.color = color; c.key = `car_${color}_${c.model}`; c.img = IMG[c.key];
}

function carCircles(c) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a), r = c.w / 2, off = c.l / 2 - r;
  return [[c.x + fx * off, c.y + fy * off, r], [c.x, c.y, r], [c.x - fx * off, c.y - fy * off, r]];
}

function stepCar(c, dt) {
  const m = c.m;
  const inp = c.dead ? { thr: 0, steer: 0, hb: true } : c.input;
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let vf = c.vx * fx + c.vy * fy, vl = -c.vx * fy + c.vy * fx;
  const maxS = c.police ? 580 : m.max, acc = c.police ? 450 : m.acc;
  const thr = inp.thr;
  if (thr > 0) { if (vf < -15) vf += 900 * thr * dt; else vf += acc * thr * dt * Math.max(0, 1 - vf / maxS); }
  else if (thr < 0) {
    if (vf > 15) vf -= 950 * -thr * dt;
    else { vf -= acc * 0.7 * -thr * dt; if (vf < -maxS * 0.3) vf = -maxS * 0.3; }
  } else { const r = Math.min(Math.abs(vf), 90 * dt); vf -= Math.sign(vf) * r; }
  vf -= vf * 0.25 * dt;
  if (inp.hb) { const r = Math.min(Math.abs(vf), 320 * dt); vf -= Math.sign(vf) * r; }
  const grip = (inp.hb ? 1.1 : m.grip) * (c.dead ? 2 : 1) * (1 - 0.32 * WEATHER.rain); // regn = halt
  vl *= Math.exp(-grip * dt);
  c.slip = Math.abs(vl);
  const sp = m.tracks ? 1 : Math.min(1, Math.abs(vf) / 110);
  const hiS = m.tracks ? 1 : 1 - 0.3 * Math.min(1, Math.abs(vf) / maxS);
  const turn = inp.steer * m.turn * sp * hiS * (vf >= (m.tracks ? -20 : 0) ? 1 : -1) * (inp.hb && !m.tracks ? 1.35 : 1);
  c.a += (turn + c.spin) * dt;
  c.spin *= Math.exp(-5 * dt);
  c.vx = fx * vf - fy * vl; c.vy = fy * vf + fx * vl;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.vf = vf;
  c.sndT -= dt;
  carWorldCollide(c);

  // sladdmärken
  const skidding = c.slip > 110 || (inp.hb && Math.abs(vf) > 90) || (thr < 0 && vf > 220);
  const fx2 = Math.cos(c.a), fy2 = Math.sin(c.a);
  const wl = [], back = c.l * 0.3, side = c.w * 0.36;
  wl.push([c.x - fx2 * back - fy2 * side, c.y - fy2 * back + fx2 * side]);
  wl.push([c.x - fx2 * back + fy2 * side, c.y - fy2 * back - fx2 * side]);
  if (skidding && c.wheels) {
    const w0 = c.wheels;
    decal(c.x, c.y, 80, (g) => {
      g.strokeStyle = 'rgba(18,18,18,0.32)'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k < 2; k++) { g.moveTo(w0[k][0], w0[k][1]); g.lineTo(wl[k][0], wl[k][1]); }
      g.stroke();
    });
    if (Math.random() < 0.3) smoke(wl[0][0], wl[0][1], 0.6, false);
  }
  c.wheels = wl;
  c.skidding = skidding;
}

function circleWorld(x, y, r) {
  let px = x, py = y, nxs = 0, nys = 0, hit = false;
  const tx0 = Math.floor((px - r) / T), tx1 = Math.floor((px + r) / T), ty0 = Math.floor((py - r) / T), ty1 = Math.floor((py + r) / T);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!solidTile(tx, ty)) continue;
    const bx0 = tx * T, by0 = ty * T;
    const cx = clamp(px, bx0, bx0 + T), cy = clamp(py, by0, by0 + T);
    const dx = px - cx, dy = py - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    let nx, ny, push;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; push = r - d; }
    else {
      const l = px - bx0, rg = bx0 + T - px, u = py - by0, dn = by0 + T - py, mn = Math.min(l, rg, u, dn);
      if (mn === l) { nx = -1; ny = 0; push = l + r; } else if (mn === rg) { nx = 1; ny = 0; push = rg + r; }
      else if (mn === u) { nx = 0; ny = -1; push = u + r; } else { nx = 0; ny = 1; push = dn + r; }
    }
    px += nx * push; py += ny * push; nxs += nx; nys += ny; hit = true;
  }
  const ttx = Math.floor(px / T), tty = Math.floor(py / T);
  for (let ty = tty - 1; ty <= tty + 1; ty++) for (let tx = ttx - 1; tx <= ttx + 1; tx++) {
    const arr = treeGrid.get(ty * MW + tx);
    if (!arr) continue;
    for (const t of arr) {
      if (!t.r) continue;
      const dx = px - t.x, dy = py - t.y, d2 = dx * dx + dy * dy, rs = r + t.r;
      if (d2 < rs * rs && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        px += nx * (rs - d); py += ny * (rs - d); nxs += nx; nys += ny; hit = true;
      }
    }
  }
  return { x: px, y: py, nx: nxs, ny: nys, hit };
}

function carWorldCollide(c) {
  for (let it = 0; it < 2; it++) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a), r = c.w / 2, off = c.l / 2 - r;
    for (const o of [off, 0, -off]) {
      const px = c.x + fx * o, py = c.y + fy * o;
      const res = circleWorld(px, py, r);
      if (!res.hit) continue;
      c.x += res.x - px; c.y += res.y - py;
      const nl = Math.hypot(res.nx, res.ny) || 1, nx = res.nx / nl, ny = res.ny / nl;
      const vn = c.vx * nx + c.vy * ny;
      if (vn < 0) {
        const J = -(1 + 0.3) * vn;
        c.vx += J * nx; c.vy += J * ny;
        const tx = -ny, ty = nx, vt = c.vx * tx + c.vy * ty;
        c.vx -= tx * vt * 0.15; c.vy -= ty * vt * 0.15;
        const rx = fx * o, ry = fy * o;
        c.spin += (rx * (J * ny) - ry * (J * nx)) * 0.00012 / c.m.mass;
        impactCar(c, -vn, px - nx * r, py - ny * r);
      }
    }
  }
}

function impactCar(c, imp, x, y) {
  if (c.sndT <= 0) {
    if (imp > 80) { sfx('crash', x, y, clamp(imp / 420, 0.15, 1)); c.sndT = 0.15; sparks(x, y, Math.min(12, imp / 30)); }
    else if (imp > 40) { sfx('scrape', x, y, 0.25); c.sndT = 0.2; }
  }
  if (imp > 130) damageCar(c, (imp - 130) * 0.07, null);
}

function damageCar(c, dmg, by) {
  if (c.dead) return;
  if (c.m.tracks) dmg *= 0.35; // pansar
  if (by === 'player' && c.gang && c.gang !== 'knutter') provokeGang(c.gang);
  c.hp -= dmg;
  if (by === 'player') c.lastHitByPlayer = gameTime;
  if (c.hp <= 0) explodeCar(c);
}

function carCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const md = (a.l + b.l) / 2;
      if (Math.abs(a.x - b.x) > md || Math.abs(a.y - b.y) > md) continue;
      // Stridsvagnen kör rakt över vrak och spränger bilar den kör på
      const tank = a.m.tracks ? a : b.m.tracks ? b : null;
      if (tank) {
        const other = tank === a ? b : a;
        if (other.dead) continue;
        let touch = false;
        for (const p of carCircles(tank)) for (const q of carCircles(other)) if (dist2(p[0], p[1], q[0], q[1]) < (p[2] + q[2] + 3) ** 2) touch = true;
        if (touch && Math.hypot(tank.vx, tank.vy) > 12) {
          if (tank.driver === 'player') other.lastHitByPlayer = gameTime;
          if (other.driver === 'player') { other.hp = 0; }
          sfx('crash', other.x, other.y, 1, 0.7);
          explodeCar(other);
          continue;
        }
      }
      const ca = carCircles(a), cb = carCircles(b);
      let maxImp = 0, ix = 0, iy = 0, an = 0, bn = 0;
      for (const p of ca) for (const q of cb) {
        const dx = q[0] - p[0], dy = q[1] - p[1], rs = p[2] + q[2], d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = rs - d;
        const ma = a.m.mass * (a.dead ? 1.6 : 1) * (a.parked ? 1.5 : 1), mb = b.m.mass * (b.dead ? 1.6 : 1) * (b.parked ? 1.5 : 1);
        const ia = 1 / ma, ib = 1 / mb, is = ia + ib;
        a.x -= nx * ov * ia / is; a.y -= ny * ov * ia / is;
        b.x += nx * ov * ib / is; b.y += ny * ov * ib / is;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const J = -(1 + 0.25) * rv / is;
          a.vx -= J * ia * nx; a.vy -= J * ia * ny; b.vx += J * ib * nx; b.vy += J * ib * ny;
          const rax = p[0] - a.x, ray = p[1] - a.y, rbx = q[0] - b.x, rby = q[1] - b.y;
          a.spin += (rax * (-J * ny) - ray * (-J * nx)) * 0.00012 * ia;
          b.spin += (rbx * (J * ny) - rby * (J * nx)) * 0.00012 * ib;
          if (-rv > maxImp) {
            maxImp = -rv; ix = (p[0] + q[0]) / 2; iy = (p[1] + q[1]) / 2;
            an = a.vx * nx + a.vy * ny; bn = -(b.vx * nx + b.vy * ny); // hur mycket var och en körde in i den andra
          }
        }
      }
      if (maxImp > 0) carCarImpact(a, b, maxImp, ix, iy, an, bn);
    }
  }
}

function carCarImpact(a, b, imp, x, y, an, bn) {
  if (a.sndT <= 0 && b.sndT <= 0 && imp > 60) { sfx('crash', x, y, clamp(imp / 400, 0.2, 1)); a.sndT = b.sndT = 0.15; sparks(x, y, Math.min(14, imp / 25)); }
  a.parked = b.parked = false;
  const tankA = a.m.tracks, tankB = b.m.tracks;
  if (imp > 130 || ((tankA || tankB) && imp > 40)) {
    const by = (a.driver === 'player' || b.driver === 'player') ? 'player' : null;
    // stridsvagnen krossar allt den kör på och tar knappt skada själv
    const dA = tankA ? (imp - 130) * 0.01 : tankB ? (imp - 40) * 0.35 : (imp - 130) * 0.05;
    const dB = tankB ? (imp - 130) * 0.01 : tankA ? (imp - 40) * 0.35 : (imp - 130) * 0.05;
    if (dA > 0) damageCar(a, dA, by);
    if (dB > 0) damageCar(b, dB, by);
    for (const [me, other, otherPush] of [[a, b, bn], [b, a, an]]) {
      if (other.driver !== 'player' || me.dead) continue;
      const myPush = me === a ? an : bn;
      if (me.police && otherPush > myPush && gameTime - me.crimeT > 2) { me.crimeT = gameTime; crime(0.5, 'polisbil', false); }
      if (me.ai && !me.police) { me.ai.angry = 3; if (Math.random() < 0.5) sfxHorn(me.x, me.y); }
    }
  }
}

function explodeCar(c) {
  if (c.dead) return;
  c.dead = true; c.hp = 0; c.deadT = 0; c.burn = 0;
  c.img = IMG['burnt_' + c.key]; c.siren = false;
  const byPlayer = c.lastHitByPlayer && gameTime - c.lastHitByPlayer < 8;
  if (c.driver === 'player') { exitCar(true); hurtPlayer(999); }
  explosion(c.x, c.y, byPlayer ? 'player' : null);
  if (c.ai) { c.driver = null; c.ai = null; }
  if (byPlayer) { crime(c.police ? 1.2 : 0.3, 'bil', false); player.money += c.police ? 150 : 50; }
  if (typeof onCarDestroyed === 'function') onCarDestroyed(c);
}

function explosion(x, y, by) {
  sfxExplosion(x, y);
  shake = Math.max(shake, 14);
  addP({ x, y, vx: 0, vy: 0, life: 0.45, t: 0, type: 'flash', size: 150 });
  for (let i = 0; i < 26; i++) { const a = rr(0, TAU), s = rr(40, 260); addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(0.4, 0.9), t: 0, type: 'fire', size: rr(10, 22) }); }
  for (let i = 0; i < 14; i++) smoke(x + rr(-30, 30), y + rr(-30, 30), 2.2, true);
  sparks(x, y, 24);
  decal(x, y, 90, (g) => {
    const gr = g.createRadialGradient(x, y, 5, x, y, 80);
    gr.addColorStop(0, 'rgba(10,8,6,0.75)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 80, 0, TAU); g.fill();
  });
  const R = 130;
  for (const c of cars) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < R && d > 1) { const k = c.m.tracks ? 0.2 : 1; c.hp -= 75 * (1 - d / R) * k; c.vx += (c.x - x) / d * 260 * (1 - d / R) * k; c.vy += (c.y - y) / d * 260 * (1 - d / R) * k; c.spin += rr(-3, 3) * k; if (by) c.lastHitByPlayer = gameTime; }
  }
  for (const p of peds) {
    if (p.dead || (p.type === 'gang' && by === 'player')) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < R) killPed(p, by, (p.x - x) / (d || 1) * 300, (p.y - y) / (d || 1) * 300);
    else if (d < 450) scare(p, x, y);
  }
  if (!player.car && player.state === 'alive') {
    const d = Math.hypot(player.x - x, player.y - y);
    if (d < R) { hurtPlayer(90 * (1 - d / R) + 15); }
  }
}

// ===== Trafik-AI =====
function laneCoord(dir, road, lane) {
  switch (dir) {
    case 0: return (ys[road] + 2.5 + lane) * T;
    case 2: return (ys[road] + 1.5 - lane) * T;
    case 1: return (xs[road] + 1.5 - lane) * T;
    default: return (xs[road] + 2.5 + lane) * T;
  }
}

function makeAI(c, dir, road, lane, mode) {
  c.ai = { dir, road, lane, wps: [], cx: c.x, cy: c.y, mode: mode || 'traffic', speed: rr(200, 250), waitT: 0, ignore: 0, rev: 0, direct: false, losT: 0, angry: 0 };
  c.driver = c.police ? 'cop' : 'ai';
}

function planNext(c) {
  const ai = c.ai, d = ai.dir;
  let ii = -1, jj = -1, entry = null;
  if (d === 0) { jj = ai.road; for (let i = 0; i < NX; i++) if (xs[i] * T > ai.cx - 4) { ii = i; break; } if (ii >= 0) entry = { x: xs[ii] * T, y: laneCoord(0, jj, ai.lane) }; else ii = NX - 1; }
  else if (d === 2) { jj = ai.road; for (let i = NX - 1; i >= 0; i--) if ((xs[i] + 4) * T < ai.cx + 4) { ii = i; break; } if (ii >= 0) entry = { x: (xs[ii] + 4) * T, y: laneCoord(2, jj, ai.lane) }; else ii = 0; }
  else if (d === 1) { ii = ai.road; for (let j = 0; j < NY; j++) if (ys[j] * T > ai.cy - 4) { jj = j; break; } if (jj >= 0) entry = { x: laneCoord(1, ii, ai.lane), y: ys[jj] * T }; else jj = NY - 1; }
  else { ii = ai.road; for (let j = NY - 1; j >= 0; j--) if ((ys[j] + 4) * T < ai.cy + 4) { jj = j; break; } if (jj >= 0) entry = { x: laneCoord(3, ii, ai.lane), y: (ys[jj] + 4) * T }; else jj = 0; }

  const opts = [];
  if (ii < NX - 1) opts.push(0);
  if (jj < NY - 1) opts.push(1);
  if (ii > 0) opts.push(2);
  if (jj > 0) opts.push(3);
  let choices = opts.filter(o => o !== (d + 2) % 4);
  if (!choices.length) choices = opts;
  let nd;
  if (ai.mode === 'chase') {
    const tx = player.car ? player.car.x : player.x, ty = player.car ? player.car.y : player.y;
    const vx = tx - (entry ? entry.x : ai.cx), vy = ty - (entry ? entry.y : ai.cy), vl = Math.hypot(vx, vy) || 1;
    let best = -9;
    for (const o of choices) { const s = (DIRS[o][0] * vx + DIRS[o][1] * vy) / vl + rr(0, 0.25); if (s > best) { best = s; nd = o; } }
  } else {
    const straight = choices.includes(d);
    const r = Math.random();
    if (straight && r < 0.5) nd = d;
    else { const turns = choices.filter(o => o !== d); nd = turns.length ? pick(turns) : d; }
  }
  const lane = ai.lane;
  let exit;
  if (nd === 0) exit = { x: (xs[ii] + 4) * T, y: laneCoord(0, jj, lane) };
  else if (nd === 2) exit = { x: xs[ii] * T, y: laneCoord(2, jj, lane) };
  else if (nd === 1) exit = { x: laneCoord(1, ii, lane), y: (ys[jj] + 4) * T };
  else exit = { x: laneCoord(3, ii, lane), y: ys[jj] * T };
  const start = entry || { x: ai.cx, y: ai.cy };
  if (entry) ai.wps.push({ x: entry.x, y: entry.y, entry: true, ii, jj });
  if (nd !== d && nd !== (d + 2) % 4) {
    const horiz = d === 0 || d === 2;
    const corner = horiz ? { x: exit.x, y: start.y } : { x: start.x, y: exit.y };
    for (const t of [0.3, 0.55, 0.8]) {
      const u = 1 - t;
      ai.wps.push({ x: u * u * start.x + 2 * u * t * corner.x + t * t * exit.x, y: u * u * start.y + 2 * u * t * corner.y + t * t * exit.y, turn: true });
    }
  }
  ai.wps.push({ x: exit.x, y: exit.y, exit: true });
  ai.dir = nd;
  ai.road = (nd === 0 || nd === 2) ? jj : ii;
  ai.cx = exit.x; ai.cy = exit.y;
}

function snapToLane(c) {
  const ai = c.ai;
  ai.wps = [];
  let bh = 0, dh = 1e9, bv = 0, dv = 1e9;
  for (let j = 0; j < NY; j++) { const d = Math.abs(c.y - (ys[j] + 2) * T); if (d < dh) { dh = d; bh = j; } }
  for (let i = 0; i < NX; i++) { const d = Math.abs(c.x - (xs[i] + 2) * T); if (d < dv) { dv = d; bv = i; } }
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let useH = dh < dv;
  if (dh < 2 * T && dv < 2 * T) useH = Math.abs(fx) > Math.abs(fy);
  if (useH) {
    ai.dir = fx >= 0 ? 0 : 2; ai.road = bh;
    ai.lane = Math.abs(c.y - laneCoord(ai.dir, bh, 0)) < Math.abs(c.y - laneCoord(ai.dir, bh, 1)) ? 0 : 1;
    ai.cx = c.x + DIRS[ai.dir][0] * 70; ai.cy = laneCoord(ai.dir, bh, ai.lane);
  } else {
    ai.dir = fy >= 0 ? 1 : 3; ai.road = bv;
    ai.lane = Math.abs(c.x - laneCoord(ai.dir, bv, 0)) < Math.abs(c.x - laneCoord(ai.dir, bv, 1)) ? 0 : 1;
    ai.cx = laneCoord(ai.dir, bv, ai.lane); ai.cy = c.y + DIRS[ai.dir][1] * 70;
  }
  ai.wps.push({ x: ai.cx, y: ai.cy });
  planNext(c);
}

function inIntersection(x, y) {
  const i = vBand(x), j = hBand(y);
  return i >= 0 && j >= 0;
}

function intersectionBusy(ii, jj, me) {
  const x0 = xs[ii] * T, x1 = x0 + 4 * T, y0 = ys[jj] * T, y1 = y0 + 4 * T;
  for (const o of cars) {
    if (o === me || o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
    if (Math.abs(angDiff(o.a, me.a)) > 0.5) return true;
  }
  return false;
}

function lookAhead(c) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let best = 1e9;
  for (const o of cars) {
    if (o === c) continue;
    const rx = o.x - c.x, ry = o.y - c.y;
    if (Math.abs(rx) > 260 || Math.abs(ry) > 260) continue;
    const along = rx * fx + ry * fy;
    if (along <= 0) continue;
    const lat = Math.abs(-rx * fy + ry * fx);
    if (lat < (o.w + c.w) / 2 + 6) { const g = along - (c.l + o.l) / 2; if (g < best) best = g; }
  }
  for (const p of peds) {
    if (p.dead) continue;
    const rx = p.x - c.x, ry = p.y - c.y;
    if (Math.abs(rx) > 200 || Math.abs(ry) > 200) continue;
    const along = rx * fx + ry * fy;
    if (along <= 0) continue;
    if (Math.abs(-rx * fy + ry * fx) < c.w / 2 + 14) { const g = along - c.l / 2 - 10; if (g < best) best = g; }
  }
  if (!player.car && player.state === 'alive') {
    const rx = player.x - c.x, ry = player.y - c.y, along = rx * fx + ry * fy;
    if (along > 0 && along < 220 && Math.abs(-rx * fy + ry * fx) < c.w / 2 + 14) best = Math.min(best, along - c.l / 2 - 10);
  }
  return best;
}

function los(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 24);
  for (let k = 1; k < n; k++) { const t = k / n; if (solidW(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}

function aiDrive(c, dt) {
  const ai = c.ai;
  const inp = c.input;
  ai.ignore = Math.max(0, ai.ignore - dt);
  ai.angry = Math.max(0, ai.angry - dt);
  const speed = Math.hypot(c.vx, c.vy);
  const fx = Math.cos(c.a), fy = Math.sin(c.a);

  // Polisjakt: direkt mot spelaren när de ser hen
  if (ai.mode === 'chase') {
    const tgt = player.car || player;
    ai.losT -= dt;
    if (ai.losT <= 0) {
      ai.losT = 0.3;
      const d = Math.hypot(tgt.x - c.x, tgt.y - c.y);
      const was = ai.direct;
      ai.direct = !playerSafe() && d < 420 && los(c.x, c.y, tgt.x, tgt.y);
      if (was && !ai.direct) snapToLane(c);
    }
    if (ai.direct) {
      const px = tgt.x + (tgt.vx || 0) * 0.3, py = tgt.y + (tgt.vy || 0) * 0.3;
      const da = angDiff(c.a, Math.atan2(py - c.y, px - c.x));
      const d = Math.hypot(tgt.x - c.x, tgt.y - c.y);
      if (ai.rev > 0) { ai.rev -= dt; inp.thr = -1; inp.steer = -Math.sign(da); inp.hb = false; return; }
      inp.steer = clamp(da * 2.5, -1, 1);
      if (!player.car && d < 150) { inp.thr = c.vf > 20 ? -1 : 0; inp.hb = d < 100; }
      else if (player.car && d < 105) { const ps = Math.hypot(tgt.vx, tgt.vy); inp.thr = ps < 60 ? (c.vf > 30 ? -1 : 0) : 0.7; inp.hb = false; }
      else { inp.thr = Math.abs(da) > 1.6 && c.vf > 200 ? -0.5 : 1; inp.hb = Math.abs(da) > 1.2 && c.vf > 250; }
      stuckCheck(c, dt, speed, true);
      return;
    }
  }

  if (!ai.wps.length) planNext(c);
  for (let guard = 0; guard < 6 && ai.wps.length; guard++) {
    const w = ai.wps[0];
    const dx = w.x - c.x, dy = w.y - c.y;
    const d2 = dx * dx + dy * dy;
    const behind = dx * fx + dy * fy < 0 && d2 < 90 * 90;
    if (d2 < 32 * 32 || behind) { ai.wps.shift(); if (!ai.wps.length) planNext(c); } else break;
  }
  let w = ai.wps[0];
  if (!w) return;
  if (dist2(c.x, c.y, w.x, w.y) > 320 * 320) { snapToLane(c); w = ai.wps[0]; }

  const desired = Math.atan2(w.y - c.y, w.x - c.x);
  const da = angDiff(c.a, desired);
  let target = ai.mode === 'chase' ? 470 : ai.speed * (ai.angry > 0 ? 1.4 : 1);
  if (Math.abs(da) > 0.3 || w.turn) target = Math.min(target, ai.mode === 'chase' ? 230 : 140);
  const nxt = ai.wps[1];
  if (nxt && nxt.turn && Math.hypot(w.x - c.x, w.y - c.y) < 110) target = Math.min(target, ai.mode === 'chase' ? 260 : 150);

  if (ai.ignore <= 0) {
    if (w.entry && ai.mode !== 'chase') {
      const d = Math.hypot(w.x - c.x, w.y - c.y);
      if (d < 100 && intersectionBusy(w.ii, w.jj, c)) target = 0;
    }
    const gap = lookAhead(c);
    if (gap < 400) target = Math.min(target, Math.max(0, (gap - 12) * 2.2));
  }

  if (ai.rev > 0) { ai.rev -= dt; inp.thr = -1; inp.steer = -clamp(da * 2, -1, 1); inp.hb = false; return; }
  inp.steer = clamp(da * 2.4, -1, 1);
  const vf = c.vf;
  if (target < 5) inp.thr = vf > 10 ? -1 : 0;
  else if (vf < target - 15) inp.thr = 1;
  else if (vf > target + 25) inp.thr = -0.6;
  else inp.thr = 0.2;
  inp.hb = false;
  stuckCheck(c, dt, speed, target > 30);
}

function stuckCheck(c, dt, speed, wantsMove) {
  const ai = c.ai;
  if (speed < 18) ai.waitT += dt; else ai.waitT = Math.max(0, ai.waitT - dt * 2);
  if (ai.waitT > (wantsMove ? 1.6 : 4.5)) {
    ai.waitT = 0;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const blocked = solidW(c.x + fx * (c.l / 2 + 18), c.y + fy * (c.l / 2 + 18));
    if (blocked || wantsMove) ai.rev = 0.9;
    ai.ignore = 1.8;
    if (c.honkT <= 0) { sfxHorn(c.x, c.y); c.honkT = 2; }
  }
  c.honkT -= dt;
}

// ===== Fotgängare =====
const PED_SETS = ['manBlue', 'manBrown', 'manOld', 'womanGreen'];
function makePed(x, y, type = 'civ', o = {}) {
  const set = type === 'cop' ? 'soldier' : type === 'gang' ? 'gang' : type === 'jogger' ? 'jogger' : type === 'target' ? 'manBrown' : (o.set || pick(PED_SETS));
  const lk = type === 'cop' ? 'cop' : type === 'gang' ? 'knutter' : type === 'jogger' ? 'jogger' : type === 'target' ? 'target' : type === 'rival' ? o.gang : pick(CIV_LOOKS);
  const p = {
    kind: 'ped', id: nextId++, x, y, a: rr(0, TAU), kx: 0, ky: 0, type, set, gang: o.gang || null,
    look: `${lk}:${randTone()}:${ri(0, 4)}`,
    hp: type === 'cop' ? 90 : type === 'gang' ? 160 : type === 'rival' ? 90 : type === 'target' ? 120 : 50,
    state: 'walk', tx: x, ty: y, dir: null, fleeT: 0, thx: 0, thy: 0, dead: false, deadT: 0,
    shootCd: rr(0.6, 1.4), persist: !!o.persist, ph: rr(0, 10), speed: rr(36, 52),
    money: type === 'rival' ? ri(40, 120) : Math.random() < 0.5 ? ri(10, 60) : 0, arrestT: 0, moving: false, remove: false, burst: 0,
  };
  peds.push(p);
  return p;
}
function pedWalkable(tx, ty) { const t = tileAt(tx, ty); return t === TL.SIDE || t === TL.PATH || t === TL.GRASS || t === TL.LOT || t === TL.ALLEY; }

function pedPickTarget(p) {
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  if (!pedWalkable(tx, ty)) {
    for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (pedWalkable(tx + dx, ty + dy)) { p.tx = (tx + dx + 0.5) * T; p.ty = (ty + dy + 0.5) * T; p.dir = null; return; }
    }
    p.tx = p.x + rr(-60, 60); p.ty = p.y + rr(-60, 60); return;
  }
  const opts = DIRS.filter(d => pedWalkable(tx + d[0], ty + d[1]));
  if (!opts.length) { p.tx = (tx + 0.5) * T; p.ty = (ty + 0.5) * T; return; }
  let d = null;
  if (p.dir && Math.random() < 0.82 && opts.some(o => o[0] === p.dir[0] && o[1] === p.dir[1])) d = p.dir;
  else {
    const nr = opts.filter(o => !(p.dir && o[0] === -p.dir[0] && o[1] === -p.dir[1]));
    d = pick(nr.length ? nr : opts);
  }
  p.dir = d;
  p.tx = (tx + d[0] + 0.5) * T + rr(-16, 16);
  p.ty = (ty + d[1] + 0.5) * T + rr(-16, 16);
}

function scare(p, x, y, t = 5) {
  if (p.dead || p.type === 'cop' || p.type === 'jogger' || p.type === 'gang' || p.type === 'rival') return;
  p.state = 'flee'; p.fleeT = t + rr(0, 2); p.thx = x; p.thy = y;
}

function updatePed(p, dt) {
  if (p.dead) {
    p.deadT += dt;
    p.x += p.kx * dt; p.y += p.ky * dt;
    p.kx *= Math.exp(-5 * dt); p.ky *= Math.exp(-5 * dt);
    return;
  }
  let mx = 0, my = 0, spd = 0;
  if (p.burning > 0) {
    // brinner: springer runt och tar skada
    p.burning -= dt; p.hp -= 32 * dt;
    if (Math.random() < dt * 30) flame(p.x, p.y);
    if (p.hp <= 0) { killPed(p, p.burnBy, 0, 0); return; }
    if (!p.burnDir || Math.random() < dt * 2.5) p.burnDir = rr(0, TAU);
    p.x += Math.cos(p.burnDir) * 150 * dt; p.y += Math.sin(p.burnDir) * 150 * dt;
    const rb = circleWorld(p.x, p.y, 9); p.x = rb.x; p.y = rb.y; if (rb.hit) p.burnDir += Math.PI * 0.7;
    p.a = lerpAngle(p.a, p.burnDir, 10 * dt); p.moving = true; p.ph += dt * 18;
    return;
  }
  if (p.type === 'cop' && stars() > 0 && player.state === 'alive') {
    // tappar spåret om de inte sett spelaren på ett tag
    p.losT = (p.losT || 0) - dt;
    if (p.losT <= 0) { p.losT = 0.3; const tg = player.car || player; p.lost = los(p.x, p.y, tg.x, tg.y) ? 0 : (p.lost || 0) + 0.3; }
  }
  if (p.type === 'cop' && p.lost > 4 && stars() > 0) {
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 6) pedPickTarget(p); else { mx = dx / d; my = dy / d; spd = 60; }
  } else if (p.type === 'gang') {
    const r = gangAI(p, dt); mx = r[0]; my = r[1]; spd = r[2];
  } else if (p.type === 'rival') {
    const r = rivalAI(p, dt); mx = r[0]; my = r[1]; spd = r[2];
  } else if (p.type === 'jogger') {
    const r = joggerAI(p, dt); mx = r[0]; my = r[1]; spd = r[2];
  } else if (p.type === 'cop' && stars() > 0 && player.state === 'alive') {
    const r = copAI(p, dt); mx = r[0]; my = r[1]; spd = r[2];
  } else if (p.state === 'flee') {
    p.fleeT -= dt;
    const dx = p.x - p.thx, dy = p.y - p.thy, d = Math.hypot(dx, dy) || 1;
    mx = dx / d; my = dy / d; spd = 140;
    if (p.fleeT <= 0) { p.state = 'walk'; p.dir = null; pedPickTarget(p); }
  } else {
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 6) pedPickTarget(p); else { mx = dx / d; my = dy / d; spd = p.speed; }
  }
  p.x += (mx * spd + p.kx) * dt; p.y += (my * spd + p.ky) * dt;
  p.kx *= Math.exp(-6 * dt); p.ky *= Math.exp(-6 * dt);
  const res = circleWorld(p.x, p.y, 9);
  if (res.hit) {
    p.x = res.x; p.y = res.y;
    if (p.state === 'flee') { const a = Math.atan2(p.y - p.thy, p.x - p.thx) + rr(-1.2, 1.2); p.thx = p.x - Math.cos(a) * 50; p.thy = p.y - Math.sin(a) * 50; }
    else if (p.type === 'jogger') joggerPickTarget(p);
    else if (p.state === 'walk' && p.type !== 'cop') pedPickTarget(p);
  }
  p.moving = spd > 0;
  if (spd > 0 && !(p.type === 'cop' && stars() > 0 && !(p.lost > 4)) && !(p.type === 'rival' && GANGS[p.gang].anger > 0)) p.a = lerpAngle(p.a, Math.atan2(my, mx), 10 * dt);
  if (spd > 0) p.ph += dt * spd * 0.12;
}

function copAI(p, dt) {
  const tgt = player.car || player;
  const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
  const st = stars();
  const safe = playerSafe();
  // Skjuter gänget på dem skjuter de tillbaka
  let shootAt = safe ? null : tgt, sd = d;
  for (const g of peds) {
    if (g.type !== 'gang' || g.dead) continue;
    const gd = Math.hypot(g.x - p.x, g.y - p.y);
    if (gd < 380 && (gd < sd || !shootAt)) { shootAt = g; sd = gd; }
  }
  const aimX = shootAt ? shootAt.x : tgt.x, aimY = shootAt ? shootAt.y : tgt.y;
  p.a = lerpAngle(p.a, Math.atan2(aimY - p.y, aimX - p.x), 12 * dt);
  let mx = dx / d, my = dy / d, spd = 140;
  if (d > 1500 && !p.persist) p.remove = true;
  if (st >= 3 && d < 170) spd = 0;
  if (d < 20) spd = 0;
  p.shootCd -= dt;
  const canShoot = shootAt && (shootAt.type === 'gang' || st >= 3);
  if (canShoot && sd < 430 && p.shootCd <= 0) {
    if (los(p.x, p.y, aimX, aimY)) {
      const w = st >= 4 ? 'rifle' : 'pistol';
      fireWeapon(p, p.x + Math.cos(p.a) * 18, p.y + Math.sin(p.a) * 18, p.a, w);
      p.shootCd = st >= 4 ? rr(0.4, 0.7) : rr(1.0, 1.6);
    } else p.shootCd = 0.3;
  }
  if (!safe && !player.car && d < 28 && st <= 2) {
    p.arrestT += dt;
    if (p.arrestT > 1.6) busted();
  } else if (!safe && player.car && d < 75 && Math.hypot(player.car.vx, player.car.vy) < 30 && st <= 2) {
    p.arrestT += dt;
    if (p.arrestT > 2.5) busted();
  } else p.arrestT = Math.max(0, p.arrestT - dt);
  return [mx, my, spd];
}

function killPed(p, by, kx = 0, ky = 0) {
  if (p.dead) return;
  p.dead = true; p.deadT = 0; p.kx = kx * 0.5; p.ky = ky * 0.5; p.hp = 0;
  bloodSplat(p.x, p.y, 1);
  sfxSplat(p.x, p.y, Math.hypot(kx, ky) > 150 ? 1 : 0.6);
  if (by === 'player') {
    if (p.type === 'cop') crime(1.5, 'polis', false);
    else crime(witnessed(p.x, p.y) ? 1 : 0.34, 'mord', false);
    if (p.money) spawnPickup(p.x, p.y, 'money', p.money);
    if (p.type === 'cop' && Math.random() < 0.6) spawnPickup(p.x + 10, p.y, 'weapon', 'pistol');
  }
  for (const o of peds) if (!o.dead && o !== p && dist2(o.x, o.y, p.x, p.y) < 300 * 300) scare(o, p.x, p.y);
  if (typeof onPedKilled === 'function') onPedKilled(p, by);
}

function damagePed(p, dmg, by, kx, ky) {
  if (p.dead) return;
  p.hp -= dmg;
  p.kx += kx; p.ky += ky;
  bloodSplat(p.x, p.y, 0.4);
  if (p.hp <= 0) killPed(p, by, kx, ky);
  else if (p.type !== 'cop') scare(p, p.x - kx, p.y - ky);
  if (by === 'player' && p.type === 'cop' && !p.dead) crime(0.6, 'polisvåld', false);
  if (by === 'player' && p.type === 'rival') provokeGang(p.gang);
}

function carPedCollisions() {
  for (const c of cars) {
    const sp = Math.hypot(c.vx, c.vy);
    const circ = carCircles(c);
    for (const p of peds) {
      if (p.dead || Math.abs(p.x - c.x) > c.l || Math.abs(p.y - c.y) > c.l) continue;
      for (const q of circ) {
        const dx = p.x - q[0], dy = p.y - q[1], rs = q[2] + 9, d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2) || 1;
        if (sp > (c.m.tracks ? 25 : 95) && !c.dead && p.type !== 'gang') {
          p.runOver = true;
          killPed(p, c.driver === 'player' ? 'player' : null, c.vx * 0.9, c.vy * 0.9);
          sfx('crash', p.x, p.y, 0.15, 1.4);
        } else { p.x += dx / d * (rs - d); p.y += dy / d * (rs - d); }
        break;
      }
    }
    if (!player.car && player.state === 'alive' && Math.abs(player.x - c.x) < c.l && Math.abs(player.y - c.y) < c.l) {
      for (const q of circ) {
        const dx = player.x - q[0], dy = player.y - q[1], rs = q[2] + 9, d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2) || 1;
        player.x += dx / d * (rs - d); player.y += dy / d * (rs - d);
        const rel = Math.hypot(c.vx, c.vy);
        if (rel > 140 && !c.dead && player.hitT <= 0) {
          hurtPlayer((rel - 140) * 0.12 + 5);
          player.kx = c.vx * 0.7; player.ky = c.vy * 0.7; player.hitT = 0.5;
          sfx('crash', player.x, player.y, 0.35, 1.3);
        }
        break;
      }
    }
  }
}

// ===== Partiklar =====
function addP(o) { if (particles.length > 800) particles.shift(); particles.push(o); }
function sparks(x, y, n) { for (let i = 0; i < n; i++) addP({ x, y, vx: rr(-260, 260), vy: rr(-260, 260), life: rr(0.12, 0.35), t: 0, type: 'spark' }); }
function smoke(x, y, s = 1, dark = false) { addP({ x, y, vx: rr(-18, 18), vy: rr(-18, 18), life: rr(0.8, 1.6) * (dark ? 1.6 : 1), t: 0, type: 'smoke', size: rr(7, 12) * s, dark }); }
function flame(x, y) { addP({ x: x + rr(-6, 6), y: y + rr(-6, 6), vx: rr(-20, 20), vy: rr(-20, 20), life: rr(0.25, 0.5), t: 0, type: 'fire', size: rr(6, 11) }); }
function bloodSplat(x, y, amt) {
  for (let i = 0; i < 8 * amt + 2; i++) addP({ x, y, vx: rr(-90, 90), vy: rr(-90, 90), life: rr(0.2, 0.4), t: 0, type: 'blood' });
  decal(x, y, 40, (g) => {
    g.fillStyle = 'rgba(120,10,12,0.75)';
    for (let i = 0; i < 4 + amt * 6; i++) { g.beginPath(); g.arc(x + rr(-14, 14) * amt, y + rr(-14, 14) * amt, rr(2, 7) * Math.max(0.6, amt), 0, TAU); g.fill(); }
  });
}

function updateParticles(dt) {
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grow && solidW(p.x, p.y)) { p.vx *= -0.2; p.vy *= -0.2; }
    const f = p.grow ? 1.5 : p.type === 'smoke' ? 1.2 : p.type === 'spark' ? 4 : 3;
    p.vx *= Math.exp(-f * dt); p.vy *= Math.exp(-f * dt);
  }
  particles = particles.filter(p => p.t < p.life);
  for (const t of tracers) t.t += dt;
  tracers = tracers.filter(t => t.t < 0.07);
}

function drawParticles(ctx, layer) {
  if (layer === 0) {
    for (const p of particles) {
      if (p.type !== 'smoke') continue;
      const k = p.t / p.life;
      ctx.fillStyle = p.dark ? `rgba(30,30,30,${0.55 * (1 - k)})` : `rgba(190,190,190,${0.35 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + k * 1.8), 0, TAU); ctx.fill();
    }
    for (const p of particles) {
      if (p.type !== 'blood') continue;
      ctx.fillStyle = '#8c0f12'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const k = p.t / p.life;
    if (p.type === 'fire') {
      ctx.fillStyle = `rgba(255,${Math.round(180 - k * 140)},40,${0.75 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.grow ? 0.5 + k * 1.6 : 1 - k * 0.5), 0, TAU); ctx.fill();
    } else if (p.type === 'spark') {
      ctx.strokeStyle = `rgba(255,220,120,${1 - k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.type === 'flash') {
      const r = p.size * (0.4 + k);
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(255,240,200,${1 - k})`); gr.addColorStop(0.4, `rgba(255,150,40,${0.8 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    } else if (p.type === 'muzzle') {
      ctx.fillStyle = `rgba(255,230,140,${1 - k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7 * (1 - k) + 2, 0, TAU); ctx.fill();
    }
  }
  for (const t of tracers) {
    ctx.strokeStyle = `rgba(255,240,170,${0.8 * (1 - t.t / 0.07)})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
  }
  ctx.restore();
}


// ===== Granater från stridsvagnen =====
let shells = [];
function fireShell(owner, x, y, a) {
  shells.push({ x, y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, a, life: 0.85, owner, rocket: false });
  sfx('gun_shotgun', x, y, 1, 0.5);
  sfx('crash', x, y, 0.35, 0.6);
  shake = Math.max(shake, 5);
  for (let i = 0; i < 6; i++) smoke(x + rr(-6, 6), y + rr(-6, 6), 1.3, false);
  addP({ x, y, vx: 0, vy: 0, life: 0.1, t: 0, type: 'flash', size: 50 });
}
function updateShells(dt) {
  for (const s of shells) {
    let boom = false;
    for (let k = 0; k < 3 && !boom; k++) {
      s.x += s.vx * dt / 3; s.y += s.vy * dt / 3;
      if (solidW(s.x, s.y)) { boom = true; break; }
      for (const c of cars) {
        if (c === s.owner || c.dead) continue;
        if (Math.abs(c.x - s.x) > c.l || Math.abs(c.y - s.y) > c.l) continue;
        for (const q of carCircles(c)) if (dist2(q[0], q[1], s.x, s.y) < q[2] * q[2]) { boom = true; break; }
        if (boom) break;
      }
      if (!boom) for (const p of peds) if (!p.dead && p.type !== 'gang' && dist2(p.x, p.y, s.x, s.y) < 14 * 14) { boom = true; break; }
    }
    s.life -= dt;
    if (Math.random() < (s.rocket ? 1 : 0.6)) smoke(s.x, s.y, s.rocket ? 0.8 : 0.5, false);
    if (boom || s.life <= 0) {
      s.dead = true;
      for (const c of cars) if (!c.dead && c !== s.owner && dist2(c.x, c.y, s.x, s.y) < 150 * 150) { c.hp -= 60; c.lastHitByPlayer = gameTime; }
      explosion(s.x, s.y, 'player');
      for (const c of cars) if (!c.dead && c.hp <= 0) explodeCar(c);
    }
  }
  shells = shells.filter(s => !s.dead);
}
function drawShells(ctx) {
  for (const s of shells) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    if (s.rocket) {
      ctx.fillStyle = `rgba(255,${150 + Math.random() * 80},40,0.9)`; ctx.beginPath(); ctx.ellipse(-14, 0, 7 + Math.random() * 3, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-9, -2.5, 15, 5); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(6, -2.5); ctx.lineTo(11, 0); ctx.lineTo(6, 2.5); ctx.fill();
      ctx.fillStyle = '#555'; ctx.fillRect(-10, -4, 3, 8);
    } else {
      ctx.fillStyle = 'rgba(255,170,60,0.55)'; ctx.fillRect(-22, -2, 18, 4);
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function fireRocket(owner, x, y, a) {
  shells.push({ x, y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, a, life: 1.2, owner, rocket: true });
  sfx('gun_shotgun', x, y, 0.8, 0.7);
  sfxSwish(x, y);
  for (let i = 0; i < 5; i++) smoke(x - Math.cos(a) * 20 + rr(-5, 5), y - Math.sin(a) * 20 + rr(-5, 5), 1.2, false);
}
function ignite(p, by) {
  if (p.dead || p.type === 'gang') return;
  if (!(p.burning > 0)) { p.burning = 3.2; p.burnBy = by; if (by === 'player' && p.type === 'rival') provokeGang(p.gang); if (by === 'player' && p.type === 'cop') crime(0.6, 'polisvåld', false); }
}
function fireFlame(sx, sy, a) {
  for (let k = 0; k < 3; k++) {
    const an = a + rr(-0.13, 0.13), sp = rr(360, 470);
    addP({ x: sx, y: sy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: rr(0.38, 0.55), t: 0, type: 'fire', size: rr(6, 11), grow: true });
  }
  flameOnT = 0.12;
  const fx = Math.cos(a), fy = Math.sin(a);
  for (const p of peds) {
    if (p.dead || p.type === 'gang') continue;
    const dx = p.x - sx, dy = p.y - sy, along = dx * fx + dy * fy;
    if (along < 0 || along > 220) continue;
    if (Math.abs(-dx * fy + dy * fx) < 16 + along * 0.2 && los(sx, sy, p.x, p.y)) ignite(p, 'player');
  }
  for (const c of cars) {
    if (c.dead || c === player.car) continue;
    const dx = c.x - sx, dy = c.y - sy, along = dx * fx + dy * fy;
    if (along < 0 || along > 220 + c.l / 2) continue;
    if (Math.abs(-dx * fy + dy * fx) < c.w / 2 + 14 + along * 0.2) damageCar(c, 1.4, 'player');
  }
}
let flameOnT = 0;
