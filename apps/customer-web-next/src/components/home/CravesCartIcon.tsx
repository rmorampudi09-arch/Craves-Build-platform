interface CravesCartIconProps {
  className?: string;
}

/** Filled cart shape matched to the approved Craves icon reference. */
export function CravesCartIcon({ className = "" }: CravesCartIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3.2 4.5h2.18c.78 0 1.47.51 1.7 1.25l.52 1.72h12.63c.88 0 1.5.86 1.22 1.69l-1.82 5.45a1.9 1.9 0 0 1-1.8 1.3H9.18l-.5 1.42h9.5a1.12 1.12 0 1 1 0 2.24H7.62c-1.2 0-2.03-1.18-1.63-2.31l1.02-2.9L4.67 6.74H3.2a1.12 1.12 0 1 1 0-2.24Z"
      />
      <circle cx="9.25" cy="21.25" r="1.55" fill="currentColor" />
      <circle cx="18.15" cy="21.25" r="1.55" fill="currentColor" />
    </svg>
  );
}

export default CravesCartIcon;
