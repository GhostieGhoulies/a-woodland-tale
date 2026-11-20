const { test, expect, startGame } = require('./helpers/game');

const expectedSounds = {
  branch: 'leaves', briar: 'leaves', puddle: 'puddle',
  fence: 'wood', bird: 'bird', log: 'original-thud',
};

for (const mode of ['normal', 'buddy', 'relaxation']) {
  test(`${mode}: every obstacle uses the correct sound exactly once without changing collision outcomes`, async ({ page }) => {
    await startGame(page);
    const results = await page.evaluate(({ mode, expectedSounds }) => {
      const heard = [];
      playCollisionEffect = kind => heard.push(kind);
      playThudSound = () => heard.push('original-thud');
      return Object.keys(expectedSounds).map(type => {
        runMode = 'normal';
        prepareRun();
        if (mode === 'relaxation') {
          returnToSelect();
          startRelaxationMode();
        } else {
          startRun();
          if (mode === 'buddy') companion = createCompanion({ lift: 0, ducking: false, grounded: true });
        }
        nextSpawnTimer = Infinity;
        nextAppleAtFeet = Infinity;
        nextGreenAppleAtFeet = Infinity;
        nextCarrotAtFeet = Infinity;
        apples = [];
        const h = type === 'puddle' ? 12 : type === 'bird' ? 24 : type === 'branch' ? 30 : 28;
        const y = type === 'puddle' ? groundY - 6 : type === 'bird' ? groundY - 52 :
          type === 'branch' ? groundY - 56 : groundY - h;
        obstacles = [{ type, x: player.x, y, w: 44, h }];
        gameSpeed = 7;
        nextSpeedUpAt = Infinity;
        heard.length = 0;
        update();
        update();
        return {
          type, sounds: [...heard], gameState, speed: gameSpeed,
          companion: !!companion, followers: relaxationFollowers.length,
        };
      });
    }, { mode, expectedSounds });
    for (const result of results) {
      expect(result.sounds, result.type).toEqual([expectedSounds[result.type]]);
      expect(result.gameState).toBe(mode === 'normal' ? 'GAMEOVER' : 'PLAYING');
      expect(result.speed).toBeCloseTo(mode === 'relaxation' ? 6.3 : 7, 8);
      expect(result.companion).toBe(false);
      expect(result.followers).toBe(mode === 'relaxation' ? 2 : 0);
    }
  });
}

test('new sound waveforms render audible output at immunity-reference volume without clipping', async ({ page }) => {
  const result = await page.evaluate(async () => {
    audioContext = new OfflineAudioContext(1, 48000, 48000);
    audioContext.resume = () => Promise.resolve();
    audioMaster = audioContext.createGain();
    audioMaster.gain.value = 0.42;
    audioMaster.connect(audioContext.destination);
    effectsBus = audioContext.createGain();
    effectsBus.gain.value = 0.9;
    effectsBus.connect(audioMaster);
    audioMuted = false;
    const stats = [];
    // Volume is measured against the unchanged four-voice immunity chord.
    for (const kind of ['leaves', 'puddle', 'wood', 'bird']) {
      const oldRandom = Math.random;
      let buffer;
      try {
        Math.random = () => { throw new Error('Sound changed gameplay randomness'); };
        buffer = collisionSoundBuffer(kind);
      } finally { Math.random = oldRandom; }
      const samples = buffer.getChannelData(0);
      let peak = 0;
      let maxRms = 0;
      for (let offset = 0; offset < samples.length; offset += 4800) {
        let energy = 0;
        for (let i = offset; i < Math.min(offset + 4800, samples.length); i++) {
          energy += samples[i] ** 2;
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        maxRms = Math.max(maxRms, Math.sqrt(energy / 4800));
      }
      stats.push({ kind, peak, maxRms, duration: buffer.duration, cached: buffer === collisionSoundBuffer(kind) });
    }
    await playObstacleContactSound('puddle');
    const output = (await audioContext.startRendering()).getChannelData(0);
    let energy = 0;
    for (const value of output) energy += value ** 2;
    return { stats, outputRms: Math.sqrt(energy / output.length) };
  });
  for (const sound of result.stats) {
    expect(sound.peak, sound.kind).toBeLessThanOrEqual(0.981);
    expect(sound.maxRms, sound.kind).toBeCloseTo(0.18 * Math.sqrt(2), 3);
    expect(sound.duration).toBeGreaterThanOrEqual(0.3);
    expect(sound.cached).toBe(true);
  }
  expect(result.outputRms).toBeGreaterThan(0.01);
});

test('muting suppresses all replacement effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    audioContext = new OfflineAudioContext(1, 48000, 48000);
    audioMaster = audioContext.createGain();
    audioMaster.connect(audioContext.destination);
    effectsBus = audioContext.createGain();
    effectsBus.connect(audioMaster);
    audioMuted = true;
    for (const type of ['branch', 'briar', 'fence', 'puddle', 'bird']) playObstacleContactSound(type);
    const samples = (await audioContext.startRendering()).getChannelData(0);
    return { silent: samples.every(value => value === 0), buffers: collisionSoundBuffers.size };
  });
  expect(result).toEqual({ silent: true, buffers: 0 });
});

for (const sampleRate of [44100, 48000]) {
  test(`log impact matches other obstacle volumes while preserving its exact sound at ${sampleRate} Hz`, async ({ page }) => {
    const result = await page.evaluate(async rate => {
      startAudio = () => {};
      audioMuted = false;
      async function render(boosted) {
        audioContext = new OfflineAudioContext(1, rate, rate);
        effectsBus = audioContext.createGain();
        effectsBus.connect(audioContext.destination);
        noiseBuffer = effectsNoiseBuffer = audioContext.createBuffer(1, rate, rate);
        const noise = effectsNoiseBuffer.getChannelData(0);
        let seed = 47291;
        for (let i = 0; i < noise.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          noise[i] = seed / 2147483648 - 1;
        }
        if (boosted) playObstacleContactSound('log');
        else {
          playTone(105, 42, 0.24, 0.38, 'sine');
          playNoiseSweep(330, 75, 0.15, 0.2);
        }
        return (await audioContext.startRendering()).getChannelData(0);
      }
      const original = await render(false);
      const boosted = await render(true);
      let peak = 0, maxRms = 0, waveformError = 0;
      const windowSize = rate * 0.1;
      for (let offset = 0; offset < boosted.length; offset += windowSize) {
        let energy = 0;
        for (let i = offset; i < Math.min(boosted.length, offset + windowSize); i++) {
          peak = Math.max(peak, Math.abs(boosted[i]));
          energy += boosted[i] ** 2;
          waveformError = Math.max(waveformError, Math.abs(boosted[i] - original[i] * 2.47));
        }
        maxRms = Math.max(maxRms, Math.sqrt(energy / windowSize));
      }
      return { peak, maxRms, waveformError };
    }, sampleRate);
    expect(result.maxRms).toBeCloseTo(0.18 * Math.sqrt(2), 2);
    expect(result.peak).toBeLessThan(0.98);
    expect(result.waveformError).toBeLessThan(0.000001);
  });
}

test('selects the Safari playback channel before creating the audio context', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true, value: { type: 'ambient' },
    });
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor(...args) {
        window.channelAtAudioCreation = navigator.audioSession.type;
        super(...args);
      }
    };
  });
  await page.reload();
  await page.locator('#storyNext').click();
  expect(await page.evaluate(() => ({
    channel: navigator.audioSession.type, atCreation: window.channelAtAudioCreation,
  }))).toEqual({ channel: 'playback', atCreation: 'playback' });
});

for (const mode of ['normal', 'buddy', 'relaxation']) {
  test(`${mode}: real collisions produce live audio through the unchanged effects mixer`, async ({ page }) => {
    await page.evaluate(() => { audioMuted = false; });
    await startGame(page);
    await page.waitForFunction(() => audioContext.state === 'running' && audioContext.currentTime > 1,
      null, { polling: 50 });
    const measurements = await page.evaluate(async mode => {
      const meter = audioContext.createAnalyser();
      meter.fftSize = 2048;
      effectsBus.connect(meter);
      const results = [];
      for (const type of ['branch', 'briar', 'puddle', 'fence', 'bird', 'log']) {
        runMode = 'normal';
        prepareRun();
        if (mode === 'relaxation') {
          returnToSelect();
          startRelaxationMode();
        } else {
          startRun();
          if (mode === 'buddy') companion = createCompanion({ lift: 0, ducking: false, grounded: true });
        }
        nextSpawnTimer = nextAppleAtFeet = nextGreenAppleAtFeet = nextCarrotAtFeet = Infinity;
        apples = [];
        const h = type === 'puddle' ? 12 : type === 'bird' ? 24 : type === 'branch' ? 30 : 28;
        const y = type === 'puddle' ? groundY - 6 : type === 'bird' ? groundY - 52 :
          type === 'branch' ? groundY - 56 : groundY - h;
        obstacles = [{ type, x: player.x, y, w: 44, h }];
        update();
        let maxRms = 0;
        for (let i = 0; i < 45; i++) {
          await new Promise(resolve => setTimeout(resolve, 20));
          const samples = new Float32Array(meter.fftSize);
          meter.getFloatTimeDomainData(samples);
          maxRms = Math.max(maxRms, Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length));
        }
        results.push({ type, maxRms, state: audioContext.state,
          effectsGain: effectsBus.gain.value, masterGain: audioMaster.gain.value });
      }
      effectsBus.disconnect(meter);
      return results;
    }, mode);
    for (const result of measurements) {
      expect(result.maxRms, result.type).toBeGreaterThan(0.04);
      expect(result.state).toBe('running');
      expect(result.effectsGain).toBeCloseTo(0.9);
      expect(result.masterGain).toBeCloseTo(0.42);
    }
  });
}

test('waits for audio recovery before scheduling a collision sound', async ({ page }) => {
  await page.evaluate(() => { audioMuted = false; });
  await startGame(page);
  await page.waitForFunction(() => audioContext.state === 'running' && audioContext.currentTime > 1,
    null, { polling: 50 });
  await page.evaluate(async () => {
    await audioContext.suspend();
    const resume = audioContext.resume.bind(audioContext);
    audioContext.resume = () => new Promise(resolve => {
      window.releaseAudioResume = () => resume().then(resolve);
    });
    const createSource = audioContext.createBufferSource.bind(audioContext);
    window.collisionSourcesScheduled = 0;
    audioContext.createBufferSource = () => {
      window.collisionSourcesScheduled++;
      return createSource();
    };
    window.recoveryMeter = audioContext.createAnalyser();
    effectsBus.connect(window.recoveryMeter);
    window.pendingCollision = playCollisionEffect('wood');
  });
  expect(await page.evaluate(() => window.collisionSourcesScheduled)).toBe(0);
  await page.evaluate(() => window.releaseAudioResume());
  await page.evaluate(() => window.pendingCollision);
  expect(await page.evaluate(() => window.collisionSourcesScheduled)).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const samples = new Float32Array(window.recoveryMeter.fftSize);
    window.recoveryMeter.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  }), { intervals: [10, 20, 30] }).toBeGreaterThan(0.05);
});
