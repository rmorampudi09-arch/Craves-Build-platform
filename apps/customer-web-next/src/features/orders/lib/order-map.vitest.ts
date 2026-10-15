// @vitest-environment jsdom
// A stand-in for maplibre (no WebGL here) records what the order map asks of it.
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  type Handler = () => void;
  class FakeMarker {
    element: HTMLElement;
    lngLat: [number, number] | null = null;
    added = false;
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
      fake.markers.push(this);
    }
    setLngLat(value: [number, number]) {
      this.lngLat = value;
      return this;
    }
    addTo() {
      this.added = true;
      return this;
    }
    remove() {
      this.added = false;
      return this;
    }
    getElement() {
      return this.element;
    }
  }
  const toggle = () => {
    const handler = { on: true, enable: () => void (handler.on = true), disable: () => void (handler.on = false) };
    return handler;
  };
  class FakeMap {
    options: Record<string, unknown>;
    keyboard = toggle();
    dragPan = toggle();
    scrollZoom = toggle();
    touchZoomRotate = toggle();
    doubleClickZoom = toggle();
    handlers: Record<string, Handler[]> = {};
    route = { setData: vi.fn() };
    fitBounds = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    canvas = document.createElement("canvas");
    constructor(options: Record<string, unknown>) {
      this.options = options;
      fake.maps.push(this);
    }
    on(event: string, handler: Handler) {
      (this.handlers[event] ??= []).push(handler);
    }
    once(event: string, handler: Handler) {
      this.on(event, handler);
    }
    emit(event: string) {
      for (const handler of this.handlers[event] ?? []) handler();
    }
    addSource() {}
    addLayer() {}
    getSource() {
      return this.route;
    }
    getCanvas() {
      return this.canvas;
    }
  }
  return { maps: [] as FakeMap[], markers: [] as FakeMarker[], FakeMap, FakeMarker };
});
vi.mock("maplibre-gl", () => ({
  Map: fake.FakeMap,
  Marker: fake.FakeMarker,
  getVersion: () => "6.13.0",
  setWorkerUrl: () => undefined,
}));

import { OrderMap } from "../components/OrderMap";

const HOME = { latitude: 17.41, longitude: 78.44 };
const RIDER = { latitude: 17.43, longitude: 78.47 };

async function loadedMap() {
  await waitFor(() => expect(fake.maps).toHaveLength(1));
  const map = fake.maps[0];
  await act(async () => map.emit("load"));
  return map;
}
const [home, rider] = [() => fake.markers[0], () => fake.markers[1]];

beforeEach(() => {
  fake.maps.length = 0;
  fake.markers.length = 0;
});
afterEach(cleanup);

describe("order map", () => {
  it("before pickup is a still, blurred backdrop on the home pin with no rider", async () => {
    render(
      createElement(OrderMap, {
        home: HOME,
        courier: RIDER,
        blurred: true,
        label: "Map, hidden until your order is picked up",
      }),
    );
    const map = await loadedMap();
    expect(map.options).toMatchObject({
      interactive: false,
      style: "/api/location/map-tiles/styles/default-light-standard/style.json",
    });
    expect(
      screen.getByRole("img", { name: "Map, hidden until your order is picked up" }),
    ).toBeTruthy();
    expect(home()).toMatchObject({ added: true, lngLat: [78.44, 17.41] });
    expect(rider().added).toBe(false);
    expect(map.easeTo).toHaveBeenCalledWith({ center: [78.44, 17.41], zoom: 14, duration: 0 });
    expect(screen.queryByText(/OpenStreetMap/)).toBeNull();
  });

  it("after pickup draws home, rider and the line between them, and follows the rider", async () => {
    const view = render(
      createElement(OrderMap, {
        home: HOME,
        courier: RIDER,
        blurred: false,
        interactive: true,
        label: "Delivery map",
      }),
    );
    const map = await loadedMap();
    expect(map.options).toMatchObject({ interactive: true, cooperativeGestures: true });
    expect(map.canvas.getAttribute("aria-label")).toBe("Delivery map");
    expect(rider()).toMatchObject({ added: true, lngLat: [78.47, 17.43] });
    expect(map.route.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        geometry: {
          type: "LineString",
          coordinates: [
            [78.47, 17.43],
            [78.44, 17.41],
          ],
        },
      }),
    );
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [78.44, 17.41],
        [78.47, 17.43],
      ],
      expect.objectContaining({ maxZoom: 16, duration: 0 }),
    );
    expect(screen.getByText("© Ola Maps · © OpenStreetMap contributors")).toBeTruthy();

    // A poll that changed nothing leaves the camera alone; a new position moves it.
    view.rerender(
      createElement(OrderMap, {
        home: { ...HOME },
        courier: { ...RIDER },
        blurred: false,
        interactive: true,
        label: "Delivery map",
      }),
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    view.rerender(
      createElement(OrderMap, {
        home: HOME,
        courier: { latitude: 17.42, longitude: 78.46 },
        blurred: false,
        interactive: true,
        label: "Delivery map",
      }),
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(rider().lngLat).toEqual([78.46, 17.42]);

    view.unmount();
    expect(map.remove).toHaveBeenCalled();
  });

  it("shows the home pin alone until the server reports the rider, and Hyderabad without either", async () => {
    const view = render(
      createElement(OrderMap, { home: HOME, courier: null, blurred: false, label: "Delivery map" }),
    );
    const map = await loadedMap();
    expect(rider().added).toBe(false);
    expect(map.route.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({ geometry: { type: "LineString", coordinates: [] } }),
    );
    expect(map.easeTo).toHaveBeenLastCalledWith({
      center: [78.44, 17.41],
      zoom: 15.5,
      duration: 0,
    });
    view.rerender(
      createElement(OrderMap, { home: null, courier: null, blurred: false, label: "Delivery map" }),
    );
    expect(home().added).toBe(false);
    expect(map.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [78.4867, 17.385] }),
    );
  });

  it("keeps a blurred tracking map still and out of the tab order until pickup", async () => {
    const props = { home: HOME, courier: null, interactive: true, label: "Map, hidden until your order is picked up" };
    const view = render(createElement(OrderMap, { ...props, blurred: true }));
    const map = await loadedMap();
    const handlers = () => [map.keyboard, map.dragPan, map.scrollZoom, map.touchZoomRotate, map.doubleClickZoom].map((handler) => handler.on);
    expect(map.canvas.tabIndex).toBe(-1);
    expect(handlers()).toEqual([false, false, false, false, false]);
    expect(screen.getByRole("img", { name: "Map, hidden until your order is picked up" })).toBeTruthy();

    view.rerender(createElement(OrderMap, { ...props, blurred: false, label: "Delivery map" }));
    expect(map.canvas.tabIndex).toBe(0);
    expect(handlers()).toEqual([true, true, true, true, true]);
    expect(map.canvas.getAttribute("aria-label")).toBe("Delivery map");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps its frame and overlays when the map style never arrives", async () => {
    render(
      createElement(
        OrderMap,
        { home: HOME, courier: null, blurred: false, interactive: true, label: "Delivery map" },
        createElement("p", null, "Track live"),
      ),
    );
    await waitFor(() => expect(fake.maps).toHaveLength(1));
    await act(async () => fake.maps[0].emit("error"));
    expect(screen.getByRole("img", { name: "Delivery map" })).toBeTruthy();
    expect(screen.getByText("Track live")).toBeTruthy();
    expect(screen.queryByText(/OpenStreetMap/)).toBeNull();
  });
});
