const { test, expect, startGame } = require('./helpers/game');

test('resume is affordable-only and restores the latest run repeatedly without duplicate spending', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    setAppleBalance(19);
    distanceFeet = 863.25;
    gameSpeed = 4.235;
    nextSpeedUpAt = 900;
    soloStartFeet = 200;
    carrotCount = 3;
    carrotPoints = 1300;
    endRun('log');
  });
  await expect(page.locator('#resumeRunButton')).toBeHidden();
  await page.evaluate(() => spendApplesToResume());
  expect(await page.evaluate(() => appleBalance)).toBe(19);
  await page.evaluate(() => setAppleBalance(60));
  await expect(page.locator('#resumeRunButton')).toBeVisible();
  await page.locator('#resumeRunButton').click();
  const resumed = await page.evaluate(() => ({
    gameState, appleBalance, distanceFeet, gameSpeed, nextSpeedUpAt,
    carrotCount, carrotPoints, soloStartFeet, companion,
    remaining: invincibleUntil - performance.now(), resumeProtection,
  }));
  expect(resumed).toMatchObject({
    gameState: 'PLAYING', appleBalance: 40, distanceFeet: 863.25,
    gameSpeed: 4.235, nextSpeedUpAt: 900, carrotCount: 3, carrotPoints: 1300,
    soloStartFeet: 200, companion: null, resumeProtection: true,
  });
  expect(resumed.remaining).toBeGreaterThan(3000);
  expect(resumed.remaining).toBeLessThanOrEqual(3500);
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 337 ft');
  await expect(page.locator('#scorePanel')).toBeVisible();
  await expect(page.locator('#applePanel')).toBeVisible();
  await expect(page.locator('#resumeRunButton')).toBeHidden();
  for (const balance of [20, 0]) {
    await page.evaluate(() => {
      distanceFeet += 11;
      endRun('log');
      spendApplesToResume();
      spendApplesToResume();
    });
    expect(await page.evaluate(() => appleBalance)).toBe(balance);
  }
  expect(await page.evaluate(() => distanceFeet)).toBe(885.25);
  await page.evaluate(() => endRun('log'));
  await expect(page.locator('#resumeRunButton')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('forestAppleBalance'))).toBe('0');
});

test('resume rechecks saved funds and never spends on an unaffordable stale button', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(20); endRun('log'); });
  await expect(page.locator('#resumeRunButton')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('forestAppleBalance', '5'));
  await page.locator('#resumeRunButton').click();
  expect(await page.evaluate(() => ({ gameState, appleBalance }))).toEqual({
    gameState: 'GAMEOVER', appleBalance: 5,
  });
  await expect(page.locator('#resumeRunButton')).toBeHidden();
});

test('resume shield blocks hazards, extends with carrots, and preserves partial carrot progress after expiry', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    setAppleBalance(20);
    carrotCount = 4;
    distanceFeet = 1450;
    soloStartFeet = 1000;
    endRun('log');
    spendApplesToResume();
    const initialExpiry = invincibleUntil;
    awardCarrot();
    const extension = invincibleUntil - initialExpiry;
    obstacles = [{ type: 'log', x: player.x - 5, w: 42, h: 30, y: groundY - 30 }];
    update();
    const protectedState = gameState;
    const countDuringShield = carrotCount;
    invincibleUntil = performance.now() - 1;
    obstacles = [];
    update();
    const countAfterShield = carrotCount;
    awardCarrot();
    return {
      extension, protectedState, countDuringShield, countAfterShield,
      newPowerUp: isInvincible(), resumeProtection, carrotCount,
    };
  });
  expect(result).toEqual({
    extension: 1000, protectedState: 'PLAYING', countDuringShield: 4,
    countAfterShield: 4, newPowerUp: true, resumeProtection: false, carrotCount: 5,
  });
});

test('resume keeps an existing buddy and does not mistakenly award one after a previous buddy was lost', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    setAppleBalance(40);
    distanceFeet = 1800;
    companion = createCompanion({ lift: 0, ducking: false, grounded: true });
    const character = companion.character;
    endRun('log');
    spendApplesToResume();
    const restored = companion.character;
    companion = null;
    soloStartFeet = 1800;
    distanceFeet = 2123;
    endRun('log');
    spendApplesToResume();
    return { character, restored, companion, soloStartFeet, distanceFeet };
  });
  expect(result.restored).toBe(result.character);
  expect(result.companion).toBeNull();
  expect(result.soloStartFeet).toBe(1800);
  expect(result.distanceFeet).toBe(2123);
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 677 ft');
});

test('ring warning follows remaining time and resume protection blinks throughout', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    resumeProtection = false;
    invincibleUntil = 10000;
    const outsideWarning = [6500, 6680].map(time => invincibilityRingVisible(time));
    const warning = [7200, 7380].map(time => invincibilityRingVisible(time));
    invincibleUntil += 1000;
    const afterExtension = [7200, 7380].map(time => invincibilityRingVisible(time));
    const stillWarning = [8280, 8460].map(time => invincibilityRingVisible(time));
    resumeProtection = true;
    invincibleUntil = 10700;
    const resumeWarning = [7200, 7380].map(time => invincibilityRingVisible(time));
    return { outsideWarning, warning, afterExtension, stillWarning, resumeWarning,
      expired: invincibilityRingVisible(10701) };
  });
  expect(result.outsideWarning).toEqual([true, true]);
  expect(result.warning).toEqual([true, false]);
  expect(result.afterExtension).toEqual([true, true]);
  expect(result.stillWarning).toEqual([true, false]);
  expect(result.resumeWarning).toEqual([true, false]);
  expect(result.expired).toBe(false);
});

test('shortened fence matches other low obstacles and its drawing stays within its height', async ({ page }) => {
  await startGame(page);
  const heights = await page.evaluate(() => {
    const original = Math.random;
    try {
      return [0, 0.2, 0.51].map(choice => {
        Math.random = () => choice;
        spawnObstacle();
        return { type: obstacles.at(-1).type, height: obstacles.at(-1).h };
      });
    } finally { Math.random = original; }
  });
  expect(heights).toEqual([
    { type: 'log', height: 30 }, { type: 'briar', height: 28 }, { type: 'fence', height: 28 },
  ]);
});
