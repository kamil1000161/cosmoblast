'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ---------- Logical (portrait, phone-like) game resolution ----------
const GAME_W = 414;
const GAME_H = 736;

// ---------- Upgrade pool (roguelike, random 3 offered each wave) ----------
const UPGRADE_POOL = [
  { id: 'damage', label: 'Rdzeń Plazmowy', desc: '+6 Obrażeń pocisków', cost: 10, color: '#00f0ff', icon: '⚡', apply: (s) => { s.damage += 6; } },
  { id: 'firerate', label: 'Przyspieszacz', desc: 'Szybsze strzelanie (-25ms)', cost: 12, color: '#ffcc00', icon: '🔫', apply: (s) => { s.fireRate = Math.max(60, s.fireRate - 25); } },
  { id: 'speed', label: 'Dopalacze', desc: '+1.2 Prędkości statku', cost: 8, color: '#00ff88', icon: '💨', apply: (s) => { s.speed += 1.2; } },
  { id: 'maxhp', label: 'Płyta Pancerna', desc: '+25 Maks. HP i pełne leczenie', cost: 14, color: '#ff5577', icon: '🛡️', apply: (s) => { s.maxHp += 25; s.healFull = true; } },
  { id: 'shield', label: 'Generator Tarczy', desc: '+30 Tarczy (regeneruje między falami)', cost: 13, color: '#66ccff', icon: '🔷', apply: (s) => { s.shieldMax += 30; s.shield = s.shieldMax; } },
  { id: 'multishot', label: 'Rozdzielacz Wiązki', desc: '+1 Dodatkowy pocisk', cost: 18, color: '#ff9900', icon: '✴️', apply: (s) => { s.multishot += 1; } },
  { id: 'pierce', label: 'Ostrze Kwantowe', desc: 'Pociski przebijają +1 wroga', cost: 16, color: '#cc66ff', icon: '🗡️', apply: (s) => { s.pierce += 1; } },
  { id: 'magnet', label: 'Magnes Kryształowy', desc: 'Większy zasięg zbierania kryształów', cost: 9, color: '#ffee00', icon: '🧲', apply: (s) => { s.magnet += 60; } },
  { id: 'regen', label: 'Nanoboty Naprawcze', desc: 'Powolna regeneracja HP w walce', cost: 15, color: '#33ff99', icon: '🩹', apply: (s) => { s.regen += 0.05; } },
];

function pickUpgrades(n = 3) {
  const pool = [...UPGRADE_POOL];
  const out = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ================= Sound engine (single shared AudioContext) =================
function useSound(mutedRef) {
  const ctxRef = useRef(null);
  const noiseBufferRef = useRef(null);

  const ensure = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
      const buf = ctxRef.current.createBuffer(1, ctxRef.current.sampleRate * 0.5, ctxRef.current.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseBufferRef.current = buf;
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback(({ freq = 440, type = 'sine', duration = 0.12, volume = 0.15, freqEnd = null, delay = 0 }) => {
    if (mutedRef.current) return;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }, [ensure, mutedRef]);

  const noiseBurst = useCallback(({ duration = 0.3, volume = 0.25, filterFreq = 800, delay = 0 }) => {
    if (mutedRef.current) return;
    const ctx = ensure();
    if (!ctx || !noiseBufferRef.current) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBufferRef.current;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(filterFreq * 0.2, 40), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }, [ensure, mutedRef]);

  return React.useMemo(() => ({
    unlock: ensure,
    shoot: () => tone({ freq: 780, freqEnd: 320, type: 'square', duration: 0.07, volume: 0.05 }),
    hit: () => tone({ freq: 500, freqEnd: 200, type: 'triangle', duration: 0.06, volume: 0.08 }),
    explosion: () => noiseBurst({ duration: 0.35, volume: 0.22, filterFreq: 700 }),
    bossExplosion: () => { noiseBurst({ duration: 0.9, volume: 0.32, filterFreq: 500 }); tone({ freq: 120, freqEnd: 40, type: 'sawtooth', duration: 0.8, volume: 0.18 }); },
    pickup: () => tone({ freq: 700, freqEnd: 1200, type: 'sine', duration: 0.09, volume: 0.06 }),
    playerHit: () => tone({ freq: 180, freqEnd: 80, type: 'sawtooth', duration: 0.2, volume: 0.16 }),
    upgrade: () => { tone({ freq: 523, type: 'sine', duration: 0.1, volume: 0.1 }); tone({ freq: 659, type: 'sine', duration: 0.1, volume: 0.1, delay: 0.08 }); tone({ freq: 784, type: 'sine', duration: 0.16, volume: 0.1, delay: 0.16 }); },
    waveClear: () => { tone({ freq: 440, type: 'triangle', duration: 0.12, volume: 0.1 }); tone({ freq: 587, type: 'triangle', duration: 0.14, volume: 0.1, delay: 0.1 }); },
    gameOver: () => { tone({ freq: 300, freqEnd: 120, type: 'sawtooth', duration: 0.5, volume: 0.15 }); tone({ freq: 200, freqEnd: 60, type: 'sawtooth', duration: 0.7, volume: 0.12, delay: 0.15 }); },
    click: () => tone({ freq: 320, type: 'sine', duration: 0.05, volume: 0.06 }),
  }), [tone, noiseBurst, ensure]);
}

// ================= Main component =================
export default function CosmoBlast() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [gameState, setGameState] = useState('MENU');
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState(0);
  const [wave, setWave] = useState(1);
  const [playerHp, setPlayerHp] = useState(100);
  const [playerShieldUI, setPlayerShieldUI] = useState(0);
  const [maxHp, setMaxHp] = useState(100);
  const [upgradeOptions, setUpgradeOptions] = useState([]);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(false);
  const [bestScore, setBestScore] = useState(0);

  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const sound = useSound(mutedRef);

  const statsRef = useRef({
    damage: 15, fireRate: 250, speed: 5,
    shield: 0, shieldMax: 0, multishot: 0, pierce: 0,
    magnet: 45, regen: 0, maxHp: 100,
  });

  useEffect(() => {
    if (gameState === 'UPGRADE') setUpgradeOptions(pickUpgrades(3));
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'GAMEOVER') {
      setBestScore((b) => Math.max(b, score));
      sound.gameOver();
    }
  }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Responsive canvas scaling ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GAME_W * dpr;
    canvas.height = GAME_H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let rafTime = performance.now();

    const W = GAME_W, H = GAME_H;

    let lastShot = 0;
    let keys = {};
    let pointer = { x: W / 2, y: H - 120, active: false };

    const player = { x: W / 2, y: H - 120, vx: 0, vy: 0, radius: 14, hp: playerHp, invuln: 0, tilt: 0 };

    let bullets = [];
    let enemyBullets = [];
    let enemies = [];
    let particles = [];
    let crystalPickups = [];
    let shake = 0;
    let comboCount = 0;
    let comboTimer = 0;

    const starLayers = [
      { count: 30, speed: [0.3, 0.7], size: [0.6, 1.2], alpha: 0.4 },
      { count: 26, speed: [0.8, 1.6], size: [1, 1.8], alpha: 0.7 },
      { count: 18, speed: [1.8, 3], size: [1.5, 2.6], alpha: 1 },
    ];
    let stars = [];
    starLayers.forEach((layer) => {
      for (let i = 0; i < layer.count; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, size: rand(layer.size[0], layer.size[1]), speed: rand(layer.speed[0], layer.speed[1]), alpha: layer.alpha });
      }
    });

    const toLocal = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
    };

    const handleKeyDown = (e) => (keys[e.code] = true);
    const handleKeyUp = (e) => (keys[e.code] = false);
    const handleMouseMove = (e) => { const p = toLocal(e.clientX, e.clientY); pointer.x = p.x; pointer.y = p.y; pointer.active = true; };
    const handleTouchMove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const p = toLocal(t.clientX, t.clientY);
      pointer.x = p.x; pointer.y = p.y; pointer.active = true;
    };
    const handleTouchStart = (e) => { handleTouchMove(e); };
    const handleTouchEnd = () => { /* keep last position, ship stays put */ };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    const isBossWave = wave % 5 === 0;
    const enemiesToSpawn = isBossWave ? 1 : 4 + wave * 3;
    let spawnedCount = 0;

    function spawnEnemy() {
      if (isBossWave) {
        const bossHp = 450 + wave * 220;
        enemies.push({ type: 'BOSS', x: W / 2, y: 110, radius: 42, hp: bossHp, maxHp: bossHp, vx: 1.8, shootCooldown: 0, phase: 1, dashCooldown: 180, spinAngle: 0, vy: 0 });
        return;
      }
      const roll = Math.random();
      const type = roll < 0.4 ? 'FAST' : roll < 0.75 ? 'HEAVY' : 'RANGED';
      const baseX = rand(36, W - 36);
      const hp = type === 'HEAVY' ? 70 + wave * 12 : type === 'RANGED' ? 30 + wave * 6 : 18 + wave * 4;
      enemies.push({
        type, x: baseX, spawnX: baseX, y: -30,
        radius: type === 'HEAVY' ? 22 : type === 'RANGED' ? 14 : 10,
        hp, maxHp: hp,
        speed: type === 'FAST' ? rand(2.6, 3.4) : type === 'HEAVY' ? rand(0.9, 1.2) : rand(1.2, 1.6),
        seed: rand(0, 1000),
        shootCooldown: rand(40, 100),
        preferredY: type === 'RANGED' ? rand(H * 0.18, H * 0.32) : null,
        state: 'ENTER', flash: 0,
      });
    }

    const spawnInterval = setInterval(() => {
      if (spawnedCount >= enemiesToSpawn) { clearInterval(spawnInterval); return; }
      spawnEnemy();
      spawnedCount++;
    }, isBossWave ? 200 : 600);

    function spawnParticles(x, y, color, count, speedRange = [1, 5], life = 30) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = rand(speedRange[0], speedRange[1]);
        particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life, maxLife: life, color, size: rand(1.5, 3.5) });
      }
    }

    function damagePlayer(amount) {
      if (player.invuln > 0) return;
      if (statsRef.current.shield > 0) {
        const absorbed = Math.min(statsRef.current.shield, amount);
        statsRef.current.shield -= absorbed;
        amount -= absorbed;
        setPlayerShieldUI(Math.max(0, statsRef.current.shield));
      }
      if (amount > 0) {
        player.hp -= amount;
        player.invuln = 22;
        shake = Math.min(shake + 8, 18);
        comboCount = 0; setCombo(0);
        sound.playerHit();
      }
      setPlayerHp(Math.max(0, player.hp));
      if (player.hp <= 0) setGameState('GAMEOVER');
    }

    function fireBullets(timestamp) {
      if (timestamp - lastShot < statsRef.current.fireRate) return;
      lastShot = timestamp;
      const count = 1 + statsRef.current.multishot;
      const spread = Math.min(0.5, count * 0.08);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        const angle = -Math.PI / 2 + t * spread;
        bullets.push({ x: player.x, y: player.y - player.radius, vx: Math.cos(angle) * 11, vy: Math.sin(angle) * 11, damage: statsRef.current.damage, pierce: statsRef.current.pierce, hitSet: new Set() });
      }
      spawnParticles(player.x, player.y - player.radius, '#00f0ff', 2, [0.5, 1.5], 10);
      sound.shoot();
    }

    function keepInBounds(enemy) {
      enemy.x = clamp(enemy.x, enemy.radius, W - enemy.radius);
    }

    function updateEnemyAI(enemy, timestamp) {
      if (enemy.type === 'BOSS') {
        const hpRatio = enemy.hp / enemy.maxHp;
        enemy.phase = hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3;
        const speedMul = enemy.phase === 3 ? 1.8 : enemy.phase === 2 ? 1.3 : 1;

        enemy.x += enemy.vx * speedMul;
        if (enemy.x < 55 || enemy.x > W - 55) enemy.vx *= -1;
        if (enemy.y < 100) enemy.y += 1;

        enemy.shootCooldown++;
        const fireEvery = enemy.phase === 3 ? 22 : enemy.phase === 2 ? 30 : 42;
        if (enemy.shootCooldown > fireEvery) {
          enemy.shootCooldown = 0;
          if (enemy.phase === 1) {
            enemyBullets.push({ x: enemy.x, y: enemy.y + 32, vx: 0, vy: 4.5, r: 4 });
            enemyBullets.push({ x: enemy.x - 20, y: enemy.y + 28, vx: -1.6, vy: 4, r: 4 });
            enemyBullets.push({ x: enemy.x + 20, y: enemy.y + 28, vx: 1.6, vy: 4, r: 4 });
          } else if (enemy.phase === 2) {
            for (let a = -2; a <= 2; a++) enemyBullets.push({ x: enemy.x, y: enemy.y + 28, vx: a * 1.4, vy: 4.5, r: 4 });
          } else {
            for (let i = 0; i < 8; i++) {
              const ang = enemy.spinAngle + (i * Math.PI * 2) / 8;
              enemyBullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(ang) * 3.6, vy: Math.sin(ang) * 3.6, r: 3.5 });
            }
          }
        }
        enemy.spinAngle += 0.15;

        enemy.dashCooldown--;
        if (enemy.phase >= 2 && enemy.dashCooldown <= 0) { enemy.vy = 5; enemy.dashCooldown = 220; }
        if (enemy.vy) {
          enemy.y += enemy.vy;
          if (enemy.y > 210) enemy.vy = -3;
          if (enemy.y < 100) { enemy.y = 100; enemy.vy = 0; }
        }
        return;
      }

      if (enemy.state === 'ENTER') {
        enemy.y += enemy.speed;
        if (enemy.y > 60) enemy.state = 'ACTIVE';
        return;
      }

      if (enemy.type === 'FAST') {
        enemy.y += enemy.speed;
        enemy.x = enemy.spawnX + Math.sin(timestamp / 260 + enemy.seed) * Math.min(60, enemy.spawnX - enemy.radius, W - enemy.radius - enemy.spawnX);
      } else if (enemy.type === 'HEAVY') {
        const d = dist(enemy.x, enemy.y, player.x, player.y);
        if (d < 240) {
          const ang = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          enemy.x += Math.cos(ang) * enemy.speed * 1.6;
          enemy.y += Math.sin(ang) * enemy.speed * 1.6;
        } else {
          enemy.y += enemy.speed;
        }
      } else if (enemy.type === 'RANGED') {
        if (enemy.y < enemy.preferredY) {
          enemy.y += enemy.speed;
        } else {
          enemy.x = enemy.spawnX + Math.sin(timestamp / 500 + enemy.seed) * Math.min(90, enemy.spawnX - enemy.radius, W - enemy.radius - enemy.spawnX);
        }
        enemy.shootCooldown--;
        if (enemy.shootCooldown <= 0 && enemy.y >= enemy.preferredY - 10) {
          enemy.shootCooldown = rand(70, 110);
          const ang = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          enemyBullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(ang) * 4.2, vy: Math.sin(ang) * 4.2, r: 4 });
        }
      }
      keepInBounds(enemy);
      if (enemy.flash > 0) enemy.flash--;
    }

    function drawShip(px, py, tilt, invuln, shieldPct) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tilt * 0.15);

      const engineGrad = ctx.createRadialGradient(0, 16, 1, 0, 16, 13);
      engineGrad.addColorStop(0, 'rgba(0,240,255,0.9)');
      engineGrad.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = engineGrad;
      ctx.beginPath();
      ctx.arc(0, 16, 11 + Math.sin(rafTime / 60) * 3, 0, Math.PI * 2);
      ctx.fill();

      if (invuln > 0 && Math.floor(invuln / 3) % 2 === 0) ctx.globalAlpha = 0.4;

      const grad = ctx.createLinearGradient(0, -18, 0, 14);
      grad.addColorStop(0, '#7ff9ff');
      grad.addColorStop(1, '#0090b0');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#e8ffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-14, 14);
      ctx.lineTo(-5, 9);
      ctx.lineTo(0, 13);
      ctx.lineTo(5, 9);
      ctx.lineTo(14, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (shieldPct > 0) {
        ctx.strokeStyle = `rgba(0,220,255,${0.4 + shieldPct * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 24 + Math.sin(rafTime / 150) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawEnemy(enemy) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      const flashOn = enemy.flash > 0;

      if (enemy.type === 'BOSS') {
        const bossColors = { 1: '#ff0055', 2: '#ff5500', 3: '#ff00cc' };
        const col = bossColors[enemy.phase];
        const g = ctx.createRadialGradient(0, 0, 5, 0, 0, enemy.radius);
        g.addColorStop(0, flashOn ? '#ffffff' : col);
        g.addColorStop(1, '#220015');
        ctx.fillStyle = g;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + enemy.spinAngle * 0.3;
          const r = i % 2 === 0 ? enemy.radius : enemy.radius * 0.7;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (enemy.type === 'FAST') {
        ctx.fillStyle = flashOn ? '#ffffff' : '#00ffcc';
        ctx.beginPath();
        ctx.moveTo(0, -enemy.radius * 1.4);
        ctx.lineTo(-enemy.radius, enemy.radius);
        ctx.lineTo(enemy.radius, enemy.radius);
        ctx.closePath();
        ctx.fill();
      } else if (enemy.type === 'HEAVY') {
        ctx.fillStyle = flashOn ? '#ffffff' : '#ff9900';
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * enemy.radius, py = Math.sin(a) * enemy.radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = flashOn ? '#ffffff' : '#cc00ff';
        ctx.beginPath();
        ctx.moveTo(0, enemy.radius);
        ctx.lineTo(-enemy.radius, -enemy.radius * 0.6);
        ctx.lineTo(0, -enemy.radius * 0.1);
        ctx.lineTo(enemy.radius, -enemy.radius * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      if (enemy.type !== 'FAST') {
        const w = enemy.type === 'BOSS' ? 84 : enemy.radius * 2.2;
        const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
        const barY = enemy.y - enemy.radius - (enemy.type === 'BOSS' ? 15 : 9);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(enemy.x - w / 2, barY, w, 4);
        ctx.fillStyle = ratio > 0.5 ? '#00ff88' : ratio > 0.25 ? '#ffcc00' : '#ff3355';
        ctx.fillRect(enemy.x - w / 2, barY, w * ratio, 4);
      }
    }

    const loop = (timestamp) => {
      rafTime = timestamp;
      const sx = shake > 0 ? rand(-shake, shake) : 0;
      const sy = shake > 0 ? rand(-shake, shake) : 0;
      shake *= 0.88;
      if (shake < 0.1) shake = 0;

      ctx.save();
      ctx.translate(sx, sy);

      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#0a0a1e');
      bgGrad.addColorStop(0.5, '#0d0a20');
      bgGrad.addColorStop(1, '#120a18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      stars.forEach((star) => {
        star.y += star.speed;
        if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });
      ctx.globalAlpha = 1;

      let ax = 0, ay = 0;
      if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
      if (keys['KeyW'] || keys['ArrowUp']) ay -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) ay += 1;

      player.vx += ax * statsRef.current.speed * 0.18;
      player.vy += ay * statsRef.current.speed * 0.18;

      if (pointer.active) {
        player.vx += (pointer.x - player.x) * 0.05;
        player.vy += (pointer.y - player.y) * 0.05;
      }

      player.vx *= 0.85;
      player.vy *= 0.85;
      const prevX = player.x;
      player.x += player.vx;
      player.y += player.vy;
      player.tilt = clamp((player.x - prevX) * 1.5, -6, 6) / 6;

      player.x = clamp(player.x, player.radius, W - player.radius);
      player.y = clamp(player.y, player.radius, H - player.radius);
      if (player.invuln > 0) player.invuln--;

      if (statsRef.current.regen > 0 && player.hp < statsRef.current.maxHp) {
        player.hp = Math.min(statsRef.current.maxHp, player.hp + statsRef.current.regen);
        setPlayerHp(Math.round(player.hp));
      }

      fireBullets(timestamp);

      if (Math.random() < 0.6) {
        particles.push({ x: player.x + rand(-4, 4), y: player.y + 13, vx: rand(-0.5, 0.5), vy: rand(1, 2.5), life: 16, maxLife: 16, color: '#00d0ff', size: rand(1, 2.5) });
      }

      drawShip(player.x, player.y, player.tilt, player.invuln, statsRef.current.shieldMax > 0 ? statsRef.current.shield / statsRef.current.shieldMax : 0);

      bullets = bullets.filter((b) => {
        b.x += b.vx; b.y += b.vy;
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 1.4, b.y - b.vy * 1.4);
        ctx.stroke();
        ctx.fillStyle = '#e0ffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
        return b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20;
      });

      enemyBullets = enemyBullets.filter((eb) => {
        eb.x += eb.vx; eb.y += eb.vy;
        ctx.fillStyle = '#ff0055';
        ctx.shadowColor = '#ff0055';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.r || 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (dist(eb.x, eb.y, player.x, player.y) < player.radius + (eb.r || 4)) {
          damagePlayer(10);
          spawnParticles(eb.x, eb.y, '#ff0055', 8, [1, 3], 18);
          return false;
        }
        return eb.y > -20 && eb.y < H + 20 && eb.x > -20 && eb.x < W + 20;
      });

      enemies = enemies.filter((enemy) => {
        updateEnemyAI(enemy, timestamp);

        // fell past the bottom without dying: despawn so the wave can still be cleared
        if (enemy.type !== 'BOSS' && enemy.y - enemy.radius > H + 10) return false;

        drawEnemy(enemy);

        const contactDist = dist(enemy.x, enemy.y, player.x, player.y);
        if (contactDist < enemy.radius + player.radius) {
          damagePlayer(enemy.type === 'BOSS' ? 20 : enemy.type === 'HEAVY' ? 15 : 8);
          if (enemy.type !== 'BOSS') {
            spawnParticles(enemy.x, enemy.y, '#ff8844', 14, [1.5, 4], 22);
            return false;
          }
        }

        let dead = false;
        bullets.forEach((b) => {
          if (b.hitSet.has(enemy)) return;
          if (dist(b.x, b.y, enemy.x, enemy.y) < enemy.radius) {
            b.hitSet.add(enemy);
            enemy.hp -= b.damage;
            enemy.flash = 6;
            spawnParticles(b.x, b.y, '#88ffee', 4, [0.5, 2], 10);
            sound.hit();
            if (b.pierce <= 0) b._dead = true; else b.pierce -= 1;
            if (enemy.hp <= 0) dead = true;
          }
        });
        bullets = bullets.filter((b) => !b._dead);

        if (dead) {
          const isBoss = enemy.type === 'BOSS';
          comboCount++; comboTimer = 90;
          setCombo(comboCount);
          const comboMul = 1 + Math.min(comboCount * 0.1, 2);
          setScore((prev) => prev + Math.round((isBoss ? 1000 : 50) * comboMul));
          spawnParticles(enemy.x, enemy.y, isBoss ? '#ff0055' : '#ffaa00', isBoss ? 60 : 18, [1, 6], isBoss ? 50 : 25);
          shake = Math.min(shake + (isBoss ? 20 : 3), 20);
          isBoss ? sound.bossExplosion() : sound.explosion();
          crystalPickups.push({ x: enemy.x, y: enemy.y, vx: rand(-1, 1), vy: rand(-1, 1), value: isBoss ? 25 : 2, life: 600 });
          return false;
        }
        return true;
      });

      if (comboTimer > 0) { comboTimer--; if (comboTimer === 0) { comboCount = 0; setCombo(0); } }

      crystalPickups = crystalPickups.filter((c) => {
        const d = dist(c.x, c.y, player.x, player.y);
        if (d < statsRef.current.magnet) {
          const ang = Math.atan2(player.y - c.y, player.x - c.x);
          c.vx += Math.cos(ang) * 0.6;
          c.vy += Math.sin(ang) * 0.6;
        }
        c.vx *= 0.92; c.vy *= 0.92;
        c.x += c.vx; c.y += c.vy;
        c.life--;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(rafTime / 300);
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        if (d < player.radius + 10) {
          setCrystals((prev) => prev + c.value);
          spawnParticles(c.x, c.y, '#00e5ff', 6, [0.5, 2], 12);
          sound.pickup();
          return false;
        }
        return c.life > 0;
      });

      particles = particles.filter((p) => {
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.95; p.vy *= 0.95;
        p.life--;
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return p.life > 0;
      });

      ctx.restore();

      if (spawnedCount >= enemiesToSpawn && enemies.length === 0) {
        clearInterval(spawnInterval);
        sound.waveClear();
        setWave((w) => w + 1);
        setGameState('UPGRADE');
        return;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(spawnInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, wave]);

  const hpPct = clamp((playerHp / maxHp) * 100, 0, 100);
  const shieldPct = statsRef.current.shieldMax > 0 ? (playerShieldUI / statsRef.current.shieldMax) * 100 : 0;

  const startGame = () => {
    sound.unlock();
    sound.click();
    statsRef.current = { damage: 15, fireRate: 250, speed: 5, shield: 0, shieldMax: 0, multishot: 0, pierce: 0, magnet: 45, regen: 0, maxHp: 100 };
    setScore(0); setCrystals(0); setWave(1);
    setPlayerHp(100); setMaxHp(100); setPlayerShieldUI(0);
    setGameState('PLAYING');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#05050c] text-white p-3 overflow-hidden" style={{ fontFamily: "'Rajdhani', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Rajdhani:wght@500;600;700&display=swap');
        .font-display { font-family: 'Orbitron', sans-serif; }
        .num-glow { text-shadow: 0 0 8px currentColor; }
      `}</style>

      <div
        ref={wrapRef}
        className="relative w-full rounded-2xl overflow-hidden border border-cyan-500/20 shadow-[0_0_60px_-15px_rgba(0,240,255,0.25)]"
        style={{ maxWidth: GAME_W, aspectRatio: `${GAME_W} / ${GAME_H}`, background: '#0a0a16' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 10%, rgba(0,240,255,0.10), transparent 45%), radial-gradient(circle at 80% 85%, rgba(204,0,255,0.10), transparent 45%)' }} />

        {gameState === 'MENU' && (
          <div className="absolute inset-0 flex flex-col items-center justify-between p-6 z-10">
            <button
              onClick={() => setMuted((m) => !m)}
              className="self-end w-9 h-9 rounded-full bg-slate-900/80 border border-slate-700 flex items-center justify-center text-sm"
              aria-label="Dźwięk"
            >
              {muted ? '🔇' : '🔊'}
            </button>

            <div className="flex flex-col items-center">
              <div className="text-[11px] tracking-[0.4em] text-cyan-400/70 font-display mb-2">OBRONA GALAKTYKI</div>
              <h1 className="font-display font-black text-5xl text-center leading-none tracking-wide bg-gradient-to-b from-cyan-200 via-cyan-400 to-cyan-600 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(6,182,212,0.55)]">
                COSMO<br />BLAST
              </h1>
              <div className="mt-4 h-px w-24 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
              <p className="text-slate-400 mt-4 text-center text-sm max-w-[26ch]">
                Przetrwaj fale najeźdźców, zbieraj kryształy i ulepszaj swój statek między falami.
              </p>
            </div>

            <div className="w-full space-y-4">
              {bestScore > 0 && (
                <div className="text-center text-xs text-slate-400 font-display tracking-widest">
                  NAJLEPSZY WYNIK <span className="text-cyan-300 num-glow">{bestScore}</span>
                </div>
              )}
              <button
                onClick={startGame}
                className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-950 font-display font-bold text-lg rounded-xl transition shadow-lg shadow-cyan-500/30 tracking-wide"
              >
                ROZPOCZNIJ GRĘ
              </button>
              <div className="flex justify-center gap-4 text-[11px] text-slate-500 font-display tracking-wide">
                <span>🖱️ MYSZ</span>
                <span>⌨️ WASD</span>
                <span>👆 DOTYK</span>
              </div>
            </div>
          </div>
        )}

        {gameState === 'PLAYING' && (
          <>
            <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10 pointer-events-none">
              <div className="space-y-1">
                <div className="font-display text-[11px] tracking-widest text-cyan-300/90">FALA {wave}</div>
                <div className="w-24 h-2 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/60">
                  <div className="h-full bg-gradient-to-r from-red-500 to-green-400 transition-all" style={{ width: `${hpPct}%` }} />
                </div>
                {statsRef.current.shieldMax > 0 && (
                  <div className="w-24 h-1.5 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/60">
                    <div className="h-full bg-cyan-400 transition-all" style={{ width: `${shieldPct}%` }} />
                  </div>
                )}
                {combo > 1 && <div className="font-display text-[11px] text-orange-400 num-glow">COMBO ×{combo}</div>}
              </div>

              <div className="flex flex-col items-end gap-1 bg-slate-950/60 backdrop-blur px-3 py-2 rounded-xl border border-slate-800/80">
                <div className="font-display text-sm text-cyan-300 num-glow tabular-nums">{score}</div>
                <div className="font-display text-xs text-yellow-300 tabular-nums flex items-center gap-1">💎 {crystals}</div>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              className="block w-full h-full touch-none select-none"
              style={{ touchAction: 'none' }}
            />
          </>
        )}

        {gameState === 'UPGRADE' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 z-10 bg-slate-950/70 backdrop-blur">
            <h2 className="font-display font-bold text-xl text-cyan-400 mb-1 tracking-wide">FALA {wave - 1} UKOŃCZONA</h2>
            <p className="text-slate-400 mb-4 text-xs">Masz 💎 {crystals} kryształów — wybierz ulepszenie:</p>
            <div className="w-full space-y-2 mb-4 max-h-[60%] overflow-y-auto">
              {upgradeOptions.map((u) => {
                const affordable = crystals >= u.cost;
                return (
                  <button
                    key={u.id}
                    disabled={!affordable}
                    onClick={() => {
                      setCrystals((c) => c - u.cost);
                      u.apply(statsRef.current);
                      if (statsRef.current.healFull) { setPlayerHp(statsRef.current.maxHp); statsRef.current.healFull = false; }
                      setMaxHp(statsRef.current.maxHp);
                      setPlayerShieldUI(statsRef.current.shield);
                      sound.upgrade();
                      setGameState('PLAYING');
                    }}
                    className={`w-full p-2.5 rounded-lg text-left flex items-center gap-2.5 border transition ${affordable ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-700' : 'bg-slate-800/30 border-slate-800 opacity-45 cursor-not-allowed'}`}
                  >
                    <span className="text-xl">{u.icon}</span>
                    <span className="flex-1 min-w-0">
                      <div className="font-display font-semibold text-sm truncate" style={{ color: u.color }}>{u.label}</div>
                      <div className="text-[11px] text-slate-400 leading-tight">{u.desc}</div>
                    </span>
                    <span className="font-display text-cyan-400 font-bold text-xs whitespace-nowrap">{u.cost} 💎</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setGameState('PLAYING')}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 font-display font-bold text-sm rounded-lg tracking-wide"
            >
              NASTĘPNA FALA ➔
            </button>
          </div>
        )}

        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-10 bg-slate-950/80 backdrop-blur">
            <h2 className="font-display font-black text-3xl text-red-500 mb-2 tracking-wide drop-shadow-[0_0_18px_rgba(239,68,68,0.5)]">GAME OVER</h2>
            <p className="text-slate-300 mb-1 text-sm">Dotarłeś do fali: <span className="font-display text-cyan-300">{wave}</span></p>
            <p className="text-slate-400 mb-1 text-sm">Końcowy wynik: <span className="font-display text-cyan-300 num-glow">{score}</span></p>
            {score >= bestScore && score > 0 && <p className="text-yellow-300 text-xs font-display mb-4 tracking-wide">★ NOWY REKORD ★</p>}
            {score < bestScore && <div className="mb-4" />}
            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-display font-bold rounded-xl transition tracking-wide"
            >
              MENU GŁÓWNE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
