const { test, expect, startGame, frames } = require('./helpers/game');

async function freezeClock(page) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-19T12:00:01Z'));
  // Installing the clock replaces the fixture's animation-frame stub.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
}

async function snapshot(page) {
  return page.evaluate(() => ({
    selectedChar, runMode, distanceFeet, gameSpeed, nextSpeedUpAt, floorOffset, frameCount,
    player: structuredClone(player), companion: structuredClone(companion),
    obstacles: structuredClone(obstacles), carrots: structuredClone(carrots), apples: structuredClone(apples),
    trail: structuredClone(playerTrail), trailDistance, soloStartFeet, nextSpawnTimer,
    nextAppleAtFeet, nextGreenAppleAtFeet, nextCarrotAtFeet,
    carrotCount, carrotPoints, appleBalance, bestScoreFeet,
  }));
}

test('selection heading has the new name with the same heading style', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
  await expect(page.locator('#selectScreen h1')).toHaveText('A Woodland Tale');
  expect(await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('#selectScreen h1'));
    const originalStyle = getComputedStyle(document.querySelector('#gameOverScreen h1'));
    return ['fontFamily', 'fontSize', 'fontWeight', 'color', 'textShadow', 'letterSpacing']
      .every(property => style[property] === originalStyle[property]);
  })).toBe(true);
});

test('pause is only available during regular runs, never menus, cutscenes, death, or relaxation', async ({ page }) => {
  const button = page.locator('#pauseRunButton');
  await expect(button).toBeHidden();
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
  await expect(button).toBeHidden();
  for (const [selector, finish] of [['#partyAppleButton', 'finishDanceParty'], ['#prepCarrotButton', 'finishWarmupScene']]) {
    await page.locator(selector).click();
    await expect(button).toBeHidden();
    await page.evaluate(name => window[name](), finish);
  }
  await page.locator(`.char-card[onclick="selectCharacter('mac')"]`).click();
  await expect(button).toBeHidden();
  await page.keyboard.press('Space');
  await expect(button).toBeVisible();
  await page.evaluate(() => endRun('log'));
  await expect(button).toBeHidden();
  await page.evaluate(() => returnToSelect());
  await page.locator('#relaxationModeButton').click();
  await expect(button).toBeHidden();
  await page.evaluate(() => toggleRunPause());
  expect(await page.evaluate(() => ({ gameState, runMode })))
    .toEqual({ gameState: 'PLAYING', runMode: 'relaxation' });
  await expect(page.locator('#endRelaxationButton')).toBeVisible();
});

test('pausing freezes the entire run and resumes the same airborne pose after exactly 3–2–1', async ({ page }) => {
  await startGame(page);
  await freezeClock(page);
  await page.evaluate(() => {
    distanceFeet = 1234.5;
    gameSpeed = 5;
    nextSpeedUpAt = 1500;
    carrotCount = 3;
    carrotPoints = 300;
    setAppleBalance(27);
    companion = createCompanion({ lift: 0, ducking: false, grounded: true });
    jump();
    for (let i = 0; i < 12; i++) update();
    obstacles = [{ type: 'fence', x: player.x + 120, y: groundY - 28, w: 44, h: 28 }];
    carrots = [{ x: player.x + 200, y: groundY - 56, w: 26, h: 32, phase: 0.2 }];
    apples = [{ kind: 'red', atFeet: distanceFeet + 300 * 0.03 * 3.28084, x: player.x + 300 }];
    loop();
  });
  const before = await snapshot(page);
  const imageBefore = await page.evaluate(() => canvas.toDataURL());
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#pauseRunButton')).toHaveText('Resume');
  expect(await page.evaluate(() => gameState)).toBe('PAUSED');
  await page.clock.fastForward(30000);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.mouse.click(20, 20);
  await page.evaluate(() => { jump(); duck(); for (let i = 0; i < 500; i++) update(); loop(); });
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => canvas.toDataURL())).toBe(imageBefore);

  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('#resumeCountdownNumber')).toHaveText('3');
  await expect(page.locator('#pauseRunButton')).toBeDisabled();
  await page.evaluate(() => { toggleRunPause(); jump(); duck(); });
  await page.clock.runFor(999);
  await expect(page.locator('#resumeCountdownNumber')).toHaveText('3');
  await page.clock.runFor(1);
  await expect(page.locator('#resumeCountdownNumber')).toHaveText('2');
  await page.clock.runFor(1000);
  await expect(page.locator('#resumeCountdownNumber')).toHaveText('1');
  await page.clock.runFor(999);
  expect(await page.evaluate(() => gameState)).toBe('RESUMING');
  await frames(page, 100);
  expect(await snapshot(page)).toEqual(before);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => gameState)).toBe('PLAYING');
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('#resumeCountdown')).toBeHidden();
  await expect(page.locator('#pauseRunButton')).toBeEnabled();
  await expect(page.locator('#pauseRunButton')).toHaveText('Pause');
  await frames(page);
  expect((await snapshot(page)).distanceFeet).toBeCloseTo(before.distanceFeet + before.gameSpeed * 0.03 * 3.28084);
});

test('duck duration is preserved through pause and countdown', async ({ page }) => {
  await startGame(page);
  await freezeClock(page);
  await page.evaluate(() => { duck(); for (let i = 0; i < 10; i++) update(); });
  const before = await snapshot(page);
  await page.locator('#pauseRunButton').click();
  await page.clock.fastForward(60000);
  await page.locator('#pauseRunButton').click();
  await page.clock.fastForward(3000);
  expect(await snapshot(page)).toEqual(before);
  await frames(page);
  expect((await snapshot(page)).player.duckTimer).toBeLessThan(before.player.duckTimer);
});

for (const paidProtection of [false, true]) {
  test(`${paidProtection ? 'paid recovery shield' : 'carrot shield'} retains its remaining protection through pause and countdown`, async ({ page }) => {
    await startGame(page);
    await freezeClock(page);
    await page.evaluate(paidProtection => {
      resumeProtection = paidProtection;
      carrotCount = paidProtection ? 3 : 5;
      invincibleUntil = performance.now() + (paidProtection ? 3500 : 7000);
      updateCarrotHud();
    }, paidProtection);
    await page.locator('#pauseRunButton').click();
    const protection = await page.evaluate(() => ({
      remaining: invincibleUntil - runTimeNow(), ring: invincibilityRingVisible(),
      text: document.getElementById('invincibleStatus').textContent,
    }));
    await page.clock.fastForward(60000);
    await page.evaluate(() => { update(); updateCarrotHud(); startAudio(); });
    expect(await page.evaluate(() => isInvincible())).toBe(true);
    expect(await page.evaluate(() => invincibilityRingVisible())).toBe(protection.ring);
    await expect(page.locator('#invincibleStatus')).toHaveText(protection.text);
    await page.locator('#pauseRunButton').click();
    await page.clock.fastForward(3000);
    expect(await page.evaluate(() => invincibleUntil - performance.now())).toBeCloseTo(protection.remaining);
    await page.clock.fastForward(protection.remaining - 1);
    expect(await page.evaluate(() => isInvincible())).toBe(true);
    await page.clock.fastForward(1);
    await frames(page);
    expect(await page.evaluate(() => ({ protected: isInvincible(), carrotCount, resumeProtection })))
      .toEqual({ protected: false, carrotCount: paidProtection ? 3 : 0, resumeProtection: false });
  });
}

test('resuming does not catch up paused time and preserves the partial physics step', async ({ page }) => {
  await startGame(page);
  await freezeClock(page);
  await page.evaluate(() => { physicsAccumulator = 8; lastFrameTime = 1000; toggleRunPause(); loop(2000); });
  const before = await snapshot(page);
  await page.clock.fastForward(60000);
  await page.locator('#pauseRunButton').click();
  await page.clock.fastForward(3000);
  await page.evaluate(() => loop(1000000));
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => physicsAccumulator)).toBe(8);
  await page.evaluate(() => loop(1000000 + PHYSICS_STEP_MS - 8));
  expect((await snapshot(page)).frameCount).toBe(before.frameCount + 1);
  expect((await snapshot(page)).distanceFeet)
    .toBeCloseTo(before.distanceFeet + before.gameSpeed * 0.03 * 3.28084);
});

test('repeated keyboard pauses resume without queued countdowns or accidental jumps', async ({ page }) => {
  await startGame(page);
  await freezeClock(page);
  const before = await snapshot(page);
  for (let i = 0; i < 5; i++) {
    await page.locator('#pauseRunButton').focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => gameState)).toBe('PAUSED');
    await page.clock.fastForward(10000);
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => gameState)).toBe('RESUMING');
    await page.clock.fastForward(3000);
    expect(await page.evaluate(() => ({ gameState, timer: resumeCountdownTimer, pointer: gamePointer })))
      .toEqual({ gameState: 'PLAYING', timer: null, pointer: null });
    expect(await snapshot(page)).toEqual(before);
  }
});

for (const action of ['returnToSelect', 'prepareRun']) {
  test(`${action} cancels the countdown so it cannot restart another screen`, async ({ page }) => {
    await startGame(page);
    await freezeClock(page);
    await page.locator('#pauseRunButton').click();
    await page.locator('#pauseRunButton').click();
    await page.evaluate(name => window[name](), action);
    await page.clock.fastForward(10000);
    expect(await page.evaluate(() => gameState)).toBe(action === 'returnToSelect' ? 'SELECT' : 'READY');
    await expect(page.locator('#pauseRunButton')).toBeHidden();
    await expect(page.locator('#resumeCountdown')).toBeHidden();
    expect(await page.evaluate(() => resumeCountdownTimer)).toBeNull();
  });
}

for (const viewport of [{ width: 402, height: 874 }, { width: 1000, height: 720 }, { width: 874, height: 402 }]) {
  test(`pause sits just above the carrot box with a centered large countdown at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.waitForFunction(viewport => width === viewport.width && height === viewport.height,
      viewport, { polling: 20 });
    await startGame(page);
    await freezeClock(page);
    const pause = await page.locator('#pauseRunButton').boundingBox();
    const score = await page.locator('#scorePanel').boundingBox();
    expect(pause.width).toBeCloseTo(score.width - 2, 0);
    expect(pause.height).toBeGreaterThanOrEqual(44);
    expect(pause.y).toBeGreaterThanOrEqual(0);
    expect(score.y - (pause.y + pause.height)).toBeGreaterThanOrEqual(6);
    expect(score.y - (pause.y + pause.height)).toBeLessThanOrEqual(10);
    await page.locator('#pauseRunButton').click();
    await page.locator('#pauseRunButton').click();
    const number = await page.locator('#resumeCountdownNumber').boundingBox();
    expect(number.height).toBeGreaterThanOrEqual(Math.min(viewport.width, viewport.height) * 0.28);
    expect(number.x + number.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(number.y + number.height / 2).toBeCloseTo(viewport.height / 2, 0);
  });
}
