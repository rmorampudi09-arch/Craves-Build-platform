import cravesLogo from "@/assets/images/craves-logo.png";
import { assetUrl } from "@/lib/asset-url";

/** The Craves wordmark + icon, used in the landing page nav and elsewhere. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={assetUrl(cravesLogo)}
        alt="Craves"
        width={44}
        height={44}
        className="h-11 w-11 object-contain"
      />
      <div className="leading-tight">
        <div className={`font-display text-2xl font-bold ${light ? "text-white" : "text-primary"}`}>
          Craves
        </div>
        <div
          className={`text-[9px] tracking-[0.2em] font-medium ${light ? "text-white/70" : "text-primary/70"}`}
        >
          FOOD FROM HOME
        </div>
      </div>
    </div>
  );
}

export default Logo;
