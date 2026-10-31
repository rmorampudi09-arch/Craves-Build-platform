import localFont from "next/font/local";

// The two type faces of the screens the owner kept (29-30 Oct 2026). Self-hosted (SIL OFL, licences beside the files)
// and imported only by those screens, so no other page downloads them.

/** Banana Leaf: the cart's headings and the leaf caption. */
export const leafSerif = localFont({
  src: [
    { path: "./tiro-telugu-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./tiro-telugu-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-leaf",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

/** Kitchen Calendar: the live order's number, day heading and times. */
export const calendarCondensed = localFont({
  src: [{ path: "./khand-latin-600-normal.woff2", weight: "600", style: "normal" }],
  variable: "--font-calendar",
  display: "swap",
  fallback: ["Arial Narrow", "sans-serif"],
});
