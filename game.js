/**
 * Vibe Clash
 * A small canvas fighter with keyboard and touch input.
 */

const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const getElement = (selector) => document.querySelector(selector);
const pressedKeys = new Set();

let width;
let height;
let pixelRatio;
let isRunning = false;
let previousFrameTime = 0;
let timeRemaining = 60;
let roundNumber = 1;
let playerWins = 0;
let opponentWins = 0;
let player;
let opponent;
let particles = [];
let callouts = [];
let screenShake = 0;
let soundEnabled = true;
let audioContext;

// ----- Setup ---------------------------------------------------------------

function resizeCanvas() {
  pixelRatio = window.devicePixelRatio || 1;
  width = canvas.clientWidth;
  height = canvas.clientHeight;

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function createFighter(x, side, name, colors) {
  return {
    x,
    y: height - 152,
    side,
    name,
    colors,
    health: 100,
    facing: side,
    state: 'idle',
    stateTime: 0,
    cooldown: 0,
    stun: 0,
    hitFlash: 0,
  };
}

function prepareRound() {
  player = createFighter(width * 0.27, 1, 'MAYA', ['#55eadb', '#8eecff', '#182b58']);
  opponent = createFighter(width * 0.73, -1, 'KAI', ['#ff69b8', '#ffd04e', '#59204e']);
  timeRemaining = 60;
  particles = [];
  callouts = [];

  getElement('#round-number').textContent = roundNumber;
  updateHud();
}

function startMatch() {
  roundNumber = 1;
  playerWins = 0;
  opponentWins = 0;
  prepareRound();

  isRunning = true;
  previousFrameTime = performance.now();
  getElement('#start-screen').classList.add('hidden');
  getElement('#result-screen').classList.add('hidden');
  playTone(380, 0.08, 0.03);
  requestAnimationFrame(gameLoop);
}

// ----- Main loop -----------------------------------------------------------

function gameLoop(currentTime) {
  if (!isRunning) return;

  const deltaTime = Math.min(0.034, (currentTime - previousFrameTime) / 1000);
  previousFrameTime = currentTime;

  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
  timeRemaining = Math.max(0, timeRemaining - deltaTime);

  if (timeRemaining === 0) {
    finishRound(player.health >= opponent.health ? player : opponent);
    return;
  }

  updateFighter(player, opponent, deltaTime, true);
  updateFighter(opponent, player, deltaTime, false);
  updateEffects(deltaTime);
  screenShake = Math.max(0, screenShake - deltaTime * 20);
  updateHud();
}

function updateFighter(fighter, rival, deltaTime, isPlayer) {
  fighter.cooldown = Math.max(0, fighter.cooldown - deltaTime);
  fighter.stun = Math.max(0, fighter.stun - deltaTime);
  fighter.hitFlash = Math.max(0, fighter.hitFlash - deltaTime);
  fighter.stateTime = Math.max(0, fighter.stateTime - deltaTime);

  if (fighter.stateTime === 0 && fighter.state !== 'idle') {
    fighter.state = 'idle';
  }

  if (fighter.stun > 0) return;

  const movementDirection = isPlayer
    ? getPlayerMovement()
    : getOpponentMovement(fighter, rival, deltaTime);

  if (fighter.state === 'idle' || fighter.state === 'block') {
    fighter.x += movementDirection * 220 * deltaTime;
  }

  fighter.x = Math.max(40, Math.min(width - 40, fighter.x));
  fighter.facing = rival.x > fighter.x ? 1 : -1;
  separateFighters();
}

function getPlayerMovement() {
  let direction = 0;

  if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) direction -= 1;
  if (pressedKeys.has('d') || pressedKeys.has('arrowright')) direction += 1;

  if (pressedKeys.has('l')) {
    player.state = 'block';
    player.stateTime = 0.08;
  }

  return direction;
}

function getOpponentMovement(fighter, rival, deltaTime) {
  const distance = rival.x - fighter.x;

  if (Math.abs(distance) > 105) {
    return Math.sign(distance);
  }

  if (fighter.cooldown <= 0 && Math.random() < deltaTime * 2.1) {
    attack(fighter, rival, Math.random() < 0.56 ? 'punch' : 'kick');
  }

  if (Math.abs(distance) < 110 && Math.random() < deltaTime * 0.35) {
    fighter.state = 'block';
    fighter.stateTime = 0.22;
  }

  return 0;
}

function separateFighters() {
  const gap = Math.abs(player.x - opponent.x);
  const minimumGap = 62;

  if (gap >= minimumGap) return;

  const push = (minimumGap - gap) / 2;
  player.x -= push * player.facing;
  opponent.x -= push * opponent.facing;
}

// ----- Combat --------------------------------------------------------------

function attack(attacker, defender, attackType) {
  if (attacker.cooldown > 0 || attacker.stun > 0 || attacker.state === 'block') return;

  const isKick = attackType === 'kick';
  attacker.state = attackType;
  attacker.stateTime = isKick ? 0.4 : 0.28;
  attacker.cooldown = isKick ? 0.48 : 0.34;
  playTone(isKick ? 170 : 230, 0.05, 0.025);

  window.setTimeout(() => {
    resolveAttack(attacker, defender, attackType);
  }, isKick ? 205 : 125);
}

function resolveAttack(attacker, defender, attackType) {
  const isKick = attackType === 'kick';
  const range = isKick ? 112 : 84;

  if (!isRunning || attacker.state !== attackType || Math.abs(attacker.x - defender.x) > range) {
    return;
  }

  const wasBlocked = defender.state === 'block';
  const baseDamage = isKick ? 13 : 8;
  const damage = baseDamage * (wasBlocked ? 0.24 : 1);

  defender.health = Math.max(0, defender.health - damage);
  defender.stun = wasBlocked ? 0.04 : 0.16;
  defender.hitFlash = 0.14;
  screenShake = wasBlocked ? 3 : 7;

  createHitEffect(attacker, defender, attackType, wasBlocked);
  playTone(wasBlocked ? 300 : 100, 0.11, 0.045, wasBlocked ? 'triangle' : 'sawtooth');

  if (defender.health <= 0) finishRound(attacker);
}

function createHitEffect(attacker, defender, attackType, wasBlocked) {
  const color = wasBlocked ? '#ffe16a' : '#fff4fb';
  const text = wasBlocked ? 'BLOCKED' : attackType === 'kick' ? 'SICK KICK!' : 'CLEAN!';

  createBurst(defender.x + attacker.facing * 18, defender.y - 55, color, wasBlocked ? 6 : 13);
  callouts.push({
    text,
    x: defender.x,
    y: defender.y - 115,
    life: 0.6,
    color: wasBlocked ? '#ffe16a' : '#fff',
  });
}

function finishRound(winner) {
  if (!isRunning) return;

  isRunning = false;

  if (winner === player) playerWins += 1;
  else opponentWins += 1;

  if (playerWins === 2 || opponentWins === 2) {
    window.setTimeout(() => showMatchResult(playerWins === 2), 550);
    return;
  }

  window.setTimeout(() => {
    roundNumber += 1;
    prepareRound();
    isRunning = true;
    previousFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  }, 900);
}

function showMatchResult(playerWon) {
  getElement('#result-label').textContent = playerWon
    ? 'MAIN CHARACTER ENERGY'
    : 'THE REMATCH AWAITS';
  getElement('#result-title').innerHTML = playerWon
    ? 'YOU<br><em>ATE.</em>'
    : 'NOT<br><em>YET.</em>';
  getElement('#result-copy').textContent = playerWon
    ? `You took it ${playerWins}–${opponentWins}. Screenshot-worthy.`
    : `Kai takes it ${opponentWins}–${playerWins}. One more?`;

  getElement('#result-screen').classList.remove('hidden');
  playTone(playerWon ? 600 : 130, 0.35, 0.06);
}

// ----- Effects and rendering ----------------------------------------------

function createBurst(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    particles.push({
      x,
      y,
      velocityX: (Math.random() - 0.5) * 260,
      velocityY: (Math.random() - 0.6) * 240,
      life: 0.45 + Math.random() * 0.3,
      color,
    });
  }
}

function updateEffects(deltaTime) {
  particles.forEach((particle) => {
    particle.x += particle.velocityX * deltaTime;
    particle.y += particle.velocityY * deltaTime;
    particle.velocityY += 500 * deltaTime;
    particle.life -= deltaTime;
  });

  callouts.forEach((callout) => {
    callout.y -= 34 * deltaTime;
    callout.life -= deltaTime;
  });

  particles = particles.filter((particle) => particle.life > 0);
  callouts = callouts.filter((callout) => callout.life > 0);
}

function draw() {
  context.save();
  context.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);

  drawStage();
  drawFighter(player);
  drawFighter(opponent);
  drawEffects();

  context.restore();
}

function drawStage() {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#1d0c42');
  sky.addColorStop(0.55, '#57205f');
  sky.addColorStop(1, '#13062a');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#ff85c8';
  context.globalAlpha = 0.22;
  context.beginPath();
  context.arc(width * 0.78, height * 0.26, 48, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  for (let index = 0; index < 18; index += 1) {
    const x = (index * 73) % width;
    const buildingHeight = 35 + ((index * 47) % 100);

    context.fillStyle = index % 2 ? '#22113f' : '#30124c';
    context.fillRect(x, height - 150 - buildingHeight, 55, buildingHeight);
  }

  context.fillStyle = '#1b0a33';
  context.fillRect(0, height - 152, width, 152);
  context.strokeStyle = '#ff5fba66';
  context.lineWidth = 2;

  for (let y = height - 130; y < height; y += 25) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + 20);
    context.stroke();
  }
}

function drawFighter(fighter) {
  const [mainColor, accentColor, darkColor] = fighter.colors;
  const armLength = fighter.state === 'punch' ? 35 : 10;
  const legLength = fighter.state === 'kick' ? 34 : 0;

  context.save();
  context.translate(fighter.x, fighter.y);
  context.scale(fighter.facing, 1);
  context.shadowBlur = fighter.hitFlash ? 22 : 7;
  context.shadowColor = fighter.hitFlash ? '#fff' : mainColor;

  context.fillStyle = darkColor;
  context.fillRect(-18, 78, 12, 35);
  context.fillRect(7, 78, 12 + legLength, 35);

  context.fillStyle = mainColor;
  context.fillRect(-20, 27, 40, 55);
  context.beginPath();
  context.arc(0, 10, 22, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#341735';
  context.fillRect(-16, 3, 32, 10);
  context.fillStyle = accentColor;
  context.fillRect(-28, 38, 16 + armLength, 10);
  context.fillRect(12, 42, 18, 10);
  context.fillStyle = '#fff5fb';
  context.fillRect(5, 11, 6, 4);
  context.fillStyle = '#ffcf45';
  context.fillRect(-8, 60, 16, 6);

  if (fighter.state === 'block') {
    context.strokeStyle = '#ffe86b';
    context.lineWidth = 5;
    context.beginPath();
    context.arc(20, 46, 30, -1.2, 1.2);
    context.stroke();
  }

  context.restore();
}

function drawEffects() {
  particles.forEach((particle) => {
    context.globalAlpha = Math.min(1, particle.life * 2);
    context.fillStyle = particle.color;
    context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
  });

  context.globalAlpha = 1;
  context.textAlign = 'center';
  context.font = '700 13px Syncopate';

  callouts.forEach((callout) => {
    context.globalAlpha = Math.min(1, callout.life * 2);
    context.fillStyle = callout.color;
    context.fillText(callout.text, callout.x, callout.y);
  });

  context.globalAlpha = 1;
}

// ----- UI, input, and audio ------------------------------------------------

function updateHud() {
  getElement('#p-health').style.width = `${player?.health ?? 100}%`;
  getElement('#e-health').style.width = `${opponent?.health ?? 100}%`;
  getElement('#timer').textContent = Math.ceil(timeRemaining);
  getElement('#p-score').textContent = String(playerWins).padStart(2, '0');
  getElement('#e-score').textContent = String(opponentWins).padStart(2, '0');
  getElement('#p-wins').textContent = '●'.repeat(playerWins) + '○'.repeat(2 - playerWins);
  getElement('#e-wins').textContent = '○'.repeat(2 - opponentWins) + '●'.repeat(opponentWins);
}

function playTone(frequency, duration, volume, wave = 'sine') {
  if (!soundEnabled) return;

  if (!audioContext) {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    audioContext = new AudioEngine();
  }

  if (audioContext.state === 'suspended') audioContext.resume();

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(now + duration + 0.02);
}

function handleKeyDown(key) {
  const normalizedKey = key.toLowerCase();
  pressedKeys.add(normalizedKey);

  if (!isRunning) return;
  if (normalizedKey === 'j') attack(player, opponent, 'punch');
  if (normalizedKey === 'k') attack(player, opponent, 'kick');
}

window.addEventListener('keydown', (event) => {
  const gameKeys = ['a', 'd', 'j', 'k', 'l', 'arrowleft', 'arrowright'];

  if (gameKeys.includes(event.key.toLowerCase())) event.preventDefault();
  handleKeyDown(event.key);
});

window.addEventListener('keyup', (event) => {
  pressedKeys.delete(event.key.toLowerCase());
});

document.querySelectorAll('[data-key]').forEach((button) => {
  const key = button.dataset.key;

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handleKeyDown(key);
  });

  ['pointerup', 'pointerleave'].forEach((eventName) => {
    button.addEventListener(eventName, () => pressedKeys.delete(key));
  });
});

getElement('#play').addEventListener('click', startMatch);
getElement('#retry').addEventListener('click', startMatch);

getElement('#sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  getElement('#sound').textContent = soundEnabled ? '♫ ON' : '♫ OFF';

  if (soundEnabled) playTone(440, 0.08, 0.03);
});

getElement('#share').addEventListener('click', async () => {
  const text = `I just went ${playerWins}–${opponentWins} in Vibe Clash. Catch me in the arena.`;

  try {
    await navigator.share({ title: 'Vibe Clash', text });
  } catch {
    await navigator.clipboard?.writeText(text);
    getElement('#share').textContent = 'COPIED TO CLIPBOARD';
  }
});

window.addEventListener('resize', () => {
  resizeCanvas();
  if (player) prepareRound();
  draw();
});

resizeCanvas();
prepareRound();
draw();
