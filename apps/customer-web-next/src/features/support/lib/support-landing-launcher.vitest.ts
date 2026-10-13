// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import nextConfig from "../../../../next.config";

const released = readFileSync(resolve("public/landing-v20/index.html"), "utf8");
const source = readFileSync(resolve("../landing-v20/index.html"), "utf8");
const snippet = released.match(/<style id="craves-assistant-style">[\s\S]*?<script id="craves-assistant-launcher">[\s\S]*?<\/script>/)![0];
const flat = (html: string) => html.replace(/\s+/g, " ");

it("landing page has the Ask Craves button, which loads the chat only when first opened", () => {
  expect(flat(source)).toContain(flat(snippet));
  document.body.innerHTML = snippet;
  new Function(snippet.match(/<script id="craves-assistant-launcher">([\s\S]*?)<\/script>/)![1])();
  const button = document.getElementById("craves-ask")!;
  const panel = document.getElementById("craves-ask-panel")!;
  const frame = document.getElementById("craves-ask-frame")!;
  expect(panel.hidden).toBe(true);
  expect(frame.getAttribute("src")).toBeNull();

  button.click();
  expect(panel.hidden).toBe(false);
  expect(frame.getAttribute("src")).toBe("/assistant");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.getAttribute("aria-label")).toBe("Close Craves assistant");

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(panel.hidden).toBe(true);
  expect(document.activeElement).toBe(button);

  button.click();
  document.getElementById("craves-ask-close")!.click();
  expect(panel.hidden).toBe(true);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(button.getAttribute("aria-label")).toBe("Questions? Ask Craves assistant");
  expect(button.textContent).toContain("Questions?");
});

it("only the assistant chat may be framed, and only by craves.in itself", async () => {
  const rules = await nextConfig.headers!();
  const frameOption = (path: string) => rules
    .filter(rule => rule.source === "/(.*)" || rule.source === path)
    .flatMap(rule => rule.headers)
    .filter(header => header.key === "X-Frame-Options")
    .at(-1)?.value;
  expect(frameOption("/assistant")).toBe("SAMEORIGIN");
  expect(frameOption("/home")).toBe("DENY");
});
