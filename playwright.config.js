const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');

// Replit provides Chromium; elsewhere use Playwright's installed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5075',
    viewport: { width: 1000, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Own server, separate from the preview: no manually started workflow needed.
  webServer: {
    command: 'python3 -m http.server 5075 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5075',
    reuseExistingServer: false,
  },
});
