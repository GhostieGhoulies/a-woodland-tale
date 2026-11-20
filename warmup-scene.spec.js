const { test, expect } = require('./helpers/game');

async function openSelection(page) {
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
}

async function pauseClock(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}

test('carrot appears at the marked spot to the right of Sebastian and leaves the apple in place', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openSelection(page);
  const carrot = await page.locator('#prepCarrotButton').boundingBox();
  const apple = await page.locator('#partyAppleButton').boundingBox();
  const squirrel = await page.locator(`.char-card[onclick="selectCharacter('sebal')"]`).boundingBox();
  expect(carrot.x).toBeGreaterThan(squirrel.x + squirrel.width);
  expect(carrot.x + carrot.width).toBeLessThan(402);
  expect(Math.abs(carrot.y - squirrel.y)).toBeLessThan(8);
  expect(carrot.width).toBeGreaterThanOrEqual(44);
  expect(apple.x + apple.width).toBeLessThan(squirrel.x);
});

test('celebration lasts exactly ten seconds and returns automatically to selection', async ({ page }) => {
  await openSelection(page);
  await pauseClock(page);
  await page.getByRole('button', { name: 'Open finish-line celebration' }).click();
  expect(await page.evaluate(() => gameState)).toBe('WARMUP');
  for (const id of ['selectScreen', 'instructions', 'scorePanel', 'applePanel', 'endRelaxationButton']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await page.clock.fastForward(9999);
  expect(await page.evaluate(() => gameState)).toBe('WARMUP');
  await page.clock.fastForward(1);
  expect(await page.evaluate(() => gameState)).toBe('SELECT');
  await expect(page.locator('#selectScreen')).toBeVisible();
  expect(await page.evaluate(() => warmupTimer)).toBeNull();
});

test('celebration is free, preserves all progression, and cannot start a run through background input', async ({ page }) => {
  await openSelection(page);
  await page.evaluate(() => {
    setAppleBalance(17);
    carrotCount = 3;
    carrotPoints = 1100;
    distanceFeet = 712;
    soloStartFeet = 350;
    bestScoreFeet = 1500;
  });
  const snapshot = () => page.evaluate(() => ({
    appleBalance, carrotCount, carrotPoints, distanceFeet, soloStartFeet, bestScoreFeet, selectedChar,
    savedApples: localStorage.getItem('forestAppleBalance'),
    savedBest: localStorage.getItem('bestDistanceFeet'),
  }));
  const before = await snapshot();
  await page.locator('#prepCarrotButton').click();
  const start = await page.evaluate(() => warmupStartedAt);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.evaluate(() => {
    for (let i = 0; i < 200; i++) update();
    startWarmupScene();
    startDanceParty();
    startRelaxationMode();
    selectCharacter('reggie');
  });
  expect(await snapshot()).toEqual(before);
  expect(await page.evaluate(() => ({ gameState, warmupStartedAt })))
    .toEqual({ gameState: 'WARMUP', warmupStartedAt: start });
  await page.evaluate(() => finishWarmupScene());
  expect(await snapshot()).toEqual(before);
});

test('keyboard activation and repeated celebrations work without interfering with the apple party', async ({ page }) => {
  await openSelection(page);
  await pauseClock(page);
  await page.locator('#prepCarrotButton').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => gameState)).toBe('WARMUP');
  await page.clock.fastForward(10000);
  await page.locator('#partyAppleButton').click();
  expect(await page.evaluate(() => gameState)).toBe('DANCE');
  await page.clock.fastForward(10000);
  await page.locator('#prepCarrotButton').click();
  expect(await page.evaluate(() => gameState)).toBe('WARMUP');
  await page.clock.fastForward(10000);
  await expect(page.locator('#selectScreen')).toBeVisible();
});

for (const viewport of [{ width: 402, height: 874 }, { width: 1000, height: 720 }, { width: 874, height: 402 }]) {
  test(`three close-up characters jump independently without walking or rotating at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.waitForFunction(viewport => width === viewport.width && height === viewport.height,
      viewport, { polling: 20 });
    const results = await page.evaluate(() => {
      const originalRandom = Math.random;
      const originalFillText = ctx.fillText;
      const results = [];
      try {
        Math.random = () => { throw new Error('Cutscene changed gameplay randomness'); };
        for (const time of [0.1, 1.2, 2.8, 5.2, 9.8]) {
          const characters = [];
          const labels = [];
          const centers = [];
          const poses = [];
          ctx.fillText = function (text, ...args) {
            labels.push(String(text));
            return originalFillText.call(this, text, ...args);
          };
          const draw = (c, type, x, y, ...args) => {
            characters.push(type);
            const point = new DOMPoint(x, y).matrixTransform(c.getTransform());
            centers.push({ x: point.x, y: point.y });
            const transform = c.getTransform();
            poses.push({ args, scale: transform.a, rotation: transform.b, skew: transform.c });
            drawCharacter(c, type, x, y, ...args);
          };
          window.drawWoodlandWarmupScene(ctx, width, height, time, draw);
          const before = canvas.toDataURL();
          window.drawWoodlandWarmupScene(ctx, width, height, time + 0.1, drawCharacter);
          const after = canvas.toDataURL();
          window.drawWoodlandWarmupScene(ctx, width, height, time, drawCharacter, true);
          const reduced = canvas.toDataURL();
          window.drawWoodlandWarmupScene(ctx, width, height, time + 0.3, drawCharacter, true);
          results.push({ characters, labels, centers, poses, animated: before !== after,
            reducedMotionStill: reduced === canvas.toDataURL() });
        }
      } finally {
        Math.random = originalRandom;
        ctx.fillText = originalFillText;
      }
      return results;
    });
    for (const result of results) {
      expect(result.characters).toEqual(['mac', 'reggie', 'sebal']);
      expect(result.animated).toBe(true);
      expect(result.reducedMotionStill).toBe(true);
      expect(result.labels.some(label => /finish/i.test(label))).toBe(true);
      expect(result.labels).not.toContain('energy');
      const scale = result.poses[0].scale;
      expect(result.centers[0].x - 40 * scale).toBeGreaterThan(0);
      expect(result.centers[2].x + 25 * scale).toBeLessThan(viewport.width);
      // A following character's tail must not cover the previous friend's face.
      expect(result.centers[0].x + 30 * scale).toBeLessThan(result.centers[1].x - 42 * scale);
      expect(result.centers[1].x + 30 * scale).toBeLessThan(result.centers[2].x - 30 * scale);
      for (const [index, center] of result.centers.entries()) {
        expect(center.x).toBeGreaterThan(35);
        expect(center.x).toBeLessThan(viewport.width - 35);
        expect(center.y).toBeGreaterThan(50);
        expect(center.y).toBeLessThan(viewport.height - 30);
        expect(result.poses[index].args).toEqual([false, 0, false]);
        expect(result.poses[index].scale).toBeGreaterThan(1.4);
        expect(result.poses[index].rotation).toBe(0);
        expect(result.poses[index].skew).toBe(0);
        expect(center.x).toBeCloseTo(results[0].centers[index].x);
        expect(result.poses[index].scale).toBeCloseTo(results[0].poses[index].scale);
      }
    }
    const jumpChanges = [0, 1, 2].map(index =>
      Math.round((results[1].centers[index].y - results[0].centers[index].y) * 100));
    expect(new Set(jumpChanges).size).toBeGreaterThan(1);
  });
}

test('kept workout music and new crowd cheers play together, respect mute, and stop on leaving', async ({ page }) => {
  await page.evaluate(() => { audioMuted = false; });
  await openSelection(page);
  await page.waitForFunction(() => !backgroundMusic.paused && backgroundMusic.currentTime > 0.1,
    null, { polling: 50 });
  await page.locator('#prepCarrotButton').click();
  await page.waitForFunction(() => !workoutMusic.paused && workoutMusic.currentTime > 0.1,
    null, { polling: 50 });
  await page.waitForFunction(() => !crowdCheering.paused && crowdCheering.currentTime > 0.1,
    null, { polling: 50 });
  expect(await page.evaluate(() => ({
    state: gameState, forestPaused: backgroundMusic.paused, discoPaused: partyMusic.paused,
    ambience: ambienceBus.gain.value, path: new URL(workoutMusic.src).pathname,
  }))).toEqual({
    state: 'WARMUP', forestPaused: true, discoPaused: true, ambience: 0,
    path: '/attached_assets/generated_audio/woodland-workout.mp3',
  });
  await page.evaluate(() => {
    window.workoutMeter = audioContext.createAnalyser();
    musicBus.connect(window.workoutMeter);
    window.cheeringMeter = audioContext.createAnalyser();
    crowdCheeringGain.connect(window.cheeringMeter);
  });
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(window.workoutMeter.fftSize);
    window.workoutMeter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  })).toBeGreaterThan(0.001);
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(window.cheeringMeter.fftSize);
    window.cheeringMeter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  })).toBeGreaterThan(0.001);
  await page.locator('#soundToggle').click();
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeLessThan(0.005);
  await page.locator('#soundToggle').click();
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeGreaterThan(0.4);
  await page.evaluate(() => { warmupStartedAt -= 10001; loop(); });
  await page.waitForFunction(() => !backgroundMusic.paused && workoutMusic.paused, null, { polling: 50 });
  expect(await page.evaluate(() => workoutMusic.currentTime)).toBe(0);
  expect(await page.evaluate(() => ({ paused: crowdCheering.paused, time: crowdCheering.currentTime })))
    .toEqual({ paused: true, time: 0 });
  expect(await page.evaluate(() => ambienceBus.gain.value)).toBeCloseTo(0.65);
  await page.locator('#partyAppleButton').click();
  await page.waitForFunction(() => !partyMusic.paused && partyMusic.currentTime > 0.1, null, { polling: 50 });
  expect(await page.evaluate(() => workoutMusic.paused)).toBe(true);
  expect(await page.evaluate(() => crowdCheering.paused)).toBe(true);
});

test('blocked workout music is reported but never prevents the return to selection', async ({ page }) => {
  await openSelection(page);
  await page.evaluate(() => {
    audioMuted = false;
    initializeAudio();
    workoutMusic.play = () => Promise.reject(new Error('Blocked for test'));
  });
  await page.locator('#prepCarrotButton').click();
  await expect(page.locator('#workoutSceneStatus')).toContainText('Celebration audio could not play');
  await page.evaluate(() => { warmupStartedAt -= 10001; loop(); });
  await expect(page.locator('#selectScreen')).toBeVisible();
  await expect(page.locator('#workoutSceneStatus')).toBeHidden();
});

test('blocked crowd cheering is reported independently of successful workout music', async ({ page }) => {
  await openSelection(page);
  await page.evaluate(() => {
    audioMuted = false;
    initializeAudio();
    crowdCheering.play = () => Promise.reject(new Error('Blocked cheers for test'));
  });
  await page.locator('#prepCarrotButton').click();
  await page.waitForFunction(() => !workoutMusic.paused && workoutMusic.currentTime > 0.1,
    null, { polling: 50 });
  await expect(page.locator('#workoutSceneStatus')).toContainText('Celebration audio could not play');
  await page.evaluate(() => finishWarmupScene());
  await expect(page.locator('#selectScreen')).toBeVisible();
});
