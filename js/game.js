'use strict';
// ---------- Huvudloop, spelare, polis, uppdrag, HUD ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
let gameTime = 0, shake = 0, running = false, started = false;
const cam = { x: 0, y: 0, zoom: 1, base: 1 };
const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
let pickups = [];
let mission = null, lastMissionType = null, missionsDone = 0;
let msgBox = null, bigMsg = null, carName = null;
let spawnT = 0, policeSpawnT = 0, sprayCool = 0, hintCool = 0;

const WEAPONS = {
  fist: { name: 'Knytnäve', rate: 0.38, melee: true, dmg: 30, pose: 'stand' },
  sword: { name: 'Svärd', rate: 0.4, melee: true, dmg: 120, pose: 'hold', pick: Infinity },
  pistol: { name: 'Pistol', rate: 0.28, dmg: 40, range: 540, spread: 0.035, pellets: 1, snd: 'gun_pistol', pose: 'gun', icon: 'w_gun', pick: 36 },
  smg: { name: 'Kulsprutepistol', rate: 0.085, dmg: 22, range: 480, spread: 0.085, pellets: 1, snd: 'gun_smg', pose: 'machine', icon: 'w_machine', pick: 150 },
  shotgun: { name: 'Hagelgevär', rate: 0.85, dmg: 26, range: 330, spread: 0.24, pellets: 7, snd: 'gun_shotgun', pose: 'machine', icon: 'w_machine', pick: 18 },
  rifle: { name: 'Automatkarbin', rate: 0.12, dmg: 34, range: 650, spread: 0.045, pellets: 1, snd: 'gun_rifle', pose: 'machine', icon: 'w_silencer', pick: 90 },
  flame: { name: 'Eldkastare', rate: 0.05, flame: true, pose: 'machine', pick: 300 },
  rocket: { name: 'Raketgevär', rate: 1.0, rocket: true, pose: 'machine', pick: 8 },
  turret: { name: 'Kulspruta', rate: 0.09, dmg: 34, range: 680, spread: 0.035, pellets: 1, snd: 'gun_rifle', pose: 'machine', icon: 'w_machine' },
};
const WEAPON_ORDER = ['fist', 'sword', 'pistol', 'smg', 'shotgun', 'rifle', 'flame', 'rocket'];

const player = {
  kind: 'player', x: 0, y: 0, a: 0, vx: 0, vy: 0, kx: 0, ky: 0, hp: 100, car: null, money: 0,
  ammo: { fist: Infinity, sword: 0, flame: 0, rocket: 0, pistol: 48, smg: 0, shotgun: 0, rifle: 0 }, cur: 'pistol', shootCd: 0,
  armor: 0, heat: 0, lastCrime: -99, hideT: 0, state: 'alive', stateT: 0, stepT: 0, hitT: 0, flash: 0, starFlash: 0, moving: false, ph: 0,
};

// ===== Indata =====
const keys = new Set();
const mouse = { x: 0, y: 0, down: false, moved: -99 };
let gpPrev = [];
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'];

addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (!started) { if (e.code === 'Enter' || e.code === 'Space') startGame(); return; }
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (!running) return;
  if (e.code === 'KeyF' || e.code === 'Enter') actionEnterExit();
  else if (e.code === 'KeyQ') cycleWeapon(-1);
  else if (e.code === 'KeyE') cycleWeapon(1);
  else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (WEAPON_ORDER[n] && player.ammo[WEAPON_ORDER[n]] > 0) player.cur = WEAPON_ORDER[n]; }
  else if (e.code === 'KeyH' && player.car) sfxHorn(player.car.x, player.car.y);
  else if (e.code === 'KeyM') { setMuted(!SND.muted); showMsg(SND.muted ? 'Ljud av' : 'Ljud på', 1.5); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = false; if (running) togglePause(); });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = gameTime; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; mouse.moved = gameTime; } });
addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && Array.from(pads).find(p => p);
  if (!gp) return null;
  const pressed = gp.buttons.map(b => b.pressed);
  const edge = (i) => pressed[i] && !gpPrev[i];
  if (running) {
    if (edge(3)) actionEnterExit();
    if (edge(4)) cycleWeapon(-1);
    if (edge(5) && player.car) sfxHorn(player.car.x, player.car.y);
  }
  if (edge(9)) togglePause();
  if (!started && (edge(0) || edge(9))) startGame();
  gpPrev = pressed;
  return gp;
}

function inputState() {
  const k = (...c) => c.some(x => keys.has(x));
  let mx = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  let my = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
  let gas = k('KeyW', 'ArrowUp') ? 1 : 0, brake = k('KeyS', 'ArrowDown') ? 1 : 0;
  let steer = mx, hb = k('Space');
  let fire = mouse.down || k('ControlLeft', 'ControlRight', 'KeyJ') || (!player.car && k('Space'));
  let ax = 0, ay = 0;
  const gp = pollGamepad();
  if (gp) {
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    mx += lx; my += ly; steer += lx;
    gas = Math.max(gas, gp.buttons[7] ? gp.buttons[7].value : 0, gp.buttons[0] && gp.buttons[0].pressed ? 1 : 0);
    brake = Math.max(brake, gp.buttons[6] ? gp.buttons[6].value : 0);
    hb = hb || (gp.buttons[1] && gp.buttons[1].pressed);
    fire = fire || (gp.buttons[2] && gp.buttons[2].pressed) || (!player.car && gp.buttons[7] && gp.buttons[7].value > 0.5);
    ax = dz(gp.axes[2] || 0); ay = dz(gp.axes[3] || 0);
  }
  return { mx: clamp(mx, -1, 1), my: clamp(my, -1, 1), gas, brake, steer: clamp(steer, -1, 1), hb, fire, ax, ay };
}

// ===== Hjälpare =====
function stars() { return Math.min(5, Math.floor(player.heat + 1e-6)); }
function crime(amount, label, needWitness) {
  if (player.state !== 'alive') return;
  if (needWitness && !witnessed(player.x, player.y)) return;
  const before = stars();
  if (frenzy) amount *= 0.3;
  player.heat = Math.min(5.99, player.heat + amount);
  player.lastCrime = gameTime;
  if (stars() > before) player.starFlash = 2;
}
function witnessed(x, y) {
  // polisen måste ha fri sikt – bakom hus och i gränder syns du inte
  for (const p of peds) if (p.type === 'cop' && !p.dead && dist2(p.x, p.y, x, y) < 450 * 450 && los(p.x, p.y, x, y)) return true;
  for (const c of cars) if (c.police && !c.dead && c.ai && dist2(c.x, c.y, x, y) < 520 * 520 && los(c.x, c.y, x, y)) return true;
  return false;
}
function inView(x, y, m = 0) { return x > VIEW.x0 - m && x < VIEW.x1 + m && y > VIEW.y0 - m && y < VIEW.y1 + m; }
function showMsg(text, dur = 4) { msgBox = { text, t: dur }; }
function showBig(title, sub, color, dur = 3) { bigMsg = { title, sub, color, t: dur, dur }; }
function hurtPlayer(dmg) {
  if (player.state !== 'alive') return;
  if (player.armor > 0) { const a = Math.min(player.armor, dmg); player.armor -= a; dmg -= a; player.flash = 0.15; }
  if (dmg <= 0) return;
  player.hp -= dmg; player.flash = 0.35;
  if (player.hp <= 0) { player.hp = 0; wasted(); }
}
function cycleWeapon(dir) {
  let i = WEAPON_ORDER.indexOf(player.cur);
  for (let k = 0; k < WEAPON_ORDER.length; k++) {
    i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    if (player.ammo[WEAPON_ORDER[i]] > 0) { player.cur = WEAPON_ORDER[i]; sfx('ui_select', undefined, undefined, 0.4); return; }
  }
}

// ===== Vapen =====
function fireWeapon(owner, sx, sy, a, wt) {
  const w = WEAPONS[wt];
  const isPlayer = owner === player;
  const gang = owner.type === 'gang';
  const by = isPlayer ? 'player' : gang ? 'gang' : null;
  sfx(w.snd, sx, sy, isPlayer ? 0.85 : 0.6, rr(0.94, 1.06));
  addP({ x: sx, y: sy, vx: 0, vy: 0, life: 0.06, t: 0, type: 'muzzle' });
  for (let k = 0; k < w.pellets; k++) {
    const ang = a + rr(-w.spread, w.spread) * (isPlayer ? 1 : gang ? 1.5 : 2.6);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let tw = w.range;
    for (let t = 6; t < w.range; t += 8) if (solidW(sx + dx * t, sy + dy * t)) { tw = t; break; }
    let best = tw, hit = null;
    for (const c of cars) {
      if (c === player.car && (isPlayer || gang)) continue;
      if (c === owner.car) continue;
      if (gang && !(c.police || (c.gang && c.gang !== 'knutter' && gangHostile(c.gang)))) continue; // gänget skjuter bara på fiender
      if (Math.abs(c.x - sx) > best + c.l || Math.abs(c.y - sy) > best + c.l) continue;
      for (const q of carCircles(c)) { const t = lineCircle(sx, sy, dx, dy, best, q[0], q[1], q[2]); if (t >= 0 && t < best) { best = t; hit = c; } }
    }
    for (const p of peds) {
      if (p.dead || p === owner) continue;
      if (!isPlayer && !gang && p.type === 'cop') continue;
      if (gang && p.type !== 'cop' && !(p.type === 'rival' && gangHostile(p.gang))) continue;
      if (owner.gang && p.gang === owner.gang) continue;
      if (isPlayer && p.type === 'gang') continue;
      if (Math.abs(p.x - sx) > best + 12 || Math.abs(p.y - sy) > best + 12) continue;
      const t = lineCircle(sx, sy, dx, dy, best, p.x, p.y, 11);
      if (t >= 0 && t < best) { best = t; hit = p; }
    }
    if (!isPlayer && !gang && !player.car && player.state === 'alive') {
      const t = lineCircle(sx, sy, dx, dy, best, player.x, player.y, 10);
      if (t >= 0 && t < best) { best = t; hit = 'player'; }
    }
    const ex = sx + dx * best, ey = sy + dy * best;
    tracers.push({ x0: sx, y0: sy, x1: ex, y1: ey, t: 0 });
    if (hit === 'player') { hurtPlayer(w.dmg * 0.16); bloodSplat(ex, ey, 0.3); }
    else if (hit && hit.kind === 'car') {
      damageCar(hit, w.dmg * (isPlayer || gang ? 0.32 : 0.12), by); sparks(ex, ey, 3);
      if (isPlayer && hit.ai && !hit.police) hit.ai.angry = 4;
      if (isPlayer && hit.police) crime(0.15, 'polisbil', false);
    } else if (hit && hit.kind === 'ped') damagePed(hit, w.dmg, by, dx * 140, dy * 140);
    else if (best < w.range) sparks(ex, ey, 2);
  }
  for (const p of peds) if (!p.dead && p.type !== 'cop' && dist2(p.x, p.y, sx, sy) < 380 * 380) scare(p, sx, sy, 4);
  if (isPlayer && witnessed(sx, sy) && player.heat < 1) { player.heat = 1; player.lastCrime = gameTime; player.starFlash = 2; }
}

function swordSwing() {
  const fx = Math.cos(player.a), fy = Math.sin(player.a);
  player.swingT = 0.22;
  sfxSwish(player.x, player.y);
  let hits = 0;
  for (const p of peds) {
    if (p.dead || p.type === 'gang') continue;
    const dx = p.x - player.x, dy = p.y - player.y, d = Math.hypot(dx, dy);
    if (d < 58 && (dx * fx + dy * fy) / (d || 1) > 0.45) {
      damagePed(p, WEAPONS.sword.dmg, 'player', fx * 220 + dx * 2, fy * 220 + dy * 2);
      hits++;
      if (p.type === 'civ' || p.type === 'jogger') crime(0.08, 'misshandel', true);
    }
  }
  for (const c of cars) {
    if (c.dead || c === player.car) continue;
    const dx = c.x - player.x, dy = c.y - player.y, d = Math.hypot(dx, dy);
    if (d < c.l / 2 + 34 && (dx * fx + dy * fy) / (d || 1) > 0.3) { damageCar(c, 6, 'player'); sparks(player.x + fx * 30, player.y + fy * 30, 6); sfx('scrape', c.x, c.y, 0.6, 1.4); }
  }
  return hits;
}
function melee() {
  if (player.cur === 'sword') { swordSwing(); return; }
  const fx = Math.cos(player.a), fy = Math.sin(player.a);
  let best = null, bd = 40;
  for (const p of peds) {
    if (p.dead) continue;
    const dx = p.x - player.x, dy = p.y - player.y, d = Math.hypot(dx, dy);
    if (d < bd && (dx * fx + dy * fy) / (d || 1) > 0.3) { bd = d; best = p; }
  }
  if (best) {
    sfx('hit', best.x, best.y, 0.9);
    damagePed(best, WEAPONS.fist.dmg, 'player', fx * 170, fy * 170);
    if (best.type !== 'cop') crime(0.08, 'misshandel', true);
  } else sfx('drop', player.x, player.y, 0.15, 1.6);
}

// ===== Spelaren =====
function updatePlayerFoot(inp, dt) {
  let mx = inp.mx, my = inp.my;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const spd = 175;
  player.vx = mx * spd; player.vy = my * spd;
  player.x += (player.vx + player.kx) * dt; player.y += (player.vy + player.ky) * dt;
  player.kx *= Math.exp(-6 * dt); player.ky *= Math.exp(-6 * dt);
  player.hitT -= dt;
  const res = circleWorld(player.x, player.y, 9);
  player.x = res.x; player.y = res.y;
  player.moving = ml > 0.1;
  const mouseAim = gameTime - mouse.moved < 2.5 || mouse.down;
  if (Math.hypot(inp.ax, inp.ay) > 0.3) player.a = Math.atan2(inp.ay, inp.ax);
  else if (mouseAim) {
    const wx = (mouse.x - VW / 2) / cam.zoom + cam.x, wy = (mouse.y - VH / 2) / cam.zoom + cam.y;
    player.a = Math.atan2(wy - player.y, wx - player.x);
  } else if (player.moving) player.a = lerpAngle(player.a, Math.atan2(my, mx), 14 * dt);
  if (player.moving) {
    player.ph += dt * 20;
    player.stepT -= dt;
    if (player.stepT <= 0) { sfx('step', player.x, player.y, 0.22, rr(0.9, 1.1)); player.stepT = 0.32; }
  }
  player.swingT = Math.max(0, (player.swingT || 0) - dt);
  player.shootCd -= dt;
  if (inp.fire && player.shootCd <= 0) {
    const w = WEAPONS[player.cur];
    player.shootCd = w.rate;
    if (w.melee) melee();
    else if (player.ammo[player.cur] > 0) {
      const fx = Math.cos(player.a), fy = Math.sin(player.a);
      const mx2 = player.x + fx * 22 - fy * 6, my2 = player.y + fy * 22 + fx * 6;
      if (w.flame) fireFlame(mx2, my2, player.a);
      else if (w.rocket) fireRocket(player, mx2, my2, player.a);
      else fireWeapon(player, mx2, my2, player.a, player.cur);
      if ((w.flame || w.rocket) && witnessed(player.x, player.y) && player.heat < 1) { player.heat = 1; player.lastCrime = gameTime; player.starFlash = 2; }
      player.ammo[player.cur]--;
      if (player.ammo[player.cur] <= 0) cycleWeapon(1);
    }
  }
}

function updatePlayerCar(inp, dt) {
  const c = player.car;
  c.input.thr = clamp(inp.gas - inp.brake, -1, 1);
  c.input.steer = inp.steer;
  c.input.hb = inp.hb;
  player.x = c.x; player.y = c.y; player.a = c.a;
  player.shootCd -= dt;
  if (c.gun && !c.dead) {
    let ta = c.a;
    if (Math.hypot(inp.ax, inp.ay) > 0.3) ta = Math.atan2(inp.ay, inp.ax);
    else if (gameTime - mouse.moved < 2.5 || mouse.down) {
      const wx = (mouse.x - VW / 2) / cam.zoom + cam.x, wy = (mouse.y - VH / 2) / cam.zoom + cam.y;
      ta = Math.atan2(wy - c.y, wx - c.x);
    }
    const cannon = c.gun === 'cannon';
    c.turretA = lerpAngle(c.turretA === undefined ? c.a : c.turretA, ta, (cannon ? 5 : 14) * dt);
    if (inp.fire && player.shootCd <= 0) {
      if (cannon) {
        player.shootCd = 1.1;
        fireShell(c, c.x + Math.cos(c.turretA) * 64, c.y + Math.sin(c.turretA) * 64, c.turretA);
        if (witnessed(c.x, c.y) && player.heat < 1) { player.heat = 1; player.lastCrime = gameTime; player.starFlash = 2; }
      } else {
        player.shootCd = WEAPONS.turret.rate;
        const bx = c.x - Math.cos(c.a) * 4, by = c.y - Math.sin(c.a) * 4;
        fireWeapon(player, bx + Math.cos(c.turretA) * 32, by + Math.sin(c.turretA) * 32, c.turretA, 'turret');
      }
    }
  }
}

function actionEnterExit() {
  if (player.state !== 'alive') return;
  if (player.car) { exitCar(false); return; }
  let best = null, bd = 80 * 80;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist2(c.x, c.y, player.x, player.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  const lx = Math.sin(best.a), ly = -Math.cos(best.a);
  if (best.ai) {
    const ex = best.x + lx * (best.w / 2 + 16), ey = best.y + ly * (best.w / 2 + 16);
    if (best.police) {
      for (let k = 0; k < best.copsInside; k++) makePed(ex + k * 18, ey, 'cop');
      best.copsInside = 0;
      crime(1.3, 'polisbil', false);
    } else if (best.gang === 'knutter') {
      const d = makePed(ex, ey, 'gang'); d.post = { x: ex, y: ey, a: best.a };
      showMsg('Knutten kliver ur: "Ta den, brorsan!"', 2.5);
    } else if (best.gang) {
      const d = makePed(ex, ey, 'rival', { gang: best.gang }); d.post = { x: ex, y: ey, a: best.a }; d.wpn = 'pistol';
      provokeGang(best.gang);
    } else {
      const d = makePed(ex, ey, 'civ');
      scare(d, player.x, player.y, 6);
      if (witnessed(best.x, best.y)) crime(1, 'biltjuvnad', false);
    }
    best.ai = null;
  } else if (best.police && best.copsInside > 0) {
    crime(1, 'polisbil', false);
  }
  best.driver = 'player'; best.parked = false; best.siren = false;
  best.input = { thr: 0, steer: 0, hb: false };
  player.car = best;
  sfx('door', best.x, best.y, 0.8);
  carName = { text: best.police ? 'Polisbil' : `${MODELS[best.model].name} (${best.colorName || COLOR_SV[best.color]})`, t: 2.5 };
}

function exitCar(force) {
  const c = player.car;
  if (!c) return;
  const lx = Math.sin(c.a), ly = -Math.cos(c.a);
  const off = c.w / 2 + 14;
  let px = c.x + lx * off, py = c.y + ly * off;
  if (!force) {
    if (solidW(px, py)) { px = c.x - lx * off; py = c.y - ly * off; }
    if (solidW(px, py)) { px = c.x + Math.cos(c.a) * (c.l / 2 + 14); py = c.y + Math.sin(c.a) * (c.l / 2 + 14); }
    if (solidW(px, py)) { showMsg('Det går inte att kliva ur här.', 1.5); return; }
  }
  player.x = px; player.y = py;
  player.car = null;
  c.driver = null;
  c.input = { thr: 0, steer: 0, hb: false };
  if (!force) sfx('door', c.x, c.y, 0.8);
}

function wasted() {
  if (player.state !== 'alive') return;
  if (player.car) exitCar(true);
  if (frenzy) endFrenzy(false);
  player.state = 'wasted'; player.stateT = 0;
  showBig('WASTED', 'Du vaknar på sjukhuset', '#e0313f', 3.4);
  sfx('jingle_wasted', undefined, undefined, 0.9);
  bloodSplat(player.x, player.y, 1.4);
  if (mission) failMission('');
}
function busted() {
  if (player.state !== 'alive' || playerSafe()) return;
  if (player.car) exitCar(true);
  if (frenzy) endFrenzy(false);
  player.state = 'busted'; player.stateT = 0;
  showBig('BUSTED', 'Vapnen beslagtas', '#4da3ff', 3.4);
  sfx('jingle_busted', undefined, undefined, 0.9);
  if (mission) failMission('');
}
function respawn() {
  const wasBusted = player.state === 'busted';
  const p = wasBusted ? WORLD.police : WORLD.hospital;
  player.x = p.x; player.y = p.y; player.a = Math.PI / 2;
  player.hp = 100; player.armor = 0; player.heat = 0; player.kx = player.ky = 0;
  const fee = Math.floor(player.money * (wasBusted ? 0.15 : 0.1));
  player.money -= fee;
  if (wasBusted) for (const w of WEAPON_ORDER) if (w !== 'fist') player.ammo[w] = 0;
  player.ammo.pistol = Math.max(player.ammo.pistol, 48);
  if (wasBusted || player.cur === 'fist') player.cur = 'pistol';
  player.state = 'alive';
  for (const q of peds) if (q.type === 'cop' && !q.persist) q.remove = true;
  for (const c of cars) if (c.police && c.ai) { c.ai.mode = 'patrol'; c.siren = false; }
  if (fee > 0) showMsg(`${wasBusted ? 'Böter' : 'Sjukhusräkning'}: $${fmtMoney(fee)}`, 4);
  cam.x = player.x; cam.y = player.y;
}

// ===== Polis =====
function updatePolice(dt) {
  const st = stars();
  const want = [0, 1, 1, 2, 3, 5][st];
  let chasing = 0, nearest = null, nd = Infinity;
  for (const c of cars) {
    if (!c.police || c.dead) continue;
    if (c.ai) {
      if (st > 0 && player.state === 'alive') {
        if (c.ai.mode !== 'chase') { c.ai.mode = 'chase'; snapToLane(c); }
        c.siren = true; chasing++;
      } else if (c.ai.mode === 'chase') { c.ai.mode = 'patrol'; c.ai.direct = false; c.siren = false; snapToLane(c); }
      if (st > 0 && c.copsInside > 0 && !player.car && player.state === 'alive') {
        const d = Math.hypot(player.x - c.x, player.y - c.y);
        if (d < 260 && Math.hypot(c.vx, c.vy) < 70) {
          const lx = Math.sin(c.a), ly = -Math.cos(c.a);
          makePed(c.x + lx * (c.w / 2 + 14), c.y + ly * (c.w / 2 + 14), 'cop');
          makePed(c.x - lx * (c.w / 2 + 14), c.y - ly * (c.w / 2 + 14), 'cop');
          c.copsInside = 0; c.ai = null; c.driver = null; c.input = { thr: 0, steer: 0, hb: true };
          sfx('door', c.x, c.y, 0.7);
        }
      }
    }
    if (c.siren) { const d = dist2(c.x, c.y, cam.x, cam.y); if (d < nd) { nd = d; nearest = c; } }
  }
  policeSpawnT -= dt;
  if (st > 0 && player.state === 'alive' && chasing < want && policeSpawnT <= 0) {
    policeSpawnT = spawnCarOnRoad(true) ? (st >= 4 ? 2.4 : 4.5) : 0.4;
  }
  if (SND.ctx) updateSiren(nearest ? nearest.x : 0, nearest ? nearest.y : 0, !!nearest);
}

function updateHeat(dt) {
  player.starFlash = Math.max(0, player.starFlash - dt);
  if (player.heat <= 0 || player.state !== 'alive') return;
  if (playerSafe()) {
    if (safeT > 2) player.heat = Math.max(0, player.heat - dt / 2.5);
    return;
  }
  const seen = witnessed(player.x, player.y);
  const inAlley = !player.car && tileAtW(player.x, player.y) === TL.ALLEY;
  if (seen) player.lastSeen = gameTime;
  const unseenFor = gameTime - Math.max(player.lastCrime, player.lastSeen || -99);
  if (!seen && inAlley) {
    player.hideT += dt;
    if (player.hideT > 1.5 && player.hideT - dt <= 1.5) showMsg('Du trycker i gränden... snuten tappar spåret.', 2.5);
    if (unseenFor > 2.5) player.heat = Math.max(0, player.heat - dt / 3.5);
  } else {
    player.hideT = 0;
    if (!seen && unseenFor > 5) player.heat = Math.max(0, player.heat - dt / 6);
  }
}

// ===== Safehouse: Gaute knutters =====
let gangSlots = [], knutterCar = null, knutterT = 0, safeT = 0, wasSafe = false;
function inSafe(x, y, m = 0) {
  const s = WORLD.safe;
  return !!s && x > s.x0 - m && x < s.x1 + m && y > s.y0 - m && y < s.y1 + m;
}
function playerSafe() { return player.state === 'alive' && inSafe(player.x, player.y); }
// Polisen kan inte gå in: knuffa ut dem till närmaste kant (grinden)
function pushOutOfSafe(e, r) {
  const s = WORLD.safe;
  if (!inSafe(e.x, e.y, r)) return false;
  const dl = e.x - (s.x0 - r), dr = (s.x1 + r) - e.x, du = e.y - (s.y0 - r), dd = (s.y1 + r) - e.y;
  const m = Math.min(dl, dr, du, dd);
  let nx = 0, ny = 0;
  if (m === dd) { e.y = s.y1 + r; ny = 1; } else if (m === dl) { e.x = s.x0 - r; nx = -1; }
  else if (m === dr) { e.x = s.x1 + r; nx = 1; } else { e.y = s.y0 - r; ny = -1; }
  if (e.vx !== undefined) { const vn = e.vx * nx + e.vy * ny; if (vn < 0) { e.vx -= vn * nx * 1.4; e.vy -= vn * ny * 1.4; } }
  return true;
}
function spawnGangMember(post) {
  const p = makePed(post.x, post.y, 'gang', { persist: true });
  p.post = post; p.a = post.a; p.shootCd = rr(0.2, 0.8); p.burst = 0;
  return p;
}
function spawnKnutterCar() {
  const s = WORLD.safe.carSpot;
  const c = makeCar(s.x, s.y, s.a, { key: getPaint('knutter', 0), model: 7, color: 'purple', persist: true });
  c.paint = { kind: 'knutter', i: 0 }; c.colorName = 'lila';
  c.special = true; c.gun = true; c.parked = true; c.turretA = s.a;
  knutterCar = c;
}
let tankCar = null, tankT = 0;
function spawnTank() {
  const s = WORLD.safe.tankSpot;
  const c = makeCar(s.x, s.y, s.a, { key: getPaint('tank', 0), model: 8, color: 'grey', persist: true, scale: 1.7 });
  c.paint = { kind: 'tank', i: 0 }; c.colorName = 'grå';
  c.special = true; c.gun = 'cannon'; c.parked = true; c.turretA = s.a;
  tankCar = c;
}
function initSafehouse() {
  const s = WORLD.safe;
  gangSlots = s.posts.map(spawnGangMember);
  spawnKnutterCar();
  spawnTank();
  s.motos.forEach((m, i) => {
    const pi = i % 2 ? 1 : 0;
    const c = makeCar(m.x, m.y, m.a, { key: getPaint('moto', pi), model: 6, color: pi ? 'red' : 'black', persist: true });
    c.paint = { kind: 'moto', i: pi }; c.colorName = PAINTS.moto.list[pi][0];
    c.special = true; c.parked = true;
  });
}
function gangAI(p, dt) {
  let tgt = null, bd = 440 * 440;
  for (const q of peds) if ((q.type === 'cop' || (q.type === 'rival' && gangHostile(q.gang))) && !q.dead) { const d = dist2(q.x, q.y, p.x, p.y); if (d < bd) { bd = d; tgt = q; } }
  for (const c of cars) if ((c.police || (c.gang && c.gang !== 'knutter' && gangHostile(c.gang))) && !c.dead) { const d = dist2(c.x, c.y, p.x, p.y); if (d < bd) { bd = d; tgt = c; } }
  if (!p.post) p.post = { x: p.x, y: p.y, a: p.a };
  if (tgt && los(p.x, p.y, tgt.x, tgt.y)) {
    const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    p.a = lerpAngle(p.a, want, 12 * dt);
    p.shootCd -= dt;
    if (p.shootCd <= 0 && Math.abs(angDiff(p.a, want)) < 0.3) {
      fireWeapon(p, p.x + Math.cos(p.a) * 20, p.y + Math.sin(p.a) * 20, p.a, 'smg');
      p.burst++;
      p.shootCd = p.burst % 5 === 0 ? rr(0.7, 1.2) : 0.11;
    }
    return [0, 0, 0];
  }
  const dx = p.post.x - p.x, dy = p.post.y - p.y, d = Math.hypot(dx, dy);
  if (d > 8) return [dx / d, dy / d, 95];
  p.a = lerpAngle(p.a, p.post.a + Math.sin(gameTime * 0.4 + p.id) * 0.5, 2 * dt);
  return [0, 0, 0];
}
function updateSafehouse(dt) {
  const s = WORLD.safe;
  if (!s) return;
  const safe = playerSafe();
  safeT = safe ? safeT + dt : 0;
  if (safe && !wasSafe) showMsg(stars() > 0 ? 'Safehouse! Gaute knutters håller snuten borta medan det lugnar ner sig.' : 'Hemma hos Gaute knutters.', 3.5);
  wasSafe = safe;
  if (safe && player.hp < 100) player.hp = Math.min(100, player.hp + 6 * dt);
  for (const c of cars) if ((c.police || (c.gang && c.gang !== 'knutter')) && c !== player.car) pushOutOfSafe(c, c.l / 2);
  for (const p of peds) if (p.type === 'rival' && !p.dead) pushOutOfSafe(p, 10);
  for (const p of peds) if (p.type === 'cop' && !p.dead) pushOutOfSafe(p, 10);
  gangSlots.forEach((g, i) => {
    if (g.dead && g.deadT > 30 && !inView(g.post.x, g.post.y, 60)) { g.persist = false; gangSlots[i] = spawnGangMember(g.post); }
  });
  if (!knutterCar || knutterCar.dead || !cars.includes(knutterCar)) {
    knutterT += dt;
    if (knutterT > 30 && !inView(s.carSpot.x, s.carSpot.y, 80) && !cars.some(c => dist2(c.x, c.y, s.carSpot.x, s.carSpot.y) < 90 * 90)) {
      if (knutterCar) knutterCar.persist = false;
      spawnKnutterCar(); knutterT = 0;
      showMsg('En ny Knutter GT står redo i safehouset.', 3);
    }
  }
  if (!tankCar || tankCar.dead || !cars.includes(tankCar)) {
    tankT += dt;
    const t = s.tankSpot;
    if (tankT > 60 && !inView(t.x, t.y, 100) && !cars.some(c => dist2(c.x, c.y, t.x, t.y) < 120 * 120)) {
      if (tankCar) tankCar.persist = false;
      spawnTank(); tankT = 0;
      showMsg('En ny stridsvagn står redo i safehouset.', 3);
    }
  }
}

// ===== Spawn och städning =====
function spawnCarOnRoad(police, gang) {
  for (let tries = 0; tries < 30; tries++) {
    const ang = rr(0, TAU), dist = rr(780, 1300);
    const x = cam.x + Math.cos(ang) * dist, y = cam.y + Math.sin(ang) * dist;
    if (inView(x, y, 140) || tileAtW(x, y) !== TL.ROAD) continue;
    const i = vBand(x), j = hBand(y);
    if (i >= 0 && j >= 0) continue;
    const lane = Math.random() < 0.5 ? 0 : 1;
    let dir, road, px, py;
    if (j >= 0) { dir = Math.random() < 0.5 ? 0 : 2; road = j; py = laneCoord(dir, j, lane); px = x; }
    else if (i >= 0) { dir = Math.random() < 0.5 ? 1 : 3; road = i; px = laneCoord(dir, i, lane); py = y; }
    else continue;
    if (cars.some(c => dist2(c.x, c.y, px, py) < 140 * 140)) continue;
    const model = ri(1, 5);
    const c = gang ? makeCar(px, py, DIR_ANG[dir], { key: gangCarKey(gang, model), model, color: gang })
      : makeCar(px, py, DIR_ANG[dir], { police });
    if (gang) { c.gang = gang; c.colorName = GANGS[gang].colorName; }
    makeAI(c, dir, road, lane, police ? (stars() > 0 ? 'chase' : 'patrol') : 'traffic');
    c.ai.cx = px; c.ai.cy = py;
    const sp = police ? 260 : 170;
    c.vx = Math.cos(c.a) * sp; c.vy = Math.sin(c.a) * sp;
    if (police && stars() > 0) c.siren = true;
    return c;
  }
  return null;
}

function spawnPed() {
  for (let tries = 0; tries < 20; tries++) {
    const ang = rr(0, TAU), dist = rr(560, 1150);
    const x = cam.x + Math.cos(ang) * dist, y = cam.y + Math.sin(ang) * dist;
    if (inView(x, y, 60) || tileAtW(x, y) !== TL.SIDE) continue;
    const p = makePed(x, y, Math.random() < 0.04 ? 'cop' : 'civ');
    pedPickTarget(p);
    return p;
  }
  return null;
}

function manageSpawns() {
  const cx = cam.x, cy = cam.y;
  peds = peds.filter(p => {
    if (p.persist) return true;
    if (p.remove && !inView(p.x, p.y, 100)) return false;
    if (p.dead && p.deadT > 25) return false;
    return dist2(p.x, p.y, cx, cy) < 1550 * 1550 || inView(p.x, p.y, 100);
  });
  cars = cars.filter(c => {
    if (c === player.car || c.persist) return true;
    if (c.dead && c.deadT > 40 && !inView(c.x, c.y, 100)) return false;
    return dist2(c.x, c.y, cx, cy) < 1900 * 1900 || inView(c.x, c.y, 100);
  });
  let nPed = 0, nCar = 0;
  for (const p of peds) if (!p.dead && dist2(p.x, p.y, cx, cy) < 1300 * 1300) nPed++;
  for (const c of cars) if (c.ai && !c.police && dist2(c.x, c.y, cx, cy) < 1500 * 1500) nCar++;
  const pedTarget = Math.round(42 - 16 * LIGHT.night);
  for (let k = 0; k < 3 && nPed < pedTarget; k++, nPed++) spawnPed();
  if (nCar < 20) {
    const r = Math.random();
    let gang = null;
    if (r > 0.06 && r < 0.3) {
      gang = pick(['knutter', 'hajar', 'kobra']);
      if (cars.filter(c => c.gang === gang && !c.dead && c.ai).length >= 3) gang = null;
    }
    spawnCarOnRoad(r < 0.06, gang);
  }
}

function carFx(c, dt) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const ex = c.x + fx * c.l * 0.35, ey = c.y + fy * c.l * 0.35;
  if (c.dead) {
    c.deadT += dt;
    if (c.deadT < 14 && Math.random() < dt * 9) smoke(c.x + rr(-8, 8), c.y + rr(-8, 8), 1.6, true);
    if (c.deadT < 5 && Math.random() < dt * 14) flame(c.x, c.y);
    return;
  }
  const f = c.hp / c.maxHp;
  if (f < 0.4 && Math.random() < dt * (f < 0.2 ? 14 : 5)) smoke(ex, ey, 1, f < 0.2);
  if (f < 0.2) {
    if (c.burn === 0 && c.driver === 'player') showMsg('Bilen brinner – hoppa ur (F)!', 3);
    c.burn += dt;
    if (Math.random() < dt * 20) flame(ex, ey);
    if (c.burn > 4.5) { if (c.driver === 'player') c.lastHitByPlayer = c.lastHitByPlayer || -99; explodeCar(c); }
  }
}

// ===== Upplockning =====
function spawnPickup(x, y, type, val, fixed) { pickups.push({ x, y, type, val, fixed: !!fixed, t: 0, active: true, respawn: 0 }); }
function initPickups() {
  const order = ['pistol', 'smg', 'shotgun', 'flame', 'rifle', 'pistol', 'rocket', 'smg', 'shotgun'];
  WORLD.crateSpots.forEach((s, i) => spawnPickup(s.x, s.y, 'weapon', order[i % order.length], true));
  WORLD.heartSpots.forEach(s => spawnPickup(s.x, s.y, 'health', 50, true));
  WORLD.armorSpots.forEach(s => spawnPickup(s.x, s.y, 'armor', 100, true));
  // svärd i några gränder
  const used = [...WORLD.crateSpots, ...WORLD.armorSpots];
  const swords = [];
  for (const a of WORLD.alleySpots.slice().sort(() => Math.random() - 0.5)) {
    if (swords.length >= 4) break;
    if (used.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 120) && swords.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 1800)) swords.push(a);
  }
  swords.forEach(a => spawnPickup(a.x, a.y, 'weapon', 'sword', true));
  WORLD.swordSpots = swords;
}
function updatePickups(dt) {
  for (const p of pickups) {
    p.t += dt;
    if (!p.active) { p.respawn -= dt; if (p.respawn <= 0) p.active = true; continue; }
    if (!p.fixed && p.t > 30) { p.dead = true; continue; }
    if (player.state !== 'alive') continue;
    const r = player.car ? 50 : 30;
    if (dist2(p.x, p.y, player.x, player.y) > r * r) continue;
    if (p.type === 'weapon') {
      const w = WEAPONS[p.val];
      player.ammo[p.val] += w.pick;
      if (player.cur === 'fist' || !player.ammo[player.cur]) player.cur = p.val;
      showMsg(isFinite(w.pick) ? `${w.name} +${w.pick}` : `${w.name}! Vänsterklick för att hugga.`, 2.5);
    } else if (p.type === 'health') {
      if (player.hp >= 100) continue;
      player.hp = Math.min(100, player.hp + p.val); showMsg('Hälsa +' + p.val, 2);
    } else if (p.type === 'armor') {
      if (player.armor >= 100) continue;
      player.armor = 100; showMsg('Skyddsväst! Pansaret tar skadan före hälsan.', 2.5);
    } else if (p.type === 'money') { player.money += p.val; }
    sfx('pickup', p.x, p.y, 0.7);
    if (p.fixed) { p.active = false; p.respawn = p.type === 'armor' ? 60 : 40; } else p.dead = true;
  }
  pickups = pickups.filter(p => !p.dead);
}

// ===== Lack & Fix =====
let sprayInside = false;
function respray(c) {
  if (c.paint) {
    const P = PAINTS[c.paint.kind];
    c.paint.i = (c.paint.i + 1 + Math.floor(Math.random() * (P.list.length - 1))) % P.list.length;
    c.key = getPaint(c.paint.kind, c.paint.i); c.img = IMG[c.key];
    return (c.colorName = P.list[c.paint.i][0]);
  }
  if (c.police) {
    const col = pick(CAR_COLORS);
    c.police = false; c.copsInside = 0; c.siren = false;
    c.color = col; c.key = `car_${col}_3`; c.img = IMG[c.key];
    return `${COLOR_SV[col]} – inte längre polisbil`;
  }
  setCarColor(c, pick(CAR_COLORS.filter(x => x !== c.color)));
  return COLOR_SV[c.color];
}
function updateSpray(dt) {
  sprayCool -= dt;
  hintCool -= dt;
  const c = player.car;
  if (!c || !WORLD.spray.some(s => dist2(c.x, c.y, s.x, s.y) < 160 * 160)) sprayInside = false;
  if (!c || player.state !== 'alive' || sprayCool > 0) return;
  for (const s of WORLD.spray) {
    if (dist2(c.x, c.y, s.x, s.y) > 115 * 115 || Math.hypot(c.vx, c.vy) > 120) continue;
    if (sprayInside) return; // åk ut och in igen för en ny lackning
    if (player.money < 250) { if (hintCool <= 0) { showMsg('Lack & Fix kostar $250 – du har inte råd.', 3); sfx('ui_error'); hintCool = 5; } return; }
    player.money -= 250; c.hp = c.maxHp; c.burn = 0;
    const hadStars = stars() > 0;
    player.heat = 0;
    const name = respray(c);
    sprayInside = true;
    for (const q of cars) if (q.police && q.ai) { q.ai.mode = 'patrol'; q.siren = false; }
    showMsg(`Ny färg: ${name}!${hadStars ? ' Polisen tappade spåret.' : ''}`, 3.5);
    sfx('pickup'); sfx('scrape', undefined, undefined, 0.5);
    sprayCool = 5;
    return;
  }
}

// ===== Uppdrag =====
const MISSION_TYPES = ['leverans', 'bud', 'likvidera', 'spräng'];
function randomSpot(minD, maxD, from) {
  for (let k = 0; k < 80; k++) {
    const a = rr(0, TAU), d = rr(minD, maxD);
    const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
    if (tileAtW(x, y) === TL.SIDE) return { x: (Math.floor(x / T) + 0.5) * T, y: (Math.floor(y / T) + 0.5) * T };
  }
  return { x: WORLD.hospital.x, y: WORLD.hospital.y };
}
function startMission(ph) {
  let type;
  do { type = pick(MISSION_TYPES); } while (type === lastMissionType);
  lastMissionType = type;
  ph.cool = 25;
  const m = { type, stage: 0, t: 0, phone: ph };
  if (type === 'spräng') {
    const cands = cars.filter(c => c.parked && !c.dead && !c.police && Math.hypot(c.x - player.x, c.y - player.y) > 700);
    if (!cands.length) m.type = type = 'bud';
    else { m.car = pick(cands); m.car.missionMark = true; m.car.persist = true; m.reward = 2500; m.text = 'Jobb: spräng den markerade bilen. Skjut eller krocka tills den brinner.'; }
  }
  if (type === 'leverans') {
    m.color = pick(CAR_COLORS);
    m.target = WORLD.garages.slice().sort((a, b) => dist2(b.x, b.y, player.x, player.y) - dist2(a.x, a.y, player.x, player.y))[0];
    m.reward = 2000;
    m.text = `Jobb: sno en ${COLOR_SV[m.color]} bil och lämna den i GARAGET.`;
  } else if (type === 'bud') {
    m.a = randomSpot(700, 1400, player); m.b = randomSpot(1400, 2300, m.a);
    m.reward = 1500; m.text = 'Jobb: hämta paketet vid markören.';
  } else if (type === 'likvidera') {
    const s = randomSpot(900, 1700, player);
    m.ped = makePed(s.x, s.y, 'target', { persist: true }); pedPickTarget(m.ped);
    m.reward = 3000; m.text = 'Jobb: en tjallare går omkring på stan. Ta hand om honom.';
  }
  mission = m;
  sfx('ui_select', undefined, undefined, 0.8);
  showMsg(m.text, 7);
}
function missionTarget() {
  const m = mission;
  if (!m) return null;
  if (m.type === 'leverans') return m.target;
  if (m.type === 'bud') return m.stage === 0 ? m.a : m.b;
  if (m.type === 'likvidera') return m.ped;
  if (m.type === 'spräng' || m.type === 'gängbil') return m.car;
  if (m.type === 'gängkrig') return GANGS[m.enemy].turf;
  return null;
}
function updateMission(dt) {
  for (const ph of WORLD.phones) ph.cool -= dt;
  if (!mission && player.state === 'alive') {
    for (const ph of WORLD.phones) {
      if (ph.cool > 0 || dist2(ph.x, ph.y, player.x, player.y) > (player.car ? 70 : 42) ** 2) continue;
      if (ph.gang && GANGS[ph.gang].respect <= -30) { if (hintCool <= 0) { showMsg(`${GANGS[ph.gang].name} pratar inte med dig. Höj respekten först.`, 3); hintCool = 5; } continue; }
      if (ph.gang) startGangMission(ph); else startMission(ph);
      break;
    }
  }
  const m = mission;
  if (!m || player.state !== 'alive') return;
  m.t += dt;
  const px = player.x, py = player.y;
  if (m.type === 'leverans') {
    const c = player.car;
    if (c && dist2(c.x, c.y, m.target.x, m.target.y) < 120 * 120 && Math.hypot(c.vx, c.vy) < 100) {
      if (c.color === m.color && !c.police && !c.special && !c.dead) {
        const bonus = Math.round(1000 * c.hp / c.maxHp);
        exitCar(false);
        if (!player.car) { cars = cars.filter(x => x !== c); m.reward += bonus; completeMission(); }
      } else if (hintCool <= 0) { showMsg(`Fel bil! Vi vill ha en ${COLOR_SV[m.color]}.`, 2.5); hintCool = 4; }
    }
  } else if (m.type === 'bud') {
    if (m.stage === 0 && dist2(px, py, m.a.x, m.a.y) < 65 * 65) {
      m.stage = 1; m.timer = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) / 190 + 16;
      sfx('pickup'); showMsg('Paketet är ditt. Leverera det innan tiden tar slut!', 4);
    } else if (m.stage === 1) {
      m.timer -= dt;
      if (m.timer <= 0) failMission('Du hann inte fram.');
      else if (dist2(px, py, m.b.x, m.b.y) < 65 * 65) { m.reward += Math.round(m.timer * 25); completeMission(); }
    }
  } else if (m.type === 'likvidera') {
    if (m.ped.dead) completeMission();
    else if (m.stage === 0 && dist2(px, py, m.ped.x, m.ped.y) < 230 * 230) { m.stage = 1; scare(m.ped, px, py, 8); m.ped.speed = 60; }
  } else if (m.type === 'spräng' || m.type === 'gängbil') {
    if (m.car.dead) completeMission();
  } else if (m.type === 'gängkrig') {
    if (m.kills >= m.goal) completeMission();
  }
}
function endMissionCleanup() {
  const m = mission;
  if (!m) return;
  if (m.ped) { m.ped.persist = false; if (!m.ped.dead) m.ped.type = 'civ'; }
  if (m.car) { m.car.missionMark = false; m.car.persist = false; }
  mission = null;
}
function completeMission() {
  const m = mission;
  player.money += m.reward;
  if (m.gang) jobRespect(m.gang);
  missionsDone++;
  showBig('UPPDRAG KLART!', `+$${fmtMoney(m.reward)}`, '#8be04e', 3);
  sfx('jingle_mission', undefined, undefined, 0.9);
  endMissionCleanup();
  if (missionsDone === 1) setTimeout(() => showMsg('Tips: fler telefoner ringer runt om i stan (gröna prickar på kartan).', 5), 3200);
}
function failMission(reason) {
  if (reason) { showBig('UPPDRAG MISSLYCKAT', reason, '#ff5a4f', 3); sfx('ui_error'); }
  endMissionCleanup();
}
function onCarDestroyed(c) {
  if (frenzy && frenzy.cfg.kind === 'car' && c.lastHitByPlayer && gameTime - c.lastHitByPlayer < 8) frenzy.count++;
  if (c.gang && c.gang !== 'knutter' && c.lastHitByPlayer && gameTime - c.lastHitByPlayer < 8) changeRespect(c.gang, -4, true);
}
function onPedKilled(p, by) {
  if (by === 'player') {
    if (p.type === 'rival') changeRespect(p.gang, -6, true);
    if (p.type === 'gang') changeRespect('knutter', -10, true);
    if (mission && mission.type === 'gängkrig' && p.type === 'rival' && p.gang === mission.enemy) mission.kills = (mission.kills || 0) + 1;
    if (frenzy && frenzy.cfg.kind === 'ped' && p.type !== 'gang') frenzy.count++;
  }
  if (p.type !== 'jogger' || !p.group) return;
  const g = p.group;
  if (by === 'player' && p.runOver) {
    if (g.first === null || gameTime - g.first > 4) { g.first = gameTime; g.sweep = 0; }
    g.sweep++;
  } else g.sweep = -99;
  if (g.members.every(m => m.dead)) {
    g.done = true; g.respawnT = 45;
    if (g.sweep >= 6 && gameTime - g.first <= 4) {
      player.money += 1000;
      showBig('ELVIS HAS LEFT THE BUILDING', '+$1 000', '#ffffff', 4.5);
      sfx('jingle_mission', undefined, undefined, 1);
    }
  }
}

// ===== Joggarna: 6 i rad i vita tröjor =====
let joggerGroups = [];
function spawnJoggerGroup(minDist) {
  for (let tries = 0; tries < 300; tries++) {
    const tx = ri(3, MW - 4), ty = ri(3, MH - 4);
    if (tileAt(tx, ty) !== TL.SIDE) continue;
    const x = (tx + 0.5) * T, y = (ty + 0.5) * T;
    if (Math.hypot(x - player.x, y - player.y) < minDist || inView(x, y, 100) || inSafe(x, y, 150)) continue;
    if (joggerGroups.some(g => g.members.some(m => !m.dead && Math.hypot(m.x - x, m.y - y) < 1500))) continue;
    const g = { members: [], trail: [], first: null, sweep: 0, done: false, respawnT: 0 };
    for (let k = 0; k < 6; k++) { const p = makePed(x, y, 'jogger', { persist: true }); p.group = g; p.money = 0; p.hp = 40; g.members.push(p); }
    joggerPickTarget(g.members[0]);
    joggerGroups.push(g);
    return g;
  }
  return null;
}
function joggerPickTarget(p) {
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  if (tileAt(tx, ty) !== TL.SIDE && tileAt(tx, ty) !== TL.ROAD) {
    for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (tileAt(tx + dx, ty + dy) === TL.SIDE) { p.tx = (tx + dx + 0.5) * T; p.ty = (ty + dy + 0.5) * T; p.dir = null; return; }
  }
  const opts = [];
  for (const d of DIRS) {
    const n = tileAt(tx + d[0], ty + d[1]);
    if (n === TL.SIDE) opts.push({ d, len: 1 });
    else if (n === TL.ROAD && tileAt(tx + 5 * d[0], ty + 5 * d[1]) === TL.SIDE && !inIntersection((tx + 2.5 * d[0] + 0.5) * T, (ty + 2.5 * d[1] + 0.5) * T)) opts.push({ d, len: 5 });
  }
  if (!opts.length) { p.tx = (tx + 0.5) * T; p.ty = (ty + 0.5) * T; p.dir = null; return; }
  const same = opts.find(o => o.d === p.dir && o.len === 1);
  const cross = opts.filter(o => o.len === 5);
  let o;
  if (same && Math.random() < 0.85) o = same;
  else if (cross.length && Math.random() < 0.4) o = pick(cross);
  else { const nr = opts.filter(q => !(p.dir && q.d[0] === -p.dir[0] && q.d[1] === -p.dir[1])); o = pick(nr.length ? nr : opts); }
  p.dir = o.d;
  p.tx = (tx + o.d[0] * o.len + 0.5) * T; p.ty = (ty + o.d[1] * o.len + 0.5) * T;
}
function joggerAI(p, dt) {
  const g = p.group;
  const alive = g.members.filter(m => !m.dead);
  const idx = alive.indexOf(p);
  if (idx === 0) {
    if (!g.trail.length || dist2(g.trail[0].x, g.trail[0].y, p.x, p.y) > 16) { g.trail.unshift({ x: p.x, y: p.y }); if (g.trail.length > 60) g.trail.pop(); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 6) { joggerPickTarget(p); return [0, 0, 0]; }
    return [dx / d, dy / d, 95];
  }
  const pt = g.trail[Math.min(g.trail.length - 1, idx * 6)];
  if (!pt) return [0, 0, 0];
  const dx = pt.x - p.x, dy = pt.y - p.y, d = Math.hypot(dx, dy);
  if (d < 3) return [0, 0, 0];
  return [dx / d, dy / d, Math.min(150, 80 + d * 1.2)];
}
function updateJoggers(dt) {
  for (const g of joggerGroups) {
    if (!g.done) continue;
    g.respawnT -= dt;
    if (g.respawnT <= 0) { g.members.forEach(m => { m.persist = false; }); g.remove = true; }
  }
  joggerGroups = joggerGroups.filter(g => !g.remove);
  while (joggerGroups.length < 4) { if (!spawnJoggerGroup(1200)) break; }
}

// ===== Kamera =====
function updateCamera(dt) {
  const t = player.car || player;
  const vx = player.car ? player.car.vx : 0, vy = player.car ? player.car.vy : 0;
  const tx = t.x + vx * 0.42, ty = t.y + vy * 0.42;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-5 * dt));
  cam.base = clamp(Math.min(VW, VH) / 860, 0.55, 1.5);
  const sp = Math.hypot(vx, vy);
  const zt = cam.base * (player.car ? 1.0 - 0.34 * clamp(sp / 560, 0, 1) : 1.12);
  cam.zoom = lerp(cam.zoom, zt, 1 - Math.exp(-1.5 * dt));
  shake = Math.max(0, shake - dt * 30);
}
function computeView() {
  const hw = VW / 2 / cam.zoom, hh = VH / 2 / cam.zoom;
  VIEW.x0 = cam.x - hw; VIEW.x1 = cam.x + hw; VIEW.y0 = cam.y - hh; VIEW.y1 = cam.y + hh;
}

// ===== Uppdatering =====
function update(dt) {
  gameTime += dt;
  computeView();
  const inp = inputState();
  if (player.state === 'alive') {
    if (player.car) updatePlayerCar(inp, dt); else updatePlayerFoot(inp, dt);
  } else {
    player.stateT += dt;
    if (player.stateT > 3.4) respawn();
  }
  for (const c of cars) {
    if (c.ai && !c.dead) { aiDrive(c, dt); if (c.gang) gangCarAI(c, dt); }
    stepCar(c, dt);
    carFx(c, dt);
  }
  if (player.car) { player.x = player.car.x; player.y = player.car.y; }
  carCarCollisions();
  carPedCollisions();
  for (const p of peds) updatePed(p, dt);
  updatePolice(dt);
  updateHeat(dt);
  spawnT -= dt;
  if (spawnT <= 0) { manageSpawns(); spawnT = 0.35; }
  updateSafehouse(dt);
  updateGangs(dt);
  updateFrenzy(dt);
  updateWorldTime(dt);
  updatePickups(dt);
  updateMission(dt);
  updateSpray(dt);
  updateShells(dt);
  updateJoggers(dt);
  updateParticles(dt);
  updateCamera(dt);
  player.flash = Math.max(0, player.flash - dt);
  if (msgBox) { msgBox.t -= dt; if (msgBox.t <= 0) msgBox = null; }
  if (bigMsg) { bigMsg.t -= dt; if (bigMsg.t <= 0) bigMsg = null; }
  if (carName) { carName.t -= dt; if (carName.t <= 0) carName = null; }
  if (SND.ctx) {
    updateEngine(player.car, dt);
    const c = player.car;
    flameOnT -= dt;
    updateAmbientSynths(WEATHER.rain, flameOnT > 0 && running);
    updateSkid(c && !c.dead ? clamp((c.slip - 90) / 260, 0, 1) + (c.skidding ? 0.35 : 0) : 0);
  }
}

// ===== Rendering =====
function drawCar(c) {
  ctx.save();
  ctx.translate(c.x + 5, c.y + 6); ctx.rotate(c.a + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-c.w / 2 + 2, -c.l / 2 + 3, c.w - 4, c.l - 6);
  ctx.restore();
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.a + Math.PI / 2);
  ctx.drawImage(c.img, -c.w / 2, -c.l / 2, c.w, c.l);
  if (c.police && !c.dead) {
    const on = c.siren ? Math.floor(gameTime * 7) % 2 : -1;
    const y = -c.l * 0.15, bw = c.w * 0.32;
    ctx.fillStyle = on === 0 ? '#9fd0ff' : '#1d3f8f'; ctx.fillRect(-bw - 1, y, bw, 5);
    ctx.fillStyle = on === 1 ? '#9fd0ff' : '#1d3f8f'; ctx.fillRect(1, y, bw, 5);
    if (c.siren) {
      ctx.globalCompositeOperation = 'lighter';
      const gx = on === 0 ? -bw / 2 : bw / 2;
      const gr = ctx.createRadialGradient(gx, y, 0, gx, y, 46);
      gr.addColorStop(0, 'rgba(80,150,255,0.55)'); gr.addColorStop(1, 'rgba(80,150,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, y, 46, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
  if (c.gun === 'cannon' && !c.dead) {
    const ta = c.turretA === undefined ? c.a : c.turretA;
    const bi = IMG.tank_barrel, s = 2.3;
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(ta + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(4, 5, 21, 0, TAU); ctx.fill();
    ctx.drawImage(bi, -bi.width * s / 2, -bi.height * s + 6, bi.width * s, bi.height * s);
    ctx.fillStyle = '#5a594c'; ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2f2e27'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#6c6b5c'; ctx.beginPath(); ctx.arc(-5, 4, 6, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (c.gun && !c.dead) {
    const ta = c.turretA === undefined ? c.a : c.turretA;
    ctx.save();
    ctx.translate(c.x - Math.cos(c.a) * 4, c.y - Math.sin(c.a) * 4); ctx.rotate(ta);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(6, -1, 28, 7);
    ctx.fillStyle = '#26262c'; ctx.fillRect(4, -3, 26, 6);
    ctx.fillStyle = '#121216'; ctx.fillRect(27, -4, 7, 8);
    ctx.fillStyle = '#3a3542'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d9b44a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}

function drawPedSprite(set, pose, x, y, a, bob, dead, alpha = 1) {
  const img = set.includes(':') ? lookImg(set, pose, dead) : dead ? IMG['dead_' + set] : IMG[`${set}_${pose}`];
  if (!img) return;
  const s = 0.62;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y); ctx.rotate(a);
  if (!dead) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(3, 3, 11, 0, TAU); ctx.fill(); }
  ctx.drawImage(img, -17 * s + bob * 0.4, -img.height * s / 2 + bob, img.width * s, img.height * s);
  ctx.restore();
}

function drawPhone(ph) {
  const ring = !mission && ph.cool <= 0 && (!ph.gang || GANGS[ph.gang].respect > -30);
  const bounce = ring ? Math.abs(Math.sin(gameTime * 9)) * 3 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(ph.x - 9, ph.y - 5, 22, 18);
  ctx.fillStyle = ph.gang ? GANGS[ph.gang].color : ring ? '#2fbf55' : '#2a6fbf'; ctx.fillRect(ph.x - 12, ph.y - 10 - bounce, 22, 18);
  ctx.fillStyle = '#fff'; ctx.fillRect(ph.x - 8, ph.y - 4 - bounce, 14, 4); ctx.fillRect(ph.x - 8, ph.y - 6 - bounce, 3, 7); ctx.fillRect(ph.x + 3, ph.y - 6 - bounce, 3, 7);
  if (ring) {
    ctx.strokeStyle = 'rgba(80,255,120,0.8)'; ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      const r = 18 + ((gameTime * 40 + k * 14) % 28);
      ctx.globalAlpha = 1 - ((gameTime * 40 + k * 14) % 28) / 28;
      ctx.beginPath(); ctx.arc(ph.x - 1, ph.y - 1, r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPickup(p) {
  if (!p.active) return;
  const bob = Math.sin(gameTime * 4 + p.x) * 3;
  if (p.type === 'weapon') {
    ctx.drawImage(IMG.crate, p.x - 16, p.y - 16, 32, 32);
    ctx.fillStyle = 'rgba(255,210,63,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y - 26 + bob, 14, 0, TAU); ctx.fill();
    if (p.val === 'sword') swordIcon(p.x, p.y - 26 + bob, 1, -0.7);
    else if (p.val === 'flame' || p.val === 'rocket') weaponIcon(p.val, p.x, p.y - 26 + bob, 1);
    else {
      const ic = IMG[WEAPONS[p.val].icon], s = 2;
      ctx.drawImage(ic, p.x - ic.width * s / 2, p.y - 26 + bob - ic.height * s / 2, ic.width * s, ic.height * s);
    }
  } else if (p.type === 'health') {
    const x = p.x, y = p.y + bob;
    ctx.fillStyle = '#e0313f';
    ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.bezierCurveTo(x - 20, y - 4, x - 9, y - 18, x, y - 7); ctx.bezierCurveTo(x + 9, y - 18, x + 20, y - 4, x, y + 10); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  } else if (p.type === 'armor') {
    const x = p.x, y = p.y + bob;
    ctx.fillStyle = 'rgba(77,155,255,0.25)'; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2f5d9e';
    ctx.beginPath(); ctx.moveTo(x - 12, y - 12); ctx.lineTo(x - 5, y - 12); ctx.lineTo(x, y - 6); ctx.lineTo(x + 5, y - 12); ctx.lineTo(x + 12, y - 12);
    ctx.lineTo(x + 13, y + 12); ctx.lineTo(x - 13, y + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#cfe3ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#cfe3ff'; ctx.fillRect(x - 9, y + 2, 18, 3); ctx.fillRect(x - 9, y + 7, 18, 2);
  } else if (p.type === 'money') {
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(0.3);
    ctx.fillStyle = '#3fa34d'; ctx.fillRect(-11, -6, 22, 12); ctx.strokeStyle = '#1f5e28'; ctx.lineWidth = 1.5; ctx.strokeRect(-11, -6, 22, 12);
    ctx.fillStyle = '#e8ffe0'; ctx.font = 'bold 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.5);
    ctx.restore();
  }
}

function drawGroundMarkers() {
  for (const ph of WORLD.phones) if (inView(ph.x, ph.y, 60)) drawPhone(ph);
  for (const p of pickups) if (inView(p.x, p.y, 60)) drawPickup(p);
  const tg = missionTarget();
  if (tg && (mission.type === 'leverans' || mission.type === 'bud')) {
    const r = 46 + Math.sin(gameTime * 5) * 6;
    ctx.strokeStyle = 'rgba(255,214,51,0.9)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,51,0.18)'; ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, TAU); ctx.fill();
  }
}

function drawTargetArrowWorld() {
  const tg = missionTarget();
  if (!tg || !inView(tg.x, tg.y, 0)) return;
  const y = tg.y - 52 - Math.abs(Math.sin(gameTime * 4)) * 14;
  ctx.fillStyle = mission.type === 'likvidera' || mission.type === 'spräng' ? '#ff4b3e' : '#ffd633';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tg.x, y + 22); ctx.lineTo(tg.x - 16, y); ctx.lineTo(tg.x - 6, y); ctx.lineTo(tg.x - 6, y - 16);
  ctx.lineTo(tg.x + 6, y - 16); ctx.lineTo(tg.x + 6, y); ctx.lineTo(tg.x + 16, y); ctx.closePath();
  ctx.stroke(); ctx.fill();
}

function render() {
  frameNo++;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d4b6e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!tiles) return;
  computeView();
  const z = cam.zoom;
  const shx = shake ? rr(-shake, shake) : 0, shy = shake ? rr(-shake, shake) : 0;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - (cam.x + shx) * z), DPR * (VH / 2 - (cam.y + shy) * z));
  ctx.imageSmoothingEnabled = true;
  drawGround(ctx, VIEW);
  drawGroundMarkers();
  drawFrenzyTokens();
  for (const p of peds) if (p.dead && inView(p.x, p.y, 40)) drawPedSprite(p.look, 'stand', p.x, p.y, p.a, 0, true, clamp((25 - p.deadT) / 4, 0, 1));
  if (player.state === 'wasted') drawPedSprite('hitman', 'stand', player.x, player.y, player.a, 0, true);
  for (const c of cars) if (inView(c.x, c.y, 100)) drawCar(c);
  for (const p of peds) {
    if (p.dead || !inView(p.x, p.y, 40)) continue;
    const pose = p.type === 'cop' || p.type === 'rival' ? 'gun' : p.type === 'gang' ? 'machine' : 'stand';
    drawPedSprite(p.look, pose, p.x, p.y, p.a, p.moving ? Math.sin(p.ph) * 1.4 : 0, false);
    if (mission && mission.ped === p) {
      ctx.strokeStyle = 'rgba(255,75,62,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 18 + Math.sin(gameTime * 8) * 3, 0, TAU); ctx.stroke();
    }
  }
  for (const c of cars) if (c.missionMark && !c.dead) {
    ctx.strokeStyle = 'rgba(255,75,62,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.l * 0.62 + Math.sin(gameTime * 8) * 4, 0, TAU); ctx.stroke();
  }
  if (!player.car && player.state !== 'wasted') {
    const pose = player.state === 'busted' ? 'stand' : WEAPONS[player.cur].pose;
    drawPedSprite('hitman', pose, player.x, player.y, player.a, player.moving ? Math.sin(player.ph) * 1.4 : 0, false);
    if (player.cur === 'sword' && player.state === 'alive') drawSword();
  }
  drawShells(ctx);
  drawParticles(ctx, 0);
  drawParticles(ctx, 1);
  const F = 1150 * cam.base / cam.zoom;
  drawTrees(ctx, VIEW, cam.x, cam.y, F);
  drawLighting();
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - (cam.x + shx) * z), DPR * (VH / 2 - (cam.y + shy) * z));
  drawBuildings(ctx, VIEW, cam.x, cam.y, F);
  drawTargetArrowWorld();
  drawWeatherFx();
  drawHUD();
}

// ===== HUD =====
function hudText(s, x, y, size, color, align = 'left', outline = 5) {
  ctx.font = `${size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = outline; ctx.strokeStyle = '#000'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function star(x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke();
}

function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const small = VW < 600;
  if (player.flash > 0) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${player.flash * 1.2})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  // pengar
  hudText(`$${fmtMoney(player.money)}`, VW - 20, small ? 38 : 50, small ? 28 : 40, '#ffd23f', 'right', 6);
  // efterlyst
  const st = stars();
  for (let i = 0; i < 5; i++) {
    const on = i < st;
    const flash = player.starFlash > 0 && on && Math.floor(gameTime * 8) % 2;
    star(VW - 34 - (4 - i) * 30, small ? 66 : 82, 12, on ? (flash ? '#ffffff' : (Math.floor(gameTime * 3) % 2 && st >= 3 ? '#ff4b3e' : '#4da3ff')) : 'rgba(255,255,255,0.15)');
  }
  drawClockAndRespect(small);
  drawFrenzyHud(small);
  // hälsa
  const hx = 20, hy = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(hx - 3, hy - 3, 186, 20);
  ctx.fillStyle = '#3a0d10'; ctx.fillRect(hx, hy, 180, 14);
  ctx.fillStyle = player.hp > 35 ? '#e0313f' : (Math.floor(gameTime * 6) % 2 ? '#ff6b6b' : '#a01822');
  ctx.fillRect(hx, hy, 180 * clamp(player.hp / 100, 0, 1), 14);
  let barY = hy + 21;
  if (player.armor > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(hx - 3, barY, 186, 13);
    ctx.fillStyle = '#132a4a'; ctx.fillRect(hx, barY + 3, 180, 7);
    ctx.fillStyle = '#4d9bff'; ctx.fillRect(hx, barY + 3, 180 * clamp(player.armor / 100, 0, 1), 7);
    barY += 12;
  }
  if (player.car && !player.car.dead) {
    const c = player.car;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(hx - 3, barY, 186, 13);
    ctx.fillStyle = '#2b3138'; ctx.fillRect(hx, barY + 3, 180, 7);
    ctx.fillStyle = c.hp / c.maxHp > 0.4 ? '#9aa7b3' : '#ff9a3e'; ctx.fillRect(hx, barY + 3, 180 * clamp(c.hp / c.maxHp, 0, 1), 7);
  }
  // vapen
  const w = WEAPONS[player.cur];
  const wy = (player.car ? 88 : 72) + (player.armor > 0 ? 12 : 0);
  if (player.car && player.car.gun === 'cannon' && !player.car.dead) {
    hudText('Kanon', hx, wy, 26, '#ffffff', 'left', 5);
    const rl = clamp(1 - player.shootCd / 1.1, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(hx + 82, wy - 18, 104, 14);
    ctx.fillStyle = rl >= 1 ? '#8be04e' : '#c9a227'; ctx.fillRect(hx + 84, wy - 16, 100 * rl, 10);
    hudText('Sikta med musen, klicka för att skjuta', hx, wy + 24, 18, '#d9a6ff', 'left', 4);
  } else if (player.car && player.car.gun && !player.car.dead) {
    const ic = IMG.w_machine, s = 3;
    ctx.drawImage(ic, hx, wy - 26, ic.width * s, ic.height * s);
    hudText('∞', hx + ic.width * s + 12, wy, 28, '#ffffff', 'left', 5);
    hudText('Kulspruta – sikta med musen', hx, wy + 24, 18, '#d9a6ff', 'left', 4);
  }
  if (!player.car) {
    if (player.cur === 'sword') swordIcon(hx + 30, wy - 12, 1.6, 0);
    else if (player.cur === 'flame' || player.cur === 'rocket') { weaponIcon(player.cur, hx + 28, wy - 12, 1.6); hudText(isFinite(player.ammo[player.cur]) ? `${player.ammo[player.cur]}` : '∞', hx + 64, wy, 26, '#ffffff', 'left', 5); }
    else if (w.icon) {
      const ic = IMG[w.icon], s = 3;
      ctx.drawImage(ic, hx, wy - 26, ic.width * s, ic.height * s);
      hudText(`${player.ammo[player.cur]}`, hx + ic.width * s + 12, wy, 26, '#ffffff', 'left', 5);
    }
    hudText(w.name, hx, wy + 24, 18, '#ffd23f', 'left', 4);
  }
  // uppdrag och timer
  if (mission) {
    let t = { gängkrig: `Ta ut ${GANGS[mission.enemy] ? GANGS[mission.enemy].name : ''}: ${mission.kills || 0}/${mission.goal || 0}`, gängbil: `Spräng ${GANGS[mission.enemy] ? GANGS[mission.enemy].name : ''}s bil`, leverans: `Leverera: ${COLOR_SV[mission.color]} bil → garaget`, bud: mission.stage === 0 ? 'Hämta paketet' : 'Leverera paketet', likvidera: 'Ta hand om tjallaren', spräng: 'Spräng den markerade bilen' }[mission.type];
    hudText(t, hx, wy + 54, 18, '#ffffff', 'left', 4);
    if (mission.type === 'bud' && mission.stage === 1) {
      const s = Math.max(0, mission.timer);
      hudText(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, VW / 2, 56, 44, s < 10 ? '#ff5a4f' : '#ffffff', 'center', 6);
    }
  }
  drawMinimap(small);
  drawEdgeArrow();
  if (msgBox) {
    ctx.font = `${small ? 16 : 20}px "Helvetica Neue", Arial, sans-serif`;
    const lines = wrapText(msgBox.text, Math.min(VW - 40, 640));
    const lh = small ? 22 : 27, bh = lines.length * lh + 18;
    const by = VH - (small ? 210 : 60) - bh;
    const bw = Math.min(VW - 24, 680);
    ctx.globalAlpha = clamp(msgBox.t * 2, 0, 1);
    ctx.fillStyle = 'rgba(8,10,14,0.78)'; ctx.fillRect(VW / 2 - bw / 2, by, bw, bh);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(VW / 2 - bw / 2, by, 4, bh);
    ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, VW / 2, by + 10 + i * lh));
    ctx.globalAlpha = 1;
  }
  if (carName) {
    ctx.globalAlpha = clamp(carName.t * 2, 0, 1);
    hudText(carName.text, VW / 2, VH * 0.24, small ? 24 : 32, '#ffffff', 'center', 6);
    ctx.globalAlpha = 1;
  }
  if (bigMsg) {
    const k = 1 - bigMsg.t / bigMsg.dur;
    const sc = 1 + Math.max(0, 0.25 - k) * 2;
    ctx.save(); ctx.translate(VW / 2, VH * 0.42); ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(bigMsg.t * 1.5, 0, 1);
    let bs = small ? 48 : 84;
    ctx.font = `${bs}px Impact, "Arial Black", sans-serif`;
    const bw2 = ctx.measureText(bigMsg.title).width;
    if (bw2 > VW * 0.9) bs *= (VW * 0.9) / bw2;
    hudText(bigMsg.title, 0, 0, bs, bigMsg.color, 'center', 10);
    if (bigMsg.sub) hudText(bigMsg.sub, 0, small ? 40 : 56, small ? 20 : 28, '#ffffff', 'center', 6);
    ctx.restore();
  }
}

function wrapText(text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawMinimap(small) {
  if (!minimapCv) return;
  const S = 3, size = small ? 120 : 170;
  const x = VW - size - 16, y = VH - size - 16;
  const scale = S / T;
  const sx = player.x * scale - size / 2, sy = player.y * scale - size / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  ctx.fillStyle = '#1d4b6e'; ctx.fillRect(x, y, size, size);
  ctx.drawImage(minimapCv, -sx + x, -sy + y);
  const dot = (wx, wy, col, r = 3.5, clampEdge = false) => {
    let px = x + wx * scale - sx, py = y + wy * scale - sy;
    if (clampEdge) { px = clamp(px, x + 5, x + size - 5); py = clamp(py, y + 5, y + size - 5); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  };
  if (!mission) for (const ph of WORLD.phones) if (ph.cool <= 0 && (!ph.gang || GANGS[ph.gang].respect > -30)) dot(ph.x, ph.y, ph.gang ? GANGS[ph.gang].color : '#3dff6e', 4, true);
  for (const s of WORLD.spray) dot(s.x, s.y, '#ffd23f', 3);
  if (mission && mission.type === 'leverans') for (const g of WORLD.garages) dot(g.x, g.y, '#5bc8ff', 3);
  dot(WORLD.hospital.x, WORLD.hospital.y, '#ffffff', 3);
  if (WORLD.safe) dot((WORLD.safe.x0 + WORLD.safe.x1) / 2, (WORLD.safe.y0 + WORLD.safe.y1) / 2, '#b45cff', 5, true);
  for (const p of pickups) if (p.type === 'armor' && p.active) dot(p.x, p.y, '#4d9bff', 3);
  for (const g of joggerGroups) { const l = g.members.find(m => !m.dead); if (l) dot(l.x, l.y, '#ffffff', 3); }
  for (const k of ['hajar', 'kobra']) { const G = GANGS[k]; if (G.turf) dot(G.turf.x, G.turf.y, G.color, gangHostile(k) && Math.floor(gameTime * 4) % 2 ? 7 : 5, true); }
  for (const c of cars) if (c.gang && !c.dead && c.ai) dot(c.x, c.y, GANGS[c.gang].color, 2.5);
  for (const c of cars) if (c.police && !c.dead && c.ai) dot(c.x, c.y, Math.floor(gameTime * 6) % 2 ? '#4da3ff' : '#ff4b3e', 3);
  const tg = missionTarget();
  if (tg && Math.floor(gameTime * 4) % 2) dot(tg.x, tg.y, '#ffd633', 5, true);
  ctx.translate(x + size / 2, y + size / 2); ctx.rotate(player.a);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawEdgeArrow() {
  const tg = missionTarget();
  if (!tg || player.state !== 'alive') return;
  const sx = (tg.x - cam.x) * cam.zoom + VW / 2, sy = (tg.y - cam.y) * cam.zoom + VH / 2;
  if (sx > 30 && sx < VW - 30 && sy > 30 && sy < VH - 30) return;
  const a = Math.atan2(sy - VH / 2, sx - VW / 2);
  const m = 46;
  const t = Math.min((VW / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (VH / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
  const ax = VW / 2 + Math.cos(a) * t, ay = VH / 2 + Math.sin(a) * t;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = mission.type === 'likvidera' || mission.type === 'spräng' ? '#ff4b3e' : '#ffd633';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-10, -16); ctx.lineTo(-4, 0); ctx.lineTo(-10, 16); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

// ===== Start, paus, loop =====
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = innerWidth; VH = innerHeight;
  canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
}
addEventListener('resize', resize);

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const loadBar = document.getElementById('loadBar');
const panelTitle = document.getElementById('panelTitle');

function startGame() {
  if (!tiles) return;
  initAudio();
  if (!started) {
    started = true;
    showMsg('Välkommen till Bråten! Du är i Gaute knutters safehouse – hit kommer inte snuten. Ta lila Knutter GT (F), sikta med musen och klicka för kulsprutan. Ringande kiosker (gröna prickar) ger jobb.', 10);
  }
  overlay.classList.add('hidden');
  running = true;
}
function togglePause() {
  if (!started) return;
  if (running) {
    running = false;
    panelTitle.textContent = 'Paus';
    startBtn.textContent = 'Fortsätt';
    overlay.classList.remove('hidden');
    if (SND.ctx) SND.ctx.suspend();
  } else startGame();
}
startBtn.addEventListener('click', startGame);

let lastT = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (dt > 0.1) dt = 0.1;
  if (running) {
    acc += dt;
    const step = 1 / 60;
    let n = 0;
    while (acc >= step && n < 5) { update(step); acc -= step; n++; }
    if (n === 5) acc = 0;
  } else pollGamepad();
  render();
}

async function boot() {
  resize();
  await loadImages((f) => { loadBar.style.width = Math.round(f * 100) + '%'; });
  makeDerivedSprites();
  const seed = 20261011;
  genMap(seed);
  buildMinimap();
  for (const p of WORLD.parked) { const c = makeCar(p.x, p.y, p.a); c.parked = true; c.persist = true; }
  initPickups();
  initSafehouse();
  initGangs();
  initFrenzies();
  player.x = WORLD.safe.start.x; player.y = WORLD.safe.start.y; player.a = Math.PI / 2;
  cam.x = player.x; cam.y = player.y;
  cam.base = clamp(Math.min(VW, VH) / 860, 0.55, 1.5); cam.zoom = cam.base * 1.12;
  computeView();
  for (let k = 0; k < 30; k++) spawnPed();
  for (let k = 0; k < 14; k++) spawnCarOnRoad(false);
  startBtn.disabled = false;
  startBtn.textContent = 'Spela';
  document.getElementById('loadWrap').style.visibility = 'hidden';
  window.__game = {
    player, cam, WORLD, get cars() { return cars; }, get peds() { return peds; }, get mission() { return mission; },
    enter: actionEnterExit, startMission, update, setHeat: (h) => { player.heat = h; },
  };
}
requestAnimationFrame(frame);
boot();


// ===== Svärd =====
function swordIcon(x, y, sc, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.fillStyle = '#d8dde3'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(16, -2); ctx.lineTo(20, 0); ctx.lineTo(16, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c9a227'; ctx.fillRect(-6, -6, 3, 12); ctx.strokeRect(-6, -6, 3, 12);
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(-14, -2, 8, 4); ctx.strokeRect(-14, -2, 8, 4);
  ctx.restore();
}
function drawSword() {
  const k = player.swingT > 0 ? 1 - player.swingT / 0.22 : -1;
  const off = k >= 0 ? -1.1 + k * 2.2 : 0.35;
  const a = player.a + off;
  ctx.save();
  ctx.translate(player.x + Math.cos(player.a) * 8, player.y + Math.sin(player.a) * 8);
  if (k >= 0) {
    ctx.strokeStyle = `rgba(230,240,255,${0.45 * (1 - k)})`; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(0, 0, 30, player.a - 1.1, a); ctx.stroke();
  }
  ctx.rotate(a);
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(2, -1.5, 7, 3);
  ctx.fillStyle = '#c9a227'; ctx.fillRect(8, -4, 2.5, 8);
  ctx.fillStyle = '#e3e8ee'; ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(36, -1.5); ctx.lineTo(40, 0); ctx.lineTo(36, 1.5); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ===== Rivaliserande gäng =====
const GANGS = {
  knutter: { name: 'Gaute knutters', short: 'Knutters', color: '#b45cff', colorName: 'lila', anger: 0, respect: 40 },
  hajar: { name: 'Hajarna', short: 'Hajarna', color: '#14c8c0', colorName: 'turkos', anger: 0, respect: 0, turf: null, slots: [] },
  kobra: { name: 'Kobrorna', short: 'Kobrorna', color: '#ff3fa4', colorName: 'rosa', anger: 0, respect: 0, turf: null, slots: [] },
};
let currentTurf = null;
function provokeGang(g) {
  const G = GANGS[g];
  if (!G || g === 'knutter') return;
  if (G.anger <= 0) showMsg(`${G.name} är ute efter dig!`, 3);
  G.anger = Math.max(G.anger, 45);
}
function spawnRival(g, post) {
  const p = makePed(post.x, post.y, 'rival', { gang: g, persist: true });
  p.post = post; p.a = post.a; p.wpn = Math.random() < 0.35 ? 'smg' : 'pistol';
  return p;
}
function initGangs() {
  const s = WORLD.safe;
  const sx = (s.x0 + s.x1) / 2, sy = (s.y0 + s.y1) / 2;
  const cand = blocks.filter(b => b.type === 'build').map(b => ({ b, x: ((b.x0 + b.x1) / 2) * T, y: ((b.y0 + b.y1) / 2) * T }))
    .filter(c => Math.hypot(c.x - sx, c.y - sy) > 2200).sort(() => Math.random() - 0.5);
  const chosen = [];
  for (const c of cand) { if (chosen.every(o => Math.hypot(o.x - c.x, o.y - c.y) > 2600)) chosen.push(c); if (chosen.length === 2) break; }
  ['hajar', 'kobra'].forEach((g, i) => {
    const c = chosen[i] || cand[i];
    const b = c.b, G = GANGS[g];
    G.turf = { x: c.x, y: c.y, r: Math.max(b.x1 - b.x0, b.y1 - b.y0) * T * 0.75 };
    const mx = ((b.x0 + b.x1) / 2) * T, my = ((b.y0 + b.y1) / 2) * T;
    G.posts = [
      { x: (b.x0 + 0.5) * T, y: (b.y0 + 0.5) * T, a: -2.3 },
      { x: mx, y: (b.y0 + 0.5) * T, a: -Math.PI / 2 },
      { x: (b.x1 - 0.5) * T, y: my, a: 0 },
      { x: mx + 40, y: (b.y1 - 0.5) * T, a: Math.PI / 2 },
      { x: mx - 40, y: (b.y1 - 0.5) * T, a: Math.PI / 2 },
      { x: (b.x0 + 0.5) * T, y: my, a: Math.PI },
    ];
    G.slots = G.posts.map(p => spawnRival(g, p));
    WORLD.phones.push({ x: (b.x1 - 2.5) * T, y: (b.y0 + 0.5) * T, cool: 0, gang: g });
  });
  const y = WORLD.safe.yard;
  WORLD.phones.push({ x: y.x0 + (y.x1 - y.x0) * 0.32, y: y.y0 + 30, cool: 0, gang: 'knutter' });
}
function rivalAI(p, dt) {
  const G = GANGS[p.gang];
  const tgt = player.car || player;
  if (gangHostile(p.gang) && player.state === 'alive' && !playerSafe()) {
    const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d < 1100) {
      p.losT = (p.losT || 0) - dt;
      if (p.losT <= 0) { p.losT = 0.25; p.seen = los(p.x, p.y, tgt.x, tgt.y); }
      const want = Math.atan2(dy, dx);
      p.a = lerpAngle(p.a, want, 10 * dt);
      if (p.seen && d < 460) {
        p.shootCd -= dt;
        if (p.shootCd <= 0 && Math.abs(angDiff(p.a, want)) < 0.35) {
          fireWeapon(p, p.x + Math.cos(p.a) * 18, p.y + Math.sin(p.a) * 18, p.a, p.wpn || 'pistol');
          p.burst++;
          p.shootCd = p.wpn === 'smg' ? (p.burst % 4 === 0 ? rr(0.8, 1.2) : 0.12) : rr(0.6, 1.0);
        }
      }
      if (d > 190) return [dx / d, dy / d, 130];
      return [0, 0, 0];
    }
  }
  const post = p.post || { x: p.x, y: p.y, a: p.a };
  const dx = post.x - p.x, dy = post.y - p.y, d = Math.hypot(dx, dy);
  if (d > 8) return [dx / d, dy / d, 70];
  p.a = lerpAngle(p.a, post.a + Math.sin(gameTime * 0.4 + p.id) * 0.6, 2 * dt);
  return [0, 0, 0];
}
function gangCarAI(c, dt) {
  c.gunCd = (c.gunCd || 0) - dt;
  const G = GANGS[c.gang];
  const shoot = (tx, ty, wpn, cd) => {
    const a = Math.atan2(ty - c.y, tx - c.x);
    fireWeapon({ type: c.gang === 'knutter' ? 'gang' : 'rival', gang: c.gang, car: c }, c.x + Math.cos(a) * (c.w / 2 + 14), c.y + Math.sin(a) * (c.w / 2 + 14), a, wpn);
    c.gunCd = cd;
  };
  if (c.gang === 'knutter') {
    // dina knuttar hjälper till: drive-by mot polisen när du är efterlyst
    if (stars() === 0 || c.gunCd > 0) return;
    let tgt = null, bd = 330 * 330;
    for (const q of peds) if (q.type === 'cop' && !q.dead) { const d = dist2(q.x, q.y, c.x, c.y); if (d < bd) { bd = d; tgt = q; } }
    for (const q of cars) if (q.police && !q.dead && q !== c) { const d = dist2(q.x, q.y, c.x, c.y); if (d < bd) { bd = d; tgt = q; } }
    if (tgt && los(c.x, c.y, tgt.x, tgt.y)) shoot(tgt.x, tgt.y, 'smg', (c.burst = (c.burst || 0) + 1) % 5 === 0 ? 0.9 : 0.13);
    else c.gunCd = 0.3;
    return;
  }
  const tgt = player.car || player;
  const d = Math.hypot(tgt.x - c.x, tgt.y - c.y);
  if (gangHostile(c.gang) && player.state === 'alive' && !playerSafe() && d < 1300) {
    if (c.ai.mode !== 'chase') { c.ai.mode = 'chase'; snapToLane(c); }
    if (c.gunCd <= 0 && d < 330) { if (los(c.x, c.y, tgt.x, tgt.y)) shoot(tgt.x, tgt.y, 'pistol', rr(0.45, 0.8)); else c.gunCd = 0.3; }
  } else if (c.ai.mode === 'chase') { c.ai.mode = 'traffic'; c.ai.direct = false; snapToLane(c); }
}
function updateGangs(dt) {
  for (const g of ['hajar', 'kobra']) {
    const G = GANGS[g];
    if (G.anger > 0) {
      const near = G.slots.some(p => !p.dead && dist2(p.x, p.y, player.x, player.y) < 1400 * 1400) || cars.some(c => c.gang === g && c.ai && dist2(c.x, c.y, player.x, player.y) < 1400 * 1400);
      G.anger = Math.max(0, G.anger - dt * (near ? 1 : 3));
      if (G.anger === 0) showMsg(`${G.name} har lugnat ner sig.`, 2.5);
    }
    G.slots.forEach((p, i) => {
      if (p.dead && p.deadT > 40 && !inView(G.posts[i].x, G.posts[i].y, 60)) { p.persist = false; G.slots[i] = spawnRival(g, G.posts[i]); }
    });
    if (G.turf) {
      const inTurf = Math.hypot(player.x - G.turf.x, player.y - G.turf.y) < G.turf.r;
      if (inTurf && currentTurf !== g) { currentTurf = g; showMsg(`Du är på ${G.name}s område. Bråka inte.`, 2.5); }
      else if (!inTurf && currentTurf === g) currentTurf = null;
    }
  }
}


// ===== Respekt =====
function gangHostile(g) { const G = GANGS[g]; return g !== 'knutter' && !!G && (G.anger > 0 || G.respect <= -30); }
let respectNote = null;
function changeRespect(g, d, quiet) {
  const G = GANGS[g];
  const before = G.respect;
  G.respect = clamp(G.respect + d, -100, 100);
  if (before > -30 && G.respect <= -30) showMsg(`${G.name} hatar dig nu – de skjuter när de ser dig.`, 3.5);
  if (!quiet) respectNote = { t: 3.5 };
  G.flash = 1.2;
}
function jobRespect(g) {
  changeRespect(g, 20);
  for (const o of ['knutter', 'hajar', 'kobra']) if (o !== g) changeRespect(o, o === 'knutter' ? -5 : -10, true);
  const parts = ['knutter', 'hajar', 'kobra'].map(o => `${GANGS[o].short} ${o === g ? '+20' : o === 'knutter' ? '−5' : '−10'}`);
  setTimeout(() => showMsg('Respekt: ' + parts.join(', '), 4), 3100);
}
function startGangMission(ph) {
  const g = ph.gang, G = GANGS[g];
  const enemies = g === 'knutter' ? ['hajar', 'kobra'] : g === 'hajar' ? ['kobra'] : ['hajar'];
  const enemy = pick(enemies), E = GANGS[enemy];
  const types = ['gängkrig', 'gängbil', 'bud', 'leverans'];
  let type = pick(types);
  ph.cool = 30;
  const m = { type, stage: 0, t: 0, phone: ph, gang: g, enemy, kills: 0 };
  if (type === 'gängkrig') {
    m.goal = 4; m.reward = 2500;
    m.text = `${G.name}: ge ${E.name} en läxa – ta ut fyra av dem på deras område.`;
  } else if (type === 'gängbil') {
    const s2 = randomSpot(900, 1800, player), model = ri(1, 5);
    const c = makeCar(s2.x, s2.y, rr(0, TAU), { key: gangCarKey(enemy, model), model, color: enemy });
    c.gang = enemy; c.colorName = E.colorName; c.parked = true; c.persist = true; c.missionMark = true;
    m.car = c; m.reward = 2000;
    m.text = `${G.name}: ${E.name} har ställt en bil på fel ställe. Spräng den.`;
  } else if (type === 'bud') {
    m.a = randomSpot(700, 1400, player); m.b = randomSpot(1400, 2300, m.a); m.reward = 1800;
    m.text = `${G.name}: hämta ett paket åt oss vid markören.`;
  } else {
    m.color = pick(CAR_COLORS);
    m.target = WORLD.garages.slice().sort((a, b) => dist2(b.x, b.y, player.x, player.y) - dist2(a.x, a.y, player.x, player.y))[0];
    m.reward = 2200;
    m.text = `${G.name}: vi behöver en ${COLOR_SV[m.color]} bil i GARAGET.`;
  }
  mission = m;
  sfx('ui_select', undefined, undefined, 0.8);
  showMsg(m.text, 7);
}

// ===== Kill frenzy =====
const FRENZIES = [
  { weapon: 'flame', goal: 15, kind: 'ped', time: 60, text: 'Bränn 15 personer' },
  { weapon: 'rocket', goal: 8, kind: 'car', time: 60, text: 'Spräng 8 bilar' },
  { weapon: 'smg', goal: 20, kind: 'ped', time: 60, text: 'Skjut 20 personer' },
];
let frenzy = null, frenzyTokens = [];
function initFrenzies() {
  const used = [...WORLD.crateSpots, ...WORLD.armorSpots, ...(WORLD.swordSpots || [])];
  const spots = [];
  for (const a of WORLD.alleySpots.slice().sort(() => Math.random() - 0.5)) {
    if (spots.length >= 3) break;
    if (used.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 140) && spots.every(o => Math.hypot(o.x - a.x, o.y - a.y) > 2200)) spots.push(a);
  }
  frenzyTokens = spots.map((sp, i) => ({ x: sp.x, y: sp.y + 20, cfg: FRENZIES[i % FRENZIES.length], active: true, respawn: 0 }));
}
function startFrenzy(tok) {
  const cfg = tok.cfg;
  frenzy = { cfg, t: cfg.time, count: 0, prevAmmo: player.ammo[cfg.weapon], prevCur: player.cur };
  player.ammo[cfg.weapon] = Infinity; player.cur = cfg.weapon;
  tok.active = false; tok.respawn = 180;
  showBig('KILL FRENZY!', `${cfg.text} på ${cfg.time} sekunder`, '#ff4b3e', 3.5);
  sfx('jingle_busted', undefined, undefined, 0.9);
}
function endFrenzy(ok) {
  const f = frenzy;
  frenzy = null;
  player.ammo[f.cfg.weapon] = f.prevAmmo || 0;
  if (!player.ammo[player.cur]) player.cur = player.ammo[f.prevCur] ? f.prevCur : 'pistol';
  if (ok) { player.money += 3000; showBig('FRENZY KLAR!', '+$3 000', '#8be04e', 3); sfx('jingle_mission'); }
  else if (player.state === 'alive') { showBig('FRENZY MISSLYCKAD', `${f.count} av ${f.cfg.goal}`, '#ff5a4f', 3); sfx('ui_error'); }
}
function updateFrenzy(dt) {
  for (const t of frenzyTokens) {
    if (!t.active) { t.respawn -= dt; if (t.respawn <= 0) t.active = true; continue; }
    if (!frenzy && !player.car && player.state === 'alive' && dist2(t.x, t.y, player.x, player.y) < 30 * 30) startFrenzy(t);
  }
  if (!frenzy) return;
  frenzy.t -= dt;
  if (frenzy.count >= frenzy.cfg.goal) endFrenzy(true);
  else if (frenzy.t <= 0) endFrenzy(false);
}
function drawFrenzyTokens() {
  for (const t of frenzyTokens) {
    if (!t.active || !inView(t.x, t.y, 40)) continue;
    const b = Math.sin(gameTime * 4) * 3, y = t.y + b;
    ctx.fillStyle = 'rgba(255,60,50,0.3)'; ctx.beginPath(); ctx.arc(t.x, y, 18 + Math.sin(gameTime * 6) * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(t.x, y - 2, 10, 0, TAU); ctx.fill(); ctx.fillRect(t.x - 6, y + 4, 12, 6);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(t.x - 4, y - 2, 3, 0, TAU); ctx.arc(t.x + 4, y - 2, 3, 0, TAU); ctx.fill();
    ctx.fillRect(t.x - 3, y + 6, 1.5, 4); ctx.fillRect(t.x + 1.5, y + 6, 1.5, 4);
  }
}
function drawFrenzyHud(small) {
  if (!frenzy) return;
  const s = Math.max(0, frenzy.t);
  hudText(`KILL FRENZY  ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, VW / 2, small ? 96 : 110, small ? 24 : 34, s < 10 ? '#ff5a4f' : '#ff9a3e', 'center', 6);
  hudText(`${frenzy.count} / ${frenzy.cfg.goal}`, VW / 2, small ? 124 : 146, small ? 22 : 30, '#ffffff', 'center', 5);
}
function weaponIcon(kind, x, y, sc) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  if (kind === 'flame') {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-14, -5, 9, 10); ctx.strokeRect(-14, -5, 9, 10);
    ctx.fillStyle = '#555'; ctx.fillRect(-5, -2, 16, 4); ctx.strokeRect(-5, -2, 16, 4);
    ctx.fillStyle = '#ff9a3e'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(19, -4); ctx.lineTo(17, 0); ctx.lineTo(19, 4); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#4d5a3a'; ctx.fillRect(-15, -3.5, 26, 7); ctx.strokeRect(-15, -3.5, 26, 7);
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(11, -3.5); ctx.lineTo(17, 0); ctx.lineTo(11, 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.fillRect(-4, 3.5, 4, 5);
  }
  ctx.restore();
}

// ===== Dygn och väder =====
let clockMin = 10 * 60;
const WEATHER = { type: 'sol', rain: 0, rainT: 0, cloud: 0, cloudT: 0, next: rr(100, 180), flash: 0, thunderT: -1 };
const WEATHER_SV = { sol: 'Sol', mulet: 'Mulet', regn: 'Regn' };
function setWeather(type) {
  WEATHER.type = type;
  WEATHER.rainT = type === 'regn' ? 1 : 0;
  WEATHER.cloudT = type === 'sol' ? 0 : 1;
}
function updateWorldTime(dt) {
  clockMin = (clockMin + dt * 3) % 1440; // 3 spelminuter per sekund – ett dygn tar 8 minuter
  const h = clockMin / 60;
  const night = h >= 22 || h < 5 ? 1 : h >= 20 ? (h - 20) / 2 : h < 7 ? 1 - (h - 5) / 2 : 0;
  LIGHT.night = night;
  WEATHER.next -= dt;
  if (WEATHER.next <= 0) {
    const r = Math.random();
    setWeather(r < 0.45 ? 'sol' : r < 0.7 ? 'mulet' : 'regn');
    WEATHER.next = rr(90, 200);
  }
  WEATHER.rain = lerp(WEATHER.rain, WEATHER.rainT, 1 - Math.exp(-dt / 6));
  WEATHER.cloud = lerp(WEATHER.cloud, WEATHER.cloudT, 1 - Math.exp(-dt / 6));
  WEATHER.flash = Math.max(0, WEATHER.flash - dt * 2.5);
  if (WEATHER.rain > 0.7 && Math.random() < dt * 0.04) { WEATHER.flash = 1; WEATHER.thunderT = rr(0.3, 1.6); }
  if (WEATHER.thunderT > 0) { WEATHER.thunderT -= dt; if (WEATHER.thunderT <= 0) sfxThunder(); }
  LIGHT.dark = clamp(0.6 * night + 0.14 * WEATHER.rain + 0.07 * WEATHER.cloud, 0, 0.72) * 0.92;
}
let lightCv = null, lightG = null;
const _lightSprites = {};
function lightSprite(col) {
  if (_lightSprites[col]) return _lightSprites[col];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, col); gr.addColorStop(0.45, col + 'aa'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (_lightSprites[col] = c);
}
function drawLighting() {
  const dark = clamp(0.64 * LIGHT.night + 0.16 * WEATHER.rain + 0.08 * WEATHER.cloud, 0, 0.78);
  if (dark < 0.02) return;
  const S = 0.3, w = Math.ceil(VW * S), h = Math.ceil(VH * S);
  if (!lightCv) { lightCv = document.createElement('canvas'); lightG = lightCv.getContext('2d'); }
  if (lightCv.width !== w || lightCv.height !== h) { lightCv.width = w; lightCv.height = h; }
  const g = lightG;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(6,10,26,${dark})`; g.fillRect(0, 0, w, h);
  const L = LIGHT.night;
  if (L > 0.05) {
    g.globalCompositeOperation = 'destination-out';
    const z = cam.zoom * S;
    g.setTransform(z, 0, 0, z, (VW / 2 - cam.x * cam.zoom) * S, (VH / 2 - cam.y * cam.zoom) * S);
    const spr = lightSprite('#000000');
    const glow = (x, y, r, a) => { g.globalAlpha = Math.min(1, a); g.drawImage(spr, x - r, y - r, r * 2, r * 2); };
    for (const l of WORLD.lamps) if (inView(l.x, l.y, 150)) glow(l.x, l.y, 135, 0.85 * L);
    for (const c of cars) {
      if (c.dead || !(c.ai || c === player.car) || !inView(c.x, c.y, 200)) continue;
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      for (const sd of [-1, 1]) {
        const ox = -fy * sd * c.w * 0.28, oy = fx * sd * c.w * 0.28;
        glow(c.x + fx * (c.l / 2 + 26) + ox, c.y + fy * (c.l / 2 + 26) + oy, 34, 0.9 * L);
        glow(c.x + fx * (c.l / 2 + 85) + ox * 1.6, c.y + fy * (c.l / 2 + 85) + oy * 1.6, 70, 0.75 * L);
      }
      if (c.siren) glow(c.x, c.y, 80, 0.6 * L);
    }
    if (player.state === 'alive') glow(player.x, player.y, 70, 0.45 * L);
    for (const p of particles) if ((p.type === 'fire' || p.type === 'flash' || p.type === 'muzzle') && inView(p.x, p.y, 100)) glow(p.x, p.y, (p.size || 8) * 3.5, 0.85);
    for (const s of shells) glow(s.x, s.y, 50, 0.8);
    g.globalAlpha = 1;
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(lightCv, 0, 0, VW, VH);
  if (L > 0.05) {
    // varmt sken från lyktorna
    const z = cam.zoom;
    ctx.save();
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - cam.x * z), DPR * (VH / 2 - cam.y * z));
    ctx.globalCompositeOperation = 'lighter';
    const warm = lightSprite('#ffbe6e');
    ctx.globalAlpha = 0.16 * L;
    for (const l of WORLD.lamps) if (inView(l.x, l.y, 120)) ctx.drawImage(warm, l.x - 100, l.y - 100, 200, 200);
    ctx.restore();
  }
}
const drops = [];
let lastFx = performance.now();
function drawWeatherFx() {
  const now = performance.now(), dt = Math.min(0.05, (now - lastFx) / 1000); lastFx = now;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.floor(WEATHER.rain * 280);
  while (drops.length < n) drops.push({ x: Math.random() * VW, y: Math.random() * VH, s: rr(700, 1000), l: rr(10, 22) });
  if (drops.length > n) drops.length = n;
  if (n > 0) {
    ctx.strokeStyle = 'rgba(190,205,230,0.38)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops) {
      if (running) { d.y += d.s * dt; d.x += d.s * 0.18 * dt; }
      if (d.y > VH + 20) { d.y = -20; d.x = Math.random() * VW * 1.2 - VW * 0.2; }
      if (d.x > VW + 20) d.x -= VW + 40;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.18, d.y - d.l);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,215,235,0.3)';
    for (let k = 0; k < n / 25; k++) { ctx.beginPath(); ctx.ellipse(Math.random() * VW, Math.random() * VH, rr(2, 5), rr(1, 2), 0, 0, TAU); ctx.stroke(); }
  }
  if (WEATHER.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${WEATHER.flash * 0.55})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawClockAndRespect(small) {
  const hh = Math.floor(clockMin / 60), mm = Math.floor(clockMin % 60);
  hudText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${WEATHER_SV[WEATHER.type]}`, VW / 2, small ? 22 : 26, small ? 16 : 20, '#e8ecf2', 'center', 4);
  // respektmätare
  const x1 = VW - 20, w = small ? 80 : 120;
  let y = small ? 88 : 104;
  for (const g of ['knutter', 'hajar', 'kobra']) {
    const G = GANGS[g], x0 = x1 - w, mid = x0 + w / 2, v = G.respect / 100;
    G.flash = Math.max(0, (G.flash || 0) - 1 / 60);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 3, y - 3, w + 6, 13);
    ctx.fillStyle = '#26282d'; ctx.fillRect(x0, y, w, 7);
    ctx.fillStyle = v >= 0 ? G.color : '#e0313f';
    if (v >= 0) ctx.fillRect(mid, y, (w / 2) * v, 7); else ctx.fillRect(mid + (w / 2) * v, y, -(w / 2) * v, 7);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(mid - 0.5, y - 2, 1, 11);
    ctx.font = `${G.flash > 0 && Math.floor(gameTime * 8) % 2 ? 'bold ' : ''}13px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(G.short, x0 - 8, y + 4);
    ctx.fillStyle = gangHostile(g) ? '#ff6b6b' : G.color; ctx.fillText(G.short, x0 - 8, y + 4);
    y += 17;
  }
  ctx.textBaseline = 'alphabetic';
}
