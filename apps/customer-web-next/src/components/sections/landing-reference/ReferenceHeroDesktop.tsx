import Image from "next/image";

import { CravesLogo } from "@/components/brand/CravesLogo";
import styles from "@/screens/public/LandingPage/LandingV2.module.css";

interface ReferenceHeroDesktopProps {
  onOpenAuth: (mode: "login" | "register") => void;
  onBecomeChef: () => void;
}

/**
 * Desktop landing hero reproducing the approved reference visual.
 *
 * The supplied reference artwork is used directly. The only intentional visual
 * replacement is the logo area: the canonical CravesLogo component is layered
 * over the reference logo so the current production logo stays unchanged.
 */
export function ReferenceHeroDesktop({
  onOpenAuth,
  onBecomeChef,
}: ReferenceHeroDesktopProps) {
  return (
    <section
      className={`${styles.referenceHeroDesktop} hidden bg-white lg:block`}
      aria-label="Craves homemade food landing page"
    >
      <div className={styles.referenceHeroFrame}>
        <Image
          src="/landing/reference/hero-reference.webp"
          width={2048}
          height={1368}
          alt="Craves landing page showing homemade food ordering and a Craves delivery rider."
          priority
          unoptimized
          sizes="(min-width: 1024px) min(100vw, 1536px), 0px"
          className={styles.referencePanelImage}
        />

        <div className={styles.referenceLogoMask}>
          <CravesLogo
            size="lg"
            priority
            className={styles.referenceCurrentLogo}
          />
        </div>

        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Home"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotHome}`}
        />
        <a
          href="#how-it-works"
          aria-label="How it works"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotHow}`}
        />
        <button
          type="button"
          onClick={onBecomeChef}
          aria-label="For chefs"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotChefs}`}
        />
        <a
          href="#why-craves"
          aria-label="Why Craves"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotWhy}`}
        />
        <a
          href="#contact"
          aria-label="Contact Craves"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotContact}`}
        />
        <a
          href="#craves-app"
          aria-label="Get the Craves app"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotApp}`}
        />

        <button
          type="button"
          onClick={() => onOpenAuth("login")}
          aria-label="Order homemade food"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotOrder}`}
        />
        <a
          href="#how-it-works"
          aria-label="Watch how Craves works"
          className={`${styles.referenceHotspot} ${styles.referenceHotspotWatch}`}
        />
      </div>
    </section>
  );
}

export default ReferenceHeroDesktop;
