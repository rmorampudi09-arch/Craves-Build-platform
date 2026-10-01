// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { getAddress, loadSelectedAddress, saveAddress, setSessionIdentity } from "../services/auth/cravesAuth";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../services/auth/sessionFetch", () => ({ sessionFetch: mocks.fetch }));
const owner = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", email: null,
  emailVerified: false, displayName: "Owner", status: "ACTIVE", roles: ["CUSTOMER"] };
const address = { hno: "Private home", city: "Hyderabad", mandal: "Area", district: "Hyderabad" };
const key = "craves.customer.selected-address.snapshot.v1";
beforeEach(() => { sessionStorage.clear(); setSessionIdentity(owner); mocks.fetch.mockReset(); });

it("clears the previous customer's selected address on a new sign-in", () => {
  saveAddress(address);
  expect(getAddress()).toEqual(address);
  setSessionIdentity({ ...owner, id: "22222222-2222-4222-8222-222222222222" });
  expect(getAddress()).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("rejects cached addresses from another owner and legacy unowned snapshots", () => {
  sessionStorage.setItem(key, JSON.stringify({ ownerId: "another-owner", address }));
  expect(getAddress()).toBeNull();
  sessionStorage.setItem(key, JSON.stringify(address));
  expect(getAddress()).toBeNull();
});

it("does not install an old address response after the session changes", async () => {
  let finish!: (value: unknown[]) => void;
  const body = new Promise<unknown[]>(resolve => { finish = resolve; });
  mocks.fetch.mockResolvedValue({ ok: true, json: () => body });
  const pending = loadSelectedAddress();
  await Promise.resolve();
  setSessionIdentity({ ...owner, id: "22222222-2222-4222-8222-222222222222" });
  saveAddress({ ...address, hno: "Current owner's home" });
  finish([]);
  expect(await pending).toBeNull();
  expect(getAddress()?.hno).toBe("Current owner's home");
});
