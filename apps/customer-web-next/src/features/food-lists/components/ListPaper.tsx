import type { ReactNode } from "react";
import { leafSerif } from "@/shared/fonts/theme-fonts";
import styles from "../styles/food-lists.module.css";

/** One list as a ruled notebook page: the name in blue ink, the note under it, then one ruled line per row. */
export function ListPaper({ title, note, headingLevel = "h1", children }: { title: string; note?: string | null; headingLevel?: "h1" | "h2"; children?: ReactNode }) {
  const Heading = headingLevel;
  return (
    <section className={`${leafSerif.variable} ${styles.paper}`}>
      <Heading className={styles.title}>{title}</Heading>
      {note ? <p className={styles.note}>{note}</p> : null}
      {children ? <div className={styles.lines}>{children}</div> : null}
    </section>
  );
}

export const listRowClass = styles.row;
export const inkClass = styles.ink;
