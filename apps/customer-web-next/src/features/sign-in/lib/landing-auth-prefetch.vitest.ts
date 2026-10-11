// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const index = readFileSync(resolve("public/landing-v20/index.html"), "utf8");
const bridge = index.match(/<script\b[^>]*\bid=["']craves-landing-auth-bridge["'][^>]*>([\s\S]*?)<\/script>/)![1];
const manifest = { script: "/landing-auth/auth-test.js", style: "/landing-auth/auth-test.css" };
const fetchAsset = vi.fn();
const importAsset = vi.fn();
const open = vi.fn(async () => {
  const portal = document.createElement("div");
  portal.id = "craves-customer-auth";
  document.body.append(portal);
});
let removeBridgeListeners: () => void;

function installBridge() {
  // Replace only the dynamic-import transport; execute the committed adapter.
  new Function("importAuth", bridge.replace("import(scriptUrl)", "importAuth(scriptUrl)"))(importAsset);
}
const intent = (type: string, options: MouseEventInit = {}) =>
  document.getElementById("sign-in")!.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
const click = (options: MouseEventInit = {}) => intent("click", options);
const style = () => document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = '<a id="sign-in" href="#sign-in"><span>Sign up / Sign in</span></a><a id="other" href="#contact">Contact</a>';
  fetchAsset.mockReset().mockImplementation(async () => new Response(JSON.stringify(manifest)));
  importAsset.mockReset().mockResolvedValue({ openLandingAuth: open });
  open.mockClear();
  vi.stubGlobal("fetch", fetchAsset);
  const registrations = vi.spyOn(document, "addEventListener");
  removeBridgeListeners = () => {
    for (const [type, listener, options] of registrations.mock.calls) {
      document.removeEventListener(type, listener as EventListener,
        typeof options === "boolean" ? options : options?.capture);
    }
  };
  installBridge();
});

afterEach(() => {
  removeBridgeListeners();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

it("warms only static assets, deduplicates intent and click, and keeps the popup behind CSS readiness", async () => {
  expect(fetchAsset).not.toHaveBeenCalled();
  intent("pointerover");
  document.getElementById("sign-in")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  intent("pointerdown");
  await vi.waitFor(() => expect(importAsset).toHaveBeenCalledOnce());
  expect(fetchAsset).toHaveBeenCalledExactlyOnceWith("/landing-auth/manifest.json", { cache: "no-store" });
  expect(importAsset).toHaveBeenCalledWith(manifest.script);
  expect(document.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
  expect(open).not.toHaveBeenCalled();
  expect(document.getElementById("craves-customer-auth")).toBeNull();
  expect(document.getElementById("sign-in")!.textContent).toBe("Sign up / Sign in");
  expect(document.getElementById("sign-in")!.hasAttribute("aria-busy")).toBe(false);
  expect(click()).toBe(false);
  expect(click()).toBe(false);
  await Promise.resolve();
  expect(open).not.toHaveBeenCalled();
  style().dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(document.getElementById("sign-in")!.hasAttribute("aria-busy")).toBe(false));
  expect(document.getElementById("sign-in")!.textContent).toBe("Sign up / Sign in");
  expect(fetchAsset.mock.calls.every(([url]) => String(url).startsWith("/landing-auth/"))).toBe(true);
});

it("preserves modified and nonprimary clicks and ignores unrelated link intent", () => {
  intent("pointerover", { ctrlKey: true });
  intent("pointerdown", { button: 1 });
  document.getElementById("other")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(fetchAsset).not.toHaveBeenCalled();
  expect(click({ ctrlKey: true })).toBe(true);
  expect(click({ button: 1 })).toBe(true);
  expect(fetchAsset).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
});

it.each(["manifest", "module"])("retries a failed %s prewarm on the next intent without duplicate styles or opening early", async (failure) => {
  if (failure === "manifest") fetchAsset.mockResolvedValueOnce(new Response(null, { status: 503 }));
  else importAsset.mockRejectedValueOnce(new Error("network"));
  intent("pointerdown");
  await vi.waitFor(() => expect(failure === "manifest" ? fetchAsset : importAsset).toHaveBeenCalledOnce());
  // Let the adapter's rejection clear its shared loading promise.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(open).not.toHaveBeenCalled();
  intent("pointerover");
  await vi.waitFor(() => expect(fetchAsset).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(importAsset).toHaveBeenCalledTimes(failure === "manifest" ? 1 : 2));
  expect(importAsset).toHaveBeenLastCalledWith(manifest.script + (failure === "module" ? "?craves_retry=1" : ""));
  expect(document.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
  click();
  style().dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(fetchAsset).toHaveBeenCalledTimes(2);
});

it("keeps retry URLs fresh after several consecutive module failures", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    importAsset.mockRejectedValueOnce(new Error("network"));
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    intent("pointerdown");
    await vi.waitFor(() => expect(importAsset).toHaveBeenCalledTimes(attempt + 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  intent("pointerover");
  await vi.waitFor(() => expect(importAsset).toHaveBeenCalledTimes(6));
  expect(importAsset.mock.calls.map(([url]) => url)).toEqual([
    manifest.script, ...[1, 2, 3, 4, 5].map((attempt) => manifest.script + "?craves_retry=" + attempt),
  ]);
  expect(document.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
  expect(open).not.toHaveBeenCalled();
  click();
  style().dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
});
