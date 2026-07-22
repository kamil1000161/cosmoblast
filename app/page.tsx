'use client';

import React, { useRef, useEffect, useState } from 'react';

// Typy
interface PlayerStats {
  damage: number;
  fireRate: number;
  speed: number;
  maxHp: number;
  bulletCount: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'CARD_UPGRADE' | 'GAMEOVER'>('MENU');
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState(0);
  const [wave, setWave] = useState(1);
  const [playerHp, setPlayerHp] = useState(100);

  const statsRef = useRef<PlayerStats>({
    damage: 15,
    fireRate: 200,
    speed: 7,
    maxHp: 100,
    bulletCount: 1,
  });

  // Naprawiony Audio Context (zarządzanie pamięcią i wznawianiem)
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'shoot' | 'explosion' | 'hit' | 'powerup') => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'explosion') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // Ignorowanie błędów Audio API
    }
  };

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    canvas.width = 450;
    canvas.height = 800;

    let lastShot = 0;
    let keys: { [key: string]: boolean } = {};
    let touchX = canvas.width / 2;
    let touchY = canvas.height - 120;

    let player = {
      x: canvas.width / 2,
      y: canvas.height - 120,
      radius: 18,
      hp: playerHp,
    };

    let bullets: any[] = [];
    let enemyBullets: any[] = [];
    let enemies: any[] = [];
    let particles: Particle[] = [];

    let stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 3 + 1,
    }));

    // Reakcja na klawiaturę
    const handleKeyDown = (e: KeyboardEvent) => (keys[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);

    // Reakcja na Dotyk / Myszkę (Mobile Control)
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      touchX = (e.clientX - rect.left) * scaleX;
      touchY = (e.clientY - rect.top) * scaleY;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerMove);

    // Generowanie Cząsteczek
    const addExplosion = (x: number, y: number, color: string, count = 12) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: Math.random() * 20 + 10,
          color,
          size: Math.random() * 3 + 2,
        });
      }
    };

    let isBossWave = wave % 5 === 0;
    let enemiesToSpawn = isBossWave ? 1 : 5 + wave * 2;
    let spawnedCount = 0;

    const spawnInterval = setInterval(() => {
      if (spawnedCount >= enemiesToSpawn) {
        clearInterval(spawnInterval);
        return;
      }

      if (isBossWave) {
        enemies.push({
          type: 'BOSS',
          x: canvas.width / 2,
          y: 100,
          radius: 38,
          hp: 500 + wave * 250,
          maxHp: 500 + wave * 250,
          color: '#ff0055',
          vx: 2.5,
          vy: 0,
          shootCooldown: 0,
          time: 0,
        });
      } else {
        const types = ['FAST', 'HEAVY', 'RANGED'];
        const type = types[Math.floor(Math.random() * types.length)];
        enemies.push({
          type,
          x: Math.random() * (canvas.width - 80) + 40,
          y: -30,
          radius: type === 'HEAVY' ? 20 : 13,
          hp: type === 'HEAVY' ? 60 + wave * 12 : 20 + wave * 6,
          maxHp: type === 'HEAVY' ? 60 + wave * 12 : 20 + wave * 6,
          color: type === 'FAST' ? '#00ffcc' : type === 'HEAVY' ? '#ffaa00' : '#d000ff',
          speed: type === 'FAST' ? 2.5 : 1.4,
          shootCooldown: 0,
          time: Math.random() * 100,
          direction: Math.random() > 0.5 ? 1 : -1,
        });
      }
      spawnedCount++;
    }, 1000);

    const loop = (timestamp: number) => {
      // Czyszczenie tła
      ctx.fillStyle = '#03030c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Tło - Gwiazdy
      ctx.fillStyle = '#ffffff';
      stars.forEach((star) => {
        star.y += star.speed;
        if (star.y > canvas.height) star.y = 0;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      // Ruch Gracza (Klawiatura + Płynny Dotyk)
      if (keys['KeyA'] || keys['ArrowLeft']) player.x -= statsRef.current.speed;
      if (keys['KeyD'] || keys['ArrowRight']) player.x += statsRef.current.speed;
      if (keys['KeyW'] || keys['ArrowUp']) player.y -= statsRef.current.speed;
      if (keys['KeyS'] || keys['ArrowDown']) player.y += statsRef.current.speed;

      player.x += (touchX - player.x) * 0.15;
      player.y += (touchY - player.y) * 0.15;

      player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

      // Strzelanie
      if (timestamp - lastShot > statsRef.current.fireRate) {
        const count = statsRef.current.bulletCount;
        if (count === 1) {
          bullets.push({ x: player.x, y: player.y - player.radius, vx: 0, vy: -12, damage: statsRef.current.damage });
        } else if (count === 2) {
          bullets.push({ x: player.x - 8, y: player.y - player.radius, vx: -1, vy: -12, damage: statsRef.current.damage });
          bullets.push({ x: player.x + 8, y: player.y - player.radius, vx: 1, vy: -12, damage: statsRef.current.damage });
        } else {
          bullets.push({ x: player.x, y: player.y - player.radius, vx: 0, vy: -12, damage: statsRef.current.damage });
          bullets.push({ x: player.x - 10, y: player.y - player.radius, vx: -2.5, vy: -11, damage: statsRef.current.damage });
          bullets.push({ x: player.x + 10, y: player.y - player.radius, vx: 2.5, vy: -11, damage: statsRef.current.damage });
        }
        playSound('shoot');
        lastShot = timestamp;
      }

      // Rysowanie Ładniejszego Statku Gracza (Vektor Sci-Fi)
      ctx.save();
      ctx.translate(player.x, player.y);

      // Płomień silnika
      ctx.fillStyle = '#ff5500';
      ctx.beginPath();
      ctx.moveTo(-6, player.radius);
      ctx.lineTo(0, player.radius + Math.random() * 10 + 6);
      ctx.lineTo(6, player.radius);
      ctx.fill();

      // Kadłub
      const grad = ctx.createLinearGradient(0, -player.radius, 0, player.radius);
      grad.addColorStop(0, '#00ffff');
      grad.addColorStop(1, '#0055ff');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, -player.radius * 1.3);
      ctx.lineTo(-player.radius, player.radius * 0.8);
      ctx.lineTo(-player.radius * 0.5, player.radius);
      ctx.lineTo(player.radius * 0.5, player.radius);
      ctx.lineTo(player.radius, player.radius * 0.8);
      ctx.closePath();
      ctx.fill();

      // Kabina
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pociski Gracza
      bullets.forEach((b, i) => {
        b.x += b.vx;
        b.y += b.vy;
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffff';
        ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
        ctx.shadowBlur = 0;
        if (b.y < 0) bullets.splice(i, 1);
      });

      // Pociski Wrogów
      enemyBullets.forEach((eb, i) => {
        eb.x += eb.vx;
        eb.y += eb.vy;
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 4, 0, Math.PI * 2);
        ctx.fill();

        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < player.radius + 4) {
          enemyBullets.splice(i, 1);
          player.hp -= 12;
          setPlayerHp(Math.max(0, player.hp));
          playSound('hit');
          addExplosion(player.x, player.y, '#ff0055', 8);
          if (player.hp <= 0) setGameState('GAMEOVER');
        }
        if (eb.y > canvas.height || eb.x < 0 || eb.x > canvas.width) enemyBullets.splice(i, 1);
      });

      // Cząsteczki / Eksplozje
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1 / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.life <= 0) particles.splice(i, 1);
      });

      // Wrogowie
      enemies.forEach((enemy, ei) => {
        enemy.time += 0.03;

        if (enemy.type === 'BOSS') {
          enemy.x += enemy.vx;
          if (enemy.x < 50 || enemy.x > canvas.width - 50) enemy.vx *= -1;

          enemy.shootCooldown++;
          if (enemy.shootCooldown > 40) {
            enemyBullets.push({ x: enemy.x, y: enemy.y + 30, vx: 0, vy: 5 });
            enemyBullets.push({ x: enemy.x - 15, y: enemy.y + 30, vx: -2, vy: 4 });
            enemyBullets.push({ x: enemy.x + 15, y: enemy.y + 30, vx: 2, vy: 4 });
            enemy.shootCooldown = 0;
          }
        } else {
          enemy.y += enemy.speed;
          enemy.x += Math.sin(enemy.time) * 2.2 * enemy.direction;

          if (enemy.x <= enemy.radius) {
            enemy.x = enemy.radius;
            enemy.direction *= -1;
          } else if (enemy.x >= canvas.width - enemy.radius) {
            enemy.x = canvas.width - enemy.radius;
            enemy.direction *= -1;
          }

          if (enemy.y > canvas.height - 120) {
            enemy.speed = -Math.abs(enemy.speed);
          } else if (enemy.y < 30) {
            enemy.speed = Math.abs(enemy.speed);
          }

          if (enemy.type === 'RANGED' || enemy.type === 'HEAVY') {
            enemy.shootCooldown++;
            if (enemy.shootCooldown > (enemy.type === 'HEAVY' ? 80 : 55)) {
              enemyBullets.push({ x: enemy.x, y: enemy.y + enemy.radius, vx: 0, vy: 4.5 });
              enemy.shootCooldown = 0;
            }
          }
        }

        // Rysowanie Wroga
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Pasek HP Bossa / Heavy
        if (enemy.type === 'BOSS' || enemy.type === 'HEAVY') {
          const barWidth = enemy.radius * 2;
          const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 10, barWidth, 4);
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 10, barWidth * hpPercent, 4);
        }

        // Kolizja Pocisku Gracza z Wrogiem
        bullets.forEach((b, bi) => {
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (dist < enemy.radius) {
            bullets.splice(bi, 1);
            enemy.hp -= b.damage;
            addExplosion(b.x, b.y, '#00ffff', 4);

            if (enemy.hp <= 0) {
              playSound('explosion');
              addExplosion(enemy.x, enemy.y, enemy.color, 16);
              enemies.splice(ei, 1);
              setScore((prev) => prev + (enemy.type === 'BOSS' ? 1000 : 50));
              setCrystals((prev) => prev + (enemy.type === 'BOSS' ? 15 : 2));
            }
          }
        });

        // Kolizja Wroga z Gracza
        const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distPlayer < player.radius + enemy.radius) {
          player.hp -= 20;
          setPlayerHp(Math.max(0, player.hp));
          playSound('hit');
          addExplosion(enemy.x, enemy.y, enemy.color, 12);
          enemies.splice(ei, 1);
          if (player.hp <= 0) setGameState('GAMEOVER');
        }
      });

      // Ukończenie Fali
      if (spawnedCount >= enemiesToSpawn && enemies.length === 0) {
        clearInterval(spawnInterval);
        setWave((w) => w + 1);
        playSound('powerup');
        setGameState('CARD_UPGRADE');
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
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerMove);
    };
  }, [gameState, wave]);

  // Karty darmowych ulepszeń po fali
  const applyCardUpgrade = (type: string) => {
    if (type === 'DAMAGE') statsRef.current.damage += 8;
    if (type === 'FIRERATE') statsRef.current.fireRate = Math.max(80, statsRef.current.fireRate - 25);
    if (type === 'HEAL') {
      setPlayerHp(statsRef.current.maxHp);
    }
    if (type === 'TRIPLE') statsRef.current.bulletCount = Math.min(3, statsRef.current.bulletCount + 1);
    setGameState('PLAYING');
  };

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center font-sans select-none p-0 sm:p-4 overflow-hidden">
      {/* EKRAN GRY / PIONOWA KONSOLA MOBILE */}
      <div className="relative w-full max-w-[450px] h-[100vh] sm:h-[800px] bg-slate-950 sm:rounded-3xl border border-cyan-500/30 overflow-hidden flex flex-col items-center justify-center shadow-[0_0_60px_rgba(6,182,212,0.15)]">
        
        {/* MENU GŁÓWNE */}
        {gameState === 'MENU' && (
          <div className="w-full h-full flex flex-col justify-between p-6 text-center z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
            <div className="mt-8">
              <span className="px-3 py-1 bg-cyan-950 text-cyan-400 text-[10px] font-bold rounded-full border border-cyan-800 tracking-widest uppercase">
                MOBILE ARCADE 2.0
              </span>
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 via-cyan-400 to-blue-600 mt-3 tracking-wider drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]">
                COSMO<br />BLAST
              </h1>
              <p className="text-slate-400 text-xs mt-2">Przetrwaj kosmiczną inwazję!</p>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm text-left text-xs space-y-2">
              <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1">💎 SKLEP ZA KRYSZTAŁY:</div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Zwiększ Maks. Życie (+25 HP)</span>
                <button
                  onClick={() => {
                    initAudio();
                    if (crystals >= 10) {
                      setCrystals((c) => c - 10);
                      statsRef.current.maxHp += 25;
                      setPlayerHp(statsRef.current.maxHp);
                    }
                  }}
                  disabled={crystals < 10}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-black font-bold rounded-lg"
                >
                  10 💎
                </button>
              </div>
            </div>

            <div className="mb-6 space-y-3">
              <button
                onClick={() => {
                  initAudio();
                  setScore(0);
                  setWave(1);
                  setPlayerHp(statsRef.current.maxHp);
                  setGameState('PLAYING');
                }}
                className="w-full py-4 bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:brightness-110 text-slate-950 font-black rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)] text-lg tracking-wider active:scale-95 transition"
              >
                GRAJ TERAZ 🚀
              </button>
            </div>
          </div>
        )}

        {/* EKRAN GRY / HUD */}
        {gameState === 'PLAYING' && (
          <div className="relative w-full h-full">
            {/* MINIMALISTYCZNY NOWOCZESNY HUD */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10 font-bold text-xs">
              <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 backdrop-blur-md">
                <span className="text-slate-400 block text-[9px]">PUNKTY</span>
                <span className="text-cyan-300 text-sm font-extrabold">{score}</span>
              </div>
              <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 backdrop-blur-md text-center">
                <span className="text-slate-400 block text-[9px]">FALA</span>
                <span className="text-white text-sm font-extrabold">{wave}</span>
              </div>
              <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 backdrop-blur-md text-right">
                <span className="text-slate-400 block text-[9px]">KRYSZTAŁY</span>
                <span className="text-cyan-400 text-sm font-extrabold">💎 {crystals}</span>
              </div>
            </div>

            {/* PASEK ZDROWIA GRACZA NA DOLE */}
            <div className="absolute bottom-4 left-6 right-6 pointer-events-none z-10 flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>POSŁONA / KADŁUB</span>
                <span>{playerHp} / {statsRef.current.maxHp} HP</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900/90 rounded-full border border-slate-800 overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-emerald-400 to-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.max(0, (playerHp / statsRef.current.maxHp) * 100)}%` }}
                />
              </div>
            </div>

            <canvas ref={canvasRef} className="w-full h-full touch-none block" />
          </div>
        )}

        {/* EKRAN DARMOWEGO ULEPSZENIA PO FALI (KARTY) */}
        {gameState === 'CARD_UPGRADE' && (
          <div className="w-full h-full p-6 flex flex-col justify-center items-center text-center z-10 bg-slate-950/95 backdrop-blur-md">
            <span className="text-xs text-cyan-400 font-bold uppercase tracking-widest mb-1">DARMOWA NAGRODA</span>
            <h2 className="text-2xl font-black text-white mb-6">WYBIERZ ULEPSZENIE</h2>

            <div className="w-full space-y-3">
              <button
                onClick={() => applyCardUpgrade('DAMAGE')}
                className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 rounded-2xl text-left flex items-center justify-between transition active:scale-95"
              >
                <div>
                  <div className="font-extrabold text-cyan-400 text-sm">⚡ Zwiększ Obrażenia</div>
                  <div className="text-xs text-slate-400 mt-0.5">+8 siły każdego pocisku</div>
                </div>
                <span className="text-xs font-bold bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-lg border border-cyan-800">DARMOWE</span>
              </button>

              <button
                onClick={() => applyCardUpgrade('FIRERATE')}
                className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 rounded-2xl text-left flex items-center justify-between transition active:scale-95"
              >
                <div>
                  <div className="font-extrabold text-cyan-400 text-sm">🔥 Szybkostrzelność</div>
                  <div className="text-xs text-slate-400 mt-0.5">Strzelaj znacznie szybciej</div>
                </div>
                <span className="text-xs font-bold bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-lg border border-cyan-800">DARMOWE</span>
              </button>

              <button
                onClick={() => applyCardUpgrade(statsRef.current.bulletCount < 3 ? 'TRIPLE' : 'HEAL')}
                className="w-full p-4 bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 rounded-2xl text-left flex items-center justify-between transition active:scale-95"
              >
                <div>
                  <div className="font-extrabold text-cyan-400 text-sm">
                    {statsRef.current.bulletCount < 3 ? '🚀 Dodatkowa Lufa' : '💚 Pełna Naprawa HP'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {statsRef.current.bulletCount < 3 ? 'Dodaj kolejny strumień pocisków' : 'Odnów w pełni pancerz'}
                  </div>
                </div>
                <span className="text-xs font-bold bg-cyan-950 text-cyan-400 px-2.5 py-1 rounded-lg border border-cyan-800">DARMOWE</span>
              </button>
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {gameState === 'GAMEOVER' && (
          <div className="w-full h-full p-6 flex flex-col justify-center items-center text-center z-10 bg-slate-950/95 backdrop-blur-md">
            <h2 className="text-4xl font-black text-red-500 mb-2 tracking-wider">GAME OVER</h2>
            <p className="text-slate-400 text-xs mb-1">Przetrwano fal: <span className="text-white font-bold">{wave}</span></p>
            <p className="text-slate-400 text-xs mb-6">Końcowy wynik: <span className="text-cyan-400 font-bold">{score}</span></p>

            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-600/30 text-sm transition"
            >
              MENU GŁÓWNE
            </button>
          </div>
        )}

      </div>
    </main>
  );
}