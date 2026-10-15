// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChefFace } from "./ChefFace";

const AVATAR = "https://craves.in/media/public/chef-avatars/chef-avatar-07.jpg";
afterEach(cleanup);

describe("ChefFace", () => {
  it("shows the https picture, hidden from screen readers by default", () => {
    const { container } = render(createElement(ChefFace, { photoUrl: AVATAR, name: "Asha Rao", size: 48 }));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(AVATAR);
    expect(img.getAttribute("alt")).toBe("");
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
    expect((container.firstElementChild as HTMLElement).style.width).toBe("48px");
  });

  it("names the picture when it is not decorative", () => {
    const { container } = render(createElement(ChefFace, { photoUrl: AVATAR, name: "Asha Rao", decorative: false }));
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("Asha Rao's chef picture");
    expect(container.firstElementChild!.hasAttribute("aria-hidden")).toBe(false);
  });

  it("falls back to initials when the url is not https or the picture fails", () => {
    const insecure = render(createElement(ChefFace, { photoUrl: "http://craves.in/a.jpg", name: "Asha Rao" }));
    expect(insecure.container.querySelector("img")).toBeNull();
    expect(insecure.container.textContent).toBe("AR");
    cleanup();
    const broken = render(createElement(ChefFace, { photoUrl: AVATAR, name: "Asha Rao", decorative: false }));
    fireEvent.error(broken.container.querySelector("img")!);
    expect(broken.container.querySelector("img")).toBeNull();
    expect(broken.getByRole("img", { name: "Asha Rao's chef picture" }).textContent).toBe("AR");
  });

  it("shows a chef hat when there is no picture and no name", () => {
    const { container } = render(createElement(ChefFace, { photoUrl: null, name: "  " }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });
});
