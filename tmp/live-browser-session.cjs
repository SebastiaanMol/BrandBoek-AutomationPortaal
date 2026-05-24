const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const profileDir = path.resolve("tmp/playwright-live-profile");
const markerFile = path.resolve("tmp/live-browser-session.txt");
const port = Number(process.env.LIVE_BROWSER_PORT || 9333);

(async () => {
  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: [`--remote-debugging-port=${port}`],
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("http://127.0.0.1:5173/flows", { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});

  fs.writeFileSync(markerFile, [
    `pid=${process.pid}`,
    `port=${port}`,
    `profile=${profileDir}`,
    `started=${new Date().toISOString()}`,
  ].join("\n"));

  await new Promise(() => {});
})().catch((err) => {
  fs.writeFileSync(markerFile, `FAILED\n${err.stack || err.message}`);
  process.exit(1);
});
