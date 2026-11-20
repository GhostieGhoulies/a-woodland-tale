const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Stop automatic animation only. Tests advance the production update()
    // explicitly, so CPU load and wall-clock timing cannot alter the outcome.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('/');
    await page.evaluate(() => { audioMuted = true; });
    await use(page);
    expect(errors, 'uncaught game errors').toEqual([]);
  },
});

async function startGame(page, character = 'mac') {
  await page.locator('#storyNext').click();
  await page.locator('#storyNext').click();
  await page.locator('#storyNext').click();
  await page.locator(`.char-card[onclick="selectCharacter('${character}')"]`).click();
  await expect(page.locator('#instructions')).toContainText('1,000 feet');
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 1,000 ft');
  await page.keyboard.press('Space');
  // Random obstacles and collectibles are irrelevant to isolated physics tests. Disable
  // their scheduling, but retain the actual physics and collision pipeline.
  await page.evaluate(() => {
    nextSpawnTimer = Infinity;
    nextCarrotAtFeet = Infinity;
    nextAppleAtFeet = Infinity;
    nextGreenAppleAtFeet = Infinity;
    apples = [];
  });
}

async function state(page) {
  return page.evaluate(() => ({
    gameState, distanceFeet, gameSpeed, soloStartFeet, trailDistance,
    trailLength: playerTrail.length,
    companion: companion ? structuredClone(companion) : null,
    obstacles: structuredClone(obstacles),
    player: structuredClone(player),
    invincible: isInvincible(),
  }));
}

async function frames(page, count = 1) {
  await page.evaluate(count => { for (let i = 0; i < count; i++) update(); }, count);
}

// Walk actual frames to either side of an externally specified boundary.
// Do not read COMPANION_SOLO_FEET: a wrong production threshold must fail.
async function crossBoundary(page, target) {
  return page.evaluate(target => {
    let steps = 0;
    while (distanceFeet + gameSpeed * 0.03 * 3.28084 < target) {
      update();
      if (++steps > 50000 || gameState !== 'PLAYING') throw new Error('Boundary not reached');
      if (companion) throw new Error(`Companion spawned early at ${distanceFeet} ft`);
    }
    const before = { distance: distanceFeet, companion, hud: document.getElementById('companionStatus').textContent };
    update();
    return {
      before,
      after: { distance: distanceFeet, companion: structuredClone(companion) },
    };
  }, target);
}

async function acquireCompanion(page) {
  await crossBoundary(page, 1000);
  expect((await state(page)).companion).not.toBeNull();
  await page.evaluate(() => {
    gameSpeed = 7.5;
    nextSpeedUpAt = Infinity;
  });
}

async function collide(page, type = 'log') {
  await placeObstacle(page, type, (await state(page)).gameSpeed - 10);
  await frames(page);
}

// Keep production obstacle dimensions and hitboxes: only choose its type and
// starting position. offset is the obstacle's left edge relative to the player.
async function placeObstacle(page, type, offset) {
  await page.evaluate(({ type, offset }) => {
    const types = ['log', 'briar', 'puddle', 'fence', 'bird', 'branch'];
    if (!types.includes(type)) throw new Error(`Unknown obstacle: ${type}`);
    const random = Math.random;
    const count = obstacles.length;
    try {
      Math.random = () => (types.indexOf(type) + 0.1) / types.length;
      spawnObstacle();
    } finally {
      Math.random = random;
    }
    if (obstacles.length !== count + 1) throw new Error('Obstacle spawn was blocked');
    obstacles.at(-1).x = player.x + offset;
  }, { type, offset });
}

// Record every production physics step, including the first lethal frame.
async function traceFrames(page, count) {
  return page.evaluate(count => {
    const trace = [];
    for (let frame = 1; frame <= count && gameState === 'PLAYING'; frame++) {
      update();
      trace.push({
        frame, gameState, speed: gameSpeed, distance: distanceFeet,
        lift: groundY - 22 - player.y,
        grounded: player.isGrounded, ducking: player.isDucking,
        extended: player.hasExtendedJump,
        obstacleX: obstacles[0]?.x ?? null,
        obstacleRight: obstacles[0] ? obstacles[0].x + obstacles[0].w : null,
        playerLeft: player.x - 14,
        companion: companion !== null, invincible: isInvincible(),
      });
    }
    return trace;
  }, count);
}

module.exports = {
  test, expect, startGame, state, frames, crossBoundary, acquireCompanion,
  collide, placeObstacle, traceFrames,
};
