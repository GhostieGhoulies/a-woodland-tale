const { test, expect, startGame } = require('./helpers/game');

async function openSelection(page) {
  for (let i = 0; i < 3; i++) await page.locator('#storyNext').click();
}

async function startRelaxation(page) {
  await openSelection(page);
  await page.getByRole('button', { name: 'relaxation mode', exact: true }).click();
}

async function disableSpawning(page) {
  await page.evaluate(() => {
    nextSpawnTimer = Infinity;
    nextAppleAtFeet = Infinity;
    nextGreenAppleAtFeet = Infinity;
    nextCarrotAtFeet = Infinity;
    obstacles = [];
  });
}

test('relaxation starts all three runners and shows only its distance and exit controls on phones', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openSelection(page);
  await expect(page.locator('#endRelaxationButton')).toBeHidden();
  const entry = await page.locator('#relaxationModeButton').boundingBox();
  const cards = await page.locator('.char-grid').boundingBox();
  expect(entry.y).toBeGreaterThanOrEqual(cards.y + cards.height);
  await page.locator('#relaxationModeButton').click();
  expect(await page.evaluate(() => ({
    gameState, runMode, distanceFeet, gameSpeed,
    runners: [selectedChar, ...relaxationFollowers.map(follower => follower.character)].sort(),
    positions: [player.x, ...relaxationFollowers.map(follower => player.x - follower.gap)],
    companion,
  }))).toEqual({
    gameState: 'PLAYING', runMode: 'relaxation', distanceFeet: 0, gameSpeed: 3.5,
    runners: ['mac', 'reggie', 'sebal'], positions: [140, 90, 40], companion: null,
  });
  await expect(page.locator('#scorePanel')).toBeVisible();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#endRelaxationButton')).toBeVisible();
  for (const id of ['applePanel', 'carrotHud', 'companionStatus', 'instructions', 'selectScreen', 'gameOverScreen']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
});

test('runner order is shuffled anew and can produce every permutation', async ({ page }) => {
  await openSelection(page);
  const orders = await page.evaluate(() => {
    const original = Math.random;
    const orders = [];
    try {
      for (const first of [0, 0.4, 0.9]) {
        for (const second of [0, 0.9]) {
          const rolls = [first, second];
          Math.random = () => rolls.length ? rolls.shift() : 0.5;
          startRelaxationMode();
          orders.push([selectedChar, ...relaxationFollowers.map(follower => follower.character)].join(','));
          endRelaxationMode();
        }
      }
    } finally { Math.random = original; }
    return orders;
  });
  expect(new Set(orders).size).toBe(6);
});

test('relaxation never spawns collectibles or earns a buddy and leaves normal bank and records untouched', async ({ page }) => {
  await page.evaluate(() => {
    setAppleBalance(27);
    bestScoreFeet = 400;
    localStorage.setItem('bestDistanceFeet', '400');
  });
  await startRelaxation(page);
  await page.evaluate(() => {
    distanceFeet = 5000;
    nextAppleAtFeet = 0;
    nextGreenAppleAtFeet = 0;
    nextCarrotAtFeet = 0;
    for (let i = 0; i < 200; i++) update();
    endRun('log');
  });
  expect(await page.evaluate(() => ({
    gameState, appleBalance, bestScoreFeet, companion,
    followers: relaxationFollowers.length, apples: apples.length, carrots: carrots.length,
    carrotCount, carrotPoints,
    savedApples: localStorage.getItem('forestAppleBalance'),
    savedBest: localStorage.getItem('bestDistanceFeet'),
  }))).toEqual({
    gameState: 'PLAYING', appleBalance: 27, bestScoreFeet: 400, companion: null,
    followers: 2, apples: 0, carrots: 0, carrotCount: 0, carrotPoints: 0,
    savedApples: '27', savedBest: '400',
  });
});

for (const type of ['log', 'briar', 'fence', 'puddle', 'bird', 'branch']) {
  test(`${type} collision reduces speed by 10% once without losing runners or ending the run`, async ({ page }) => {
    await startRelaxation(page);
    await disableSpawning(page);
    const result = await page.evaluate(type => {
      gameSpeed = 7;
      distanceFeet = 450;
      nextSpeedUpAt = 600;
      const original = Math.random;
      Math.random = () => ['log', 'briar', 'puddle', 'fence', 'bird', 'branch'].indexOf(type) / 6 + 0.01;
      try { spawnObstacle(); } finally { Math.random = original; }
      obstacles[0].x = player.x;
      update();
      const first = gameSpeed;
      update();
      return { first, after: gameSpeed, gameState, distanceFeet,
        followers: relaxationFollowers.length, absorbed: obstacles[0].absorbed };
    }, type);
    expect(result.first).toBeCloseTo(6.3, 10);
    expect(result.after).toBeCloseTo(6.3, 10);
    expect(result.gameState).toBe('PLAYING');
    expect(result.distanceFeet).toBeGreaterThan(450);
    expect(result.followers).toBe(2);
    expect(result.absorbed).toBe(true);
    await expect(page.locator('#gameOverScreen')).toBeHidden();
  });
}

test('collisions cannot slow below the normal starting speed and speed still increases every 300 feet', async ({ page }) => {
  await startRelaxation(page);
  await disableSpawning(page);
  const result = await page.evaluate(() => {
    gameSpeed = 3.6;
    for (let i = 0; i < 3; i++) {
      obstacles = [{ type: 'log', x: player.x, w: 42, h: 30, y: groundY - 30 }];
      update();
    }
    const minimum = gameSpeed;
    obstacles = [];
    distanceFeet = 299.99;
    nextSpeedUpAt = 300;
    update();
    const firstMilestone = gameSpeed;
    distanceFeet = 599.99;
    update();
    return { minimum, firstMilestone, secondMilestone: gameSpeed, nextSpeedUpAt };
  });
  expect(result.minimum).toBe(3.5);
  expect(result.firstMilestone).toBeCloseTo(3.85, 10);
  expect(result.secondMilestone).toBeCloseTo(4.235, 10);
  expect(result.nextSpeedUpAt).toBe(900);
});

test('obstacle scheduling uses the normal spacing parameters', async ({ page }) => {
  await startRelaxation(page);
  const result = await page.evaluate(() => {
    const original = Math.random;
    try {
      Math.random = () => 0.5;
      gameSpeed = 6;
      nextSpawnTimer = 1;
      update();
      return { gap: nextSpawnTimer, types: obstacles.map(obstacle => obstacle.type) };
    } finally { Math.random = original; }
  });
  expect(result.gap).toBe(Math.max(68, 125 - 6 * 4) + 0.5 * 45);
  expect(result.types).toHaveLength(1);
});

test('both followers replay jumps, extended jumps, and ducks at their own world positions through speed changes', async ({ page }) => {
  await startRelaxation(page);
  await disableSpawning(page);
  const samples = [];
  const record = async (count, changeSpeed = false) => {
    samples.push(...await page.evaluate(({ count, changeSpeed }) => {
      if (changeSpeed) nextSpeedUpAt = distanceFeet + 0.01;
      const samples = [];
      for (let i = 0; i < count; i++) {
        update();
        samples.push({
          speed: gameSpeed,
          leader: { lift: groundY - 22 - player.y, ducking: player.isDucking, grounded: player.isGrounded },
          followers: structuredClone(relaxationFollowers),
        });
      }
      return samples;
    }, { count, changeSpeed }));
  };
  await record(35);
  await page.keyboard.press('Space');
  await record(5);
  await page.keyboard.press('Space');
  await record(160, true);
  await page.keyboard.press('ArrowDown');
  await record(130, true);
  const history = [{ distance: 0, lift: 0, ducking: false, grounded: true }];
  let distance = 0;
  for (const sample of samples) {
    distance += sample.speed;
    history.push({ distance, ...sample.leader });
    for (let follower = 0; follower < 2; follower++) {
      const target = distance - (follower + 1) * 50;
      let index = 0;
      while (index + 1 < history.length && history[index + 1].distance <= target) index++;
      const before = history[index];
      const after = history[index + 1] || before;
      const fraction = Math.max(0, Math.min(1,
        (target - before.distance) / Math.max(0.001, after.distance - before.distance)));
      const pose = sample.followers[follower].pose;
      expect(pose.lift).toBeCloseTo(before.lift + (after.lift - before.lift) * fraction, 6);
      expect(pose.ducking).toBe(before.ducking);
      expect(pose.grounded).toBe(before.grounded && after.grounded);
    }
  }
  for (let follower = 0; follower < 2; follower++) {
    expect(samples.some(sample => sample.followers[follower].pose.lift > 40)).toBe(true);
    expect(samples.some(sample => sample.followers[follower].pose.ducking)).toBe(true);
    expect(samples.at(-1).followers[follower].pose.grounded).toBe(true);
    expect(samples.at(-1).followers[follower].pose.ducking).toBe(false);
  }
});

test('ending relaxation resets its distance and cleanly returns to normal mode', async ({ page }) => {
  await startRelaxation(page);
  await page.evaluate(() => { distanceFeet = 1600; gameSpeed = 8; });
  await page.getByRole('button', { name: 'end run', exact: true }).click();
  expect(await page.evaluate(() => ({
    gameState, runMode, distanceFeet, gameSpeed, followers: relaxationFollowers.length,
  }))).toEqual({ gameState: 'SELECT', runMode: 'normal', distanceFeet: 0, gameSpeed: 3.5, followers: 0 });
  await expect(page.locator('#selectScreen')).toBeVisible();
  await expect(page.locator('#scorePanel')).toBeHidden();
  await expect(page.locator('#endRelaxationButton')).toBeHidden();
  await page.locator(`.char-card[onclick="selectCharacter('reggie')"]`).click();
  await page.keyboard.press('Space');
  await expect(page.locator('#applePanel')).toBeVisible();
  await expect(page.locator('#carrotHud')).toBeVisible();
  await expect(page.locator('#companionStatus')).toHaveText('Friend in 1,000 ft');
  expect(await page.evaluate(() => ({ playerX: player.x, followers: relaxationFollowers.length })))
    .toEqual({ playerX: 90, followers: 0 });
});

test('a new relaxation session always starts its distance from zero', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { distanceFeet = 500; endRun('log'); returnToSelect(); });
  await page.locator('#relaxationModeButton').click();
  await page.evaluate(() => { distanceFeet = 2600; endRelaxationMode(); });
  await page.locator('#relaxationModeButton').click();
  expect(await page.evaluate(() => ({ distanceFeet, gameSpeed }))).toEqual({ distanceFeet: 0, gameSpeed: 3.5 });
});
