'use strict';
// ---------- Ljud ----------
// Inspelade ljud (Kenney + Free Firearm Sound Library) blandas med syntetiska
// ljud som skapas i realtid: motor, däckskrik, siren, tuta, explosion, stadsbrus.
const SND_FILES = {
  gun_pistol: 1, gun_smg: 1, gun_shotgun: 1, gun_rifle: 1,
  crash: 5, step: 5, scrape: 2, hit: 2, glass: 1, thud: 1,
  pickup: 1, ui_select: 1, ui_error: 1, door: 1, drop: 1,
  jingle_mission: 1, jingle_wasted: 1, jingle_busted: 1,
};
// Inspelade motorloopar laddas om filerna finns (annars används syntetiska motorer)
const OPTIONAL_SOUNDS = { engine_car: 'engine_car.wav', engine_sport: 'engine_sport.wav', engine_tank: 'engine_tank.wav' };
const SND = { ctx: null, master: null, buf: {}, fallback: {}, voices: {}, muted: false, engine: null, skid: null, siren: null, noise: null };

function initAudio() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = SND.ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  SND.master = ctx.createGain();
  SND.master.gain.value = SND.muted ? 0 : 0.85;
  SND.master.connect(comp); comp.connect(ctx.destination);

  // vitt brus som återanvänds
  const len = ctx.sampleRate * 2;
  const nb = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  SND.noise = nb;

  SND.engine = null;
  SND.skid = makeSkidSynth();
  SND.siren = makeSirenSynth();
  makeAmbience();

  for (const name in SND_FILES) {
    const n = SND_FILES[name];
    if (n > 1) for (let i = 0; i < n; i++) loadSound(`${name}_${i}`);
    else loadSound(name);
  }
  for (const k in OPTIONAL_SOUNDS) loadSound(k, true, OPTIONAL_SOUNDS[k]);
}

async function loadSound(key, optional, file) {
  const url = `assets/audio/${file || key + '.mp3'}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const ab = await r.arrayBuffer();
    SND.buf[key] = await new Promise((res, rej) => SND.ctx.decodeAudioData(ab, res, rej));
  } catch (e) {
    if (optional) return;
    // t.ex. om index.html öppnas direkt från disk (file://) – då funkar inte fetch
    const a = new Audio(url); a.preload = 'auto';
    SND.fallback[key] = a;
  }
}

function setMuted(m) {
  SND.muted = m;
  if (SND.master) SND.master.gain.setTargetAtTime(m ? 0 : 0.85, SND.ctx.currentTime, 0.05);
}

function spatial(x, y, maxD = 1500) {
  if (x === undefined) return { g: 1, pan: 0 };
  const d = Math.hypot(x - cam.x, y - cam.y);
  return { g: Math.pow(clamp(1 - d / maxD, 0, 1), 1.6), pan: clamp((x - cam.x) / 800, -1, 1) };
}

function outNode(gain, pan) {
  const ctx = SND.ctx;
  const g = ctx.createGain(); g.gain.value = gain;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(p); p.connect(SND.master);
  } else g.connect(SND.master);
  return g;
}

function sfx(name, x, y, vol = 1, rate = 1) {
  if (!SND.ctx || SND.muted) return;
  const n = SND_FILES[name] || 1;
  const key = n > 1 ? `${name}_${Math.floor(Math.random() * n)}` : name;
  const s = spatial(x, y);
  const g = vol * s.g;
  if (g < 0.01) return;
  const v = SND.voices[name] || 0;
  if (v >= 6) return;
  const b = SND.buf[key];
  if (b) {
    const src = SND.ctx.createBufferSource();
    src.buffer = b; src.playbackRate.value = rate;
    src.connect(outNode(g, s.pan));
    src.start();
    SND.voices[name] = v + 1;
    src.onended = () => { SND.voices[name]--; };
  } else if (SND.fallback[key]) {
    const a = SND.fallback[key].cloneNode();
    a.volume = clamp(g, 0, 1);
    a.play().catch(() => {});
  }
}

// ---- Motorer: en loopad "motorcykel" (en varvcykel med tändpulser) per fordonstyp.
// Tonhöjden styrs med playbackRate = varvtal. Finns inspelade loopar (engine_*.mp3) används de i stället.
const ENGINE_PROFILES = {
  car:   { baseHz: 22, pulses: [[0, 1], [0.5, 0.95]], thumpHz: 120, thump: 0.6, noise: 0.8, noiseLP: 0.25, decay: 90, rateMin: 1.0, rateMax: 3.6, lpBase: 650, lpRpm: 2200, hissF: 900, vol: 0.11, drive: 1.6, sample: 'engine_car', sampleRate: [0.72, 2.0], sampleVol: 0.13, sampleLp: [900, 5000], seed: 11 },
  sport: { baseHz: 13, pulses: [[0, 1], [0.21, 0.62], [0.5, 0.92], [0.73, 0.55]], thumpHz: 85, thump: 0.95, noise: 0.6, noiseLP: 0.18, decay: 65, rateMin: 1.1, rateMax: 5.4, lpBase: 480, lpRpm: 3200, hissF: 650, vol: 0.14, drive: 2.6, sample: 'engine_sport', sampleRate: [0.62, 2.5], sampleVol: 0.17, sampleLp: [700, 6500], layer: 0.45, seed: 23 },
  bike:  { baseHz: 30, pulses: [[0, 1]], thumpHz: 160, thump: 0.7, noise: 0.7, noiseLP: 0.3, decay: 120, rateMin: 1.2, rateMax: 6.0, lpBase: 900, lpRpm: 3000, hissF: 1400, vol: 0.10, drive: 2.0, sample: 'engine_car', sampleRate: [1.3, 3.3], sampleVol: 0.10, sampleLp: [1400, 7000], seed: 37 },
  tank:  { baseHz: 9, pulses: [[0, 1], [0.34, 0.8], [0.67, 0.95]], thumpHz: 55, thump: 0.75, noise: 1.25, noiseLP: 0.55, decay: 50, rateMin: 1.0, rateMax: 1.9, lpBase: 380, lpRpm: 1300, hissF: 300, vol: 0.16, drive: 2.2, sample: 'engine_tank', sampleRate: [0.8, 1.35], sampleVol: 0.2, sampleLp: [900, 3000], layer: 0.3, seed: 51 },
};
const _cycleCache = {};
function cycleBuffer(name) {
  if (_cycleCache[name]) return _cycleCache[name];
  const P = ENGINE_PROFILES[name], c = SND.ctx, sr = c.sampleRate;
  const len = Math.round(sr / P.baseHz);
  const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  let seed = P.seed * 7919;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  for (const [pos, amp] of P.pulses) {
    const st = Math.floor(pos * len);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, env = Math.exp(-t * P.decay);
      if (env < 0.002) break;
      lp += (rnd() - lp) * P.noiseLP;
      d[(st + i) % len] += amp * env * (Math.sin(TAU * P.thumpHz * t) * P.thump + lp * P.noise);
    }
  }
  let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] *= 0.9 / (pk || 1);
  return (_cycleCache[name] = b);
}
function trackBuffer() {
  if (_cycleCache.tracks) return _cycleCache.tracks;
  const c = SND.ctx, sr = c.sampleRate, len = Math.round(sr * 0.3);
  const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  [0, 0.34, 0.67].forEach((pos, k) => {
    const st = Math.floor(pos * len), f1 = 1900 + k * 350, f2 = 310;
    for (let i = 0; i < len - st; i++) {
      const t = i / sr;
      d[st + i] += Math.sin(TAU * f1 * t) * Math.exp(-t * 70) * 0.6 + Math.sin(TAU * f2 * t) * Math.exp(-t * 35) * 0.5 + (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.5;
    }
  });
  return (_cycleCache.tracks = b);
}
function softClip(k) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
  return curve;
}
function engineProfileFor(car) {
  if (car.m.tracks) return 'tank';
  if (car.model === 6) return 'bike';
  if (car.model === 7 || car.model === 1) return 'sport';
  return 'car';
}
function makeEngineVoice(name) {
  const c = SND.ctx, P = ENGINE_PROFILES[name];
  const useSample = P.sample && SND.buf[P.sample];
  const src = c.createBufferSource();
  src.buffer = useSample ? SND.buf[P.sample] : cycleBuffer(name);
  src.loop = true;
  const sh = c.createWaveShaper(); sh.curve = softClip(useSample ? 1.2 : P.drive);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = P.lpBase;
  const out = c.createGain(); out.gain.value = 0;
  src.connect(sh); sh.connect(lp); lp.connect(out); out.connect(SND.master);
  let layer = null, layerG = null;
  if (useSample && P.layer) {
    // syntetiskt lager under inspelningen: V8-mullret på sportbilen, dieselknackningar på stridsvagnen
    layer = c.createBufferSource(); layer.buffer = cycleBuffer(name); layer.loop = true;
    const lsh = c.createWaveShaper(); lsh.curve = softClip(P.drive);
    const llp = c.createBiquadFilter(); llp.type = 'lowpass'; llp.frequency.value = 900;
    layerG = c.createGain(); layerG.gain.value = P.layer;
    layer.connect(lsh); lsh.connect(llp); llp.connect(layerG); layerG.connect(out); layer.start();
  }
  const n = c.createBufferSource(); n.buffer = SND.noise; n.loop = true;
  const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = P.hissF; nb.Q.value = 0.8;
  const ng = c.createGain(); ng.gain.value = 0;
  n.connect(nb); nb.connect(ng); ng.connect(out);
  src.start(); n.start();
  const v = { name, P, src, lp, out, ng, n, useSample, layer, rpm: 0.2, prevThr: 0, popT: 0 };
  if (name === 'tank') {
    const tr = c.createBufferSource(); tr.buffer = trackBuffer(); tr.loop = true;
    const tg = c.createGain(); tg.gain.value = 0;
    tr.connect(tg); tg.connect(SND.master); tr.start();
    v.tr = tr; v.tg = tg;
  }
  return v;
}
function stopEngineVoice(v) {
  const t = SND.ctx.currentTime;
  v.out.gain.setTargetAtTime(0, t, 0.05);
  if (v.tg) v.tg.gain.setTargetAtTime(0, t, 0.05);
  for (const s of [v.src, v.n, v.tr, v.layer]) if (s) try { s.stop(t + 0.4); } catch (e) {}
}
function enginePop(v) {
  const c = SND.ctx, t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = SND.noise;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 700; f.Q.value = 1.5;
  const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(f); f.connect(g); g.connect(SND.master); n.start(t, Math.random()); n.stop(t + 0.08);
}
function updateEngine(car, dt) {
  if (!SND.ctx) return;
  let v = SND.engine;
  if (!car || car.dead) { if (v) { stopEngineVoice(v); SND.engine = null; } return; }
  const name = engineProfileFor(car);
  if (!v || v.name !== name || (!v.useSample && v.P.sample && SND.buf[v.P.sample])) {
    if (v) stopEngineVoice(v);
    v = SND.engine = makeEngineVoice(name);
  }
  const P = v.P, t = SND.ctx.currentTime;
  const sp = Math.abs(car.vf || 0);
  const thr = Math.max(0, Math.abs(car.input.thr));
  let target;
  if (name === 'tank') target = 0.15 + thr * 0.3 + clamp(sp / car.m.max, 0, 1) * 0.55;
  else {
    const top = car.m.max / (name === 'sport' ? 5 : 4.2);
    if (sp < 25) target = 0.12 + thr * 0.45;
    else { const gear = Math.min(5, Math.floor(sp / top)); target = 0.28 + 0.72 * clamp((sp - gear * top) / top, 0, 1) + thr * 0.06; }
  }
  v.rpm = lerp(v.rpm, target, clamp(dt * (name === 'tank' ? 3 : 10), 0, 1));
  const rate = v.useSample ? lerp(P.sampleRate[0], P.sampleRate[1], v.rpm) : lerp(P.rateMin, P.rateMax, v.rpm);
  v.src.playbackRate.setTargetAtTime(rate, t, 0.03);
  if (v.layer) v.layer.playbackRate.setTargetAtTime(lerp(P.rateMin, P.rateMax, v.rpm), t, 0.03);
  const lpF = v.useSample ? lerp(P.sampleLp[0], P.sampleLp[1], v.rpm) + thr * 800 : P.lpBase + v.rpm * P.lpRpm + thr * 500;
  v.lp.frequency.setTargetAtTime(lpF, t, 0.05);
  v.out.gain.setTargetAtTime((v.useSample ? P.sampleVol : P.vol) * (0.55 + thr * 0.35 + v.rpm * 0.25), t, 0.06);
  v.ng.gain.setTargetAtTime(0.25 * thr * (0.3 + v.rpm), t, 0.08);
  if (v.tg) {
    v.tr.playbackRate.setTargetAtTime(0.4 + sp / 70, t, 0.05);
    v.tg.gain.setTargetAtTime(clamp(sp / 60, 0, 1) * 0.11, t, 0.08);
  }
  // sportbilen smäller och puttrar när man släpper gasen på höga varv
  if (name === 'sport') {
    if (v.prevThr > 0.5 && thr < 0.1 && v.rpm > 0.5) v.popT = 0.8;
    v.popT -= dt;
    if (v.popT > 0 && Math.random() < dt * 14) enginePop(v);
  }
  v.prevThr = thr;
}

// ---- Däckskrik: bandpassat brus + vibrerande ton
function makeSkidSynth() {
  const c = SND.ctx;
  const n = c.createBufferSource(); n.buffer = SND.noise; n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 760;
  const vib = c.createOscillator(); vib.frequency.value = 11;
  const vibG = c.createGain(); vibG.gain.value = 30;
  vib.connect(vibG); vibG.connect(o.frequency);
  const obp = c.createBiquadFilter(); obp.type = 'bandpass'; obp.frequency.value = 900; obp.Q.value = 6;
  const og = c.createGain(); og.gain.value = 0.35;
  const out = c.createGain(); out.gain.value = 0;
  n.connect(bp); bp.connect(out);
  o.connect(obp); obp.connect(og); og.connect(out);
  out.connect(SND.master);
  n.start(); o.start(); vib.start();
  return { out, o };
}
function updateSkid(amount) {
  const s = SND.skid; if (!s) return;
  const t = SND.ctx.currentTime;
  s.out.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.22, t, 0.05);
  s.o.frequency.setTargetAtTime(700 + amount * 160, t, 0.1);
}

// ---- Siren (wail) – volym styrs av närmaste polisbil
function makeSirenSynth() {
  const c = SND.ctx;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 850;
  const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.42;
  const lg = c.createGain(); lg.gain.value = 320;
  lfo.connect(lg); lg.connect(o.frequency);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
  const out = c.createGain(); out.gain.value = 0;
  let pan = null;
  o.connect(f);
  if (c.createStereoPanner) { pan = c.createStereoPanner(); f.connect(pan); pan.connect(out); } else f.connect(out);
  out.connect(SND.master);
  o.start(); lfo.start();
  return { out, pan };
}
function updateSiren(x, y, on) {
  const s = SND.siren; if (!s) return;
  const t = SND.ctx.currentTime;
  if (!on) { s.out.gain.setTargetAtTime(0, t, 0.2); return; }
  const sp = spatial(x, y, 1700);
  s.out.gain.setTargetAtTime(sp.g * 0.07, t, 0.1);
  if (s.pan) s.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
}

function makeAmbience() {
  const c = SND.ctx;
  const n = c.createBufferSource(); n.buffer = SND.noise; n.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  const g = c.createGain(); g.gain.value = 0.05;
  n.connect(f); f.connect(g); g.connect(SND.master); n.start();
}

function sfxExplosion(x, y) {
  if (!SND.ctx || SND.muted) return;
  const c = SND.ctx, t = c.currentTime;
  const s = spatial(x, y, 2200);
  if (s.g < 0.01) return;
  const n = c.createBufferSource(); n.buffer = SND.noise;
  const f = c.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(70, t + 1.4);
  const out = outNode(0, s.pan);
  out.gain.setValueAtTime(1.3 * s.g, t); out.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
  const og = c.createGain(); og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  n.connect(f); f.connect(out); o.connect(og); og.connect(out);
  n.start(t); n.stop(t + 1.7); o.start(t); o.stop(t + 1);
  sfx('crash', x, y, 0.9, 0.8);
  sfx('glass', x, y, 0.8);
}

function sfxHorn(x, y) {
  if (!SND.ctx || SND.muted) return;
  const c = SND.ctx, t = c.currentTime;
  const s = spatial(x, y, 1200);
  if (s.g < 0.02) return;
  const out = outNode(0, s.pan);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.09 * s.g, t + 0.02);
  out.gain.setValueAtTime(0.09 * s.g, t + 0.35); out.gain.linearRampToValueAtTime(0, t + 0.42);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600; f.connect(out);
  for (const fr of [392, 494]) {
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr;
    o.connect(f); o.start(t); o.stop(t + 0.45);
  }
}

// ---- Splat: mjuk duns + blött kladd + små droppar (påkörning/död)
function sfxSplat(x, y, vol = 1) {
  if (!SND.ctx || SND.muted) return;
  const c = SND.ctx, t = c.currentTime;
  const s = spatial(x, y, 1300);
  if (s.g < 0.02) return;
  const out = outNode(vol * s.g, s.pan);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const og = c.createGain(); og.gain.setValueAtTime(0.85, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
  const n = c.createBufferSource(); n.buffer = SND.noise; n.playbackRate.value = 0.75;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(1900, t); bp.frequency.exponentialRampToValueAtTime(320, t + 0.26);
  const ng = c.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.95, t + 0.004);
  ng.gain.exponentialRampToValueAtTime(0.3, t + 0.06); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, Math.random() * 1.5); n.stop(t + 0.36);
  for (let i = 0; i < 4; i++) {
    const d = t + 0.04 + Math.random() * 0.2;
    const n2 = c.createBufferSource(); n2.buffer = SND.noise;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9; f2.frequency.value = 500 + Math.random() * 1000;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, d); g2.gain.linearRampToValueAtTime(0.6, d + 0.004); g2.gain.exponentialRampToValueAtTime(0.001, d + 0.045);
    n2.connect(f2); f2.connect(g2); g2.connect(out); n2.start(d, Math.random()); n2.stop(d + 0.06);
  }
}

// ---- Svisch för svärdet
function sfxSwish(x, y) {
  if (!SND.ctx || SND.muted) return;
  const c = SND.ctx, t = c.currentTime, s = spatial(x, y);
  const n = c.createBufferSource(); n.buffer = SND.noise;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
  f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.18);
  const g = outNode(0, s.pan);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * s.g, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  n.connect(f); f.connect(g); n.start(t, Math.random()); n.stop(t + 0.22);
}

// ---- Regn, åska och eldkastare
function makeLoopNoise(type, freq, q, gainNode) {
  const c = SND.ctx;
  const n = c.createBufferSource(); n.buffer = SND.noise; n.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  n.connect(f); f.connect(gainNode); n.start();
  return { n, f };
}
function updateAmbientSynths(rain, flameOn) {
  if (!SND.ctx) return;
  const c = SND.ctx, t = c.currentTime;
  if (!SND.rain) {
    const g = c.createGain(); g.gain.value = 0; g.connect(SND.master);
    const hp = c.createBiquadFilter(); hp.type = 'lowpass'; hp.frequency.value = 6500; hp.connect(g);
    makeLoopNoise('highpass', 900, 0.5, hp);
    SND.rain = g;
    const fg = c.createGain(); fg.gain.value = 0; fg.connect(SND.master);
    const v = makeLoopNoise('bandpass', 420, 0.6, fg);
    const v2 = makeLoopNoise('lowpass', 180, 0.7, fg);
    SND.flame = fg; SND.flameF = v.f;
  }
  SND.rain.gain.setTargetAtTime(rain * 0.09, t, 0.5);
  SND.flame.gain.setTargetAtTime(flameOn ? 0.32 : 0, t, flameOn ? 0.03 : 0.08);
  if (flameOn) SND.flameF.frequency.setTargetAtTime(380 + Math.random() * 160, t, 0.05);
}
function sfxThunder() {
  if (!SND.ctx || SND.muted) return;
  const c = SND.ctx, t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = SND.noise; n.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(70, t + 3.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.25, t + 1.2); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
  n.connect(f); f.connect(g); g.connect(SND.master); n.start(t); n.stop(t + 4.6);
}
