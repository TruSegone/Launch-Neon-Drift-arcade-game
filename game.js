/**
 * Neon Drift
 * A dependency-free, touch-friendly arcade game.
 */

// ----- DOM references -------------------------------------------------------

const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const getElement = (selector) => document.querySelector(selector);

const scoreElement = getElement('#score');
const bestElement = getElement('#best');
const comboElement = getElement('#combo');
const startScreen = getElement('#start-screen');
const gameOverScreen = getElement('#game-over');
const soundButton = getElement('#sound');

// ----- Game state -----------------------------------------------------------

let width;
let height;
let pixelRatio;
let isRunning = false;
let previousFrameTime = 0;
let score = 0;
let combo = 1;
let spawnTimer = 0;
let soundEnabled = true;
let player;
let items = [];
let particles = [];

let bestScore = Number(localStorage.neonDriftBest || 0);
bestElement.textContent = formatScore(bestScore);

// ----- Setup ----------------------------------------------------------------

function resizeCanvas() {
	pixelRatio = window.devicePixelRatio || 1;
	width = canvas.clientWidth;
	height = canvas.clientHeight;

	canvas.width = width * pixelRatio;
	canvas.height = height * pixelRatio;
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function resetGame() {
	score = 0;
	combo = 1;
	spawnTimer = 0;
	items = [];
	particles = [];

	player = {
		x: width / 2,
		y: height * 0.76,
		radius: 15,
		targetX: width / 2,
		trail: [],
	};

	updateHud();
}

function startGame() {
	resetGame();
	isRunning = true;
	previousFrameTime = performance.now();

	startScreen.classList.add('hidden');
	gameOverScreen.classList.add('hidden');
	requestAnimationFrame(gameLoop);
}

function endGame() {
	isRunning = false;
	bestScore = Math.max(bestScore, Math.floor(score));
	localStorage.neonDriftBest = bestScore;

	bestElement.textContent = formatScore(bestScore);
	getElement('#final-score').textContent = Math.floor(score).toLocaleString();
	getElement('#run-note').textContent =
		score > bestScore * 0.8
			? 'That was clean. Can you beat it?'
			: 'The void always wants another lap.';

	gameOverScreen.classList.remove('hidden');
	vibrate([35, 30, 70]);
}

// ----- Updates --------------------------------------------------------------

function gameLoop(currentTime) {
	if (!isRunning) return;

	// Keep the game stable when a paused browser tab resumes.
	const deltaTime = Math.min(0.035, (currentTime - previousFrameTime) / 1000);
	previousFrameTime = currentTime;

	update(deltaTime);
	draw();
	requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
	movePlayer(deltaTime);
	updateItems(deltaTime);
	updateParticles(deltaTime);
	updateHud();
}

function movePlayer(deltaTime) {
	const smoothing = Math.min(1, deltaTime * 10);
	player.x += (player.targetX - player.x) * smoothing;

	player.trail.unshift({ x: player.x, y: player.y });
	player.trail.length = 12;
	score += deltaTime * 10 * combo;
}

function updateItems(deltaTime) {
	spawnTimer -= deltaTime;

	if (spawnTimer <= 0) {
		// Item frequency increases gradually as a run goes on.
		spawnTimer = 0.43 - Math.min(score / 2500, 0.18);
		spawnItem();
	}

	items.forEach((item) => {
		item.y += item.speed * deltaTime;
		item.rotation += deltaTime * 5;
	});

	items = items.filter((item) => {
		if (item.y >= height + 50) return false;
		if (!hasCollided(player, item)) return true;

		if (item.isEnergy) {
			score += 25 * combo;
			combo = Math.min(9, combo + 1);
			createBurst(item.x, item.y, '#43f1cf');
			vibrate(18);
			return false; // Remove collected energy immediately.
		}

		createBurst(item.x, item.y, '#ff5d7e', 18);
		endGame();
		return false;
	});
}

function updateParticles(deltaTime) {
	particles.forEach((particle) => {
		particle.x += particle.velocityX * deltaTime;
		particle.y += particle.velocityY * deltaTime;
		particle.life -= deltaTime;
	});

	particles = particles.filter((particle) => particle.life > 0);
}

function spawnItem() {
	const isEnergy = Math.random() > 0.33;

	items.push({
		x: 35 + Math.random() * (width - 70),
		y: -35,
		radius: isEnergy ? 10 : 14,
		isEnergy,
		speed: 170 + Math.min(score, 700) * 0.12,
		rotation: Math.random() * 6,
	});
}

function createBurst(x, y, color, amount = 10) {
	for (let index = 0; index < amount; index += 1) {
		particles.push({
			x,
			y,
			velocityX: (Math.random() - 0.5) * 180,
			velocityY: (Math.random() - 0.5) * 180,
			life: 1,
			color,
		});
	}
}

// ----- Rendering ------------------------------------------------------------

function draw() {
	context.clearRect(0, 0, width, height);
	drawBackground();
	drawTrail();
	items.forEach(drawItem);
	particles.forEach(drawParticle);
	drawPlayer();
}

function drawBackground() {
	context.fillStyle = '#071225';
	context.fillRect(0, 0, width, height);

	for (let index = 0; index < 24; index += 1) {
		const lineY = (index * 83 + score * 9) % (height + 80) - 40;
		context.strokeStyle = 'rgba(51, 130, 207, 0.12)';
		context.beginPath();
		context.moveTo(0, lineY);
		context.lineTo(width, lineY + height * 0.08);
		context.stroke();
	}
}

function drawTrail() {
	player.trail.forEach((point, index) => {
		context.beginPath();
		context.fillStyle = `rgba(67, 241, 207, ${0.18 - index * 0.013})`;
		context.arc(point.x, point.y, Math.max(1, 13 - index), 0, Math.PI * 2);
		context.fill();
	});
}

function drawItem(item) {
	context.save();
	context.translate(item.x, item.y);
	context.rotate(item.rotation);
	context.fillStyle = item.isEnergy ? '#43f1cf' : '#ff5d7e';
	context.shadowBlur = 18;
	context.shadowColor = context.fillStyle;
	context.beginPath();

	if (item.isEnergy) {
		context.moveTo(0, -item.radius);
		context.lineTo(item.radius, 0);
		context.lineTo(0, item.radius);
		context.lineTo(-item.radius, 0);
	} else {
		context.moveTo(0, -item.radius);
		context.lineTo(item.radius * 0.86, item.radius * 0.5);
		context.lineTo(-item.radius * 0.86, item.radius * 0.5);
	}

	context.closePath();
	context.fill();
	context.restore();
}

function drawParticle(particle) {
	context.globalAlpha = particle.life;
	context.fillStyle = particle.color;
	context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
	context.globalAlpha = 1;
}

function drawPlayer() {
	context.save();
	context.translate(player.x, player.y);
	context.fillStyle = '#eefaff';
	context.shadowBlur = 24;
	context.shadowColor = '#43f1cf';
	context.beginPath();
	context.moveTo(0, -19);
	context.lineTo(14, 15);
	context.lineTo(0, 9);
	context.lineTo(-14, 15);
	context.closePath();
	context.fill();
	context.fillStyle = '#43f1cf';
	context.fillRect(-3, -4, 6, 13);
	context.restore();
}

// ----- Input and UI ---------------------------------------------------------

function steer(pointerX) {
	if (!isRunning) return;

	player.targetX = Math.max(20, Math.min(width - 20, pointerX));
}

function updateHud() {
	scoreElement.textContent = formatScore(Math.floor(score));
	comboElement.textContent = `x${combo}`;
}

function formatScore(value) {
	return String(value).padStart(6, '0');
}

function hasCollided(first, second) {
	return Math.hypot(first.x - second.x, first.y - second.y) < first.radius + second.radius;
}

function vibrate(pattern) {
	if (soundEnabled && navigator.vibrate) navigator.vibrate(pattern);
}

canvas.addEventListener('pointerdown', (event) => {
	canvas.setPointerCapture(event.pointerId);
	steer(event.clientX - canvas.getBoundingClientRect().left);
});

canvas.addEventListener('pointermove', (event) => {
	if (event.buttons) steer(event.clientX - canvas.getBoundingClientRect().left);
});

getElement('#play').addEventListener('click', startGame);
getElement('#retry').addEventListener('click', startGame);

soundButton.addEventListener('click', () => {
	soundEnabled = !soundEnabled;
	soundButton.textContent = soundEnabled ? '◖))' : '◖×';
});

getElement('#share').addEventListener('click', async () => {
	const shareText = `I scored ${Math.floor(score)} in Neon Drift. Can you outrun the void?`;

	try {
		await navigator.share({ title: 'Neon Drift', text: shareText, url: location.href });
	} catch {
		await navigator.clipboard?.writeText(`${shareText} ${location.href}`);
		getElement('#share').textContent = 'SCORE COPIED';
	}
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
draw();
