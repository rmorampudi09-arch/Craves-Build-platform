import { Heart } from "lucide-react";

/** Site footer with app-store buttons and copyright line. */
export function FooterSection() {
  return (
    <footer className="relative overflow-hidden bg-ink py-16 text-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h3 className="font-display text-3xl font-bold">
          Craves – Food From Home <Heart className="inline h-6 w-6 fill-primary text-primary" />
        </h3>
        <p className="mt-2 text-white/80">Download the app and enjoy homemade happiness!</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <button className="flex items-center gap-3 rounded-xl bg-white/10 px-5 py-3 text-left transition-colors hover:bg-white/20">
            <div className="text-xs">
              <div className="text-white/70">GET IT ON</div>
              <div className="text-base font-semibold">Google Play</div>
            </div>
          </button>
          <button className="flex items-center gap-3 rounded-xl bg-white/10 px-5 py-3 text-left transition-colors hover:bg-white/20">
            <div className="text-xs">
              <div className="text-white/70">Download on the</div>
              <div className="text-base font-semibold">App Store</div>
            </div>
          </button>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-white/60">
          © {new Date().getFullYear()} Craves. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default FooterSection;
