import { Heart } from "lucide-react";

/** Site footer with app-store buttons and copyright line. */
export function FooterSection() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-white py-16 text-black">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h3 className="font-display text-3xl font-bold text-black">
          Craves – Food From Home <Heart className="inline h-6 w-6 fill-[#C92716] text-[#C92716]" />
        </h3>
        <p className="mt-2 text-black/75">Download the app and enjoy homemade happiness!</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <button className="flex items-center gap-3 rounded-xl border px-5 py-3 text-left">
            <div className="text-xs">
              <div>GET IT ON</div>
              <div className="text-base font-semibold">Google Play</div>
            </div>
          </button>
          <button className="flex items-center gap-3 rounded-xl border px-5 py-3 text-left">
            <div className="text-xs">
              <div>Download on the</div>
              <div className="text-base font-semibold">App Store</div>
            </div>
          </button>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-xs text-black/60">
          © {new Date().getFullYear()} Craves. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default FooterSection;
