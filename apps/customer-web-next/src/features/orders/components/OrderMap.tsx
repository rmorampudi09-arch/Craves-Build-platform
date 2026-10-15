"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bike, Check, ChefHat, Clock3, Home, Route, ShoppingBag } from "lucide-react";
import { KITCHEN_STEPS, type MapPoint } from "@/features/orders/lib/order-journey";

// Same tile proxy as the address map: the Ola key never reaches the browser.
const MAP_STYLE_URL = "/api/location/map-tiles/styles/default-light-standard/style.json";
/** Hyderabad, where Craves delivers today: the blurred backdrop when an order has no map pin. */
const FALLBACK: MapPoint = { latitude: 17.385, longitude: 78.4867 };
const PADDING = { top: 72, right: 56, bottom: 56, left: 56 };
const ROUTE = "order-route";

const lngLat = (point: MapPoint): [number, number] => [point.longitude, point.latitude];
const routeLine = (from: MapPoint | null, to: MapPoint | null): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: from && to ? [lngLat(from), lngLat(to)] : [] },
});

/**
 * The order's map: the home pin, the delivery partner once the server reports one, and a straight
 * line between them. Before pickup it is only a backdrop: blurred, washed out and still.
 */
export function OrderMap({
  home,
  courier,
  blurred,
  interactive = false,
  label,
  className = "",
  children,
}: {
  home: MapPoint | null;
  courier: MapPoint | null;
  blurred: boolean;
  interactive?: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef("");
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [pins, setPins] = useState<{ home: Marker; courier: Marker } | null>(null);
  const [failed, setFailed] = useState(false);
  const rider = blurred ? null : courier;

  // One map per page: Ola bills every map load. Polling only moves the pins.
  useEffect(() => {
    let disposed = false;
    let created: MapLibreMap | undefined;
    const fail = () => {
      if (!disposed) setFailed(true);
    };
    void import("maplibre-gl")
      .then(({ Map, Marker, getVersion, setWorkerUrl }) => {
        if (disposed || !containerRef.current) return;
        setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${getVersion()}`);
        const next = new Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: lngLat(FALLBACK),
          zoom: 12,
          interactive,
          // A page scrolls past it: one finger or the wheel keeps scrolling the page.
          cooperativeGestures: interactive,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          transformRequest: (url) => ({
            url: url.startsWith("/") ? window.location.origin + url : url,
          }),
        });
        created = next;
        let styleArrived = false;
        next.once("style.load", () => {
          styleArrived = true;
        });
        // Only a style that never arrived is fatal; a failed tile just leaves a gap.
        next.on("error", () => {
          if (!styleArrived) fail();
        });
        next.once("load", () => {
          next.addSource(ROUTE, { type: "geojson", data: routeLine(null, null) });
          next.addLayer({
            id: ROUTE,
            type: "line",
            source: ROUTE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#1A1A1A", "line-width": 3.5, "line-dasharray": [0.1, 2] },
          });
          if (!disposed) setMap(next);
        });
        setPins({
          home: new Marker({ element: document.createElement("div") }),
          courier: new Marker({ element: document.createElement("div") }),
        });
      })
      .catch(fail);
    return () => {
      disposed = true;
      created?.remove();
    };
  }, [interactive]);

  useEffect(() => {
    if (interactive) map?.getCanvas().setAttribute("aria-label", label);
  }, [interactive, label, map]);

  // Runs after every render; the key keeps a poll that changed nothing from moving the camera.
  useEffect(() => {
    if (!map || !pins) return;
    const key = JSON.stringify([home, rider, blurred]);
    if (key === placedRef.current) return;
    const duration =
      placedRef.current && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 600
        : 0;
    placedRef.current = key;
    if (home) pins.home.setLngLat(lngLat(home)).addTo(map);
    else pins.home.remove();
    if (rider) pins.courier.setLngLat(lngLat(rider)).addTo(map);
    else pins.courier.remove();
    (map.getSource(ROUTE) as GeoJSONSource | undefined)?.setData(routeLine(rider, home));
    if (home && rider) {
      map.fitBounds(
        [
          [Math.min(home.longitude, rider.longitude), Math.min(home.latitude, rider.latitude)],
          [Math.max(home.longitude, rider.longitude), Math.max(home.latitude, rider.latitude)],
        ],
        { padding: PADDING, maxZoom: 16, duration },
      );
    } else {
      map.easeTo({
        center: lngLat((blurred ? home : (rider ?? home)) ?? FALLBACK),
        zoom: blurred ? 14 : 15.5,
        duration,
      });
    }
  });

  return (
    <div className={`relative overflow-hidden bg-[#ECEAE7] ${className}`} aria-busy={!map && !failed}>
      {/* maplibre-gl.css makes its container position:relative, so it must not be the absolute layer.
          The label sits here, not on the frame, so the overlays stay readable. */}
      <div
        className={`absolute inset-0 ${blurred ? "pointer-events-none scale-110 blur-md saturate-50" : ""}`}
        {...(interactive && !failed ? {} : { role: "img", "aria-label": label })}
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {blurred ? (
        <div className="pointer-events-none absolute inset-0 bg-white/40" />
      ) : failed ? null : (
        <p className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-white/80 px-1 text-[9px] font-semibold leading-3 text-[#6B6B6B]">
          © Ola Maps · © OpenStreetMap contributors
        </p>
      )}
      {pins
        ? createPortal(
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#1A1A1A] text-white shadow-[0_2px_8px_rgba(26,26,26,0.3)]">
              <Home className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>,
            pins.home.getElement(),
          )
        : null}
      {pins
        ? createPortal(
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[#C4200F] text-white shadow-[0_2px_8px_rgba(26,26,26,0.3)]">
              <Bike className="h-5 w-5" aria-hidden="true" />
            </span>,
            pins.courier.getElement(),
          )
        : null}
      {children}
    </div>
  );
}

/** Sits on the blurred map until pickup. */
export function LockedMapNote() {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]">
      <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Live map opens once your order is picked up
    </p>
  );
}

const STEP_ICONS = [Clock3, ChefHat, ShoppingBag] as const;

/** The three kitchen steps, laid over the blurred map. */
export function KitchenSteps({ step }: { step: -1 | 0 | 1 | 2 }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      <ol
        aria-label="Order progress"
        className="flex w-full max-w-md rounded-[18px] bg-white px-1 pb-3 pt-4 shadow-[0_6px_16px_rgba(26,26,26,0.10)]"
      >
        {KITCHEN_STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          const Icon = done ? Check : STEP_ICONS[index];
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 top-[17px] h-0.5 ${step >= index ? "bg-[#C4200F]" : "bg-[#E5E7EB]"}`}
                />
              ) : null}
              {index < KITCHEN_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 top-[17px] h-0.5 ${step > index ? "bg-[#C4200F]" : "bg-[#E5E7EB]"}`}
                />
              ) : null}
              <span
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] ${
                  done || current
                    ? "border-[#C4200F] bg-[#C4200F] text-white"
                    : "border-[#D7DADF] bg-white text-[#6B6B6B]"
                } ${current ? "shadow-[0_2px_8px_rgba(246,46,24,0.35)]" : ""}`}
              >
                <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
              </span>
              <span
                className={`px-1 text-xs leading-4 ${done || current ? "font-semibold text-[#1A1A1A]" : "text-[#6B6B6B]"}`}
              >
                {label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <LockedMapNote />
    </div>
  );
}
