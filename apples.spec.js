const { test, expect, startGame, state, crossBoundary } = require('./helpers/game');

async function placeAppleForNextFrame(page) {
  await page.evaluate(() => {
    apples = [{ atFeet: distanceFeet + gameSpeed * 0.03 * METERS_TO_FEET }];
    nextAppleAtFeet = Infinity;
    update();
  });
}

test('apples appear at 23% of the original rate with randomized distance gaps', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    let seed = 7;
    const original = Math.random;
    try {
      Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      apples = [];
      nextAppleAtFeet = randomAppleGap();
      const first = nextAppleAtFeet;
      distanceFeet = 30000;
      populateApples();
      const redApples = apples.filter(apple => apple.kind === 'red');
      const gaps = redApples.slice(1).map((apple, i) => apple.atFeet - redApples[i].atFeet);
      return {
        first, count: gaps.length, min: Math.min(...gaps), max: Math.max(...gaps),
        unique: new Set(gaps.map(gap => gap.toFixed(3))).size,
        positionsMatchDistance: apples.every(apple =>
          Math.abs(apple.x - player.x - (apple.atFeet - distanceFeet) / (0.03 * METERS_TO_FEET)) < 0.0001),
      };
    } finally {
      Math.random = original;
    }
  });
  expect(result.first).toBeGreaterThanOrEqual(30 / 0.23);
  expect(result.first).toBeLessThanOrEqual(100 / 0.23);
  expect(result.count).toBeGreaterThan(90);
  expect(result.count).toBeLessThan(130);
  expect(result.min).toBeGreaterThanOrEqual(30 / 0.23);
  expect(result.max).toBeLessThanOrEqual(100 / 0.23);
  expect(result.unique).toBeGreaterThan(80);
  expect(result.positionsMatchDistance).toBe(true);
});

test('running and ducking collect apples without changing carrot progress', async ({ page }) => {
  await startGame(page);
  await placeAppleForNextFrame(page);
  expect(await page.evaluate(() => appleBalance)).toBe(1);
  await page.keyboard.press('ArrowDown');
  await placeAppleForNextFrame(page);
  expect(await page.evaluate(() => appleBalance)).toBe(2);
  const result = await page.evaluate(() => {
    for (let i = 0; i < 5; i++) awardCarrot();
    const until = invincibleUntil;
    apples = [{ atFeet: distanceFeet + gameSpeed * 0.03 * METERS_TO_FEET }];
    update();
    return { appleBalance, carrotCount, until, after: invincibleUntil };
  });
  expect(result.appleBalance).toBe(3);
  expect(result.carrotCount).toBe(5);
  expect(result.after).toBe(result.until);
  expect(await page.evaluate(() => localStorage.getItem('forestAppleBalance'))).toBe('3');
});

test('jumping can pass above an apple, and fast motion cannot tunnel through one on the ground', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    player.isGrounded = false;
    player.jumpProgress = 0.5;
    player.jumpStep = 0;
  });
  await placeAppleForNextFrame(page);
  expect(await page.evaluate(() => appleBalance)).toBe(0);
  await page.evaluate(() => {
    player.isGrounded = true;
    player.y = groundY - 22;
    gameSpeed = 200;
    nextSpeedUpAt = Infinity;
    apples = [{ atFeet: distanceFeet + gameSpeed * 0.03 * METERS_TO_FEET / 2 }];
    update();
  });
  expect(await page.evaluate(() => appleBalance)).toBe(1);
});

test('apple bank survives retry, character changes, and reopening the page', async ({ page }) => {
  await startGame(page);
  await placeAppleForNextFrame(page);
  await page.evaluate(() => endRun('log'));
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  expect(await page.evaluate(() => appleBalance)).toBe(1);
  await page.evaluate(() => { startRun(); endRun('log'); });
  await page.getByRole('button', { name: 'Change Character', exact: true }).click();
  await page.locator(`.char-card[onclick="selectCharacter('reggie')"]`).click();
  expect(await page.evaluate(() => appleBalance)).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => appleBalance)).toBe(1);
  await expect(page.locator('#applePanel')).toBeHidden();
});

test('apple panel appears only in active play and aligns with the score panel on phones', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(page.locator('#applePanel')).toBeHidden();
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
  await expect(page.locator('#applePanel')).toBeHidden();
  await page.locator(`.char-card[onclick="selectCharacter('mac')"]`).click();
  await expect(page.locator('#instructions')).toBeVisible();
  await expect(page.locator('#applePanel')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.locator('#applePanel')).toBeVisible();
  const appleBox = await page.locator('#applePanel').boundingBox();
  const scoreBox = await page.locator('#scorePanel').boundingBox();
  expect(Math.abs(appleBox.y - scoreBox.y)).toBeLessThan(1);
  expect(appleBox.x + appleBox.width).toBeLessThan(scoreBox.x);
  await page.evaluate(() => endRun('log'));
  await expect(page.locator('#applePanel')).toBeHidden();
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.locator('#applePanel')).toBeHidden();
});

test('skip is unavailable below ten apples and rechecks funds on selection', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(9); endRun('log'); });
  await expect(page.locator('#skipAheadButton')).toBeHidden();
  await expect(page.locator('#skipAheadButton')).toBeDisabled();
  await page.evaluate(() => spendApplesToSkip());
  expect((await state(page)).gameState).toBe('GAMEOVER');
  expect(await page.evaluate(() => appleBalance)).toBe(9);
  await page.evaluate(() => { setAppleBalance(10); updateAppleHud(); });
  await expect(page.locator('#skipAheadButton')).toBeVisible();
  // Another tab spent funds after this tab rendered its menu.
  await page.evaluate(() => localStorage.setItem('forestAppleBalance', '2'));
  await page.locator('#skipAheadButton').click();
  expect((await state(page)).gameState).toBe('GAMEOVER');
  expect(await page.evaluate(() => appleBalance)).toBe(2);
  await expect(page.locator('#skipAheadButton')).toBeHidden();
});

test('ten apples starts at 750 feet with matching speed and 250 feet until a companion', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(10); endRun('log'); });
  await page.getByRole('button', { name: 'Use 10 apples to skip ahead to 750 feet', exact: true }).click();
  const skipped = await state(page);
  expect(skipped.gameState).toBe('PLAYING');
  expect(skipped.distanceFeet).toBe(750);
  expect(skipped.gameSpeed).toBeCloseTo(3.5 * 1.1 * 1.1, 10);
  expect(skipped.soloStartFeet).toBe(0);
  expect(skipped.companion).toBeNull();
  expect(await page.evaluate(() => nextSpeedUpAt)).toBe(900);
  await expect(page.locator('#scoreDisplay')).toHaveText('750');
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 250 ft');
  await expect(page.locator('#applePanel')).toBeVisible();
  await expect(page.locator('#gameOverScreen')).toBeHidden();
  await expect(page.locator('#instructions')).toBeHidden();
  expect(await page.evaluate(() => appleBalance)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('forestAppleBalance'))).toBe('0');
  expect(await page.evaluate(() => nextCarrotAtFeet > 750)).toBe(true);
  expect(await page.evaluate(() => apples.every(apple => apple.atFeet >= 780))).toBe(true);
  await page.evaluate(() => {
    spendApplesToSkip(); // A second click cannot spend again or reset the run.
    nextSpawnTimer = Infinity;
    nextCarrotAtFeet = Infinity;
    nextAppleAtFeet = Infinity;
    apples = [];
  });
  expect(await page.evaluate(() => appleBalance)).toBe(0);
  const { before, after } = await crossBoundary(page, 1000);
  expect(before.companion).toBeNull();
  expect(after.companion).not.toBeNull();
  await page.evaluate(() => { endRun('log'); prepareRun(); });
  expect((await state(page)).distanceFeet).toBe(0);
  expect((await state(page)).gameSpeed).toBe(3.5);
});

test('spending saves the remaining balance across reload', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(15); endRun('log'); });
  await page.locator('#skipAheadButton').click();
  expect(await page.evaluate(() => appleBalance)).toBe(5);
  await page.reload();
  expect(await page.evaluate(() => appleBalance)).toBe(5);
});

test('ground apple locations stay clear of all six obstacle types', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    const original = Math.random;
    const results = [];
    try {
      for (let i = 0; i < 6; i++) {
        Math.random = () => (i + 0.1) / 6;
        apples = [{ x: width + 100 }];
        obstacles = [];
        spawnObstacle();
        results.push(obstacles.length === 0);
        apples = [];
        spawnObstacle();
        results.push(obstacles.length === 1);
      }
      return results.every(Boolean);
    } finally {
      Math.random = original;
    }
  });
  expect(result).toBe(true);
});

test('a collected apple emits an audible two-tone ding', async ({ page }) => {
  const result = await page.evaluate(async () => {
    audioContext = new OfflineAudioContext(1, 24000, 48000);
    audioContext.resume = () => Promise.resolve();
    audioMaster = audioContext.createGain();
    audioMaster.connect(audioContext.destination);
    effectsBus = audioContext.createGain();
    effectsBus.connect(audioMaster);
    audioMuted = false;
    collectApple();
    const buffer = await audioContext.startRendering();
    const samples = buffer.getChannelData(0);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    return Math.sqrt(energy / samples.length);
  });
  expect(result).toBeGreaterThan(0.005);
});

test('storage failures warn players without breaking collection or retry', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await placeAppleForNextFrame(page);
  expect(await page.evaluate(() => appleBalance)).toBe(1);
  await expect(page.locator('#appleSaveWarning')).toContainText('Saving unavailable');
  await page.evaluate(() => { endRun('log'); prepareRun(); });
  expect(await page.evaluate(() => appleBalance)).toBe(1);
});

test('selection displays Sebastian while preserving the existing character choice', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
  const character = page.locator(`.char-card[onclick="selectCharacter('sebal')"]`);
  await expect(character.locator('.char-name')).toHaveText('Sebastian');
  await character.click();
  expect(await page.evaluate(() => selectedChar)).toBe('sebal');
  await expect(page.locator('#instructions')).toBeVisible();
});

test('each skip option appears only when its individual apple cost is affordable', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(9); endRun('log'); });
  for (const [balance, lower, higher] of [[9, false, false], [10, true, false], [14, true, false], [15, true, true]]) {
    await page.evaluate(balance => setAppleBalance(balance), balance);
    expect(await page.locator('#skipAheadButton').isVisible()).toBe(lower);
    expect(await page.locator('#skipAhead1250Button').isVisible()).toBe(higher);
    expect(await page.locator('#skipAhead1250Button').isDisabled()).toBe(!higher);
  }
});

test('fifteen apples starts at 1,250 feet with the matching speed and a different companion', async ({ page }) => {
  await startGame(page, 'sebal');
  await page.evaluate(() => { setAppleBalance(18); endRun('log'); });
  await page.getByRole('button', { name: 'Use 15 apples to skip ahead to 1,250 feet', exact: true }).click();
  const skipped = await state(page);
  expect(skipped.gameState).toBe('PLAYING');
  expect(skipped.distanceFeet).toBe(1250);
  expect(skipped.gameSpeed).toBeCloseTo(3.5 * Math.pow(1.1, 4), 10);
  expect(skipped.companion).not.toBeNull();
  expect(skipped.companion.character).not.toBe('sebal');
  expect(skipped.companion.pose).toEqual({ lift: 0, ducking: false, grounded: true });
  expect(await page.evaluate(() => nextSpeedUpAt)).toBe(1500);
  expect(await page.evaluate(() => nextGreenAppleAtFeet)).toBe(1500);
  expect(await page.evaluate(() => appleBalance)).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem('forestAppleBalance'))).toBe('3');
  await expect(page.locator('#scoreDisplay')).toHaveText('1250');
  await expect(page.locator('#companionStatus')).toContainText('1 spare life');
  await expect(page.locator('#gameOverScreen')).toBeHidden();
  await expect(page.locator('#instructions')).toBeHidden();
  await expect(page.locator('#applePanel')).toBeVisible();
  await page.evaluate(() => spendApplesToSkip(1250));
  expect(await page.evaluate(() => appleBalance)).toBe(3);
  expect((await state(page)).distanceFeet).toBe(1250);
  await page.reload();
  expect(await page.evaluate(() => appleBalance)).toBe(3);
});

test('advanced skip refuses insufficient funds, stale funds, and unsupported destinations', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { setAppleBalance(14); endRun('log'); spendApplesToSkip(1250); });
  expect((await state(page)).gameState).toBe('GAMEOVER');
  expect(await page.evaluate(() => appleBalance)).toBe(14);
  await page.evaluate(() => { setAppleBalance(15); spendApplesToSkip(9999); });
  expect(await page.evaluate(() => appleBalance)).toBe(15);
  await expect(page.locator('#skipAhead1250Button')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('forestAppleBalance', '10'));
  await page.locator('#skipAhead1250Button').click();
  expect((await state(page)).gameState).toBe('GAMEOVER');
  expect(await page.evaluate(() => appleBalance)).toBe(10);
  await expect(page.locator('#skipAhead1250Button')).toBeHidden();
  await expect(page.locator('#skipAheadButton')).toBeVisible();
});

test('exactly one green apple is scheduled at each 500-foot milestone without duplicates', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    nextGreenAppleAtFeet = 500;
    distanceFeet = 2000;
    populateApples();
    const milestones = apples.filter(apple => apple.kind === 'green').map(apple => apple.atFeet);
    populateApples();
    return {
      milestones,
      after: apples.filter(apple => apple.kind === 'green').map(apple => apple.atFeet),
      next: nextGreenAppleAtFeet,
    };
  });
  expect(result.milestones).toEqual([500, 1000, 1500, 2000]);
  expect(result.after).toEqual(result.milestones);
  expect(result.next).toBe(2500);
});

test('a green apple credits three to the same saved apple bank', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    apples = [{ kind: 'green', atFeet: distanceFeet + gameSpeed * 0.03 * METERS_TO_FEET }];
    update();
  });
  expect(await page.evaluate(() => appleBalance)).toBe(3);
  await expect(page.locator('#appleCount')).toHaveText('3');
  expect(await page.evaluate(() => localStorage.getItem('forestAppleBalance'))).toBe('3');
  expect(await page.evaluate(() => carrotCount)).toBe(0);
  await page.reload();
  expect(await page.evaluate(() => appleBalance)).toBe(3);
});

test('skips schedule only future green apples and regular retries restart their milestones', async ({ page }) => {
  await startGame(page);
  const result = await page.evaluate(() => {
    const next = [];
    for (const start of [0, 750, 1250]) {
      prepareRun(start);
      next.push(nextGreenAppleAtFeet);
    }
    return next;
  });
  expect(result).toEqual([500, 1000, 1500]);
  expect(await page.evaluate(() => appleBalance)).toBe(0);
});
