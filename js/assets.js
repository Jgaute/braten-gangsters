'use strict';
// ---------- Grafik ----------
// Alla bilder laddas härifrån. Vill du byta grafik: lägg nya PNG-filer med samma namn i img/.
const IMG = {};
const CAR_COLORS = ['black', 'blue', 'green', 'red', 'yellow'];
const COLOR_SV = { black: 'svart', blue: 'blå', green: 'grön', red: 'röd', yellow: 'gul', purple: 'lila', grey: 'grå' };
const CHAR_FILES = {
  hitman: 'hitman1', manBlue: 'manBlue', manBrown: 'manBrown', manOld: 'manOld',
  womanGreen: 'womanGreen', survivor: 'survivor1', soldier: 'soldier1',
};
const POSES = ['stand', 'gun', 'machine', 'hold'];

function assetList() {
  const L = [];
  for (const c of CAR_COLORS) for (let n = 1; n <= 5; n++) L.push([`car_${c}_${n}`, `img/cars/car_${c}_${n}.png`]);
  for (const k in CHAR_FILES) for (const p of POSES) L.push([`${k}_${p}`, `img/chars/${CHAR_FILES[k]}_${p}.png`]);
  for (const t of ['asphalt', 'concrete', 'grass', 'water', 'dirt']) L.push([t, `img/tiles/${t}.png`]);
  for (const o of ['tree_large', 'tree_small', 'bush', 'crate', 'barrel', 'cone']) L.push([o, `img/obj/${o}.png`]);
  for (const w of ['gun', 'machine', 'silencer']) L.push(['w_' + w, `img/obj/weapon_${w}.png`]);
  for (const m of ['black', 'red']) L.push(['moto_' + m, `img/cars/motorcycle_${m}.png`]);
  L.push(['tank', 'img/cars/tank_body.png'], ['tank_barrel', 'img/cars/tank_barrel.png']);
  return L;
}

function loadImages(onProgress) {
  const L = assetList();
  let done = 0;
  return Promise.all(L.map(([k, src]) => new Promise((res) => {
    const i = new Image();
    i.onload = () => { IMG[k] = i; done++; onProgress && onProgress(done / L.length); res(); };
    i.onerror = () => {
      console.warn('Kunde inte ladda', src);
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, 32, 32);
      IMG[k] = c; done++; res();
    };
    i.src = src;
  })));
}

function tintCopy(img, color) {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

function makeDerivedSprites() {
  for (const c of CAR_COLORS) for (let n = 1; n <= 5; n++) {
    const k = `car_${c}_${n}`;
    IMG['burnt_' + k] = tintCopy(IMG[k], 'rgba(28,20,14,0.86)');
  }
  // Svensk polisbil: blå sedan med gul-blå rutor på sidorna och vitt tak
  const base = IMG.car_blue_3;
  const cv = document.createElement('canvas');
  cv.width = base.width; cv.height = base.height;
  const g = cv.getContext('2d');
  g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const W = base.width, H = base.height;
  const y0 = Math.round(H * 0.36), y1 = Math.round(H * 0.70);
  const sq = 9;
  for (let y = y0, r = 0; y < y1; y += sq, r++) {
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 2; k++) {
        const x = side === 0 ? k * sq * 0.6 : W - (k + 1) * sq * 0.6;
        g.fillStyle = ((r + k) % 2) ? '#f2d40c' : '#1d46b3';
        g.fillRect(x, y, sq * 0.6, sq);
      }
    }
  }
  g.fillStyle = 'rgba(240,244,250,0.92)';
  g.fillRect(W * 0.22, H * 0.43, W * 0.56, H * 0.19);
  g.fillStyle = '#1d46b3';
  g.font = `bold ${Math.round(W * 0.2)}px Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(W / 2, H * 0.525); g.rotate(-Math.PI / 2); g.fillText('POLIS', 0, 0); g.restore();
  IMG.police = cv;
  IMG.burnt_police = tintCopy(cv, 'rgba(28,20,14,0.86)');
  // Gör om "soldaten" till polis: grön hjälm/uniform -> mörkblå
  for (const p of POSES) {
    const src = IMG['soldier_' + p];
    try {
      const cv2 = document.createElement('canvas'); cv2.width = src.width; cv2.height = src.height;
      const g2 = cv2.getContext('2d'); g2.drawImage(src, 0, 0);
      const id = g2.getImageData(0, 0, cv2.width, cv2.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (gg > r + 8 && gg > b + 8) { const l = (r + gg + b) / 3; d[i] = l * 0.25; d[i + 1] = l * 0.35; d[i + 2] = Math.min(255, l * 0.95 + 40); }
      }
      g2.putImageData(id, 0, 0);
      IMG['soldier_' + p] = cv2;
    } catch (e) { /* file:// – behåll originalet */ }
  }
  getPaint('knutter', 0); getPaint('tank', 0); getPaint('moto', 0); getPaint('moto', 1);
  IMG.burnt_tank = tintCopy(IMG.tank, 'rgba(28,20,14,0.8)');
  IMG.burnt_moto_black = tintCopy(IMG.moto_black, 'rgba(28,20,14,0.86)');
  IMG.burnt_moto_red = tintCopy(IMG.moto_red, 'rgba(28,20,14,0.86)');
  // Gaute knutters: survivor-gubben med lila jacka
  for (const p of POSES) {
    const src = IMG['survivor_' + p];
    let out = src;
    try {
      const cv4 = document.createElement('canvas'); cv4.width = src.width; cv4.height = src.height;
      const g4 = cv4.getContext('2d'); g4.drawImage(src, 0, 0);
      const id = g4.getImageData(0, 0, cv4.width, cv4.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (b > r + 25 && b > gg + 15) { d[i] = Math.min(255, b * 0.95); d[i + 1] = gg * 0.35; d[i + 2] = Math.min(255, b * 1.05); }
      }
      g4.putImageData(id, 0, 0);
      out = cv4;
    } catch (e) { out = tintCopy(src, 'rgba(140,40,200,0.25)'); }
    IMG['gang_' + p] = out;
  }
  // Joggare: blå tröja -> vit
  for (const p of POSES) {
    const src = IMG['manBlue_' + p];
    let out = src;
    try {
      const cv5 = document.createElement('canvas'); cv5.width = src.width; cv5.height = src.height;
      const g5 = cv5.getContext('2d'); g5.drawImage(src, 0, 0);
      const id = g5.getImageData(0, 0, cv5.width, cv5.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (b > r + 25 && b > gg + 10) { const l = 195 + (b / 255) * 55; d[i] = l; d[i + 1] = l; d[i + 2] = Math.min(255, l + 6); }
      }
      g5.putImageData(id, 0, 0);
      out = cv5;
    } catch (e) { out = tintCopy(src, 'rgba(255,255,255,0.45)'); }
    IMG['jogger_' + p] = out;
  }
  for (const k of ['manBlue', 'manBrown', 'manOld', 'womanGreen', 'survivor', 'soldier', 'hitman', 'gang', 'jogger']) {
    IMG['dead_' + k] = tintCopy(IMG[k + '_stand'], 'rgba(60,10,10,0.35)');
  }
}

// ---------- Lackering av specialfordon (Lack & Fix) ----------
const PAINTS = {
  knutter: { base: 'car_red_1', op: 'hue', stripes: true, list: [['lila', '#8b2cff'], ['orange', '#ff7a1a'], ['turkos', '#14c8c0'], ['rosa', '#ff3fa4'], ['guld', '#e0a92a']] },
  moto: { base: 'moto_red', op: 'hue', list: [['svart', null, 'moto_black'], ['röd', null], ['blå', '#2a6cff'], ['grön', '#20c050'], ['gul', '#ffd000'], ['lila', '#9a3cff']] },
  tank: { base: 'tank', op: 'color', list: [['grå', null], ['olivgrön', '#5d6b2f'], ['sand', '#c6a46a'], ['vinterblå', '#6f8fb0']] },
};
function getPaint(kind, i) {
  const key = `${kind}_p${i}`;
  if (IMG[key]) return key;
  const P = PAINTS[kind], entry = P.list[i], src = IMG[entry[2] || P.base], hex = entry[1];
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  if (hex) {
    g.globalCompositeOperation = P.op; g.fillStyle = hex; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  }
  if (P.stripes) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = kind === 'knutter' && i === 4 ? 'rgba(30,30,34,0.9)' : 'rgba(217,180,74,0.95)';
    g.fillRect(cv.width * 0.08, cv.height * 0.08, 3, cv.height * 0.84);
    g.fillRect(cv.width * 0.92 - 3, cv.height * 0.08, 3, cv.height * 0.84);
  }
  IMG[key] = cv;
  IMG['burnt_' + key] = tintCopy(cv, 'rgba(28,20,14,0.84)');
  return key;
}

// ---------- Utseenden: hudtoner, hår och kläder ----------
// Kenney-figurerna har hud i två färgfamiljer. Bara de pixlarna byts, så kläder och hår behålls.
const SKIN_SRC = {
  LIGHT: [[[255, 208, 163], 'b'], [[163, 133, 104], 's'], [[255, 220, 187], 'h']],
  BROWN: [[[196, 134, 71], 'b'], [[145, 98, 51], 's'], [[154, 105, 55], 's'], [[159, 109, 57], 's']],
};
const TONES = [
  { b: [255, 208, 163], s: [163, 133, 104], h: [255, 220, 187] },
  { b: [232, 186, 138], s: [160, 121, 87], h: [244, 202, 158] },
  { b: [196, 134, 71], s: [145, 98, 51], h: [212, 152, 90] },
  { b: [141, 92, 54], s: [98, 62, 36], h: [160, 108, 66] },
  { b: [96, 62, 38], s: [66, 43, 27], h: [116, 78, 50] },
];
const LOOKS = {
  manBlue: { base: 'manBlue', skin: 'BROWN' },
  manBrown: { base: 'manBrown', skin: 'LIGHT' },
  manOld: { base: 'manOld', skin: 'LIGHT' },
  womanGreen: { base: 'womanGreen', skin: 'LIGHT', hair: ['#c48647', '#2b2b2b', '#e2bf5a', '#5a3a22'] },
  suit: { base: 'hitman', skin: 'LIGHT', suit: ['#4a5568', '#6b4f3a', '#2f3e5c', '#7a7f87', '#5b2a2a'] },
  cop: { base: 'soldier', skin: 'LIGHT' },
  jogger: { base: 'manBlue', skin: 'BROWN', shirt: '#f2f2f2' },
  target: { base: 'manBrown', skin: 'LIGHT' },
  knutter: { base: 'hitman', skin: 'LIGHT', suit: ['#7a2bd6'] },
  hajar: { base: 'hitman', skin: 'LIGHT', suit: ['#129ea6'] },
  kobra: { base: 'hitman', skin: 'LIGHT', suit: ['#d6337f'] },
};
const CIV_LOOKS = ['manBlue', 'manBrown', 'manOld', 'womanGreen', 'suit', 'suit'];
function randTone() { const r = Math.random(); return r < 0.28 ? 0 : r < 0.48 ? 1 : r < 0.68 ? 2 : r < 0.85 ? 3 : 4; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lookImg(look, pose, dead) {
  const key = `L_${look}_${pose}${dead ? '_d' : ''}`;
  if (IMG[key]) return IMG[key];
  if (dead) return (IMG[key] = tintCopy(lookImg(look, pose, false), 'rgba(60,10,10,0.35)'));
  const parts = look.split(':');
  const L = LOOKS[parts[0]] || LOOKS.manBrown, tone = TONES[+parts[1] || 0], v = +parts[2] || 0;
  const src = IMG[L.base + '_' + pose] || IMG[L.base + '_stand'];
  let out = src;
  try {
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d'); g.drawImage(src, 0, 0);
    const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
    const fam = SKIN_SRC[L.skin];
    const suit = L.suit ? hexRgb(L.suit[v % L.suit.length]) : null;
    const hair = L.hair ? hexRgb(L.hair[v % L.hair.length]) : null;
    const shirt = L.shirt ? hexRgb(L.shirt) : null;
    const near = (r, gg, b, c, t) => (r - c[0]) ** 2 + (gg - c[1]) ** 2 + (b - c[2]) ** 2 < t * t;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      let done = false;
      for (const [c, role] of fam) if (near(r, gg, b, c, 10)) { const t = tone[role]; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; done = true; break; }
      if (done) continue;
      if (hair) {
        for (const [c] of SKIN_SRC.BROWN) if (near(r, gg, b, c, 10)) { const k = (r + gg + b) / 401; d[i] = Math.min(255, hair[0] * k); d[i + 1] = Math.min(255, hair[1] * k); d[i + 2] = Math.min(255, hair[2] * k); done = true; break; }
        if (done) continue;
      }
      if (suit && r === gg && gg === b && r >= 40 && r <= 72) { const k = r / 62; d[i] = Math.min(255, suit[0] * k); d[i + 1] = Math.min(255, suit[1] * k); d[i + 2] = Math.min(255, suit[2] * k); continue; }
      if (shirt && b > r + 25 && b > gg + 10) { const k = 0.78 + 0.22 * b / 208; d[i] = shirt[0] * k; d[i + 1] = shirt[1] * k; d[i + 2] = shirt[2] * k; }
    }
    g.putImageData(id, 0, 0);
    out = cv;
  } catch (e) { /* file:// – originalbild */ }
  return (IMG[key] = out);
}

// ---------- Gängens bilar ----------
const GANG_HUES = { knutter: '#8b2cff', hajar: '#14c8c0', kobra: '#ff3fa4' };
function gangCarKey(gang, model) {
  const key = `gcar_${gang}_${model}`;
  if (IMG[key]) return key;
  const src = IMG[`car_red_${model}`];
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'hue'; g.fillStyle = GANG_HUES[gang]; g.fillRect(0, 0, cv.width, cv.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  IMG[key] = cv;
  IMG['burnt_' + key] = tintCopy(cv, 'rgba(28,20,14,0.84)');
  return key;
}
