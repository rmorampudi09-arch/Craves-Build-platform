import { ArrowLeft } from "lucide-react";

export function ChefProfileHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[4.5rem] max-w-5xl items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition hover:text-[#F62E18]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#F62E18]">Craves customer</p>
          <span className="font-display text-lg font-black text-[#1A1A1A]">Home kitchen</span>
        </div>
      </div>
    </header>
  );
}

export default ChefProfileHeader;
