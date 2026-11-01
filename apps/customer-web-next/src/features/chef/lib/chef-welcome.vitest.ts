// @vitest-environment jsdom
// The "You're a Craves chef" sheet: once, right after approval, only while the menu is empty.
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldWelcome } from "../components/chef-mode-dashboard";
import type { ChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import type { ChefMenuItem } from "./chef-menu-contract";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/chef" }));

const KEY = "craves-chef-approved:fixture";
const NOW = Date.parse("2026-10-16T07:00:00Z");
const application = (status: string, reviewedAt: string | null) => ({ status, reviewedAt }) as unknown as ChefApplication;
const dish = {} as ChefMenuItem;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("welcome after approval", () => {
  it("shows for a chef approved days ago with no dishes, once per device", () => {
    vi.useFakeTimers({ now: NOW });
    expect(shouldWelcome(application("APPROVED", "2026-10-12T10:00:00Z"), [], KEY)).toBe(true);
    localStorage.setItem(KEY, "seen");
    expect(shouldWelcome(application("APPROVED", "2026-10-12T10:00:00Z"), [], KEY)).toBe(false);
  });

  it.each([
    ["not approved yet", application("PENDING", "2026-10-12T10:00:00Z"), []],
    ["already has a dish", application("APPROVED", "2026-10-12T10:00:00Z"), [dish]],
    ["approved months ago", application("APPROVED", "2026-06-01T10:00:00Z"), []],
    ["no approval date", application("APPROVED", null), []],
    ["an unreadable approval date", application("APPROVED", "soon"), []],
  ])("stays away when %s", (_, value, menu) => {
    vi.useFakeTimers({ now: NOW });
    expect(shouldWelcome(value, menu, KEY)).toBe(false);
  });

  it("stays away when the phone can't remember it was seen", () => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(shouldWelcome(application("APPROVED", "2026-10-12T10:00:00Z"), [], KEY)).toBe(false);
  });
});
