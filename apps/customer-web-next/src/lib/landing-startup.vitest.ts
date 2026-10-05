import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// jsdom is already installed for the behavioral suite; keep this fixture's
// browser surface typed without adding a production/package dependency.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: Record<string, unknown>) => { window: Window & typeof globalThis };
};

const html = readFileSync(new URL("../../public/landing-v20/index.html", import.meta.url), "utf8");
const scriptPath = html.match(/src="\/landing-v20\/assets\/([^"?]+\.js)"/)![1];
const bundle = readFileSync(new URL(`../../public/landing-v20/assets/${scriptPath}`, import.meta.url), "utf8");
let page: InstanceType<typeof JSDOM> | undefined;
afterEach(() => {
  page?.window.document.querySelectorAll("link[data-craves-css]").forEach(link => link.dispatchEvent(new page!.window.Event("load")));
  page?.window.close();
  page = undefined;
});

function mount(options: { reduced?: boolean; saveData?: boolean } = {}) {
  page = new JSDOM(html, { url: "https://fixture.invalid/", runScripts: "outside-only", pretendToBeVisual: true });
  const browser = page.window;
  browser.performance.getEntriesByType = vi.fn(() => []);
  const idleCallbacks: Array<() => void> = [];
  browser.matchMedia = vi.fn(query => ({ matches: Boolean(options.reduced && query.includes("reduced-motion")), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  Object.defineProperty(browser.navigator, "connection", { value: { saveData: options.saveData === true } });
  browser.requestIdleCallback = vi.fn(callback => { idleCallbacks.push(() => callback({ didTimeout: false, timeRemaining: () => 50 })); return idleCallbacks.length; });
  browser.cancelIdleCallback = vi.fn();
  browser.HTMLMediaElement.prototype.load = vi.fn();
  browser.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  const boot = browser.document.getElementById("craves-boot-script")!.textContent!;
  browser.eval(boot);
  // jsdom executes a classic script; supply the built module's asset base.
  // The auth module import remains untouched and is triggered only by clicks.
  browser.eval(bundle.replaceAll("import.meta", `(${JSON.stringify({ url: `https://fixture.invalid/landing-v20/assets/${scriptPath}` })})`));
  return { browser, idleCallbacks };
}

describe("served landing startup", () => {
  it("reveals the real page while font CSS and images have not completed", async () => {
    const { browser } = mount();
    expect(browser.document.documentElement.hasAttribute("data-craves-boot")).toBe(true);
    await vi.waitFor(() => expect(browser.document.getElementById("craves-boot")).toBeNull());
    expect(browser.document.querySelector("h1")?.textContent).toContain("CRAVE MORE.");
    expect(browser.document.querySelector('a[href="#sign-in"]')).toBeTruthy();
    expect(browser.document.querySelector("#top")?.classList.contains("is-visible")).toBe(true);
    expect(browser.document.querySelector('link[href*="font-loading.css"]')?.getAttribute("media")).toBe("print");
    expect(browser.document.querySelector('link[href*="assets/index-"]')?.getAttribute("media")).toBeNull();
    expect(browser.document.querySelector(".splash-screen")).toBeNull();
  });

  it("keeps the poster until idle, then starts only the compact hero video", async () => {
    const { browser, idleCallbacks } = mount();
    await vi.waitFor(() => expect(idleCallbacks).toHaveLength(1));
    const video = browser.document.querySelector(".hero__video") as HTMLVideoElement;
    expect(video.preload).toBe("none");
    expect(video.poster).toContain("hero-poster.jpg");
    expect(video.querySelector("source")).toBeNull();
    idleCallbacks[0]();
    await vi.waitFor(() => expect(video.querySelector("source")?.src).toContain("hero-bg-fast.mp4?craves_rev="));
    expect(browser.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it.each([{ reduced: true }, { saveData: true }])("does not request video with preference %j", async options => {
    const { browser, idleCallbacks } = mount(options);
    await vi.waitFor(() => expect(browser.document.getElementById("craves-boot")).toBeNull());
    expect(browser.document.querySelector(".hero__video source")).toBeNull();
    expect(idleCallbacks).toHaveLength(0);
    expect(browser.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
