interface CravesCartIconProps {
  className?: string;
}

/**
 * Cart glyph only. The surrounding action owns the circular background so
 * profile and cart controls can share the exact same hover treatment.
 */
export function CravesCartIcon({ className = "" }: CravesCartIconProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M10.1 11.2h2.55c.72 0 1.36.46 1.59 1.15l.7 2.06h14.01c.83 0 1.42.81 1.16 1.6l-2.04 6.25a2.13 2.13 0 0 1-2.03 1.47H16.1l-.55 1.64h10.86a1.22 1.22 0 1 1 0 2.44H14.27c-1.35 0-2.29-1.33-1.86-2.61l1.13-3.37-2.23-6.57h-1.21a2.04 2.04 0 0 1 0-4.08Z"
      />
      <circle cx="17.2" cy="30.15" r="2.05" fill="currentColor" />
      <circle cx="26.15" cy="30.15" r="2.05" fill="currentColor" />
    </svg>
  );
}

export default CravesCartIcon;
