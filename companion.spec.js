const {
  test, expect, startGame, state, frames, crossBoundary, acquireCompanion, collide,
} = require('./helpers/game');

for (const character of ['mac', 'reggie', 'sebal']) {
  const others = ['mac', 'reggie', 'sebal'].filter(name => name !== character);
  for (const [random, expected] of [[0, others[0]], [0.999999, others[1]]]) {
    test(`${character}: waits 1,000 solo feet, then can select ${expected}`, async ({ page }) => {
      await startGame(page, character);
      await page.evaluate(random => { Math.random = () => random; }, random);
      const { before, after } = await crossBoundary(page, 1000);
      expect(before.distance).toBeLessThan(1000);
      expect(before.distance).toBeGreaterThan(990);
      expect(before.companion).toBeNull();
      expect(before.hud).toMatch(/^Friend in [1-9]\d* ft$/);
      expect(after.distance).toBeGreaterThanOrEqual(1000);
      expect(after.companion.character).toBe(expected);
      await expect(page.locator('#companionStatus')).toHaveText(
        `${expected[0].toUpperCase() + expected.slice(1)} is with you · 1 spare life`);
    });
  }
}

test('a friend stays indefinitely but never banks additional spare lives', async ({ page }) => {
  await startGame(page);
  await acquireCompanion(page);
  const original = (await state(page)).companion.character;
  await page.evaluate(() => {
    const friend = companion;
    gameSpeed = 30;
    // More than two further earning intervals with a companion present.
    while (distanceFeet < 16000) {
      update();
      if (companion !== friend) throw new Error('Existing companion disappeared or was replaced');
    }
    gameSpeed = 7.5;
  });
  expect((await state(page)).companion.character).toBe(original);
  await expect(page.locator('#companionStatus')).toContainText('1 spare life');
  await collide(page);
  expect((await state(page)).gameState).toBe('PLAYING');
  expect((await state(page)).companion).toBeNull();
  await collide(page, 'briar');
  expect((await state(page)).gameState).toBe('GAMEOVER');
});

for (const type of ['log', 'briar', 'puddle', 'fence', 'bird', 'branch']) {
  test(`${type}: collision consumes one companion and ignores that obstacle's later frames`, async ({ page }) => {
    await startGame(page);
    await acquireCompanion(page);
    await collide(page, type);
    const hit = await state(page);
    expect(hit.gameState).toBe('PLAYING');
    expect(hit.companion).toBeNull();
    expect(hit.soloStartFeet).toBe(hit.distanceFeet);
    expect(hit.obstacles).toHaveLength(1);
    expect(hit.obstacles[0].absorbed).toBe(true);
    await expect(page.locator('#companionStatus')).toHaveText('Friend in 1,000 ft');
    // At this speed all six shapes still overlap on the next two frames.
    await frames(page, 2);
    expect((await state(page)).gameState).toBe('PLAYING');
    expect((await state(page)).obstacles[0].absorbed).toBe(true);
    // Immunity belongs to the absorbed obstacle, not a global grace period.
    await collide(page, type);
    expect((await state(page)).gameState).toBe('GAMEOVER');
    await expect(page.locator('#gameOverScreen')).toBeVisible();
  });

  test(`${type}: invincibility preserves the companion until the power-up expires`, async ({ page }) => {
    await startGame(page);
    await acquireCompanion(page);
    const friend = (await state(page)).companion.character;
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) awardCarrot();
    });
    expect((await state(page)).invincible).toBe(true);
    await collide(page, type);
    const protectedState = await state(page);
    expect(protectedState.gameState).toBe('PLAYING');
    expect(protectedState.companion.character).toBe(friend);
    expect(protectedState.obstacles[0].absorbed).not.toBe(true);
    // Let the same obstacle hit just after expiry, proving it wasn't marked
    // absorbed while invincible and the companion still protects the player.
    await page.evaluate(() => { invincibleUntil = performance.now() - 1; update(); });
    const expired = await state(page);
    expect(expired.invincible).toBe(false);
    expect(expired.gameState).toBe('PLAYING');
    expect(expired.companion).toBeNull();
    expect(expired.obstacles[0].absorbed).toBe(true);
  });
}

test('loss starts a fresh 1,000-foot solo interval, even after a long accompanied run', async ({ page }) => {
  await startGame(page);
  await acquireCompanion(page);
  await frames(page, 200);
  await collide(page);
  const lostAt = (await state(page)).soloStartFeet;
  expect(lostAt).toBeGreaterThan(1000);
  const { before, after } = await crossBoundary(page, lostAt + 1000);
  expect(before.companion).toBeNull();
  expect(before.distance - lostAt).toBeLessThan(1000);
  expect(after.distance - lostAt).toBeGreaterThanOrEqual(1000);
  expect(after.companion).not.toBeNull();
  await collide(page);
  expect((await state(page)).gameState).toBe('PLAYING');
});

test('Try Again clears companion, solo interval and replay history before a new run', async ({ page }) => {
  await startGame(page, 'sebal');
  await acquireCompanion(page);
  await page.keyboard.press('ArrowUp');
  await frames(page, 10);
  await page.keyboard.press('ArrowDown');
  await frames(page, 60);
  await collide(page);
  await collide(page);
  expect((await state(page)).gameState).toBe('GAMEOVER');
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  const retry = await state(page);
  expect(retry.gameState).toBe('READY');
  expect(retry.companion).toBeNull();
  expect(retry.distanceFeet).toBe(0);
  expect(retry.soloStartFeet).toBe(0);
  expect(retry.trailDistance).toBe(0);
  expect(retry.trailLength).toBe(0);
  expect(retry.gameSpeed).toBe(3.5);
  expect(retry.obstacles).toEqual([]);
  expect(retry.player.isGrounded).toBe(true);
  expect(retry.player.isDucking).toBe(false);
  expect(retry.player.hasExtendedJump).toBe(false);
  await expect(page.locator('#gameOverScreen')).toBeHidden();
  await expect(page.locator('#instructions')).toBeVisible();
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 1,000 ft');
  await page.keyboard.press('Space');
  await page.evaluate(() => { nextSpawnTimer = Infinity; nextCarrotAtFeet = Infinity; });
  const { after } = await crossBoundary(page, 1000);
  expect(after.companion).not.toBeNull();
  expect(after.companion.character).not.toBe('sebal');
});

test('the retry handler also discards an existing companion and stale action history', async ({ page }) => {
  await startGame(page);
  await acquireCompanion(page);
  await page.keyboard.press('ArrowUp');
  await frames(page, 10);
  expect((await state(page)).companion).not.toBeNull();
  expect((await state(page)).trailLength).toBeGreaterThan(0);
  // Defensive reset case: normal lethal collisions consume the companion
  // first. Force the terminal screen to exercise retry with a friend retained.
  await page.evaluate(() => { endRun('log'); });
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  const retry = await state(page);
  expect(retry.gameState).toBe('READY');
  expect(retry.companion).toBeNull();
  expect(retry.trailLength).toBe(0);
  expect(retry.trailDistance).toBe(0);
  expect(retry.distanceFeet).toBe(0);
  expect(retry.soloStartFeet).toBe(0);
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 1,000 ft');
});
