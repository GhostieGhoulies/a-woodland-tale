const { test, expect } = require('./helpers/game');

async function openSelection(page) {
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
}

test('apple sits beside Sebastian on phones and opens a free ten-second party without selecting a runner', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openSelection(page);
  const apple = page.getByRole('button', { name: 'Open woodland dance party' });
  const appleBox = await apple.boundingBox();
  const squirrelBox = await page.locator(`.char-card[onclick="selectCharacter('sebal')"]`).boundingBox();
  expect(appleBox.width).toBeGreaterThanOrEqual(44);
  expect(appleBox.x + appleBox.width).toBeLessThan(squirrelBox.x);
  expect(Math.abs(appleBox.y - squirrelBox.y)).toBeLessThan(8);
  await page.evaluate(() => {
    carrotCount = 3;
    carrotPoints = 1300;
    distanceFeet = 543.25;
    soloStartFeet = 100;
    bestScoreFeet = 900;
  });
  const before = await page.evaluate(() => ({
    selectedChar, carrotCount, carrotPoints, distanceFeet, soloStartFeet, bestScoreFeet, appleBalance,
    apples: localStorage.getItem('forestAppleBalance'),
    best: localStorage.getItem('bestDistanceFeet'),
  }));
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await apple.click();
  expect(await page.evaluate(() => gameState)).toBe('DANCE');
  for (const id of ['selectScreen', 'instructions', 'scorePanel', 'applePanel', 'endRelaxationButton']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await page.evaluate(() => { for (let i = 0; i < 120; i++) update(); });
  expect(await page.evaluate(() => ({
    selectedChar, carrotCount, carrotPoints, distanceFeet, soloStartFeet, bestScoreFeet, appleBalance,
    apples: localStorage.getItem('forestAppleBalance'),
    best: localStorage.getItem('bestDistanceFeet'),
  }))).toEqual(before);
  await page.clock.fastForward(9999);
  expect(await page.evaluate(() => gameState)).toBe('DANCE');
  await page.clock.fastForward(1);
  expect(await page.evaluate(() => gameState)).toBe('SELECT');
  await expect(page.locator('#selectScreen')).toBeVisible();
  expect(await page.evaluate(() => dancePartyTimer)).toBeNull();
});

test('keyboard activation works, repeats do not restart the countdown, and the party can be replayed', async ({ page }) => {
  await openSelection(page);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const apple = page.getByRole('button', { name: 'Open woodland dance party' });
  await apple.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => gameState)).toBe('DANCE');
  const started = await page.evaluate(() => dancePartyStartedAt);
  await page.clock.fastForward(5000);
  await page.evaluate(() => { startDanceParty(); startRelaxationMode(); selectCharacter('sebal'); });
  expect(await page.evaluate(() => ({ gameState, dancePartyStartedAt }))).toEqual({
    gameState: 'DANCE', dancePartyStartedAt: started,
  });
  await page.clock.fastForward(5000);
  await apple.click();
  expect(await page.evaluate(() => gameState)).toBe('DANCE');
  await page.clock.fastForward(10000);
  await expect(page.locator('#selectScreen')).toBeVisible();
});

for (const viewport of [{ width: 402, height: 874 }, { width: 1000, height: 720 }, { width: 874, height: 402 }]) {
  test(`party renders all three original characters and animates at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.waitForFunction(viewport => width === viewport.width && height === viewport.height,
      viewport, { polling: 20 });
    const result = await page.evaluate(() => {
      const names = [];
      const centers = [];
      const oldRandom = Math.random;
      let first, second, stillA, stillB;
      try {
        Math.random = () => { throw new Error('Party rendering changed gameplay randomness'); };
        const draw = (c, type, ...args) => {
          names.push(type);
          centers.push({ x: c.getTransform().e, y: c.getTransform().f });
          drawCharacter(c, type, ...args);
        };
        window.drawWoodlandDanceScene(ctx, width, height, 1, draw);
        first = canvas.toDataURL();
        window.drawWoodlandDanceScene(ctx, width, height, 2, drawCharacter);
        second = canvas.toDataURL();
        window.drawWoodlandDanceScene(ctx, width, height, 1, drawCharacter, true);
        stillA = canvas.toDataURL();
        window.drawWoodlandDanceScene(ctx, width, height, 2, drawCharacter, true);
        stillB = canvas.toDataURL();
      } finally { Math.random = oldRandom; }
      return { names, centers, moving: first !== second, reducedMotionStill: stillA === stillB };
    });
    expect(result.names).toEqual(['mac', 'reggie', 'sebal']);
    expect(result.moving).toBe(true);
    expect(result.reducedMotionStill).toBe(true);
    for (const center of result.centers) {
      expect(center.x).toBeGreaterThan(35);
      expect(center.x).toBeLessThan(viewport.width - 35);
      expect(center.y).toBeGreaterThan(50);
      expect(center.y).toBeLessThan(viewport.height - 25);
    }
  });
}

test('EDM audio plays through the shared mixer, respects mute, and restores woodland music afterwards', async ({ page }) => {
  await page.evaluate(() => { audioMuted = false; });
  await openSelection(page);
  await page.waitForFunction(() => backgroundMusic.currentTime > 0.1 && !backgroundMusic.paused,
    null, { polling: 50 });
  await page.locator('#partyAppleButton').click();
  await page.waitForFunction(() => partyMusic.currentTime > 0.1 && !partyMusic.paused,
    null, { polling: 50 });
  expect(await page.evaluate(() => ({
    gameState, forestPaused: backgroundMusic.paused, ambience: ambienceBus.gain.value,
    path: new URL(partyMusic.src).pathname,
  }))).toEqual({
    gameState: 'DANCE', forestPaused: true, ambience: 0,
    path: '/attached_assets/generated_audio/woodland-disco.mp3',
  });
  await page.evaluate(() => {
    window.partyMeter = audioContext.createAnalyser();
    musicBus.connect(window.partyMeter);
  });
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(window.partyMeter.fftSize);
    window.partyMeter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
  })).toBeGreaterThan(0.001);
  await page.locator('#soundToggle').click();
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeLessThan(0.005);
  await page.locator('#soundToggle').click();
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeGreaterThan(0.4);
  await page.evaluate(() => { dancePartyStartedAt -= 10001; loop(); });
  await expect(page.locator('#selectScreen')).toBeVisible();
  await page.waitForFunction(() => !backgroundMusic.paused && partyMusic.paused, null, { polling: 50 });
  expect(await page.evaluate(() => ({ partyTime: partyMusic.currentTime, ambience: ambienceBus.gain.value })))
    .toEqual({ partyTime: 0, ambience: 0.6499999761581421 });
});

test('blocked party music is reported and cannot trap the selection screen', async ({ page }) => {
  await openSelection(page);
  await page.evaluate(() => {
    audioMuted = false;
    initializeAudio();
    partyMusic.play = () => Promise.reject(new Error('Playback blocked for test'));
  });
  await page.locator('#partyAppleButton').click();
  await expect(page.locator('#dancePartyStatus')).toContainText('Party music could not play');
  await page.evaluate(() => { dancePartyStartedAt -= 10001; loop(); });
  await expect(page.locator('#selectScreen')).toBeVisible();
  await expect(page.locator('#dancePartyStatus')).toBeHidden();
});

test('both game modes still start normally after the cutscene ends', async ({ page }) => {
  await openSelection(page);
  await page.locator('#partyAppleButton').click();
  await page.evaluate(() => finishDanceParty());
  await page.locator(`.char-card[onclick="selectCharacter('mac')"]`).click();
  expect(await page.evaluate(() => ({ gameState, gameSpeed, distanceFeet })))
    .toEqual({ gameState: 'READY', gameSpeed: 3.5, distanceFeet: 0 });
  await page.keyboard.press('Space');
  await expect(page.locator('#applePanel')).toBeVisible();
  await page.evaluate(() => { endRun('log'); returnToSelect(); });
  await page.locator('#relaxationModeButton').click();
  expect(await page.evaluate(() => ({ gameState, runMode, followers: relaxationFollowers.length })))
    .toEqual({ gameState: 'PLAYING', runMode: 'relaxation', followers: 2 });
  await expect(page.locator('#applePanel')).toBeHidden();
});

test('disco draws only the original characters without extra arms or hands', async ({ page }) => {
  const result = await page.evaluate(() => {
    const originalScale = ctx.scale;
    const originalRestore = ctx.restore;
    const originalSave = ctx.save;
    const originalFill = ctx.fill;
    const originalStroke = ctx.stroke;
    let depth = 0;
    let characterDepth = null;
    let extraShapes = 0;
    const names = [];
    try {
      ctx.save = function (...args) { depth++; return originalSave.apply(this, args); };
      ctx.restore = function (...args) {
        if (depth === characterDepth) characterDepth = null;
        depth--;
        return originalRestore.apply(this, args);
      };
      // Character placement is the only scale operation in the disco renderer.
      ctx.scale = function (...args) { characterDepth = depth; return originalScale.apply(this, args); };
      ctx.fill = function (...args) {
        if (characterDepth !== null) extraShapes++;
        return originalFill.apply(this, args);
      };
      ctx.stroke = function (...args) {
        if (characterDepth !== null) extraShapes++;
        return originalStroke.apply(this, args);
      };
      window.drawWoodlandDanceScene(ctx, width, height, 2, (c, type) => names.push(type));
    } finally {
      ctx.scale = originalScale;
      ctx.restore = originalRestore;
      ctx.save = originalSave;
      ctx.fill = originalFill;
      ctx.stroke = originalStroke;
    }
    return { names, extraShapes };
  });
  expect(result.names).toEqual(['mac', 'reggie', 'sebal']);
  expect(result.extraShapes).toBe(0);
});
