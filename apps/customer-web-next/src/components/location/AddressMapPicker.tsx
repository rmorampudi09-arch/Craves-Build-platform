"use client";

import { useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Minus, Plus } from "lucide-react";

type Coordinate = {
  latitude: number;
  longitude: number;
};

interface AddressMapPickerProps extends Coordinate {
  onCenterChange: (next: Coordinate) => void;
  onUseCurrentLocation: () => void;
  locating?: boolean;
  disabled?: boolean;
}

const STATIC_MAP_WIDTH = 900;
const STATIC_MAP_HEIGHT = 520;
const MIN_ZOOM = 12;
const MAX_ZOOM = 20;

function longitudeToWorldX(longitude: number, zoom: number): number {
  const worldSize = 256 * 2 ** zoom;
  return ((longitude + 180) / 360) * worldSize;
}

function latitudeToWorldY(latitude: number, zoom: number): number {
  const worldSize = 256 * 2 ** zoom;
  const clipped = Math.min(85.05112878, Math.max(-85.05112878, latitude));
  const sin = Math.sin((clipped * Math.PI) / 180);
  return (
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
    worldSize
  );
}

function worldXToLongitude(x: number, zoom: number): number {
  const worldSize = 256 * 2 ** zoom;
  const wrapped = ((x % worldSize) + worldSize) % worldSize;
  return (wrapped / worldSize) * 360 - 180;
}

function worldYToLatitude(y: number, zoom: number): number {
  const worldSize = 256 * 2 ** zoom;
  const clipped = Math.min(worldSize, Math.max(0, y));
  const n = Math.PI - (2 * Math.PI * clipped) / worldSize;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function AddressMapPicker({
  latitude,
  longitude,
  onCenterChange,
  onUseCurrentLocation,
  locating = false,
  disabled = false,
}: AddressMapPickerProps) {
  const [zoom, setZoom] = useState(17);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imageLoading, setImageLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{
    id: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const imageUrl = useMemo(() => {
    const query = new URLSearchParams({
      latitude: latitude.toFixed(7),
      longitude: longitude.toFixed(7),
      zoom: String(zoom),
    });
    return `/api/location/map-image?${query}`;
  }, [latitude, longitude, zoom]);

  const moveByScreenPixels = (dx: number, dy: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const scaleX = rect?.width ? STATIC_MAP_WIDTH / rect.width : 1;
    const scaleY = rect?.height ? STATIC_MAP_HEIGHT / rect.height : 1;
    const centerX = longitudeToWorldX(longitude, zoom);
    const centerY = latitudeToWorldY(latitude, zoom);
    const nextX = centerX - dx * scaleX;
    const nextY = centerY - dy * scaleY;
    onCenterChange({
      latitude: Number(worldYToLatitude(nextY, zoom).toFixed(7)),
      longitude: Number(worldXToLongitude(nextX, zoom).toFixed(7)),
    });
  };

  const finishDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
    const offset = dragOffset;
    setDragOffset({ x: 0, y: 0 });
    if (!cancelled && (Math.abs(offset.x) > 2 || Math.abs(offset.y) > 2)) {
      moveByScreenPixels(offset.x, offset.y);
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={viewportRef}
        role="application"
        tabIndex={disabled ? -1 : 0}
        aria-label="Delivery map. Drag the map or use arrow keys to move the delivery pin."
        onKeyDown={(event) => {
          if (disabled) return;
          const step = event.shiftKey ? 72 : 28;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveByScreenPixels(step, 0);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveByScreenPixels(-step, 0);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveByScreenPixels(0, step);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            moveByScreenPixels(0, -step);
          }
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerRef.current = {
            id: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          setDragOffset({ x: 0, y: 0 });
        }}
        onPointerMove={(event) => {
          const active = pointerRef.current;
          if (!active || active.id !== event.pointerId || disabled) return;
          setDragOffset({
            x: event.clientX - active.clientX,
            y: event.clientY - active.clientY,
          });
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        className="relative aspect-[900/520] w-full touch-none overflow-hidden rounded-[1.6rem] border border-[#E5E7EB] bg-[#F1F3F5] shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
      >
        {!imageFailed ? (
          // Static Azure map bytes come from our authenticated same-origin BFF,
          // so Next/Image optimization would only add another server hop.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            onLoad={() => {
              setImageLoading(false);
              setImageFailed(false);
            }}
            onError={() => {
              setImageLoading(false);
              setImageFailed(true);
            }}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#F1F3F5] px-8 text-center text-sm font-semibold text-[#6B6B6B]">
            Map preview is temporarily unavailable. Your selected location is still preserved.
          </div>
        )}

        {imageLoading && !imageFailed ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/45 backdrop-blur-[2px]">
            <Loader2 className="h-7 w-7 animate-spin text-[#F62E18]" />
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-full"
          aria-hidden="true"
        >
          <MapPin
            className="h-11 w-11 fill-[#F62E18] text-[#F62E18] drop-shadow-[0_5px_6px_rgba(26,26,26,0.24)]"
            strokeWidth={2}
          />
          <span className="absolute left-1/2 top-[40%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>

        <div className="absolute right-3 top-3 z-30 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setZoom((current) => Math.min(MAX_ZOOM, current + 1));
              setImageLoading(true);
              setImageFailed(false);
            }}
            disabled={disabled || zoom >= MAX_ZOOM}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/95 text-[#1A1A1A] shadow-[0_5px_16px_rgba(26,26,26,0.12)] backdrop-blur disabled:opacity-45"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom((current) => Math.max(MIN_ZOOM, current - 1));
              setImageLoading(true);
              setImageFailed(false);
            }}
            disabled={disabled || zoom <= MIN_ZOOM}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/95 text-[#1A1A1A] shadow-[0_5px_16px_rgba(26,26,26,0.12)] backdrop-blur disabled:opacity-45"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onUseCurrentLocation}
          disabled={disabled || locating}
          className="absolute bottom-3 right-3 z-30 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/80 bg-white/95 px-3 text-xs font-black text-[#1A1A1A] shadow-[0_5px_16px_rgba(26,26,26,0.12)] backdrop-blur hover:text-[#F62E18] disabled:opacity-50"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4 text-[#F62E18]" />
          )}
          Recenter
        </button>

        <span className="pointer-events-none absolute bottom-2 left-3 z-20 rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-[#6B6B6B] backdrop-blur">
          Microsoft Azure Maps
        </span>
      </div>

      <p className="text-center text-xs font-medium leading-5 text-[#6B6B6B]">
        Move the map until the pin is exactly at your delivery entrance.
      </p>
    </div>
  );
}
