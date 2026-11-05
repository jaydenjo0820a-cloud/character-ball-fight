(() => {
  'use strict';

  const characters = [
    { id: 'flare', name: '플레어', title: 'THE SPARK', color: '#ff8b55', shadow: '#ff8b5544', halo: '#fff0e8', face: '✦', description: '불꽃처럼 빠르게 움직이는 기본형 캐릭터예요.', detail: '빠른 이동으로 경기장을 넓게 누비며 상대에게 먼저 접근합니다. 충돌 피해에 더해 강한 파이어 펄스로 큰 피해를 노리는 공격형 볼입니다.', skills: [{ id: 'fire-pulse', name: '파이어 펄스', description: '몸에서 불꽃 파동을 터뜨려 상대에게 추가 피해를 줍니다.', damage: 42, weight: 100, sound: 'flare' }], speed: 1.08 },
    { id: 'frost', name: '프로스트', title: 'THE COMET', color: '#6287f5', shadow: '#6287f544', halo: '#edf1ff', face: '✳', description: '침착하게 궤도를 유지하는 기본형 캐릭터예요.', detail: '안정적인 움직임으로 충돌 기회를 꾸준히 만듭니다. 아이스 버스트가 자주 발동해 상대의 체력을 차근차근 깎는 균형형 볼입니다.', skills: [{ id: 'ice-burst', name: '아이스 버스트', description: '차가운 충격파를 발산해 상대에게 추가 피해를 줍니다.', damage: 36, weight: 100, sound: 'frost' }], speed: .96 },
    { id: 'air-purifier', name: '공기청정기', title: 'THE CLEAN AIR', color: '#56bfe9', shadow: '#56bfe944', halo: '#e9f8ff', image: 'assets/air-purifier-circle.png', description: '공기를 빨아들이고 깨끗한 바람을 내보내는 공기청정기예요.', detail: '매초 공기를 빨아들여 상대에게 8 피해를 주고, 15초마다 공기를 내보내 자신을 50 회복시키며 상대에게 100 피해를 줍니다.', passive: { name: '공기 흡입', description: '1초마다 공기를 빨아들여 상대에게 8 피해를 줍니다.', damage: 8, interval: 1, sound: 'purifier-passive' }, skills: [{ id: 'air-release', name: '공기 내보내기', description: '자신은 50 회복하고 상대에게 100 피해를 줍니다.', damage: 100, heal: 50, cooldown: 15, icon: 'dust', weight: 100, sound: 'purifier-skill' }], speed: .96 }
  ];

  const state = { picks: [null, null], running: false, ended: false, fighters: [], lastTime: 0, elapsed: 0, collisionLock: false, raf: 0, particles: [], skills: [], lastSkill: [0, 0], speedMultiplier: 1, soundEnabled: true };
  const canvas = document.querySelector('#arena');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('#arena-frame');
  const overlay = document.querySelector('#arena-overlay');
  const startButton = document.querySelector('#start-button');
  const dialog = document.querySelector('#character-dialog');
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const purifierSounds = { passive: new Audio('assets/purifier-passive.wav'), skill: new Audio('assets/purifier-skill.wav') };
  purifierSounds.passive.volume = .28; purifierSounds.passive.preload = 'auto';
  purifierSounds.skill.volume = .48; purifierSounds.skill.preload = 'auto';
  let audioContext = null;
  let lastBounceSound = 0;
  const characterImages = new Map();

  function getCharacterImage(char) {
    if (!char.image) return null;
    if (!characterImages.has(char.id)) { const image = new Image(); image.onload = () => drawIdle(); image.src = char.image; characterImages.set(char.id, image); }
    return characterImages.get(char.id);
  }

  function abilityIcon(kind) {
    if (kind === 'wind') return '<img src="assets/wind-glyph.svg" alt="바람" draggable="false">';
    if (kind === 'dust') return '<img src="assets/dust-gust.png" alt="먼지바람" draggable="false">';
    return '<span aria-hidden="true">✦</span>';
  }

  function unlockAudio() {
    if (!state.soundEnabled) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (error) {
      audioContext = null;
    }
  }

  function playBounceSound() {
    if (!state.soundEnabled || !audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if (audioContext.state !== 'running') return;
    const now = audioContext.currentTime;
    if (now - lastBounceSound < .06) return;
    lastBounceSound = now;
    const osc = audioContext.createOscillator(), body = audioContext.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(310, now); osc.frequency.exponentialRampToValueAtTime(95, now + .07);
    body.gain.setValueAtTime(.0001, now); body.gain.exponentialRampToValueAtTime(.42, now + .003); body.gain.exponentialRampToValueAtTime(.0001, now + .09);
    osc.connect(body); body.connect(audioContext.destination); osc.start(now); osc.stop(now + .095);
    const samples = Math.max(1, Math.floor(audioContext.sampleRate * .025));
    const buffer = audioContext.createBuffer(1, samples, audioContext.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
    const snap = audioContext.createBufferSource(), highpass = audioContext.createBiquadFilter(), snapGain = audioContext.createGain();
    snap.buffer = buffer; highpass.type = 'highpass'; highpass.frequency.value = 650;
    snapGain.gain.setValueAtTime(.55, now); snapGain.gain.exponentialRampToValueAtTime(.001, now + .026);
    snap.connect(highpass); highpass.connect(snapGain); snapGain.connect(audioContext.destination); snap.start(now);
  }

  function playSkillSound(characterId) {
    if (!state.soundEnabled || !audioContext || audioContext.state !== 'running') return;
    const now = audioContext.currentTime;
    if (characterId === 'flare') {
      const osc = audioContext.createOscillator(), filter = audioContext.createBiquadFilter(), gain = audioContext.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(680, now); osc.frequency.exponentialRampToValueAtTime(115, now + .24);
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(1400, now); filter.frequency.exponentialRampToValueAtTime(260, now + .24);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.24, now + .015); gain.gain.exponentialRampToValueAtTime(.0001, now + .26);
      osc.connect(filter); filter.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + .27);
    } else {
      [1046.5, 1568, 2093].forEach((frequency, index) => {
        const start = now + index * .055, osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.13, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
        osc.connect(gain); gain.connect(audioContext.destination); osc.start(start); osc.stop(start + .17);
      });
    }
  }

  function playPurifierSound(kind) {
    if (!state.soundEnabled) return;
    const sound = purifierSounds[kind === 'purifier-passive' ? 'passive' : 'skill'];
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function resizeCanvas() {
    const rect = frame.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIdle();
  }

  function previewMarkup(char, small = false) {
    return `<div class="ball-preview ${char.image ? 'has-image' : ''}" style="--ball-color:${char.color};--ball-shadow:${char.shadow}">${char.image ? `<img src="${char.image}" alt="${char.name}" draggable="false">` : `<span class="ball-face">${char.face}</span>`}</div>`;
  }

  function renderSlots() {
    state.picks.forEach((pick, index) => {
      const slot = document.querySelector(`#slot-${index + 1}`);
      const status = document.querySelector(`#status-${index + 1}`);
      slot.innerHTML = `<div class="character-list">${characters.map(char => `<button class="character-option ${pick?.id === char.id ? 'selected' : ''}" data-player="${index}" data-character="${char.id}" aria-pressed="${pick?.id === char.id}"><span class="option-ball ${char.image ? 'has-image' : ''}" style="--ball-color:${char.color}">${char.image ? `<img src="${char.image}" alt="" draggable="false">` : `<span class="option-face">${char.face}</span>`}</span><span class="option-name">${char.name}</span><span class="option-skill">${char.skills.map(skill => skill.name).join(' · ')}</span><span class="option-check">${pick?.id === char.id ? '✓' : ''}</span></button>`).join('')}</div>`;
      status.innerHTML = pick ? `<span class="status-dot" style="background:${pick.color}"></span> ${pick.name} 선택됨` : '<span class="status-dot"></span> 캐릭터를 선택하세요';
    });
    document.querySelectorAll('.character-option').forEach(button => button.addEventListener('click', () => chooseCharacter(Number(button.dataset.player), button.dataset.character)));
    startButton.disabled = state.picks.some(p => !p) || state.running;
    renderCharacterDetails();
  }

  function renderCharacterDetails() {
    const grid = document.querySelector('#detail-grid');
    if (!grid) return;
    grid.innerHTML = characters.map((char, index) => {
      const selectedBy = state.picks.map((pick, player) => pick?.id === char.id ? `P${player + 1}` : '').filter(Boolean).join(' · ');
      return `<article class="detail-card" style="--detail-color:${char.color};--detail-halo:${char.halo}">
        <div class="detail-card-top"><div class="detail-ball ${char.image ? 'has-image' : ''}">${char.image ? `<img src="${char.image}" alt="${char.name}" draggable="false">` : char.face}</div><div class="detail-name"><span>${char.title}</span><h3>${char.name}</h3></div><span class="detail-selected">${selectedBy || '기본 캐릭터'}</span></div>
        <p class="detail-description">${char.detail}</p>
        <div class="detail-stats"><div><span>체력</span><b>500 HP</b></div><div><span>충돌 피해</span><b>20</b></div><div><span>최대 스킬 피해</span><b>${Math.max(...char.skills.map(skill => skill.damage))}</b></div><div><span>이동 속도</span><b>${char.speed.toFixed(2)}×</b></div></div>
        ${char.passive ? `<div class="detail-skill"><span class="detail-skill-symbol">${abilityIcon('wind')}</span><div><small>패시브 · ${char.passive.interval}초마다</small><strong>${char.passive.name}</strong><p>${char.passive.description}</p></div></div>` : ''}
        ${char.skills.map(skill => `<div class="detail-skill"><span class="detail-skill-symbol">${abilityIcon(skill.icon)}</span><div><small>자동 스킬 · 쿨타임 ${skill.cooldown || 4}초 · 선택 확률 ${Math.round(skill.weight / char.skills.reduce((sum, item) => sum + item.weight, 0) * 100)}%</small><strong>${skill.name}</strong><p>${skill.description}</p></div></div>`).join('')}
      </article>`;
    }).join('');
  }

  function chooseCharacter(player, id) {
    if (state.running) return;
    state.picks[player] = characters.find(char => char.id === id);
    renderSlots();
    drawIdle();
  }

  function selectSkill(char) {
    const skills = char.skills.filter(skill => Number(skill.weight) > 0);
    if (!skills.length) return null;
    const totalWeight = skills.reduce((sum, skill) => sum + Number(skill.weight), 0);
    let roll = Math.random() * totalWeight;
    for (const skill of skills) {
      roll -= Number(skill.weight);
      if (roll < 0) return skill;
    }
    return skills[skills.length - 1];
  }

  function showDetails(player) {
    const char = state.picks[player] || characters[player];
    document.querySelector('#dialog-art').innerHTML = previewMarkup(char);
    document.querySelector('#dialog-art').style.setProperty('--ball-halo', char.halo);
    document.querySelector('#dialog-kicker').textContent = `${player === 0 ? 'PLAYER ONE' : 'PLAYER TWO'} · ${char.title}`;
    document.querySelector('#dialog-title').textContent = char.name;
    document.querySelector('#dialog-description').textContent = char.description;
    document.querySelector('#dialog-attack').textContent = Math.max(...char.skills.map(skill => skill.damage));
    document.querySelector('#dialog-skill').textContent = char.skills.map(skill => skill.name).join(' / ');
    document.querySelector('#dialog-skill-description').textContent = `${char.passive ? `패시브: ${char.passive.description} ` : ''}${char.skills.map(skill => `${skill.name} (쿨타임 ${skill.cooldown || 4}초): ${skill.description}`).join(' · ')}`;
    document.querySelector('.skill-card small').textContent = `자동 스킬 · 쿨타임 ${Math.max(...char.skills.map(skill => skill.cooldown || 4))}초`;
    document.querySelector('.skill-icon').innerHTML = abilityIcon(char.skills[0]?.icon);
    dialog.showModal();
  }

  document.querySelectorAll('.more-button').forEach(button => button.addEventListener('click', () => showDetails(Number(button.dataset.player) - 1)));
  document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  function drawBall(x, y, radius, char, angle = 0, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha;
    const portrait = getCharacterImage(char);
    if (portrait?.complete && portrait.naturalWidth) {
      ctx.shadowColor = '#56bfe966'; ctx.shadowBlur = radius * .25;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius * .9, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(portrait, x - radius * .9, y - radius * .9, radius * 1.8, radius * 1.8); ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, radius * .98, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, radius * .09); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.shadowColor = char.shadow; ctx.shadowBlur = radius * .45;
    const gradient = ctx.createRadialGradient(x - radius * .35, y - radius * .4, radius * .08, x, y, radius);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.2, char.color); gradient.addColorStop(1, shade(char.color, -.2));
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = gradient; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(x - radius * .28, y - radius * .34, radius * .28, radius * .13, -.55, 0, Math.PI * 2); ctx.fillStyle = '#ffffffa8'; ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#252321'; ctx.font = `800 ${radius * .46}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(char.face, 0, 1); ctx.restore(); ctx.restore();
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
    return `rgb(${clamp(Math.round(r * (1 + amount)), 0, 255)},${clamp(Math.round(g * (1 + amount)), 0, 255)},${clamp(Math.round(b * (1 + amount)), 0, 255)})`;
  }

  function drawIdle() {
    const width = frame.clientWidth, height = frame.clientHeight;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    if (state.running || state.ended) return;
    const size = Math.min(width, height), r = size * .075;
    const left = state.picks[0], right = state.picks[1];
    if (left && right) {
      drawBall(width * .43, height * .49, r, left, -.4);
      drawBall(width * .57, height * .51, r, right, .3);
    } else if (left || right) {
      drawBall(width * (left ? .43 : .57), height * .5, r, left || right, .1);
    } else {
      drawBall(width * .43, height * .49, r, characters[0], -.4, .24);
      drawBall(width * .57, height * .51, r, characters[1], .3, .24);
    }
  }

  function startGame() {
    if (state.picks.some(p => !p) || state.running) return;
    unlockAudio();
    document.querySelector('.winner-banner')?.remove();
    state.running = true; state.ended = false; state.elapsed = 0; state.lastTime = 0; state.collisionLock = false; state.particles = []; state.skills = []; state.lastSkill = [0, 0];
    const rect = frame.getBoundingClientRect(); const size = Math.min(rect.width, rect.height); const radius = size * .055;
    state.fighters = state.picks.map((char, i) => ({ char, hp: 500, x: rect.width * (i === 0 ? .40 : .60), y: rect.height * (i === 0 ? .44 : .56), vx: (i === 0 ? 1 : -1) * char.speed * size * .38, vy: (Math.random() * .6 + .25) * (Math.random() < .5 ? -1 : 1) * size * .38 * char.speed, r: radius, angle: 0, cooldown: char.skills[0]?.cooldown || 4, passiveTimer: char.passive?.interval || 0, damageFlash: 0 }));
    document.querySelectorAll('.fighter-panel').forEach(panel => { panel.classList.add('in-battle'); panel.innerHTML = ''; });
    state.fighters.forEach((fighter, i) => { const cooldown = fighter.char.skills[0]?.cooldown || 4; document.querySelector(`.fighter-panel-${i === 0 ? 'left' : 'right'}`).innerHTML = `<div class="panel-heading"><span class="player-tag ${i === 0 ? 'p1-tag' : 'p2-tag'}">P${i + 1}</span><span>PLAYER ${i === 0 ? 'ONE' : 'TWO'}</span><span class="battle-state" id="state-${i}" style="margin-left:auto">FIGHTING</span></div><div class="battle-bars"><div class="battle-person">${previewMarkup(fighter.char)}<h3>${fighter.char.name}</h3><div class="subname">${fighter.char.title}</div></div><div class="bar-caption"><span>HP</span><span class="hp-number" id="hp-number-${i}">500 / 500</span></div><div class="hp-track"><div class="hp-fill" id="hp-fill-${i}"></div></div><div class="bar-caption"><span>SKILL COOLDOWN</span><span id="cool-label-${i}">${cooldown.toFixed(1)}s</span></div><div class="cooldown-track"><div class="cooldown-fill" id="cool-fill-${i}"></div></div><div class="skill-name">${fighter.char.skills.map(skill => skill.name).join(' / ')}</div><div class="skill-sub">${fighter.char.passive ? '패시브 가동 중 · ' : ''}쿨타임 종료 시 스킬 ${fighter.char.skills.length === 1 ? '확정 발동' : '중 하나 발동'}</div></div>`; });
    startButton.querySelector('span:first-child').textContent = '대전 중'; startButton.disabled = true;
    document.querySelector('#arena-state').textContent = 'BATTLE IN PROGRESS';
    overlay.classList.add('hidden');
    document.querySelector('#arena-count').textContent = 'LIVE · 00:00';
    drawHud();
    state.raf = requestAnimationFrame(tick);
  }

  function drawHud() {
    let hud = document.querySelector('.battle-hud');
    if (!hud) { hud = document.createElement('div'); hud.className = 'battle-hud'; frame.append(hud); }
    hud.innerHTML = `<span class="hud-chip">P1 · ${state.fighters[0].char.name}</span><span class="hud-chip" id="timer-chip">00:00</span><span class="hud-chip">P2 · ${state.fighters[1].char.name}</span>`;
  }

  function tick(time) {
    if (!state.running) return;
    if (!state.lastTime) state.lastTime = time;
    const dt = Math.min((time - state.lastTime) / 1000, .04) * state.speedMultiplier; state.lastTime = time; state.elapsed += dt;
    const width = frame.clientWidth, height = frame.clientHeight;
    const min = Math.min(width, height), margin = min * .085;
    const [a, b] = state.fighters;
    [a, b].forEach((fighter, i) => {
      fighter.x += fighter.vx * dt; fighter.y += fighter.vy * dt; fighter.angle += dt * (i ? -1.3 : 1.5); fighter.cooldown -= dt; fighter.damageFlash = Math.max(0, fighter.damageFlash - dt);
      if (fighter.char.passive) {
        fighter.passiveTimer -= dt;
        while (fighter.passiveTimer <= 0) { fighter.passiveTimer += fighter.char.passive.interval; takeDamage(1 - i, fighter.char.passive.damage, fighter.char.name); burst(state.fighters[1 - i].x, state.fighters[1 - i].y, '#8bdfff', 5); playPurifierSound(fighter.char.passive.sound); }
      }
      if (fighter.x < margin + fighter.r) { fighter.x = margin + fighter.r; fighter.vx = Math.abs(fighter.vx); playBounceSound(); }
      if (fighter.x > width - margin - fighter.r) { fighter.x = width - margin - fighter.r; fighter.vx = -Math.abs(fighter.vx); playBounceSound(); }
      if (fighter.y < margin + fighter.r) { fighter.y = margin + fighter.r; fighter.vy = Math.abs(fighter.vy); playBounceSound(); }
      if (fighter.y > height - margin - fighter.r) { fighter.y = height - margin - fighter.r; fighter.vy = -Math.abs(fighter.vy); playBounceSound(); }
      if (fighter.cooldown <= 0) { castSkill(i); fighter.cooldown = fighter.char.skills[0]?.cooldown || 4; }
      updateBars(fighter, i);
    });
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1, minDistance = a.r + b.r;
    if (distance < minDistance) {
      const nx = dx / distance, ny = dy / distance;
      const overlap = minDistance - distance;
      a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2;
      if (!state.collisionLock) {
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) { a.vx -= rel * nx; a.vy -= rel * ny; b.vx += rel * nx; b.vy += rel * ny; }
        // A small normal impulse plus perpendicular kick makes the head-on bounce visibly read as a right-angle deflection.
        const kick = min * .10; a.vy += (ny >= 0 ? -kick : kick); b.vy += (ny >= 0 ? kick : -kick);
        takeDamage(0, 20); takeDamage(1, 20); burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#d4c4ff'); state.collisionLock = true;
        playBounceSound();
      }
    } else state.collisionLock = false;
    state.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }); state.particles = state.particles.filter(p => p.life > 0);
    state.skills.forEach(s => { s.life -= dt; }); state.skills = state.skills.filter(s => s.life > 0);
    renderFrame(width, height);
    const secs = Math.floor(state.elapsed), clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    document.querySelector('#arena-count').textContent = `LIVE · ${clock}`;
    document.querySelector('#timer-chip').textContent = clock;
    if (a.hp <= 0 || b.hp <= 0) { finishGame(a.hp > b.hp ? 0 : 1); return; }
    state.raf = requestAnimationFrame(tick);
  }

  function updateBars(fighter, i) {
    const hp = Math.max(0, fighter.hp), fill = document.querySelector(`#hp-fill-${i}`), num = document.querySelector(`#hp-number-${i}`);
    fill.style.width = `${hp / 5}%`; fill.classList.toggle('damage', hp < 250); num.textContent = `${hp} / 500`;
    document.querySelector(`#cool-fill-${i}`).style.width = `${(1 - fighter.cooldown / (fighter.char.skills[0]?.cooldown || 4)) * 100}%`;
    document.querySelector(`#cool-label-${i}`).textContent = `${Math.max(0, fighter.cooldown).toFixed(1)}s`;
  }

  function takeDamage(index, amount, sourceName = '') {
    const fighter = state.fighters[index]; fighter.hp = Math.max(0, fighter.hp - amount); fighter.damageFlash = .25;
    if (amount > 20 || sourceName) floatText(fighter.x, fighter.y + fighter.r + 20, `-${amount} HP${sourceName ? ` · ${sourceName}` : ''}`, fighter.char.color);
  }

  function heal(index, amount) {
    const fighter = state.fighters[index], healed = Math.min(amount, 500 - fighter.hp);
    fighter.hp += healed;
    if (healed > 0) floatText(fighter.x, fighter.y - fighter.r - 20, `+${healed} HP`, '#45ae79');
  }

  function castSkill(index) {
    const attacker = state.fighters[index], target = state.fighters[1 - index];
    const skill = selectSkill(attacker.char);
    if (!skill) return;
    if (skill.sound === 'purifier-skill') playPurifierSound(skill.sound); else playSkillSound(skill.sound || attacker.char.id);
    attacker.cooldown = skill.cooldown || 4; state.lastSkill[index] = state.elapsed;
    if (skill.heal) heal(index, skill.heal);
    takeDamage(1 - index, skill.damage, attacker.char.name); burst(target.x, target.y, attacker.char.color, 22);
    if (skill.icon === 'dust') showDustBurst(target.x, target.y);
    floatText(attacker.x, attacker.y - attacker.r - 34, skill.name, attacker.char.color);
    document.querySelector(`#state-${index}`).textContent = 'SKILL!';
    setTimeout(() => { const label = document.querySelector(`#state-${index}`); if (label && state.running) label.textContent = 'FIGHTING'; }, 750);
  }

  function floatText(x, y, text, color) {
    const el = document.createElement('div'); el.className = 'skill-pop'; el.textContent = text; el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.color = text.includes('HP') ? '#fff' : color; frame.append(el); setTimeout(() => el.remove(), 1250);
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 90; state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .25 + Math.random() * .45, max: .7, color, r: 1.5 + Math.random() * 3 }); }
  }

  function showDustBurst(x, y) {
    const image = document.createElement('img'); image.className = 'dust-gust-burst'; image.src = 'assets/dust-gust.png'; image.alt = '';
    image.style.left = `${x}px`; image.style.top = `${y}px`; frame.append(image);
    setTimeout(() => image.remove(), 900);
  }

  function renderFrame(width, height) {
    ctx.clearRect(0, 0, width, height);
    state.particles.forEach(p => { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
    state.fighters.forEach(f => { if (f.damageFlash > 0) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.42, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,90,90,${f.damageFlash * .48})`; ctx.fill(); } drawBall(f.x, f.y, f.r, f.char, f.angle); });
  }

  function finishGame(winnerIndex) {
    state.running = false; state.ended = true; cancelAnimationFrame(state.raf);
    document.querySelector('#arena-state').textContent = 'MATCH COMPLETE';
    document.querySelector('#arena-count').textContent = 'FINAL · 00:00';
    document.querySelector(`#state-${winnerIndex}`).textContent = 'WINNER';
    const banner = document.createElement('div'); banner.className = 'winner-banner'; banner.innerHTML = `<small>VICTORY</small><strong>${state.fighters[winnerIndex].char.name} 승리!</strong>`; frame.append(banner);
    startButton.querySelector('span:first-child').textContent = '다시 대전'; startButton.disabled = false;
  }

  function resetGame() {
    state.running = false; state.ended = false; cancelAnimationFrame(state.raf); state.fighters = []; state.particles = []; state.skills = [];
    document.querySelector('.battle-hud')?.remove(); document.querySelector('.winner-banner')?.remove(); document.querySelectorAll('.skill-pop').forEach(el => el.remove());
    document.querySelectorAll('.fighter-panel').forEach(panel => { panel.classList.remove('in-battle'); });
    document.querySelector('.fighter-panel-left').innerHTML = '<div class="panel-heading"><span class="player-tag p1-tag">P1</span><span>PLAYER ONE</span><button class="more-button" data-player="1" aria-label="플레이어 1 캐릭터 정보 보기">···</button></div><div class="selection-slot" id="slot-1"></div><div class="active-status" id="status-1"></div>';
    document.querySelector('.fighter-panel-right').innerHTML = '<div class="panel-heading"><span class="player-tag p2-tag">P2</span><span>PLAYER TWO</span><button class="more-button" data-player="2" aria-label="플레이어 2 캐릭터 정보 보기">···</button></div><div class="selection-slot" id="slot-2"></div><div class="active-status" id="status-2"></div>';
    state.picks = [null, null]; startButton.querySelector('span:first-child').textContent = '대전 시작';
    document.querySelector('#arena-state').textContent = 'READY TO FIGHT'; document.querySelector('#arena-count').textContent = 'ARENA 01'; overlay.classList.remove('hidden');
    bindMoreButtons(); renderSlots(); drawIdle();
  }

  function bindMoreButtons() { document.querySelectorAll('.more-button').forEach(button => button.addEventListener('click', () => showDetails(Number(button.dataset.player) - 1))); }
  startButton.addEventListener('click', () => startGame());
  const speedButton = document.querySelector('#speed-button');
  speedButton.addEventListener('click', () => {
    state.speedMultiplier = state.speedMultiplier === 1 ? 2 : 1;
    speedButton.textContent = `속도 ${state.speedMultiplier}×`;
    speedButton.setAttribute('aria-pressed', String(state.speedMultiplier === 2));
  });
  const soundButton = document.querySelector('#sound-button');
  soundButton.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    soundButton.textContent = state.soundEnabled ? '소리 켬' : '소리 끔';
    soundButton.setAttribute('aria-label', state.soundEnabled ? '효과음 끄기' : '효과음 켜기');
    soundButton.setAttribute('aria-pressed', String(state.soundEnabled));
    if (state.soundEnabled) unlockAudio();
  });
  document.querySelector('#reset-button').addEventListener('click', resetGame);
  window.addEventListener('resize', resizeCanvas);
  renderSlots(); resizeCanvas();
})();
