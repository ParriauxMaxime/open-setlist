import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { startRecording } from "./recorder.mjs";

export const APP = process.env.APP_URL ?? "http://localhost:3000";

export async function openStage() {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: "dark", locale: "fr-FR" });
  await ctx.route(`${APP}/__stage`, (r) => r.fulfill({ contentType: "text/html", body: readFileSync(new URL("./stage.html", import.meta.url)) }));
  await ctx.addInitScript(() => {
    if (!location.pathname.startsWith("/__stage") && !localStorage.getItem("demo-init")) {
      localStorage.setItem("demo-init", "1");
      localStorage.setItem("open-setlist-display-prefs", JSON.stringify({ locale: "fr" }));
      localStorage.setItem("open-setlist-perform-hints-seen", "1");
      localStorage.setItem("open-setlist-onboarding-dismissed", "1");
    }
  });
  const page = await ctx.newPage();
  await page.goto(`${APP}/__stage`);
  const app = page.frameLocator("#app");
  const frame = () => page.frame({ url: (u) => u.href.startsWith(APP) && !u.pathname.startsWith("/__stage") });
  const go = async (path, wait = 1200) => {
    await page.evaluate(() => document.getElementById("tablet").classList.add("dim"));
    await page.waitForTimeout(260);
    await page.evaluate((u) => { document.getElementById("app").src = u; }, `${APP}${path}`);
    await page.waitForTimeout(wait);
    await page.evaluate(() => document.getElementById("tablet").classList.remove("dim"));
    await page.waitForTimeout(260);
  };
  const tap = async (locator, opts = {}) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("no box");
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.evaluate(([x, y]) => window.tapAt(x, y), [x, y]);
    await page.waitForTimeout(opts.pre ?? 180);
    await locator.click({ force: true });
    await page.waitForTimeout(opts.post ?? 500);
  };
  const caption = (k, t, s) => page.evaluate(([k, t, s]) => window.caption(k, t, s), [k, t, s]);
  const card = (on, b, l, s, u) => page.evaluate(([on, b, l, s, u]) => window.card(on, b, l, s, u), [on, b, l, s, u]);
  const wait = (ms) => page.waitForTimeout(ms);
  // Camera zoom on a point given in app (iframe CSS) coordinates.
  const zoomApp = (x, y, sc) => page.evaluate(([x, y, sc]) => window.zoom(644 + x, 120 + y, sc), [x, y, sc]);
  const zoomOn = async (locator, sc) => {
    const box = await locator.boundingBox();
    if (!box) return;
    await page.evaluate(([x, y, sc]) => window.zoom(x, y, sc), [box.x + box.width / 2, box.y + box.height / 2, sc]);
  };
  const unzoom = () => page.evaluate(() => window.zoom(0, 0, 1));
  const scrollApp = async (dy, steps = 20, delay = 30) => {
    await page.mouse.move(1234, 560);
    for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(delay); }
  };
  return { browser, page, app, frame, go, tap, caption, card, wait, scrollApp, zoomApp, zoomOn, unzoom, record: (dir) => startRecording(page, dir) };
}
