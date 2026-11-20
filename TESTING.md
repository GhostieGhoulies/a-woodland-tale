# Browser regression tests

These tests load the actual `index.html` in Chromium. They use the real keyboard
handlers, physics, spawning shapes, collision code, HUD and Try Again button.
There are no production test hooks or copied game implementations.

## Run

Requires Node.js (20 or newer), npm and Python 3.

```sh
npm ci
# Outside Replit, install Chromium once:
npx playwright install chromium
npm test
```

Replit's supplied `/repl/tools/bin/chromium` is used automatically. To use another
local Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.
On a Linux machine missing browser libraries, use
`npx playwright install --with-deps chromium` instead.

`npm run test:companion` runs lifecycle/collision tests only.
`npm run test:headed` opens the browser when a graphical display is available.
The suite starts and stops its own Python server on port 5075; the preview on
port 5000 is not required or affected. Port 5075 must be free.

## Coverage and determinism

- No companion before 5,000 solo feet; spawn on the crossing frame.
- All three runners, with both eligible friends and no self-selection.
- Continued presence through multiple earning intervals, with only one spare life.
- Normal jump, extended jump and duck replay 50 world pixels behind the player,
  including interpolation and speed increases at both low and high speeds.
- All six obstacle types consume a companion, ignore later frames of the same
  obstacle, but do not grant immunity from a new obstacle.
- Invincibility preserves the friend; the same obstacle can consume it after expiry.
- Loss starts a new 5,000-foot solo interval, followed by another usable companion.
- Try Again clears the companion, solo baseline, motion history and run state;
  the next run must earn a new friend from zero.

Tests disable automatic animation scheduling and advance the actual `update()`
one frame at a time. Random obstacle/carrot scheduling is suppressed; collision
tests explicitly spawn real obstacles. The sound setting is muted. Random
selection is controlled only where a specific branch is required. No arbitrary
sleeps or wall-clock races are used. An independent full-history oracle checks
the follower pose against observed player poses, not production trail data.

This suite targets desktop Chromium game logic, not mobile gestures, sound,
visual appearance, or best-distance persistence.

## Failures

The command exits nonzero on failure. Playwright writes screenshots and traces
under `test-results/` (ignored by Git and deployment). Inspect a retained trace:

```sh
npx playwright show-trace test-results/<failed-test-directory>/trace.zip
```
