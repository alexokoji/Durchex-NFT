import { Quote } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";

const QUOTES = [
  {
    quote:
      "I listed forty pieces in an afternoon without paying a cent of gas. Durchex only mints when someone actually buys.",
    name: "@vantablk",
    role: "Digital Artist",
  },
  {
    quote: "The Explore page is the first marketplace grid that's actually fun to browse.",
    name: "@ionrelic",
    role: "Collector",
  },
  {
    quote: "Royalties landed automatically on every resale. Setup took five minutes.",
    name: "@mira.eth",
    role: "Collection Creator",
  },
];

export function Testimonials() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <div className="grid sm:grid-cols-3 gap-5">
        {QUOTES.map((q) => (
          <div key={q.name} className="surface-card p-6">
            <Quote className="w-6 h-6 text-purple-500 mb-3" />
            <p className="text-sm text-white/70 leading-relaxed mb-5">&ldquo;{q.quote}&rdquo;</p>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <GeneratedArt seedKey={q.name} className="w-full h-full" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">{q.name}</div>
                <div className="text-xs text-white/40">{q.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
