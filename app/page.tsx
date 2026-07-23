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
  drones: number;
  shield: boolean;
}

interface PermanentStats {
  baseDamage: number;
  baseHp: number;
  baseFireRate: number;
  critChance: number;
  crystalMultiplier: number;
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

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
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
    critChance: 5,
    crystalMultiplier: 1,
  });

  // Statystyki na bieżące podejście (run)
  const statsRef = useRef<PlayerStats>({
    damageModifier: 0,
    fireRateModifier: 0,
    maxHp: 100,
    weapon: 'BLASTER',
    bulletCount: 1,
    drones: 0,
    shield: false,
  });

  // Opcje ulepszeń po fali
  const [upgradeCards, setUpgradeCards] = useState<any[]>([]);

  // Ładowanie i zapisywanie kryształów / statystyk z LocalStorage
  useEffect(() => {
    const savedCrystals = localStorage.getItem('cb_crystals_v2');
    const savedStats = localStorage.getItem('cb_permStats_v2');
    if (savedCrystals) setCrystals(parseInt(savedCrystals, 10));
    if (savedStats) setPermStats({ ...permStats, ...JSON.parse(savedStats) });
  }, []);

  useEffect(() => {
    localStorage.setItem('cb_crystals_v2', crystals.toString());
  }, [crystals]);

  useEffect(() => {
    localStorage.setItem('cb_permStats_v2', JSON.stringify(permStats));
  }, [permStats]);

  // --- SYSTEM AUDIO ---
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
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
      } else if (type === 'plasma') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
      } else if (type === 'explosion') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
      } else if (type === 'powerup' || type === 'buy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      }
    } catch (e) {}
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
    let lastDroneShot = 0;
    let pointerX = canvas.width / 2;
    let pointerY = canvas.height - 120;

    let player = {
      x: canvas.width / 2,
      y: canvas.height - 120,
      radius: 20,
      hp: playerHp,
      tilt: 0,
      hasShield: statsRef.current.shield,
    };

    let bullets: any[] = [];
    let enemyBullets: any[] = [];
    let enemies: any[] = [];
    let particles: Particle[] = [];
    let floatingTexts: FloatingText[] = [];

    // Paralaksowe tło
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
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, maxLife: Math.random() * 25 + 10,
          color, size: Math.random() * (isPlayer ? 5 : 3) + 2,
          rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.2
        });
      }
    };

    const addFloatingText = (x: number, y: number, text: string, color: string) => {
      floatingTexts.push({ x, y, text, color, life: 1, maxLife: 30 });
    };

    // Zbalansowane skalowanie
    let isBossWave = wave % 5 === 0;
    let enemiesToSpawn = isBossWave ? 1 : Math.min(25, 4 + Math.floor(wave * 1.5));
    let spawnedCount = 0;
    const hpMultiplier = 1 + (wave * 0.25);

    const spawnInterval = setInterval(() => {
      if (spawnedCount >= enemiesToSpawn) {
        clearInterval(spawnInterval);
        return;
      }

      if (isBossWave) {
        enemies.push({
          type: 'BOSS',
          x: canvas.width / 2, y: -50, startX: canvas.width / 2, startY: 150,
          radius: 45,
          hp: 800 * hpMultiplier, maxHp: 800 * hpMultiplier,
          color: '#ff1a4a', time: 0, shootCooldown: 0,
        });
      } else {
        const types = ['SCOUT', 'FIGHTER', 'DREADNOUGHT'];
        const rand = Math.random();
        const type = rand < 0.5 ? 'SCOUT' : (rand < 0.85 ? 'FIGHTER' : 'DREADNOUGHT');
        
        enemies.push({
          type,
          x: Math.random() * (canvas.width - 100) + 50, y: -40,
          startX: Math.random() * (canvas.width - 100) + 50, startY: Math.random() * 150 + 50,
          radius: type === 'DREADNOUGHT' ? 28 : (type === 'FIGHTER' ? 20 : 15),
          hp: (type === 'DREADNOUGHT' ? 120 : (type === 'FIGHTER' ? 45 : 25)) * hpMultiplier,
          maxHp: (type === 'DREADNOUGHT' ? 120 : (type === 'FIGHTER' ? 45 : 25)) * hpMultiplier,
          color: type === 'SCOUT' ? '#00e5ff' : type === 'FIGHTER' ? '#ffaa00' : '#b026ff',
          time: Math.random() * 100, shootCooldown: Math.random() * 30,
        });
      }
      spawnedCount++;
    }, Math.max(600, 1200 - wave * 50));

    const loop = (timestamp: number) => {
      // Tło
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gwiazdy
      ctx.fillStyle = '#ffffff';
      [starsLayer1, starsLayer2].forEach((layer, index) => {
        ctx.globalAlpha = index === 0 ? 0.3 : 0.6;
        layer.forEach((star) => {
          star.y += star.speed;
          if (star.y > canvas.height) star.y = 0;
          ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
        });
      });
      ctx.globalAlpha = 1;

      // Płynny ruch gracza
      const dx = pointerX - player.x;
      const dy = pointerY - player.y;
      player.x += dx * 0.15;
      player.y += dy * 0.15;
      
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
            bullets.push({ x: player.x, y: player.y - player.radius, vx: Math.sin(angle) * 12, vy: -Math.cos(angle) * 12, damage: currentDamage * 0.7, type: 'spread' });
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

      // RYSOWANIE STATKU GRACZA
      ctx.save();
      ctx.translate(player.x, player.y);
      
      // Tarcza
      if (player.hasShield) {
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.rotate(player.tilt);

      // Płomienie
      const flameHeight = 15 + Math.random() * 10;
      ctx.fillStyle = '#00f0ff';
      ctx.shadowBlur = 15; ctx.shadowColor = '#00f0ff';
      ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(0, 12 + flameHeight); ctx.lineTo(8, 12); ctx.fill();
      ctx.shadowBlur = 0;

      // Skrzydła
      const gradWing = ctx.createLinearGradient(0, -20, 0, 20);
      gradWing.addColorStop(0, '#2a2a35'); gradWing.addColorStop(1, '#11111a');
      ctx.fillStyle = gradWing; ctx.strokeStyle = '#444455'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(25, 15); ctx.lineTo(10, 15); ctx.lineTo(0, 10); ctx.lineTo(-10, 15); ctx.lineTo(-25, 15); ctx.closePath();
      ctx.fill(); ctx.stroke();

      // Kadłub
      const gradBody = ctx.createLinearGradient(0, -25, 0, 15);
      gradBody.addColorStop(0, '#00d4ff'); gradBody.addColorStop(1, '#0055ff');
      ctx.fillStyle = gradBody;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(8, 5); ctx.lineTo(0, 18); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fill();

      // Kokpit
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(0, -5, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Drony
      const droneCount = statsRef.current.drones;
      if (droneCount > 0) {
        const orbitRadius = 45;
        const orbitSpeed = timestamp * 0.002;
        for (let i = 0; i < droneCount; i++) {
          const angle = orbitSpeed + (i * (Math.PI * 2) / droneCount);
          const dx = Math.cos(angle) * orbitRadius;
          const dy = Math.sin(angle) * orbitRadius;
          const droneX = player.x + dx;
          const droneY = player.y + dy;

          ctx.fillStyle = '#00ff88';
          ctx.shadowBlur = 10; ctx.shadowColor = '#00ff88';
          ctx.beginPath(); ctx.arc(droneX, droneY, 4, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;

          if (timestamp - lastDroneShot > 800) {
            bullets.push({ x: droneX, y: droneY, vx: 0, vy: -12, damage: currentDamage * 0.5, type: 'drone' });
          }
        }
        if (timestamp - lastDroneShot > 800) lastDroneShot = timestamp;
      }

      // Rysowanie Pocisków Gracza
      bullets.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy;
        ctx.save(); ctx.translate(b.x, b.y);
        if (b.type === 'plasma') {
          ctx.fillStyle = '#a200ff'; ctx.shadowBlur = 15; ctx.shadowColor = '#d000ff';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else if (b.type === 'drone') {
          ctx.fillStyle = '#00ff88'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#00ffff'; ctx.shadowBlur = 8; ctx.shadowColor = '#00ffff';
          const angle = Math.atan2(b.vy, b.vx) + Math.PI/2; ctx.rotate(angle); ctx.fillRect(-2, -8, 4, 16);
        }
        ctx.restore();
        if (b.y < -20 || b.x < -20 || b.x > canvas.width + 20) bullets.splice(i, 1);
      });

      // Zaktualizowana Sztuczna Inteligencja
      const enemyFireModifier = Math.max(0.5, 1 - (wave * 0.05)); // Szybsze strzelanie wroga z czasem

      enemies.forEach((enemy, ei) => {
        enemy.time += 0.02;

        if (enemy.type === 'BOSS') {
          if (enemy.y < enemy.startY) {
            enemy.y += 1.5;
          } else {
            enemy.x = enemy.startX + Math.sin(enemy.time * 1.5) * 120;
            enemy.y = enemy.startY + Math.sin(enemy.time * 3) * 30;
            enemy.shootCooldown++;
            if (enemy.shootCooldown > 45 * enemyFireModifier) {
               enemyBullets.push({ x: enemy.x, y: enemy.y + 30, vx: 0, vy: 6, radius: 6, color: '#ff1a4a' });
               enemyBullets.push({ x: enemy.x - 20, y: enemy.y + 30, vx: -2.5, vy: 5, radius: 4, color: '#ff1a4a' });
               enemyBullets.push({ x: enemy.x + 20, y: enemy.y + 30, vx: 2.5, vy: 5, radius: 4, color: '#ff1a4a' });
               enemy.shootCooldown = 0;
            }
          }
        } else if (enemy.type === 'SCOUT') {
          enemy.y += 3;
          enemy.x = enemy.startX + Math.sin(enemy.time * 4) * 50;
          // Zabezpieczenie przed ucieczką za ekran (teleportacja naprawiona)
          if (enemy.y > canvas.height + 50) { 
            enemy.y = -50; 
            enemy.startX = Math.random() * (canvas.width - 60) + 30; 
            enemy.time = 0; // Płynny reset
          }
        } else if (enemy.type === 'FIGHTER') {
          if (enemy.y < enemy.startY) {
            enemy.y += 2;
          } else {
            enemy.x = enemy.startX + Math.sin(enemy.time * 2) * 80;
            enemy.y = enemy.startY + Math.cos(enemy.time * 1.5) * 20;
            enemy.shootCooldown++;
            if (enemy.shootCooldown > 80 * enemyFireModifier) {
              const dx = player.x - enemy.x; const dy = player.y - enemy.y;
              const angle = Math.atan2(dy, dx);
              enemyBullets.push({ x: enemy.x, y: enemy.y + 10, vx: Math.cos(angle) * 4.5, vy: Math.sin(angle) * 4.5, radius: 4, color: '#ffaa00' });
              enemy.shootCooldown = 0;
            }
          }
        } else if (enemy.type === 'DREADNOUGHT') {
          enemy.y += 0.6;
          enemy.x = enemy.startX + Math.sin(enemy.time) * 30;
          enemy.shootCooldown++;
          if (enemy.shootCooldown > 100 * enemyFireModifier) {
            for(let i=0; i<5; i++) {
               const angle = (Math.PI/4) + (i * Math.PI/8);
               enemyBullets.push({ x: enemy.x, y: enemy.y + 20, vx: Math.cos(angle) * 3.5, vy: Math.sin(angle) * 3.5, radius: 5, color: '#b026ff' });
            }
            enemy.shootCooldown = 0;
          }
        }

        // Zatrzymanie wrogów w obszarze ekranu (żeby nie uciekali na boki)
        enemy.x = Math.max(enemy.radius, Math.min(canvas.width - enemy.radius, enemy.x));

        // RYSOWANIE WROGÓW
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.shadowBlur = 15; ctx.shadowColor = enemy.color;
        
        if (enemy.type === 'SCOUT') {
          ctx.fillStyle = enemy.color;
          ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(10, -10); ctx.lineTo(0, -5); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill();
        } else if (enemy.type === 'FIGHTER') {
          ctx.fillStyle = '#1e1e28'; ctx.strokeStyle = enemy.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(20, 0); ctx.lineTo(20, -10); ctx.lineTo(8, -5); ctx.lineTo(8, -15); ctx.lineTo(-8, -15); ctx.lineTo(-8, -5); ctx.lineTo(-20, -10); ctx.lineTo(-20, 0); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = enemy.color;
          ctx.beginPath(); ctx.arc(-14, -8, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(14, -8, 3, 0, Math.PI*2); ctx.fill();
        } else if (enemy.type === 'DREADNOUGHT') {
          ctx.fillStyle = '#15151c'; ctx.strokeStyle = enemy.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-15, 25); ctx.lineTo(15, 25); ctx.lineTo(25, 5); ctx.lineTo(15, -20); ctx.lineTo(-15, -20); ctx.lineTo(-25, 5); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = enemy.color; ctx.fillRect(-8, -10, 16, 20);
        } else if (enemy.type === 'BOSS') {
          ctx.fillStyle = '#1a0510'; ctx.strokeStyle = enemy.color; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.rotate(enemy.time * 2);
          ctx.fillStyle = enemy.color; ctx.fillRect(-15, -15, 30, 30);
        }
        ctx.restore();

        // Pasek HP Bossa / Dreadnoughta
        if (enemy.type === 'BOSS' || enemy.type === 'DREADNOUGHT') {
          const barW = enemy.radius * 2;
          const hpP = Math.max(0, enemy.hp / enemy.maxHp);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 12, barW, 4);
          ctx.fillStyle = enemy.color; ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 12, barW * hpP, 4);
        }

        // Kolizje Ciało-w-Ciało
        const distP = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distP < player.radius + enemy.radius - 5) {
           if (player.hasShield) {
              player.hasShield = false;
              statsRef.current.shield = false;
              playSound('explosion');
              addExplosion(player.x, player.y, '#00ffff', 20, true);
           } else {
              player.hp -= 20;
              setPlayerHp(Math.max(0, player.hp));
              playSound('hit');
              addExplosion(enemy.x, enemy.y, enemy.color, 15);
              if (player.hp <= 0) setGameState('GAMEOVER');
           }
           enemies.splice(ei, 1);
        }

        // Trafienia wroga pociskami
        bullets.forEach((b, bi) => {
          const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
          if (dist < enemy.radius + (b.type === 'plasma' ? 8 : 2)) {
            bullets.splice(bi, 1);
            
            // Obliczenia trafień krytycznych
            const isCrit = Math.random() < (permStats.critChance / 100);
            const finalDamage = isCrit ? b.damage * 2 : b.damage;
            enemy.hp -= finalDamage;
            
            addExplosion(b.x, b.y, b.type === 'plasma' ? '#a200ff' : '#00ffff', 3);
            if (isCrit) addFloatingText(enemy.x, enemy.y - 15, 'CRIT!', '#ff2a2a');

            if (enemy.hp <= 0) {
              playSound('explosion');
              addExplosion(enemy.x, enemy.y, enemy.color, enemy.type === 'BOSS' ? 40 : 15);
              enemies.splice(ei, 1);
              setScore((prev) => prev + (enemy.type === 'BOSS' ? 1000 : (enemy.type === 'DREADNOUGHT' ? 150 : 50)));
              
              const crystalDrop = (enemy.type === 'BOSS' ? 30 : (enemy.type === 'DREADNOUGHT' ? 5 : 1)) * permStats.crystalMultiplier;
              setCrystals((prev) => prev + Math.floor(crystalDrop));
            }
          }
        });
      });

      // Pociski Wrogów
      enemyBullets.forEach((eb, i) => {
        eb.x += eb.vx; eb.y += eb.vy;
        ctx.fillStyle = eb.color; ctx.shadowBlur = 10; ctx.shadowColor = eb.color;
        ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < player.radius - 2) {
          enemyBullets.splice(i, 1);
          if (player.hasShield) {
            player.hasShield = false;
            statsRef.current.shield = false;
            playSound('hit');
            addExplosion(player.x, player.y, '#00ffff', 10);
          } else {
            player.hp -= 15;
            setPlayerHp(Math.max(0, player.hp));
            playSound('hit');
            addExplosion(player.x, player.y, '#ff1a4a', 8, true);
            if (player.hp <= 0) setGameState('GAMEOVER');
          }
        }
        if (eb.y > canvas.height || eb.x < -20 || eb.x > canvas.width + 20) enemyBullets.splice(i, 1);
      });

      // Rysowanie cząsteczek
      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.rotation += p.rotSpeed; p.life -= 1 / p.maxLife;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
        if (p.life <= 0) particles.splice(i, 1);
      });

      // Pływający tekst (Floating Combat Text)
      floatingTexts.forEach((ft, i) => {
        ft.y -= 0.5; ft.life -= 1 / ft.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
        if (ft.life <= 0) floatingTexts.splice(i, 1);
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
      { id: 'dmg', title: 'Siła Ognia', desc: '+20 Obrażeń', color: 'from-orange-500 to-red-600', icon: '💥' },
      { id: 'rate', title: 'Chłodzenie', desc: 'Szybsze ataki o 15%', color: 'from-blue-400 to-indigo-600', icon: '⚡' },
      { id: 'heal', title: 'Naprawa Kadłuba', desc: 'Odzyskaj 50% HP', color: 'from-emerald-400 to-teal-600', icon: '🔧' },
      { id: 'shield', title: 'Tarcza Energetyczna', desc: 'Blokuje 1 trafienie', color: 'from-cyan-400 to-blue-500', icon: '🛡️' },
      { id: 'drone', title: 'Dron Bojowy', desc: 'Sojusznik ostrzeliwujący wroga', color: 'from-green-400 to-emerald-600', icon: '🛰️' },
      { id: 'plasma', title: 'Działo Plazmowe', desc: 'Zmień broń na potężną Plazmę', color: 'from-purple-500 to-fuchsia-600', icon: '🟣' },
      { id: 'multibarrel', title: 'Dodatkowa Lufa', desc: '+1 do ilości wystrzeliwanych pocisków', color: 'from-yellow-400 to-orange-500', icon: '🎰' },
    ];
    // Losuj 3 unikalne
    const shuffled = [...possibleUpgrades].sort(() => 0.5 - Math.random());
    setUpgradeCards(shuffled.slice(0, 3));
  };

  const applyCard = (id: string) => {
    playSound('powerup');
    if (id === 'dmg') statsRef.current.damageModifier += 20;
    if (id === 'rate') statsRef.current.fireRateModifier -= 30;
    if (id === 'heal') setPlayerHp(Math.min(permStats.baseHp, playerHp + permStats.baseHp * 0.5));
    if (id === 'shield') statsRef.current.shield = true;
    if (id === 'drone') statsRef.current.drones = Math.min(4, statsRef.current.drones + 1);
    if (id === 'plasma') statsRef.current.weapon = 'PLASMA';
    if (id === 'multibarrel') statsRef.current.bulletCount = Math.min(3, statsRef.current.bulletCount + 1);
    
    setGameState('PLAYING');
  };

  // --- SKLEP ---
  const buyPermUpgrade = (type: keyof PermanentStats, cost: number, amount: number) => {
    if (crystals >= cost) {
      playSound('buy');
      setCrystals(c => c - cost);
      setPermStats(prev => {
        const next = { ...prev };
        if (type === 'baseFireRate') next[type] -= amount; 
        else next[type] += amount;
        return next;
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#020205] flex flex-col items-center justify-center font-sans select-none overflow-hidden sm:p-6 text-slate-100">
      
      <div className="relative w-full max-w-[450px] h-[100vh] sm:h-[850px] bg-[#0a0a14] sm:rounded-[40px] border border-blue-900/30 overflow-hidden shadow-[0_0_100px_rgba(0,100,255,0.08)] flex flex-col">
        
        {/* === MENU GŁÓWNE === */}
        {gameState === 'MENU' && (
          <div className="w-full h-full flex flex-col items-center p-6 z-10 bg-gradient-to-br from-[#070714] via-[#0a0a20] to-[#020205] relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-screen pointer-events-none"></div>

            <div className="mt-12 text-center animate-pulse z-10">
              <span className="px-4 py-1.5 bg-cyan-950/40 text-cyan-400 text-[10px] font-bold rounded-full border border-cyan-800/50 tracking-[0.25em] uppercase backdrop-blur-md">
                Sector 7
              </span>
              <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-300 to-blue-700 mt-5 tracking-tighter drop-shadow-[0_0_30px_rgba(0,200,255,0.6)]">
                COSMO<br />BLAST
              </h1>
            </div>

            <div className="mt-8 mb-6 w-full flex items-center justify-center z-10">
               <div className="bg-[#0f1020]/80 border border-cyan-900/50 px-6 py-3 rounded-2xl backdrop-blur-xl shadow-2xl flex items-center gap-4 transition-transform hover:scale-105">
                  <span className="text-2xl drop-shadow-[0_0_15px_rgba(0,255,255,0.9)]">💎</span>
                  <span className="text-4xl font-black text-cyan-300 tracking-wider">{crystals}</span>
               </div>
            </div>

            {/* Sklep Permanentny */}
            <div className="w-full flex-1 bg-white/[0.01] border border-white/[0.03] rounded-3xl p-5 backdrop-blur-2xl flex flex-col gap-3 shadow-2xl z-10 overflow-y-auto custom-scrollbar">
              <h3 className="text-[11px] text-cyan-400 font-bold tracking-widest uppercase mb-1 border-b border-cyan-900/40 pb-2">Hangar Dowództwa</h3>
              
              {[
                { key: 'baseHp', label: 'Wzmocnienie Pancerza', desc: `Max HP: ${permStats.baseHp}`, cost: 20, bump: 20, limit: false },
                { key: 'baseDamage', label: 'Moduł Zniszczenia', desc: `Siła bazowa: ${permStats.baseDamage}`, cost: 30, bump: 5, limit: false },
                { key: 'baseFireRate', label: 'Chłodzenie Dział', desc: `Przerwa ataku: ${permStats.baseFireRate}ms`, cost: 40, bump: 20, limit: permStats.baseFireRate <= 100 },
                { key: 'critChance', label: 'Celownik Laserowy', desc: `Szansa Crit: ${permStats.critChance}%`, cost: 50, bump: 5, limit: permStats.critChance >= 50 },
                { key: 'crystalMultiplier', label: 'Ekstraktor Złomu', desc: `Mnożnik kryształów: x${permStats.crystalMultiplier.toFixed(1)}`, cost: 100, bump: 0.5, limit: permStats.crystalMultiplier >= 5 },
              ].map((upg, i) => (
                <div key={i} className="flex justify-between items-center bg-[#05050a]/60 p-3.5 rounded-2xl border border-white/[0.04] hover:bg-[#0a0a14] transition-colors">
                  <div>
                    <div className="text-sm font-bold text-slate-200">{upg.label}</div>
                    <div className="text-[10px] text-slate-500 font-medium tracking-wide">{upg.desc}</div>
                  </div>
                  <button 
                    onClick={() => buyPermUpgrade(upg.key as keyof PermanentStats, upg.cost, upg.bump)}
                    disabled={crystals < upg.cost || upg.limit}
                    className="bg-gradient-to-br from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 disabled:opacity-20 disabled:grayscale text-white text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(0,150,255,0.4)] active:scale-95"
                  >
                    {upg.limit ? 'MAX' : `${upg.cost} 💎`}
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                initAudio(); setScore(0); setWave(1);
                statsRef.current = { damageModifier: 0, fireRateModifier: 0, maxHp: permStats.baseHp, weapon: 'BLASTER', bulletCount: 1, drones: 0, shield: false };
                setPlayerHp(permStats.baseHp); setGameState('PLAYING');
              }}
              className="mt-6 w-full py-5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:brightness-125 text-white font-black rounded-3xl shadow-[0_0_40px_rgba(0,200,255,0.5)] text-xl tracking-[0.3em] active:scale-95 transition-all z-10"
            >
              START BATTLE
            </button>
          </div>
        )}

        {/* === EKRAN GRY / HUD === */}
        {gameState === 'PLAYING' && (
          <div className="relative w-full h-full">
            <div className="absolute top-5 left-5 right-5 flex justify-between items-start pointer-events-none z-10">
              <div className="bg-[#05050a]/80 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 shadow-2xl">
                <span className="text-slate-500 block text-[9px] font-bold tracking-[0.2em]">PUNKTY</span>
                <span className="text-slate-100 text-lg font-black tracking-wider">{score}</span>
              </div>
              <div className="bg-blue-950/80 backdrop-blur-xl px-6 py-2 rounded-2xl border border-blue-500/40 shadow-[0_0_30px_rgba(0,150,255,0.4)] text-center transform scale-110">
                <span className="text-blue-300 block text-[9px] font-bold tracking-[0.2em]">FALA</span>
                <span className="text-white text-2xl font-black">{wave}</span>
              </div>
              <div className="bg-[#05050a]/80 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 shadow-2xl text-right">
                <span className="text-slate-500 block text-[9px] font-bold tracking-[0.2em]">KRYSZTAŁY</span>
                <span className="text-cyan-400 text-lg font-black tracking-wider">💎 {crystals}</span>
              </div>
            </div>

            <div className="absolute bottom-8 left-6 right-6 pointer-events-none z-10">
              <div className="flex justify-between items-end text-[10px] font-bold tracking-[0.2em] mb-2 px-1">
                <span className="text-slate-400">INTEGRALNOŚĆ</span>
                <span className="text-white bg-black/50 px-2 py-0.5 rounded-md">{Math.ceil(playerHp)} / {permStats.baseHp}</span>
              </div>
              <div className="w-full h-4 bg-[#05050a]/90 rounded-full border border-white/10 overflow-hidden backdrop-blur-xl shadow-[0_0_20px_rgba(0,0,0,0.9)] relative">
                {/* Overlay Tarczy */}
                {statsRef.current.shield && (
                   <div className="absolute inset-0 bg-cyan-400/20 z-20 animate-pulse border border-cyan-400/50 rounded-full"></div>
                )}
                <div
                  className="h-full bg-gradient-to-r from-rose-600 via-orange-500 to-emerald-400 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(0, (playerHp / permStats.baseHp) * 100)}%` }}
                />
              </div>
            </div>

            <canvas ref={canvasRef} className="w-full h-full touch-none block" />
          </div>
        )}

        {/* === EKRAN WYBORU KARTY === */}
        {gameState === 'CARD_UPGRADE' && (
          <div className="absolute inset-0 p-6 flex flex-col justify-center items-center text-center z-30 bg-[#05050a]/95 backdrop-blur-2xl">
            <span className="text-[10px] text-cyan-500 font-black tracking-[0.4em] mb-3 animate-pulse">SEKTOR ZABEZPIECZONY</span>
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-10 drop-shadow-2xl">WYBIERZ ZASÓB</h2>

            <div className="w-full grid grid-cols-1 gap-4">
              {upgradeCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => applyCard(card.id)}
                  className={`w-full p-5 bg-gradient-to-r ${card.color} rounded-[24px] text-left flex items-center gap-5 transition-all active:scale-95 hover:scale-[1.02] shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/20`}
                >
                  <div className="text-4xl drop-shadow-lg bg-black/20 p-3 rounded-2xl border border-white/10">{card.icon}</div>
                  <div>
                    <div className="font-black text-white text-xl tracking-wide drop-shadow-md">{card.title}</div>
                    <div className="text-sm text-white/80 font-medium drop-shadow-sm mt-0.5">{card.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === GAME OVER === */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 p-6 flex flex-col justify-center items-center text-center z-30 bg-rose-950/95 backdrop-blur-2xl">
            <h2 className="text-6xl font-black text-rose-500 mb-2 tracking-widest drop-shadow-[0_0_40px_rgba(244,63,94,0.6)]">Zniszczony</h2>
            
            <div className="bg-[#05050a]/60 p-8 rounded-[32px] border border-rose-500/20 w-full mt-8 mb-10 backdrop-blur-xl shadow-2xl">
                <p className="text-rose-400/80 text-[10px] font-bold tracking-[0.3em] mb-2">PRZETRWANE FALE</p>
                <p className="text-white font-black text-4xl mb-6">{wave}</p>
                
                <div className="h-px w-full bg-gradient-to-r from-transparent via-rose-900 to-transparent mb-6"></div>

                <p className="text-rose-400/80 text-[10px] font-bold tracking-[0.3em] mb-2">PUNKTY KARIERY</p>
                <p className="text-white font-black text-5xl tracking-tighter drop-shadow-md">{score}</p>
            </div>

            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-5 bg-white text-rose-950 hover:bg-slate-200 font-black rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.4)] text-lg tracking-[0.25em] transition-all active:scale-95"
            >
              POWRÓT DO BAZY
            </button>
          </div>
        )}

      </div>
    </main>
  );
}