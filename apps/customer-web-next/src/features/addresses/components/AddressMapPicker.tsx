"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapLibreEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Loader2, Minus, Plus } from "lucide-react";

import { MAP_STYLE_URL } from "@/features/addresses/lib/map-tiles";
import {
  StaticAddressMapPicker,
  type AddressMapPickerProps,
  type Coordinate,
} from "./StaticAddressMapPicker";

type Props = AddressMapPickerProps & {
  /** Short line shown above the pin while it rests, e.g. where the order goes. */
  pinHint?: string;
};

const START_ZOOM = 16.5;
const MIN_ZOOM = 5;
const MAX_ZOOM = 19.5;
/** Resolve the address only once the hand has left the map. */
const SETTLE_MS = 450;
/** Fall back to the static map if the interactive one has not drawn by then. */
const LOAD_TIMEOUT_MS = 12_000;
const SAME_POINT = 1e-6;

const sameCenter = (a: Coordinate, b: Coordinate) =>
  Math.abs(a.latitude - b.latitude) < SAME_POINT &&
  Math.abs(a.longitude - b.longitude) < SAME_POINT;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Swiggy-style picker: the map moves under a fixed centre pin. Ola vector tiles come through our
 * same-origin proxy (the key stays server-side); without WebGL or the proxy it falls back to the
 * static map so nobody is left without a way to place the pin.
 */
export function AddressMapPicker(props: Props) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <StaticAddressMapPicker {...props} />;
  return <InteractiveAddressMap {...props} onUnavailable={() => setUnavailable(true)} />;
}

function InteractiveAddressMap({
  latitude,
  longitude,
  onCenterChange,
  onUseCurrentLocation,
  locating = false,
  disabled = false,
  ariaLabel = "Delivery map. Drag the map or use arrow keys to move the delivery pin.",
  showLocateButton = true,
  pinHint,
  onUnavailable,
}: Props & { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** The point the host knows about; moves that end here are not reported again. */
  const knownCenterRef = useRef<Coordinate>({ latitude, longitude });
  const callbacksRef = useRef({ onCenterChange, onUnavailable });
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [zoom, setZoom] = useState(START_ZOOM);

  useEffect(() => {
    callbacksRef.current = { onCenterChange, onUnavailable };
  });

  // Create the map once; later prop changes are applied by the effects below.
  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = () => {
      if (!disposed) callbacksRef.current.onUnavailable();
    };
    const loadTimer = setTimeout(giveUp, LOAD_TIMEOUT_MS);

    void import("maplibre-gl")
      .then(({ Map, AttributionControl, getVersion, setWorkerUrl }) => {
        if (disposed || !containerRef.current) return;
        // Read now, not at mount: the host may have moved the pin while the library loaded.
        const start = knownCenterRef.current;
        // maplibre-gl 6 ships its worker separately; app/vendor/maplibre-gl-worker.mjs serves it same-origin.
        setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${getVersion()}`);
        map = new Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: [start.longitude, start.latitude],
          zoom: START_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          // Zooming keeps the chosen spot under the pin.
          scrollZoom: { around: "center" },
          touchZoomRotate: { around: "center" },
          renderWorldCopies: false,
          transformRequest: (url) => ({
            url: url.startsWith("/") ? window.location.origin + url : url,
          }),
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(
          new AttributionControl({
            compact: false,
            customAttribution:
              '<a href="https://maps.olakrutrim.com/" target="_blank" rel="noopener">© Ola Maps</a> | <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
          }),
          "bottom-left",
        );
        map.getCanvas().setAttribute("aria-label", ariaLabel);

        let styleArrived = false;
        let tilesDrawn = 0;
        let failures = 0;
        map.once("style.load", () => {
          styleArrived = true;
        });
        map.on("sourcedata", (event) => {
          if (event.tile) tilesDrawn += 1;
        });
        map.once("load", () => {
          clearTimeout(loadTimer);
          // Nothing drew and requests failed (e.g. every tile refused upstream): static beats empty.
          if (tilesDrawn === 0 && failures > 0) giveUp();
          else if (!disposed) setReady(true);
        });
        map.on("error", () => {
          // Only a style that never arrived is fatal; a failed tile, glyph or sprite just leaves a gap.
          if (!styleArrived) {
            giveUp();
            return;
          }
          failures += 1;
          // A failed request schedules no frame, and "load" is only checked while drawing one.
          map?.triggerRepaint();
        });
        map.on("movestart", (event: MapLibreEvent) => {
          if (!event.originalEvent) return;
          clearTimeout(settleTimer);
          setMoving(true);
        });
        map.on("zoomend", () => setZoom(map?.getZoom() ?? START_ZOOM));
        map.on("moveend", () => {
          setMoving(false);
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            if (!map) return;
            const center = map.getCenter();
            const next = {
              latitude: Number(center.lat.toFixed(7)),
              longitude: Number(center.lng.toFixed(7)),
            };
            if (sameCenter(next, knownCenterRef.current)) return;
            knownCenterRef.current = next;
            callbacksRef.current.onCenterChange(next);
          }, SETTLE_MS);
        });
      })
      .catch(giveUp);

    return () => {
      disposed = true;
      clearTimeout(loadTimer);
      clearTimeout(settleTimer);
      map?.remove();
      mapRef.current = null;
    };
    // ariaLabel is applied once with the canvas; the map must not be recreated on prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The host moved the pin (search result, current location): glide there without reporting it back.
  useEffect(() => {
    const next = { latitude, longitude };
    knownCenterRef.current = next;
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (sameCenter(next, { latitude: center.lat, longitude: center.lng })) return;
    map.easeTo({ center: [longitude, latitude], duration: prefersReducedMotion() ? 0 : 650 });
    // Not keyed on `ready`: that would pull back a drag made while the tiles were still loading.
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const handler of [map.dragPan, map.boxZoom, map.doubleClickZoom, map.keyboard]) {
      if (disabled) handler.disable();
      else handler.enable();
    }
    if (disabled) {
      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
    } else {
      map.scrollZoom.enable({ around: "center" });
      map.touchZoomRotate.enable({ around: "center" });
      map.touchZoomRotate.disableRotation();
    }
  }, [disabled, ready]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map || disabled) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: prefersReducedMotion() ? 0 : 250 });
  };

  const controlButton =
    "flex h-10 w-10 items-center justify-center text-[#1A1A1A] transition-colors duration-150 hover:bg-[#F1F3F5] focus-visible:bg-[#F1F3F5] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={
        "relative aspect-[4/3] w-full overflow-hidden rounded-[1.6rem] border border-[#E5E7EB] bg-[#F1F3F5] shadow-inner md:aspect-[900/520] " +
        // Map chrome in the CRAVES palette.
        "[&_.maplibregl-canvas]:outline-none [&_.maplibregl-canvas:focus-visible]:ring-2 [&_.maplibregl-canvas:focus-visible]:ring-inset [&_.maplibregl-canvas:focus-visible]:ring-[#F62E18]/40 " +
        "[&_.maplibregl-ctrl-attrib]:!m-2 [&_.maplibregl-ctrl-attrib]:rounded-md [&_.maplibregl-ctrl-attrib]:!bg-white/85 [&_.maplibregl-ctrl-attrib]:!px-1.5 [&_.maplibregl-ctrl-attrib]:!py-0.5 [&_.maplibregl-ctrl-attrib]:text-[9px] [&_.maplibregl-ctrl-attrib]:font-semibold [&_.maplibregl-ctrl-attrib]:text-[#6B6B6B] [&_.maplibregl-ctrl-attrib_a]:!text-[#6B6B6B]"
      }
      aria-busy={!ready}
    >
      {/* maplibre-gl.css makes its container position:relative, so it must not be the absolute layer. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {!ready ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#F1F3F5]">
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(120deg,#F1F3F5_20%,#FFFFFF_45%,#F1F3F5_70%)] motion-reduce:animate-none" />
          <span className="relative inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-black text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.10)]">
            <Loader2 className="h-4 w-4 animate-spin text-[#F62E18]" aria-hidden="true" />
            Loading map
          </span>
        </div>
      ) : null}

      {/* Fixed centre pin: its tip marks the chosen point; it lifts while the map moves. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20" aria-hidden="true">
        <span
          className={
            "absolute left-0 top-0 h-2 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[#1A1A1A]/25 blur-[1px] transition-transform duration-200 ease-out motion-reduce:transition-none " +
            (moving ? "scale-50" : "scale-100")
          }
        />
        <div
          className={
            "absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center transition-transform duration-200 ease-out motion-reduce:transition-none " +
            (moving ? "-translate-y-3" : "translate-y-0")
          }
        >
          {pinHint && ready && !moving ? (
            <span className="relative mb-2 w-max max-w-[15rem] rounded-xl bg-[#1A1A1A] px-3 py-2 text-center shadow-[0_10px_24px_rgba(26,26,26,0.28)]">
              <span className="block text-[11px] font-black leading-4 text-white">{pinHint}</span>
              <span className="mt-0.5 block text-[10px] font-semibold leading-3.5 text-white/70">
                Move the map to adjust the pin
              </span>
              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-[#1A1A1A]" />
            </span>
          ) : null}
          <svg
            viewBox="0 0 40 52"
            className="h-[52px] w-10 drop-shadow-[0_8px_10px_rgba(26,26,26,0.28)]"
          >
            <path
              d="M20 51c-1.1 0-2.1-.6-2.7-1.6C11.4 39.6 2 30.6 2 19.8 2 9.4 10.1 1 20 1s18 8.4 18 18.8c0 10.8-9.4 19.8-15.3 29.6-.6 1-1.6 1.6-2.7 1.6z"
              fill="#F62E18"
            />
            <circle cx="20" cy="19.5" r="7.25" fill="#FFFFFF" />
          </svg>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-30 flex flex-col overflow-hidden rounded-2xl bg-white/95 shadow-[0_8px_24px_rgba(26,26,26,0.14)] ring-1 ring-[#1A1A1A]/5 backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          disabled={disabled || !ready || zoom >= MAX_ZOOM}
          className={controlButton}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-2 h-px bg-[#E5E7EB]" aria-hidden="true" />
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          disabled={disabled || !ready || zoom <= MIN_ZOOM}
          className={controlButton}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {showLocateButton ? (
        <button
          type="button"
          onClick={onUseCurrentLocation}
          disabled={disabled || locating}
          className="absolute bottom-3 right-3 z-30 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 text-xs font-black text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.14)] ring-1 ring-[#1A1A1A]/5 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(26,26,26,0.18)] active:translate-y-0 disabled:opacity-50 motion-reduce:transform-none"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#F62E18]" />
          ) : (
            <Crosshair className="h-4 w-4 text-[#F62E18]" />
          )}
          Locate me
        </button>
      ) : null}
    </div>
  );
}
