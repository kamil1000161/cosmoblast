'use client';

import React, { useRef, useEffect, useState } from 'react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'UPGRADE' | 'GAMEOVER'>('MENU');
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState(0);
  const [wave, setWave] = useState(1);
  const [playerHp, setPlayerHp] = useState(100);
  const [maxHp] = useState(100);

  const statsRef = useRef({
    damage: 15,
    fireRate: 250,
    speed: 5,
    shield: 0,
  });

  // Sintetyzator Dźwięków (Web Audio API)
  const playSound = (type: 'shoot' | 'explosion' | 'hit') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'shoot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'explosion') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      // Wyłapanie ograniczeń autoplaya w przeglądarkach
    }
  };

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    canvas.width = 800;
    canvas.height = 600;

    let lastShot = 0;
    let keys: { [key: string]: boolean } = {};
    let mouse = { x: canvas.width / 2, y: canvas.height - 100 };

    let player = {
      x: canvas.width / 2,
      y: canvas.height - 100,
      radius: 15,
      hp: playerHp,
      maxHp: maxHp,
      shield: statsRef.current.shield,
    };

    let bullets: any[] = [];
    let enemyBullets: any[] = [];
    let enemies: any[] = [];
    let stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 2 + 0.5,
    }));

    const handleKeyDown = (e: KeyboardEvent) => (keys[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleMouseMove);

    let isBossWave = wave % 5 === 0;
    let enemiesToSpawn = isBossWave ? 1 : 4 + wave * 2;
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
          radius: 40,
          hp: 400 + wave * 200,
          maxHp: 400 + wave * 200,
          color: '#ff0055',
          vx: 2,
          vy: 0,
          shootCooldown: 0,
          time: 0,
        });
      } else {
        const types = ['FAST', 'HEAVY', 'RANGED'];
        const type = types[Math.floor(Math.random() * types.length)];
        enemies.push({
          type,
          x: Math.random() * (canvas.width - 120) + 60,
          y: -30,
          radius: type === 'HEAVY' ? 22 : 14,
          hp: type === 'HEAVY' ? 50 + wave * 10 : 20 + wave * 5,
          maxHp: type === 'HEAVY' ? 50 + wave * 10 : 20 + wave * 5,
          color: type === 'FAST' ? '#00ffcc' : type === 'HEAVY' ? '#ff9900' : '#cc00ff',
          speed: type === 'FAST' ? 2.2 : 1.2,
          shootCooldown: 0,
          time: Math.random() * 100, // Losowy offset do ruchu wahadłowego
          direction: Math.random() > 0.5 ? 1 : -1,
        });
      }
      spawnedCount++;
    }, 1200);

    const loop = (timestamp: number) => {
      // Tło
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gwiazdy
      ctx.fillStyle = '#ffffff';
      stars.forEach((star) => {
        star.y += star.speed;
        if (star.y > canvas.height) star.y = 0;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      // Ruch gracza (klawiatura + płynna myszka)
      if (keys['KeyA'] || keys['ArrowLeft']) player.x -= statsRef.current.speed;
      if (keys['KeyD'] || keys['ArrowRight']) player.x += statsRef.current.speed;
      if (keys['KeyW'] || keys['ArrowUp']) player.y -= statsRef.current.speed;
      if (keys['KeyS'] || keys['ArrowDown']) player.y += statsRef.current.speed;

      player.x += (mouse.x - player.x) * 0.1;
      player.y += (mouse.y - player.y) * 0.1;

      // Granice planszy dla gracza
      player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

      // Strzelanie gracza
      if (timestamp - lastShot > statsRef.current.fireRate) {
        bullets.push({
          x: player.x,
          y: player.y - player.radius,
          vx: 0,
          vy: -10,
          damage: statsRef.current.damage,
        });
        playSound('shoot');
        lastShot = timestamp;
      }

      // Rysowanie gracza
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(0, -player.radius * 1.4);
      ctx.lineTo(-player.radius, player.radius);
      ctx.lineTo(player.radius, player.radius);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Pociski gracza
      bullets.forEach((b, i) => {
        b.x += b.vx;
        b.y += b.vy;
        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00ffff';
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
        ctx.shadowBlur = 0;
        if (b.y < 0) bullets.splice(i, 1);
      });

      // Pociski wrogów
      enemyBullets.forEach((eb, i) => {
        eb.x += eb.vx;
        eb.y += eb.vy;
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Kolizja pocisku wroga z graczem
        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < player.radius + 4) {
          enemyBullets.splice(i, 1);
          player.hp -= 12;
          setPlayerHp(Math.max(0, player.hp));
          playSound('hit');
          if (player.hp <= 0) setGameState('GAMEOVER');
        }
        if (eb.y > canvas.height || eb.x < 0 || eb.x > canvas.width) enemyBullets.splice(i, 1);
      });

      // Wrogowie
      enemies.forEach((enemy, ei) => {
        enemy.time += 0.03;

        if (enemy.type === 'BOSS') {
          // Ruch Bossa na boki
          enemy.x += enemy.vx;
          if (enemy.x < 60 || enemy.x > canvas.width - 60) enemy.vx *= -1;

          // Atak Bossa
          enemy.shootCooldown++;
          if (enemy.shootCooldown > 45) {
            enemyBullets.push({ x: enemy.x, y: enemy.y + 30, vx: 0, vy: 5 });
            enemyBullets.push({ x: enemy.x - 15, y: enemy.y + 30, vx: -2, vy: 4 });
            enemyBullets.push({ x: enemy.x + 15, y: enemy.y + 30, vx: 2, vy: 4 });
            enemy.shootCooldown = 0;
          }
        } else {
          // REALISTYCZNY RUCH WROGA: Zjeżdża w dół, ale faluje na boki i odbija się od ścian
          enemy.y += enemy.speed;
          enemy.x += Math.sin(enemy.time) * 2 * enemy.direction;

          // Blokada przed wylatywaniem na boki
          if (enemy.x <= enemy.radius) {
            enemy.x = enemy.radius;
            enemy.direction *= -1;
          } else if (enemy.x >= canvas.width - enemy.radius) {
            enemy.x = canvas.width - enemy.radius;
            enemy.direction *= -1;
          }

          // Zawracanie, jeśli dotrze do dolnej części ekranu
          if (enemy.y > canvas.height - 100) {
            enemy.speed = -Math.abs(enemy.speed);
          } else if (enemy.y < 40) {
            enemy.speed = Math.abs(enemy.speed);
          }

          // Strzelanie wrogów typu RANGED oraz HEAVY
          if (enemy.type === 'RANGED' || enemy.type === 'HEAVY') {
            enemy.shootCooldown++;
            if (enemy.shootCooldown > (enemy.type === 'HEAVY' ? 90 : 60)) {
              enemyBullets.push({ x: enemy.x, y: enemy.y + enemy.radius, vx: 0, vy: 4 });
              enemy.shootCooldown = 0;
            }
          }
        }

        // Rysowanie wroga
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();

        // Pasek życia dla Bossa i Heavy
        if (enemy.type === 'BOSS' || enemy.type === 'HEAVY') {
          const barWidth = enemy.radius * 2;
          const hpPercent = enemy.hp / enemy.maxHp;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 12, barWidth, 6);
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 12, barWidth * hpPercent, 6);
        }

        // Kolizja pocisku gracza z wrogiem
        bullets.forEach((b, bi) => {
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (dist < enemy.radius) {
            bullets.splice(bi, 1);
            enemy.hp -= b.damage;

            if (enemy.hp <= 0) {
              playSound('explosion');
              enemies.splice(ei, 1);
              setScore((prev) => prev + (enemy.type === 'BOSS' ? 1000 : 50));
              setCrystals((prev) => prev + (enemy.type === 'BOSS' ? 20 : 2));
            }
          }
        });

        // Kolizja wroga z statkiem gracza
        const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distPlayer < player.radius + enemy.radius) {
          player.hp -= 20;
          setPlayerHp(Math.max(0, player.hp));
          playSound('hit');
          enemies.splice(ei, 1);
          if (player.hp <= 0) setGameState('GAMEOVER');
        }
      });

      // Warunek ukończenia fali
      if (spawnedCount >= enemiesToSpawn && enemies.length === 0) {
        clearInterval(spawnInterval);
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
    };
  }, [gameState, wave]);

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans p-4 select-none">
      {/* MENU GŁÓWNE */}
      {gameState === 'MENU' && (
        <div className="text-center p-8 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-cyan-500/40 max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.25)]">
          <div className="inline-block px-3 py-1 bg-cyan-950 text-cyan-400 text-xs font-semibold rounded-full border border-cyan-800 mb-3 tracking-widest">
            RETRO ARCADE SHOOTER
          </div>
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 mb-2 tracking-wider drop-shadow-lg">
            COSMOBLAST
          </h1>
          <p className="text-slate-400 mb-6 text-sm">Obroń galaktykę, ulepszaj statek i przetrwaj!</p>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-left text-xs text-slate-300 space-y-2 mb-6">
            <div className="font-bold text-cyan-400 border-b border-slate-800 pb-1">🎮 STEROWANIE:</div>
            <div>• <span className="text-white font-semibold">Myszka / WSAD / Strzałki</span> – Sterowanie statkiem</div>
            <div>• <span className="text-white font-semibold">Automatyczny strzał</span> – Działa ciągle</div>
          </div>

          <button
            onClick={() => {
              setScore(0);
              setCrystals(0);
              setWave(1);
              setPlayerHp(100);
              setGameState('PLAYING');
            }}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-cyan-500/30 text-lg"
          >
            ROZPOCZNIJ GRĘ 🚀
          </button>
        </div>
      )}

      {/* PLANSZA GRY */}
      {gameState === 'PLAYING' && (
        <div className="relative">
          {/* HUD - Paski Życia i Punkty */}
          <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-sm font-bold text-cyan-300 pointer-events-none bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-800 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">HP:</span>
              <div className="w-32 h-3.5 bg-slate-950 rounded-full border border-slate-700 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-emerald-400 to-cyan-400 transition-all duration-200"
                  style={{ width: `${(playerHp / maxHp) * 100}%` }}
                />
              </div>
            </div>
            <div>FALA: <span className="text-white">{wave}</span></div>
            <div>PUNKTY: <span className="text-white">{score}</span></div>
            <div>💎 <span className="text-cyan-400">{crystals}</span></div>
          </div>

          <canvas ref={canvasRef} className="rounded-xl border border-slate-800 shadow-2xl bg-slate-950" />
        </div>
      )}

      {/* SKLEP / UPGRADE */}
      {gameState === 'UPGRADE' && (
        <div className="text-center p-8 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-cyan-500/40 max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-extrabold text-cyan-400 mb-1">FALA {wave - 1} UKOŃCZONA!</h2>
          <p className="text-slate-400 mb-6 text-sm">Masz <span className="text-cyan-300 font-bold">💎 {crystals}</span> kryształów. Wybierz ulepszenie:</p>
          
          <div className="space-y-3 mb-6">
            <button
              onClick={() => {
                if (crystals >= 10) {
                  setCrystals((c) => c - 10);
                  statsRef.current.damage += 8;
                  setGameState('PLAYING');
                }
              }}
              disabled={crystals < 10}
              className="w-full p-3.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800/80 rounded-xl text-left flex justify-between items-center border border-slate-700 transition"
            >
              <div>
                <div className="font-bold text-white text-sm">+8 Obrażenia Pocisków</div>
                <div className="text-xs text-slate-400">Szybciej niszcz wrogów</div>
              </div>
              <span className="text-cyan-400 font-extrabold bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-800/50">10 💎</span>
            </button>

            <button
              onClick={() => {
                if (crystals >= 15) {
                  setCrystals((c) => c - 15);
                  statsRef.current.fireRate = Math.max(70, statsRef.current.fireRate - 35);
                  setGameState('PLAYING');
                }
              }}
              disabled={crystals < 15}
              className="w-full p-3.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800/80 rounded-xl text-left flex justify-between items-center border border-slate-700 transition"
            >
              <div>
                <div className="font-bold text-white text-sm">Szybsza Szybkostrzelność</div>
                <div className="text-xs text-slate-400">Zwiększ częstotliwość strzałów</div>
              </div>
              <span className="text-cyan-400 font-extrabold bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-800/50">15 💎</span>
            </button>
          </div>

          <button
            onClick={() => setGameState('PLAYING')}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl transition text-sm"
          >
            NASTĘPNA FALA ➔
          </button>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === 'GAMEOVER' && (
        <div className="text-center p-8 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-red-500/40 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.2)]">
          <h2 className="text-4xl font-black text-red-500 mb-2 tracking-wider">GAME OVER</h2>
          <p className="text-slate-300 text-sm mb-1">Przetrwano fal: <span className="font-bold text-white">{wave}</span></p>
          <p className="text-slate-400 text-sm mb-6">Wynik końcowy: <span className="font-bold text-cyan-400">{score}</span></p>
          <button
            onClick={() => setGameState('MENU')}
            className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition shadow-lg shadow-red-600/30 text-sm"
          >
            MENU GŁÓWNE
          </button>
        </div>
      )}
    </main>
  );
}