const { test, expect } = require('@playwright/test');

test('fairycore instrumental plays, loops, and shares Sound mute without restarting on jumps', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/');
  await page.locator('#storyNext').click();
  await page.waitForFunction(() => backgroundMusic &&
    !backgroundMusic.paused && backgroundMusic.currentTime > 0.1, null, { polling: 100 });
  expect(await page.evaluate(() => ({
    loop: backgroundMusic.loop,
    track: new URL(backgroundMusic.src).pathname,
    context: audioContext.state,
    forest: ambienceNoise !== null,
  }))).toEqual({
    loop: true,
    track: '/attached_assets/generated_audio/fairycore-woodland.mp3',
    context: 'running',
    forest: true,
  });
  expect(await page.evaluate(() => musicBus.gain.value)).toBeCloseTo(0.65);

  // Measure the actual decoded music signal, not just a successful play() call.
  await page.evaluate(() => {
    window.musicMeter = audioContext.createAnalyser();
    musicBus.connect(window.musicMeter);
  });
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(window.musicMeter.fftSize);
    window.musicMeter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  })).toBeGreaterThan(0.001);

  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveText('Sound: Off');
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeLessThan(0.005);
  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveText('Sound: On');
  await expect.poll(() => page.evaluate(() => audioMaster.gain.value)).toBeGreaterThan(0.4);

  await page.locator('#storyNext').click();
  await page.locator('#storyNext').click();
  await page.locator(".char-card[onclick=\"selectCharacter('mac')\"]").click();
  await page.keyboard.press('Space');
  const before = await page.evaluate(() => backgroundMusic.currentTime);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => backgroundMusic.currentTime)).toBeGreaterThanOrEqual(before);

  await page.waitForFunction(() => Number.isFinite(backgroundMusic.duration), null, { polling: 100 });
  await page.evaluate(() => { backgroundMusic.currentTime = backgroundMusic.duration - 0.3; });
  await page.waitForFunction(() => backgroundMusic.currentTime < 2 && !backgroundMusic.paused,
    null, { polling: 100 });
  expect(await page.evaluate(() => backgroundMusic.error)).toBeNull();
  expect(errors).toEqual([]);
});
