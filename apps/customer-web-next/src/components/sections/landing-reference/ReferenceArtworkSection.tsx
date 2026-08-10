import Image from "next/image";

import styles from "@/screens/public/LandingPage/LandingV2.module.css";

type ReferenceArtworkVariant = "how" | "why" | "chefs-app";

const artwork: Record<
  ReferenceArtworkVariant,
  {
    src: string;
    width: number;
    height: number;
    alt: string;
  }
> = {
  how: {
    src: "/landing/reference/how-craves-works-reference.webp",
    width: 2048,
    height: 1369,
    alt: "How Craves works: discover homemade meals, order, a home chef prepares the meal, and Craves delivers it to your doorstep.",
  },
  why: {
    src: "/landing/reference/why-craves-reference.webp",
    width: 2048,
    height: 1386,
    alt: "Why Craves: trusted home chefs, meals made nearby, freshly prepared food, and the chance to discover something different.",
  },
  "chefs-app": {
    src: "/landing/reference/home-chefs-app-reference.webp",
    width: 2048,
    height: 1372,
    alt: "Meet the home chefs and discover the Craves app for finding and ordering homemade food nearby.",
  },
};

interface ReferenceArtworkSectionProps {
  variant: ReferenceArtworkVariant;
  priority?: boolean;
}

/** Desktop visual section based directly on the approved reference artwork. */
export function ReferenceArtworkSection({
  variant,
  priority = false,
}: ReferenceArtworkSectionProps) {
  const item = artwork[variant];

  return (
    <section
      className={`${styles.referenceDesktopSection} hidden bg-white lg:block`}
      aria-label={item.alt}
    >
      <div className={styles.referencePanelFrame}>
        <Image
          src={item.src}
          width={item.width}
          height={item.height}
          alt={item.alt}
          priority={priority}
          unoptimized
          sizes="(min-width: 1024px) min(100vw, 1536px), 0px"
          className={styles.referencePanelImage}
        />
      </div>
    </section>
  );
}

export default ReferenceArtworkSection;
