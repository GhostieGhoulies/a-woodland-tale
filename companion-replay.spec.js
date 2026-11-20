const { test, expect, startGame, acquireCompanion } = require('./helpers/game');

// Independent test oracle: 50 world pixels behind the leader, never N frames.
// Keep full history here (unlike the production rolling buffer).
function checkReplay(samples) {
  const history = [{ distance: 0, lift: 0, ducking: false, grounded: true }];
  let distance = 0;
  for (const [frame, sample] of samples.entries()) {
    distance += sample.speed;
    history.push({ distance, ...sample.leader });
    const target = distance - 50;
    let index = 0;
    while (index + 1 < history.length && history[index + 1].distance <= target) index++;
    const before = history[index];
    const after = history[index + 1] || before;
    const fraction = Math.max(0, Math.min(1,
      (target - before.distance) / Math.max(0.001, after.distance - before.distance)));
    expect(sample.follower.lift, `lift on frame ${frame}`).toBeCloseTo(
      before.lift + (after.lift - before.lift) * fraction, 6);
    expect(sample.follower.ducking, `duck on frame ${frame}`).toBe(before.ducking);
    expect(sample.follower.grounded, `grounded on frame ${frame}`).toBe(before.grounded && after.grounded);
  }
}

async function recordFrames(page, count, accelerate = false) {
  return page.evaluate(({ count, accelerate }) => {
    if (accelerate) nextSpeedUpAt = distanceFeet + 0.01;
    const samples = [];
    for (let i = 0; i < count; i++) {
      update();
      samples.push({
        speed: gameSpeed,
        leader: {
          lift: groundY - 22 - player.y,
          grounded: player.isGrounded,
          ducking: player.isDucking,
        },
        follower: structuredClone(companion.pose),
        extended: player.hasExtendedJump,
      });
    }
    return samples;
  }, { count, accelerate });
}

for (const speed of [7.5, 22.5]) {
  test(`jump, extra hang time and duck replay by distance while speed changes from ${speed}`, async ({ page }) => {
    await startGame(page);
    await acquireCompanion(page);
    await page.evaluate(speed => { gameSpeed = speed; }, speed);
    const samples = await recordFrames(page, 20);

    await page.keyboard.press('ArrowUp');
    const normal = [
      ...await recordFrames(page, 2),
      ...await recordFrames(page, 70, true),
    ];
    samples.push(...normal);
    expect(normal[0].leader.lift).toBeGreaterThan(0);
    expect(normal[0].follower.lift).toBe(0); // No simultaneous jump.
    expect(normal.some(sample => sample.follower.lift > 0)).toBe(true);
    expect(normal.at(-1).follower.grounded).toBe(true);

    // Repeat at the same starting speed, adding a second real keyboard input.
    await page.evaluate(speed => { gameSpeed = speed; nextSpeedUpAt = Infinity; }, speed);
    await page.keyboard.press('Space');
    const extended = await recordFrames(page, 2);
    extended.push(...await recordFrames(page, 2, true));
    await page.keyboard.press('Space');
    extended.push(...await recordFrames(page, 100));
    samples.push(...extended);
    expect(extended[4].extended).toBe(true);
    const airborneDistance = trace => trace
      .filter(sample => !sample.leader.grounded)
      .reduce((distance, sample) => distance + sample.speed, 0);
    expect(airborneDistance(extended)).toBeGreaterThan(airborneDistance(normal) * 1.5);
    expect(extended.some(sample => sample.follower.lift > 0)).toBe(true);
    expect(extended.at(-1).follower.grounded).toBe(true);

    await page.keyboard.press('ArrowDown');
    const duck = [
      ...await recordFrames(page, 1),
      ...await recordFrames(page, 95, true),
    ];
    samples.push(...duck);
    expect(duck[0].leader.ducking).toBe(true);
    expect(duck[0].follower.ducking).toBe(false);
    expect(duck.some(sample => sample.follower.ducking)).toBe(true);
    const leaderEnd = duck.findIndex(sample => !sample.leader.ducking);
    expect(leaderEnd).toBeGreaterThan(0);
    expect(duck[leaderEnd].follower.ducking).toBe(true);
    expect(duck.at(-1).follower.ducking).toBe(false);
    expect(new Set(samples.map(sample => sample.speed)).size).toBeGreaterThan(2);
    checkReplay(samples);
  });
}
