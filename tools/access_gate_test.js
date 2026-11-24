import { chromium } from "playwright";

const site = "https://arthur404-max.github.io/IT_ENGLISH_TG_2/";

async function withTelegramMock(page, statusPayload, gamePayload = null) {
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.Telegram = {
      WebApp: {
        initData: "query_id=test&user=%7B%22id%22%3A123%7D&hash=invalid",
        platform: "android",
        colorScheme: "dark",
        ready() {},
        expand() {},
        close() {},
        openInvoice() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        BackButton: {
          show() {},
          hide() {},
          onClick() {},
        },
      },
    };`,
    });
  });
  await page.route("https://desktop-lj8j1lk.tail050ea4.ts.net/api/access/status", async (route) => {
    await route.fulfill({
      status: statusPayload.status || 200,
      contentType: "application/json",
      body: JSON.stringify(statusPayload.body || {}),
    });
  });
  if (gamePayload) {
    await page.route("https://desktop-lj8j1lk.tail050ea4.ts.net/api/access/game/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(gamePayload),
      });
    });
  }
}

const browser = await chromium.launch({ headless: true });
let failed = false;

const noTelegram = await browser.newContext({ viewport: { width: 390, height: 844 } });
const noTelegramPage = await noTelegram.newPage();
await noTelegramPage.goto(site);
await noTelegramPage.waitForTimeout(500);
const gateVisible = await noTelegramPage.locator("#tg-access-gate").isVisible();
const shellHidden = await noTelegramPage.locator(".app-shell").evaluate((element) =>
  getComputedStyle(element).visibility === "hidden");
if (!gateVisible || !shellHidden) {
  console.error("FAIL: browser without Telegram exposes or does not gate the app");
  failed = true;
}
await noTelegram.close();

const locked = await browser.newContext({ viewport: { width: 390, height: 844 } });
const lockedPage = await locked.newPage();
await withTelegramMock(lockedPage, { status: 200, body: { paid: false, free: false } });
await lockedPage.goto(site);
await lockedPage.waitForTimeout(500);
const lockedGate = await lockedPage.locator("#tg-access-gate").isVisible();
const lockedShell = await lockedPage.locator(".app-shell").evaluate((element) =>
  getComputedStyle(element).visibility === "hidden");
if (!lockedGate || !lockedShell) {
  console.error("FAIL: valid Telegram context without purchase is unlocked");
  failed = true;
}
await locked.close();

const unlocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
const unlockedPage = await unlocked.newPage();
await withTelegramMock(unlockedPage, { status: 200, body: { paid: true, free: false } });
await unlockedPage.goto(site);
await unlockedPage.waitForTimeout(500);
const unlockedGateHidden = await unlockedPage.locator("#tg-access-gate").isHidden();
const unlockedShellVisible = await unlockedPage.locator(".app-shell").evaluate((element) =>
  getComputedStyle(element).visibility !== "hidden");
if (!unlockedGateHidden || !unlockedShellVisible) {
  console.error("FAIL: confirmed paid access did not unlock the app");
  failed = true;
}
await unlocked.close();

const directGame = await browser.newContext({ viewport: { width: 390, height: 844 } });
const directGamePage = await directGame.newPage();
await withTelegramMock(directGamePage,
  { status: 200, body: { paid: false, free: false } },
  {
    nonce: "test-session",
    questions: Array.from({ length: 10 }, (_, index) => ({
      en: `term-${index}`,
      options: ["one", "two", "three", "four"],
    })),
  });
await directGamePage.goto(`${site}?free_game=1#/home`);
await directGamePage.waitForTimeout(700);
const gameVisible = await directGamePage.locator(".tg-game-options").isVisible();
const directShellHidden = await directGamePage.locator(".app-shell").evaluate((element) =>
  getComputedStyle(element).visibility === "hidden");
if (!gameVisible || !directShellHidden) {
  console.error("FAIL: free-game direct link did not open only the game");
  failed = true;
}
await directGame.close();

await browser.close();
if (failed) process.exit(1);
console.log("PASS: locked, unlocked, no-Telegram, and direct-game access gates");
