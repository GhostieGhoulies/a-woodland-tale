const { test, expect, startGame, state } = require('./helpers/game');

// Drive the real animation callback with controlled display timestamps.
// Freeze only drawing for these clock tests; physics/collisions remain real.
async function clockScene(page) {
  await startGame(page);
  await page.evaluate(() => {
    drawStaticBackground = drawForestFloor = drawCharacter = () => {};
    drawObstacles = drawCarrots = drawApples = () => {};
    resetFrameClock();
    loop(0);
  });
}

for (const hz of [30, 60, 90, 120, 144]) {
  test(`${hz} Hz preserves real-time distance and 300-foot speed progression`, async ({ page }) => {
    await clockScene(page);
    const result = await page.evaluate(hz => {
      const firstFrame = frameCount;
      for (let i = 1; i <= hz * 20; i++) loop(i * 1000 / hz);
      return { steps: frameCount - firstFrame, distanceFeet, gameSpeed, nextSpeedUpAt };
    }, hz);
    // Independent 60-Hz oracle, with the reduced 3.5 starting pace and
    // exactly 10% increases per 300 feet, not constants read from production.
    let distance = 0, speed = 3.5, threshold = 300;
    for (let step = 0; step < 1200; step++) {
      distance += speed * 0.03 * 3.28084;
      while (distance >= threshold) { speed *= 1.1; threshold += 300; }
    }
    expect(result.steps).toBe(1200);
    expect(result.distanceFeet).toBeCloseTo(distance, 6);
    expect(result.gameSpeed).toBeCloseTo(speed, 6);
    expect(result.nextSpeedUpAt).toBe(threshold);
  });

  test(`${hz} Hz keeps normal jump duration consistent in seconds`, async ({ page }) => {
    await clockScene(page);
    await page.keyboard.press('Space');
    const landedAt = await page.evaluate(hz => {
      for (let frame = 1; frame <= hz * 2; frame++) {
        loop(frame * 1000 / hz);
        if (player.isGrounded) return frame * 1000 / hz;
      }
      throw new Error('Jump never landed');
    }, hz);
    expect(landedAt).toBeGreaterThanOrEqual(63 * 1000 / 60 - 0.001);
    expect(landedAt).toBeLessThanOrEqual(63 * 1000 / 60 + 1000 / hz + 0.001);
  });
}

test('irregular display frames still produce 60 physics steps per second', async ({ page }) => {
  await clockScene(page);
  const result = await page.evaluate(() => {
    const firstFrame = frameCount;
    const gaps = [4, 8, 22, 35, 11, 20]; // 100 ms total
    let now = 0;
    for (let cycle = 0; cycle < 20; cycle++) {
      for (const gap of gaps) { now += gap; loop(now); }
    }
    return { steps: frameCount - firstFrame, distanceFeet };
  });
  expect(result.steps).toBe(120);
  expect(result.distanceFeet).toBeCloseTo(41.338584, 6);
});

test('returning from a background tab does not fast-forward the run', async ({ page }) => {
  await clockScene(page);
  await page.evaluate(() => loop(1000 / 60));
  const before = await state(page);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    loop(60000);
  });
  expect((await state(page)).distanceFeet).toBe(before.distanceFeet);
  await page.evaluate(() => loop(60000 + 1000 / 60));
  expect((await state(page)).distanceFeet - before.distanceFeet).toBeCloseTo(0.3444882, 6);
});

test('a long stalled frame has bounded catch-up, not seconds of instant movement', async ({ page }) => {
  await clockScene(page);
  const result = await page.evaluate(() => {
    const before = frameCount;
    loop(10000);
    return { steps: frameCount - before, distanceFeet };
  });
  expect(result.steps).toBe(6);
  expect(result.distanceFeet).toBeCloseTo(2.0669292, 6);
});
