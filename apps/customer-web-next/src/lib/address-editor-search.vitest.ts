// @vitest-environment jsdom
// Behaviour of the customer address search typeahead. All provider calls are mocked fixtures.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  reverse: vi.fn(),
  selected: null as null | { lat?: number; lng?: number },
}));
vi.mock("@/services/location/searchLocation", () => ({ searchLocations: mocks.search }));
vi.mock("@/services/location/reverseGeocode", () => ({ reverseGeocodeCurrentLocation: mocks.reverse }));
vi.mock("@/services/auth/cravesAuth", () => ({ getAddress: () => mocks.selected }));
vi.mock("@/services/auth/sessionFetch", () => ({ sessionFetch: vi.fn() }));
vi.mock("@/components/location/AddressMapPicker", () => ({
  AddressMapPicker: (props: { latitude: number; longitude: number }) =>
    createElement("div", { "data-testid": "map", "data-lat": props.latitude, "data-lng": props.longitude }),
}));

import { AddressEditorFlow } from "@/components/profile/AddressEditorFlow";

const result = (id: string, title: string, latitude: number, longitude: number) => ({
  id, title, subtitle: "Hyderabad, Telangana, India", formattedAddress: `${title}, Hyderabad, Telangana, India`,
  latitude, longitude, houseNumber: null, street: null, area: null, district: null, city: null, state: null, postalCode: null,
});
const detected = {
  formattedAddress: "Plot 12, Madhapur, Hyderabad, Telangana, 500081, India", houseNumber: null, street: null,
  area: "Madhapur", city: "Hyderabad", district: "Rangareddy", state: "Telangana", postalCode: "500081",
  country: "India", confidence: "High", preciseHouseNumber: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const mount = () => render(createElement(AddressEditorFlow, {
  open: true,
  initialAddress: null,
  profileDefaults: { recipientName: "Fixture Customer", contactPhoneNumber: "9876543210" },
  onClose: () => {},
  onSaved: () => {},
}));
const input = () => screen.getByLabelText("Search for your area, street or landmark") as HTMLInputElement;

beforeEach(() => {
  mocks.search.mockReset();
  mocks.reverse.mockReset().mockResolvedValue(detected);
  mocks.selected = null;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("customer address search typeahead", () => {
  it("debounces keystrokes into one search and aborts superseded requests", async () => {
    mocks.search.mockResolvedValue([]);
    mount();
    for (const value of ["m", "ma", "mad", "madh", "madha"]) fireEvent.change(input(), { target: { value } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(mocks.search.mock.calls[0][0]).toBe("madha");
    expect(mocks.search.mock.calls[0][1]).toBeNull();
    const firstSignal = mocks.search.mock.calls[0][2] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);
    fireEvent.change(input(), { target: { value: "madhapur" } });
    expect(firstSignal.aborted).toBe(true);
    await screen.findByText("No matching places found. Try a nearby landmark or area name.", {}, { timeout: 3_000 });
  });

  it("biases the search to the customer's selected delivery location", async () => {
    mocks.selected = { lat: 17.385, lng: 78.4867 };
    mocks.search.mockResolvedValue([]);
    mount();
    fireEvent.change(input(), { target: { value: "Kondapur" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    expect(mocks.search.mock.calls[0][1]).toEqual({ latitude: 17.385, longitude: 78.4867 });
  });

  it("drops a slower stale response", async () => {
    const first = deferred<ReturnType<typeof result>[]>();
    const second = deferred<ReturnType<typeof result>[]>();
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mount();
    fireEvent.change(input(), { target: { value: "mad" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1), { timeout: 3_000 });
    fireEvent.change(input(), { target: { value: "madh" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await act(async () => { second.resolve([result("b", "Madhapur", 17.4483, 78.3915)]); });
    await act(async () => { first.resolve([result("a", "Madanapalle", 13.55, 78.5)]); });
    expect(screen.queryByText("Madanapalle")).toBeNull();
    expect(screen.getByText("Madhapur")).toBeTruthy();
  });

  it("opens the map on the chosen suggestion and reverse geocodes that pin", async () => {
    mocks.search.mockResolvedValue([result("ola-platform:madhapur", "Madhapur", 17.4483, 78.3915)]);
    mount();
    fireEvent.change(input(), { target: { value: "Madhap" } });
    fireEvent.click(await screen.findByText("Madhapur", {}, { timeout: 3_000 }));
    const map = await screen.findByTestId("map");
    expect(Number(map.getAttribute("data-lat"))).toBeCloseTo(17.4483, 4);
    await waitFor(() => expect(mocks.reverse).toHaveBeenCalledWith(17.4483, 78.3915));
    expect((await screen.findByDisplayValue("Madhapur")).tagName).toBe("INPUT");
  });

  it("blocks search while a GPS fix is pending so the fix cannot overwrite a picked place", async () => {
    let deliver: ((position: { coords: { latitude: number; longitude: number } }) => void) | null = null;
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition: (ok: typeof deliver) => { deliver = ok; } } });
    mount();
    fireEvent.click(screen.getByText("Use current location"));
    await waitFor(() => expect(input().disabled).toBe(true));
    await act(async () => { deliver!({ coords: { latitude: 17.4401, longitude: 78.3489 } }); });
    await waitFor(() => expect(mocks.reverse).toHaveBeenCalledWith(17.4401, 78.3489));
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
