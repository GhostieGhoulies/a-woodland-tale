const {
  test, expect, startGame, state, frames, placeObstacle, traceFrames,
} = require('./helpers/game');

const LOW = ['log', 'briar', 'puddle', 'fence'];
const HIGH = ['bird', 'branch'];
// Starting pace, the 1,250-foot skip pace, and a much later run pace.
const PACES = [0, 4, 11].map(level => ({
  label: `speed level ${level}`, speed: 3.5 * 1.1 ** level,
}));

async function setup(page, speed) {
  await startGame(page);
  await page.evaluate(speed => {
    gameSpeed = speed;
    nextSpeedUpAt = Infinity;
  }, speed);
  const initial = await state(page);
  expect(initial.companion).toBeNull();
  expect(initial.invincible).toBe(false);
}

async function centerObstacle(page, type, centerAhead) {
  await placeObstacle(page, type, centerAhead);
  await page.evaluate(() => { obstacles[0].x -= obstacles[0].w / 2; });
}

function expectCleared(trace) {
  expect(trace.length).toBeGreaterThan(0);
  expect(trace.every(frame => frame.gameState === 'PLAYING')).toBe(true);
  // Prove we actually traversed the hazard, rather than stopping before it.
  expect(trace.some(frame => frame.obstacleRight !== null &&
    frame.obstacleRight < frame.playerLeft)).toBe(true);
  expect(trace.every(frame => !frame.companion && !frame.invincible)).toBe(true);
}

for (const { label, speed } of PACES) {
  for (const type of LOW) {
    test(`${label}: a normal jump clears ${type} and lands`, async ({ page }) => {
      await setup(page, speed);
      // The quick rise still reaches its apex after ~73.5 world pixels.
      // The slower descent now extends total normal jump travel to ~220.5.
      await centerObstacle(page, type, 73.5);
      await page.keyboard.press('Space');
      const trace = await traceFrames(page, 90);
      expectCleared(trace);
      expect(trace.some(frame => !frame.grounded)).toBe(true);
      expect(trace.at(-1).grounded).toBe(true);
      expect(Math.max(...trace.map(frame => frame.lift))).toBeLessThanOrEqual(54.001);
    });

    test(`${label}: extra hang time clears a later ${type} that a single jump cannot`, async ({ page }) => {
      await setup(page, speed);
      await centerObstacle(page, type, 260);
      await page.keyboard.press('Space');
      await frames(page, Math.ceil(20 / speed));
      await page.keyboard.press('Space');
      const trace = await traceFrames(page, 150);
      expect(trace[0].extended).toBe(true);
      expectCleared(trace);
      expect(trace.at(-1).grounded).toBe(true);
      expect(Math.max(...trace.map(frame => frame.lift))).toBeLessThanOrEqual(54.001);

      // Same scene and launch position, without the second input: no spare
      // life or power-up can hide a collision after the normal jump ends.
      await page.reload();
      await setup(page, speed);
      await centerObstacle(page, type, 260);
      await page.keyboard.press('Space');
      const single = await traceFrames(page, 150);
      expect(single.at(-1).gameState).toBe('GAMEOVER');
      expect(single.every(frame => !frame.extended)).toBe(true);
      expect(single.at(-1).companion).toBe(false);
      await expect(page.locator('#gameOverScreen')).toBeVisible();
    });
  }

  for (const type of HIGH) {
    test(`${label}: ducking clears ${type} then returns to standing`, async ({ page }) => {
      await setup(page, speed);
      await centerObstacle(page, type, 100);
      await page.keyboard.press('ArrowDown');
      const trace = await traceFrames(page, 80);
      expect(trace[0].ducking).toBe(true);
      expectCleared(trace);
      expect(trace.at(-1).ducking).toBe(false);
      expect(trace.every(frame => frame.grounded)).toBe(true);
    });

    for (const extended of [false, true]) {
      test(`${label}: ${extended ? 'extended' : 'normal'} jump cannot bypass overhead ${type}`, async ({ page }) => {
        await setup(page, speed);
        await centerObstacle(page, type, extended ? 147 : 73.5);
        await page.keyboard.press('Space');
        if (extended) {
          await frames(page, Math.ceil(20 / speed));
          await page.keyboard.press('Space');
        }
        const trace = await traceFrames(page, 110);
        expect(trace.at(-1).gameState).toBe('GAMEOVER');
        expect(trace.at(-1).grounded).toBe(false);
        expect(trace.at(-1).companion).toBe(false);
        expect(Math.max(...trace.map(frame => frame.lift))).toBeLessThanOrEqual(54.001);
      });
    }
  }

  for (const type of [...LOW, ...HIGH]) {
    test(`${label}: running straight into ${type} ends an unprotected run at contact`, async ({ page }) => {
      await setup(page, speed);
      await placeObstacle(page, type, 200);
      // Player right edge is x+14, padded obstacle left is obs.x+5.
      // Strict overlap starts only once travel exceeds 200 - (14 - 5).
      const contactFrame = Math.floor(191 / speed) + 1;
      const before = await traceFrames(page, contactFrame - 1);
      expect(before.every(frame => frame.gameState === 'PLAYING')).toBe(true);
      const [hit] = await traceFrames(page, 1);
      expect(hit.gameState).toBe('GAMEOVER');
      expect(hit.companion).toBe(false);
      expect(hit.invincible).toBe(false);
      await expect(page.locator('#gameOverScreen')).toBeVisible();
    });
  }

  for (const type of LOW) {
    test(`${label}: ducking does not protect against low ${type}`, async ({ page }) => {
      await setup(page, speed);
      await centerObstacle(page, type, 100);
      await page.keyboard.press('ArrowDown');
      const trace = await traceFrames(page, 40);
      expect(trace.at(-1).gameState).toBe('GAMEOVER');
      expect(trace.at(-1).ducking).toBe(true);
      expect(trace.at(-1).companion).toBe(false);
    });
  }
}

test('a 300-foot speed increase preserves jump clearance and accelerates its animation', async ({ page }) => {
  await setup(page, 3.5);
  await page.evaluate(() => { distanceFeet = 299; nextSpeedUpAt = 300; });
  await centerObstacle(page, 'fence', 73.5);
  await page.keyboard.press('Space');
  const trace = await traceFrames(page, 90);
  expectCleared(trace);
  expect(trace[0].speed).toBe(3.5);
  expect(trace[1].speed).toBe(3.5);
  expect(trace[2].speed).toBeCloseTo(3.85);
  expect(trace.findIndex(frame => frame.grounded)).toBeLessThan(62);
  expect(trace.at(-1).grounded).toBe(true);
});

test('collision timing uses the new speed on the frame a 300-foot milestone is crossed', async ({ page }) => {
  await setup(page, 3.5);
  await page.evaluate(() => { distanceFeet = 299; nextSpeedUpAt = 300; });
  await placeObstacle(page, 'log', 200);
  // Independent numeric oracle, using the requested 10% per 300 feet.
  let distance = 299, speed = 3.5, travel = 0, contactFrame = 0;
  while (travel <= 191) {
    distance += speed * 0.03 * 3.28084;
    if (speed === 3.5 && distance >= 300) speed *= 1.1;
    travel += speed;
    contactFrame++;
  }
  const trace = await traceFrames(page, contactFrame + 2);
  expect(trace).toHaveLength(contactFrame);
  expect(trace.slice(0, -1).every(frame => frame.gameState === 'PLAYING')).toBe(true);
  expect(trace.at(-1).gameState).toBe('GAMEOVER');
  expect(trace.at(-1).speed).toBeCloseTo(3.85);
});

test.describe('phone-sized picket fence clearance', () => {
  test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true });
  for (const [feet, speed] of [[0, 3.5], [750, 3.5 * 1.1 ** 2], [1250, 3.5 * 1.1 ** 4]]) {
    for (const lead of [64, 73.5, 82, 100, 110, 120]) {
      test(`${feet}-foot pace: a tap clears a fence with ${lead}px lead`, async ({ page }) => {
        await setup(page, speed);
        await centerObstacle(page, 'fence', lead);
        await page.touchscreen.tap(200, 400);
        const trace = await traceFrames(page, 110);
        expectCleared(trace);
        expect(Math.max(...trace.map(frame => frame.lift))).toBeGreaterThan(53);
        expect(trace.at(-1).grounded).toBe(true);
      });
    }
  }
});

for (const { label, speed } of PACES) {
  for (const type of HIGH) {
    test(`${label}: duck expiry waits until the trailing edge of ${type} is clear`, async ({ page }) => {
      await setup(page, speed);
      await placeObstacle(page, type, speed * 72);
      await page.keyboard.press('ArrowDown');
      const during = await traceFrames(page, 72);
      expect(during.at(-1).ducking).toBe(true);
      expect(during.at(-1).gameState).toBe('PLAYING');
      expect(during.at(-1).obstacleRight).toBeGreaterThan(during.at(-1).playerLeft);
      const after = await traceFrames(page, 50);
      expectCleared([...during, ...after]);
      expect(after.at(-1).ducking).toBe(false);
    });
  }
}

test('jump rises promptly but descends more gradually without increasing its height', async ({ page }) => {
  await setup(page, 3.5);
  await page.keyboard.press('Space');
  const trace = await traceFrames(page, 65);
  expect(trace[20].lift).toBeCloseTo(54);
  expect(trace[41].grounded).toBe(false); // Previously landed here.
  expect(trace[41].lift).toBeGreaterThan(30);
  expect(trace[62].grounded).toBe(true);
  expect(Math.max(...trace.map(frame => frame.lift))).toBeLessThanOrEqual(54.001);
});
