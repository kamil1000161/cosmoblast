'use client';

import React, { useRef, useEffect, useState } from 'react';

// --- TYPY ---
type WeaponType = 'BLASTER' | 'SPREAD' | 'PLASMA';

interface PlayerStats {
  damageModifier: number;
  fireRateModifier: number;
  maxHp: number;
  weapon: WeaponType;
  bulletCount: number;
}

interface PermanentStats {
  baseDamage: number;
  baseHp: number;
  baseFireRate: number;
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
  rotation: number;
  rotSpeed: number;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Stany gry
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'CARD_UPGRADE' | 'GAMEOVER'>('MENU');
  const [score, setScore] = useState(0);
  const [crystals, setCrystals] = useState(0);
  const [wave, setWave] = useState(1);
  const [playerHp, setPlayerHp] = useState(100);

  // Trwałe ulepszenia (zapisywane)
  const [permStats, setPermStats] = useState<PermanentStats>({
    baseDamage: 10,
    baseHp: 100,
    baseFireRate: 250,
  });

  // Statystyki na bieżące podejście (run)
  const statsRef = useRef<PlayerStats>({
    damageModifier: 0,
    fireRateModifier: 0,
    maxHp: 100,
    weapon: 'BLASTER',
    bulletCount: 1,
  });

  // Opcje ulepszeń po fali
  const [upgradeCards, setUpgradeCards] = useState<any[]>([]);

  // Ładowanie i zapisywanie kryształów / statystyk z LocalStorage
  useEffect(() => {
    const savedCrystals = localStorage.getItem('cb_crystals');
    const savedStats = localStorage.getItem('cb_permStats');
    if (savedCrystals) setCrystals(parseInt(savedCrystals, 10));
    if (savedStats) setPermStats(JSON.parse(savedStats));
  }, []);

  useEffect(() => {
    localStorage.setItem('cb_crystals', crystals.toString());
  }, [crystals]);

  useEffect(() => {
    localStorage.setItem('cb_permStats', JSON.stringify(permStats));
  }, [permStats]);

  // --- SYSTEM AUDIO (Złagodzone, przyjemne dźwięki) ---
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'shoot' | 'plasma' | 'explosion' | 'hit' | 'powerup' | 'buy') => {
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
        osc.type = 'triangle'; // Miękki dźwięk
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); // Znacznie ciszej
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'plasma') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'explosion') {
        osc.type = 'sine'; // Głęboki basowy wybuch zamiast ostrego szumu
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'powerup' || type === 'buy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      // Ignoruj błędy
    }
  };

  // --- GŁÓWNA PĘTLA GRY ---
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
    // Tylko Myszka / Dotyk
    let pointerX = canvas.width / 2;
    let pointerY = canvas.height - 120;

    let player = {
      x: canvas.width / 2,
      y: canvas.height - 120,
      radius: 20,
      hp: playerHp,
      tilt: 0, // Kąt przechyłu
    };

    let bullets: any[] = [];
    let enemyBullets: any[] = [];
    let enemies: any[] = [];
    let particles: Particle[] = [];

    // Paralaksowe tło (Gwiazdy i mgławice)
    let starsLayer1 = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 1.5 + 0.5, speed: Math.random() * 0.5 + 0.2
    }));
    let starsLayer2 = Array.from({ length: 30 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2 + 1.5, speed: Math.random() * 1.5 + 1
    }));

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      pointerX = (e.clientX - rect.left) * scaleX;
      pointerY = (e.clientY - rect.top) * scaleY;
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerMove);

    const addExplosion = (x: number, y: number, color: string, count = 15, isPlayer = false) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (isPlayer ? 5 : 3) + 1;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1, maxLife: Math.random() * 25 + 10,
          color,
          size: Math.random() * (isPlayer ? 5 : 3) + 2,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2
        });
      }
    };

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
          x: canvas.width / 2, y: -50,
          startX: canvas.width / 2, startY: 150,
          radius: 45,
          hp: 800 + wave * 300, maxHp: 800 + wave * 300,
          color: '#ff2a5f',
          time: 0,
          shootCooldown: 0,
          phase: 0,
        });
      } else {
        const types = ['SCOUT', 'FIGHTER', 'DREADNOUGHT'];
        // Losowanie wagowe (Dreadnought najrzadszy)
        const rand = Math.random();
        const type = rand < 0.5 ? 'SCOUT' : (rand < 0.85 ? 'FIGHTER' : 'DREADNOUGHT');
        
        enemies.push({
          type,
          x: Math.random() * (canvas.width - 100) + 50,
          y: -40,
          startX: Math.random() * (canvas.width - 100) + 50,
          startY: Math.random() * 150 + 50, // Docelowa wysokość krążenia
          radius: type === 'DREADNOUGHT' ? 28 : (type === 'FIGHTER' ? 20 : 15),
          hp: type === 'DREADNOUGHT' ? 120 + wave * 15 : (type === 'FIGHTER' ? 40 + wave * 8 : 20 + wave * 5),
          maxHp: type === 'DREADNOUGHT' ? 120 + wave * 15 : (type === 'FIGHTER' ? 40 + wave * 8 : 20 + wave * 5),
          color: type === 'SCOUT' ? '#00e5ff' : type === 'FIGHTER' ? '#ffaa00' : '#b026ff',
          time: Math.random() * 100,
          shootCooldown: Math.random() * 30,
        });
      }
      spawnedCount++;
    }, 1200);

    const loop = (timestamp: number) => {
      // Tło
      ctx.fillStyle = '#020208';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gwiazdy
      ctx.fillStyle = '#ffffff';
      [starsLayer1, starsLayer2].forEach((layer, index) => {
        ctx.globalAlpha = index === 0 ? 0.4 : 0.8;
        layer.forEach((star) => {
          star.y += star.speed;
          if (star.y > canvas.height) star.y = 0;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1;

      // Płynny ruch gracza (Smooth Follow)
      const dx = pointerX - player.x;
      const dy = pointerY - player.y;
      player.x += dx * 0.12;
      player.y += dy * 0.12;
      
      // Przechył na boki podczas ruchu
      player.tilt = dx * 0.015;
      player.tilt = Math.max(-0.4, Math.min(0.4, player.tilt));

      // Limity mapy
      player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

      // Strzelanie
      const currentFireRate = Math.max(50, permStats.baseFireRate + statsRef.current.fireRateModifier);
      const currentDamage = permStats.baseDamage + statsRef.current.damageModifier;

      if (timestamp - lastShot > currentFireRate) {
        const wep = statsRef.current.weapon;
        const count = statsRef.current.bulletCount;

        if (wep === 'BLASTER') {
          playSound('shoot');
          for(let i=0; i<count; i++) {
            const offset = count === 1 ? 0 : (i - (count-1)/2) * 12;
            bullets.push({ x: player.x + offset, y: player.y - player.radius, vx: 0, vy: -15, damage: currentDamage, type: 'normal' });
          }
        } else if (wep === 'SPREAD') {
          playSound('shoot');
          const spreadCount = count === 1 ? 3 : (count === 2 ? 5 : 7);
          for(let i=0; i<spreadCount; i++) {
            const angle = (i - (spreadCount-1)/2) * 0.15;
            bullets.push({ 
              x: player.x, y: player.y - player.radius, 
              vx: Math.sin(angle) * 12, vy: -Math.cos(angle) * 12, 
              damage: currentDamage * 0.7, type: 'spread' 
            });
          }
        } else if (wep === 'PLASMA') {
          playSound('plasma');
          for(let i=0; i<count; i++) {
             const offset = count === 1 ? 0 : (i - (count-1)/2) * 20;
             bullets.push({ x: player.x + offset, y: player.y - player.radius, vx: 0, vy: -10, damage: currentDamage * 2.5, type: 'plasma' });
          }
        }
        lastShot = timestamp;
      }

      // RYSOWANIE STATKU GRACZA (Szczegółowy Wektor)
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.tilt);

      // Płomienie silnika (animowane)
      const flameHeight = 15 + Math.random() * 10;
      ctx.fillStyle = '#00f0ff';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(-8, 12);
      ctx.lineTo(0, 12 + flameHeight);
      ctx.lineTo(8, 12);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Skrzydła
      const gradWing = ctx.createLinearGradient(0, -20, 0, 20);
      gradWing.addColorStop(0, '#2a2a35');
      gradWing.addColorStop(1, '#11111a');
      ctx.fillStyle = gradWing;
      ctx.strokeStyle = '#444455';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(25, 15);
      ctx.lineTo(10, 15);
      ctx.lineTo(0, 10);
      ctx.lineTo(-10, 15);
      ctx.lineTo(-25, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Korpus główny (Kadłub)
      const gradBody = ctx.createLinearGradient(0, -25, 0, 15);
      gradBody.addColorStop(0, '#00d4ff');
      gradBody.addColorStop(1, '#0055ff');
      ctx.fillStyle = gradBody;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(8, 5);
      ctx.lineTo(0, 18);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();

      // Kokpit
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, -5, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Rysowanie Pocisków Gracza
      bullets.forEach((b, i) => {
        b.x += b.vx;
        b.y += b.vy;
        
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.type === 'plasma') {
          ctx.fillStyle = '#a200ff';
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#d000ff';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Blaster / Spread
          ctx.fillStyle = '#00ffff';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00ffff';
          const angle = Math.atan2(b.vy, b.vx) + Math.PI/2;
          ctx.rotate(angle);
          ctx.fillRect(-2, -8, 4, 16);
        }
        ctx.restore();

        if (b.y < -20 || b.x < -20 || b.x > canvas.width + 20) bullets.splice(i, 1);
      });

      // Złożona Sztuczna Inteligencja / Fizyka Wrogów
      enemies.forEach((enemy, ei) => {
        enemy.time += 0.02;

        if (enemy.type === 'BOSS') {
          // Faza wejścia
          if (enemy.y < enemy.startY) {
            enemy.y += 1.5;
          } else {
            // Krążenie po ósemce wokół środka
            enemy.x = enemy.startX + Math.sin(enemy.time * 1.5) * 120;
            enemy.y = enemy.startY + Math.sin(enemy.time * 3) * 30;

            enemy.shootCooldown++;
            if (enemy.shootCooldown > 45) {
               enemyBullets.push({ x: enemy.x, y: enemy.y + 30, vx: 0, vy: 6, radius: 6, color: '#ff2a5f' });
               enemyBullets.push({ x: enemy.x - 20, y: enemy.y + 30, vx: -2.5, vy: 5, radius: 4, color: '#ff2a5f' });
               enemyBullets.push({ x: enemy.x + 20, y: enemy.y + 30, vx: 2.5, vy: 5, radius: 4, color: '#ff2a5f' });
               enemy.shootCooldown = 0;
            }
          }
        } else if (enemy.type === 'SCOUT') {
          // Zwiadowca: Szybki zygzak w dół
          enemy.y += 2.5;
          enemy.x = enemy.startX + Math.sin(enemy.time * 5) * 60;
          if (enemy.y > canvas.height + 50) { enemy.y = -50; enemy.startX = Math.random() * canvas.width; }
        } else if (enemy.type === 'FIGHTER') {
          // Myśliwiec: Opada do startY, potem robi łagodne fale w poziomie
          if (enemy.y < enemy.startY) {
            enemy.y += 2;
          } else {
            enemy.x = enemy.startX + Math.sin(enemy.time * 2) * 80;
            enemy.y = enemy.startY + Math.cos(enemy.time * 1.5) * 20;
            
            enemy.shootCooldown++;
            if (enemy.shootCooldown > 80) {
              // Celuje w gracza
              const dx = player.x - enemy.x;
              const dy = player.y - enemy.y;
              const angle = Math.atan2(dy, dx);
              enemyBullets.push({ 
                x: enemy.x, y: enemy.y + 10, 
                vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4, 
                radius: 4, color: '#ffaa00' 
              });
              enemy.shootCooldown = 0;
            }
          }
        } else if (enemy.type === 'DREADNOUGHT') {
          // Krążownik: Bardzo wolno opada w dół, majestatycznie
          enemy.y += 0.5;
          enemy.x = enemy.startX + Math.sin(enemy.time) * 30;

          enemy.shootCooldown++;
          if (enemy.shootCooldown > 100) {
            // Strzela gęstym pierścieniem pocisków
            for(let i=0; i<5; i++) {
               const angle = (Math.PI/4) + (i * Math.PI/8);
               enemyBullets.push({ 
                x: enemy.x, y: enemy.y + 20, 
                vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3, 
                radius: 5, color: '#b026ff' 
              });
            }
            enemy.shootCooldown = 0;
          }
        }

        // RYSOWANIE WROGÓW
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.shadowBlur = 15;
        ctx.shadowColor = enemy.color;
        
        if (enemy.type === 'SCOUT') {
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.lineTo(10, -10);
          ctx.lineTo(0, -5);
          ctx.lineTo(-10, -10);
          ctx.closePath();
          ctx.fill();
        } else if (enemy.type === 'FIGHTER') {
          ctx.fillStyle = '#333344';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 10);
          ctx.lineTo(20, 0);
          ctx.lineTo(20, -10);
          ctx.lineTo(8, -5);
          ctx.lineTo(8, -15);
          ctx.lineTo(-8, -15);
          ctx.lineTo(-8, -5);
          ctx.lineTo(-20, -10);
          ctx.lineTo(-20, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Świecące reaktory
          ctx.fillStyle = enemy.color;
          ctx.beginPath(); ctx.arc(-14, -8, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(14, -8, 3, 0, Math.PI*2); ctx.fill();
        } else if (enemy.type === 'DREADNOUGHT') {
          ctx.fillStyle = '#22222a';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-15, 25);
          ctx.lineTo(15, 25);
          ctx.lineTo(25, 5);
          ctx.lineTo(15, -20);
          ctx.lineTo(-15, -20);
          ctx.lineTo(-25, 5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = enemy.color;
          ctx.fillRect(-8, -10, 16, 20);
        } else if (enemy.type === 'BOSS') {
          ctx.fillStyle = '#1a0510';
          ctx.strokeStyle = enemy.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, 35, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Obracający się rdzeń
          ctx.rotate(enemy.time * 2);
          ctx.fillStyle = enemy.color;
          ctx.fillRect(-15, -15, 30, 30);
        }

        ctx.restore();

        // Pasek HP Bossa / Dreadnoughta
        if (enemy.type === 'BOSS' || enemy.type === 'DREADNOUGHT') {
          const barW = enemy.radius * 2;
          const hpP = Math.max(0, enemy.hp / enemy.maxHp);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 12, barW, 4);
          ctx.fillStyle = enemy.color;
          ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 12, barW * hpP, 4);
        }

        // Kolizje Gracza z Wrogami (Ciało w Ciało)
        const distP = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distP < player.radius + enemy.radius - 5) {
           player.hp -= 15;
           setPlayerHp(Math.max(0, player.hp));
           playSound('hit');
           addExplosion(enemy.x, enemy.y, enemy.color, 15);
           enemies.splice(ei, 1);
           if (player.hp <= 0) setGameState('GAMEOVER');
        }

        // Kolizja Pocisków Gracza z Wrogiem
        bullets.forEach((b, bi) => {
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (dist < enemy.radius + (b.type === 'plasma' ? 8 : 2)) {
            bullets.splice(bi, 1);
            enemy.hp -= b.damage;
            
            // Mała iskra przy trafieniu
            addExplosion(b.x, b.y, b.type === 'plasma' ? '#a200ff' : '#00ffff', 3);

            if (enemy.hp <= 0) {
              playSound('explosion');
              addExplosion(enemy.x, enemy.y, enemy.color, enemy.type === 'BOSS' ? 40 : 15);
              enemies.splice(ei, 1);
              setScore((prev) => prev + (enemy.type === 'BOSS' ? 1000 : (enemy.type === 'DREADNOUGHT' ? 150 : 50)));
              setCrystals((prev) => prev + (enemy.type === 'BOSS' ? 25 : (enemy.type === 'DREADNOUGHT' ? 5 : 1)));
            }
          }
        });
      });

      // Pociski Wrogów
      enemyBullets.forEach((eb, i) => {
        eb.x += eb.vx;
        eb.y += eb.vy;
        
        ctx.fillStyle = eb.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = eb.color;
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < player.radius - 2) {
          enemyBullets.splice(i, 1);
          player.hp -= 10;
          setPlayerHp(Math.max(0, player.hp));
          playSound('hit');
          addExplosion(player.x, player.y, '#ff0055', 8, true);
          if (player.hp <= 0) setGameState('GAMEOVER');
        }
        if (eb.y > canvas.height || eb.x < -20 || eb.x > canvas.width + 20) enemyBullets.splice(i, 1);
      });

      // Cząsteczki
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.life -= 1 / p.maxLife;
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();

        if (p.life <= 0) particles.splice(i, 1);
      });

      // Koniec Fali
      if (spawnedCount >= enemiesToSpawn && enemies.length === 0) {
        clearInterval(spawnInterval);
        setWave((w) => w + 1);
        playSound('powerup');
        generateUpgradeCards();
        setGameState('CARD_UPGRADE');
        return;
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(spawnInterval);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerMove);
    };
  }, [gameState, wave, permStats]);

  // --- SYSTEM KART ULEPSZEŃ ---
  const generateUpgradeCards = () => {
    const possibleUpgrades = [
      { id: 'dmg', title: 'Siła Ognia', desc: '+15 Obrażeń', color: 'from-orange-500 to-red-600', icon: '💥' },
      { id: 'rate', title: 'Szybkostrzelność', desc: 'Szybsze ataki', color: 'from-blue-400 to-indigo-600', icon: '⚡' },
      { id: 'heal', title: 'Odbudowa Kadłuba', desc: 'Odzyskaj 50% Max HP', color: 'from-emerald-400 to-teal-600', icon: '🔧' },
      { id: 'spread', title: 'Rozprysk', desc: 'Zmień broń na Spread', color: 'from-cyan-400 to-blue-500', icon: '🌊' },
      { id: 'plasma', title: 'Ciężka Plazma', desc: 'Zmień broń na Plazmę', color: 'from-purple-500 to-fuchsia-600', icon: '🟣' },
      { id: 'multibarrel', title: 'Dodatkowa Lufa', desc: '+1 do ilości pocisków', color: 'from-yellow-400 to-orange-500', icon: '🎰' },
    ];
    // Losuj 3 unikalne
    const shuffled = [...possibleUpgrades].sort(() => 0.5 - Math.random());
    setUpgradeCards(shuffled.slice(0, 3));
  };

  const applyCard = (id: string) => {
    playSound('powerup');
    if (id === 'dmg') statsRef.current.damageModifier += 15;
    if (id === 'rate') statsRef.current.fireRateModifier -= 25;
    if (id === 'heal') setPlayerHp(Math.min(permStats.baseHp, playerHp + permStats.baseHp * 0.5));
    if (id === 'spread') statsRef.current.weapon = 'SPREAD';
    if (id === 'plasma') statsRef.current.weapon = 'PLASMA';
    if (id === 'multibarrel') statsRef.current.bulletCount = Math.min(3, statsRef.current.bulletCount + 1);
    
    setGameState('PLAYING');
  };

  // --- SKLEP W MENU GŁÓWNYM ---
  const buyPermUpgrade = (type: keyof PermanentStats, cost: number, amount: number) => {
    if (crystals >= cost) {
      playSound('buy');
      setCrystals(c => c - cost);
      setPermStats(prev => {
        const next = { ...prev };
        if (type === 'baseFireRate') next[type] -= amount; // Szybkostrzelność (mniej ms to lepiej)
        else next[type] += amount;
        return next;
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#050508] flex flex-col items-center justify-center font-sans select-none overflow-hidden sm:p-4">
      
      <div className="relative w-full max-w-[450px] h-[100vh] sm:h-[800px] bg-[#0a0a14] sm:rounded-3xl border border-blue-900/40 overflow-hidden flex flex-col items-center justify-center shadow-[0_0_80px_rgba(0,100,255,0.1)]">
        
        {/* === MENU GŁÓWNE (Glassmorphism, Piękne) === */}
        {gameState === 'MENU' && (
          <div className="w-full h-full flex flex-col items-center p-6 z-10 bg-gradient-to-br from-[#050510] via-[#0a0a20] to-[#020205]">
            
            <div className="mt-10 text-center animate-fade-in-down">
              <span className="px-3 py-1 bg-blue-950/50 text-blue-400 text-[10px] font-bold rounded-full border border-blue-800/50 tracking-[0.2em] uppercase backdrop-blur-sm">
                Next-Gen Space Shooter
              </span>
              <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 via-blue-500 to-indigo-700 mt-4 tracking-widest drop-shadow-[0_0_25px_rgba(0,150,255,0.4)]">
                COSMO<br />BLAST
              </h1>
            </div>

            <div className="mt-8 mb-4 w-full flex items-center justify-center gap-2">
               <div className="bg-slate-900/60 border border-slate-700/50 px-5 py-2 rounded-2xl backdrop-blur-md shadow-lg flex items-center gap-3">
                  <span className="text-2xl drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]">💎</span>
                  <span className="text-3xl font-extrabold text-cyan-300">{crystals}</span>
               </div>
            </div>

            {/* Sklep Permanentny */}
            <div className="w-full flex-1 mt-2 bg-white/[0.02] border border-white/[0.05] rounded-3xl p-5 backdrop-blur-xl flex flex-col gap-3 shadow-2xl">
              <h3 className="text-xs text-blue-300 font-bold tracking-widest uppercase mb-1 border-b border-blue-900/50 pb-2">Hangar Wsparcia (Trwałe)</h3>
              
              {/* HP Upgrade */}
              <div className="flex justify-between items-center bg-black/40 p-3 rounded-2xl border border-white/[0.05]">
                <div>
                  <div className="text-sm font-bold text-white">Wzmocnienie Pancerza</div>
                  <div className="text-[10px] text-slate-400">Aktualne: {permStats.baseHp} HP</div>
                </div>
                <button 
                  onClick={() => buyPermUpgrade('baseHp', 20, 20)}
                  disabled={crystals < 20}
                  className="bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                >
                  20 💎
                </button>
              </div>

              {/* Dmg Upgrade */}
              <div className="flex justify-between items-center bg-black/40 p-3 rounded-2xl border border-white/[0.05]">
                <div>
                  <div className="text-sm font-bold text-white">Moduł Zniszczenia</div>
                  <div className="text-[10px] text-slate-400">Bazowe Obrażenia: {permStats.baseDamage}</div>
                </div>
                <button 
                  onClick={() => buyPermUpgrade('baseDamage', 30, 5)}
                  disabled={crystals < 30}
                  className="bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                >
                  30 💎
                </button>
              </div>

              {/* FireRate Upgrade */}
              <div className="flex justify-between items-center bg-black/40 p-3 rounded-2xl border border-white/[0.05]">
                <div>
                  <div className="text-sm font-bold text-white">Chłodzenie Dział</div>
                  <div className="text-[10px] text-slate-400">Przerwa ataku: {permStats.baseFireRate}ms</div>
                </div>
                <button 
                  onClick={() => buyPermUpgrade('baseFireRate', 40, 20)}
                  disabled={crystals < 40 || permStats.baseFireRate <= 100}
                  className="bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                >
                  {permStats.baseFireRate <= 100 ? 'MAX' : '40 💎'}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                initAudio();
                setScore(0);
                setWave(1);
                // Reset run stats
                statsRef.current = { damageModifier: 0, fireRateModifier: 0, maxHp: permStats.baseHp, weapon: 'BLASTER', bulletCount: 1 };
                setPlayerHp(permStats.baseHp);
                setGameState('PLAYING');
              }}
              className="mt-6 w-full py-5 bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400 hover:brightness-110 text-[#020205] font-black rounded-3xl shadow-[0_0_40px_rgba(0,255,255,0.5)] text-xl tracking-[0.2em] active:scale-95 transition-all"
            >
              START
            </button>
          </div>
        )}

        {/* === EKRAN GRY / HUD === */}
        {gameState === 'PLAYING' && (
          <div className="relative w-full h-full">
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
              <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
                <span className="text-white/50 block text-[9px] font-bold tracking-widest">WYNIK</span>
                <span className="text-white text-lg font-black tracking-wider">{score}</span>
              </div>
              <div className="bg-blue-900/40 backdrop-blur-md px-5 py-2 rounded-2xl border border-blue-500/30 shadow-[0_0_20px_rgba(0,150,255,0.3)] text-center">
                <span className="text-blue-300 block text-[9px] font-bold tracking-widest">FALA</span>
                <span className="text-white text-xl font-black">{wave}</span>
              </div>
              <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg text-right">
                <span className="text-white/50 block text-[9px] font-bold tracking-widest">KRYSZTAŁY</span>
                <span className="text-cyan-400 text-lg font-black tracking-wider">💎 {crystals}</span>
              </div>
            </div>

            <div className="absolute bottom-6 left-6 right-6 pointer-events-none z-10">
              <div className="flex justify-between text-[10px] text-white/60 font-bold tracking-widest mb-2 px-1">
                <span>PANCERZ</span>
                <span>{Math.ceil(playerHp)} / {permStats.baseHp}</span>
              </div>
              <div className="w-full h-3 bg-black/60 rounded-full border border-white/10 overflow-hidden backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                <div
                  className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-cyan-400 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(0, (playerHp / permStats.baseHp) * 100)}%` }}
                />
              </div>
            </div>

            <canvas ref={canvasRef} className="w-full h-full touch-none block" />
          </div>
        )}

        {/* === EKRAN WYBORU KARTY PO FALI === */}
        {gameState === 'CARD_UPGRADE' && (
          <div className="w-full h-full p-6 flex flex-col justify-center items-center text-center z-20 bg-black/80 backdrop-blur-xl">
            <span className="text-xs text-cyan-400 font-bold tracking-[0.3em] mb-2 drop-shadow-md">SEKTOR OCZYSZCZONY</span>
            <h2 className="text-3xl font-black text-white mb-8 drop-shadow-lg">WYBIERZ ZASÓB</h2>

            <div className="w-full space-y-4">
              {upgradeCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => applyCard(card.id)}
                  className={`w-full p-5 bg-gradient-to-r ${card.color} rounded-3xl text-left flex items-center gap-4 transition-transform active:scale-95 shadow-xl hover:brightness-110`}
                >
                  <div className="text-4xl drop-shadow-md bg-black/20 p-3 rounded-2xl">{card.icon}</div>
                  <div>
                    <div className="font-black text-white text-lg tracking-wide drop-shadow-md">{card.title}</div>
                    <div className="text-sm text-white/80 font-medium drop-shadow-sm">{card.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === GAME OVER === */}
        {gameState === 'GAMEOVER' && (
          <div className="w-full h-full p-6 flex flex-col justify-center items-center text-center z-20 bg-red-950/90 backdrop-blur-xl">
            <h2 className="text-6xl font-black text-red-500 mb-2 tracking-widest drop-shadow-[0_0_30px_rgba(255,0,0,0.8)]">Zniszczony</h2>
            <div className="bg-black/40 p-6 rounded-3xl border border-red-500/20 w-full mt-6 mb-8 backdrop-blur-md">
                <p className="text-red-300 text-xs font-bold tracking-widest mb-1">PRZETRWANE FALE</p>
                <p className="text-white font-black text-3xl mb-4">{wave}</p>
                
                <p className="text-red-300 text-xs font-bold tracking-widest mb-1">PUNKTY KARIERY</p>
                <p className="text-white font-black text-4xl">{score}</p>
            </div>

            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-5 bg-white text-red-950 hover:bg-gray-200 font-black rounded-3xl shadow-[0_0_30px_rgba(255,255,255,0.3)] text-lg tracking-[0.2em] transition-all active:scale-95"
            >
              POWRÓT DO BAZY
            </button>
          </div>
        )}

      </div>
    </main>
  );
}