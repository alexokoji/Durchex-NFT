import { PenLine, ListChecks, Sparkles } from "lucide-react";
import { SectionHeading } from "@/components/home/SectionHeading";

const STEPS = [
  {
    icon: PenLine,
    title: "1. Sign, don't pay",
    desc: "Upload your art and sign an off-chain EIP-712 voucher with your wallet. No transaction, no gas — it's free.",
  },
  {
    icon: ListChecks,
    title: "2. Goes live instantly",
    desc: "Your item appears on Explore and your collection page immediately with an 'Unminted' badge, ready to sell.",
  },
  {
    icon: Sparkles,
    title: "3. Buyer mints it for you",
    desc: "The first buyer's purchase transaction mints the token straight to their wallet and pays you — atomically.",
  },
];

export function HowLazyMintingWorks() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <SectionHeading eyebrow="For creators" title="How Lazy Minting Works" />
      <div className="grid sm:grid-cols-3 gap-5">
        {STEPS.map((s, i) => (
          <div key={s.title} className="surface-card p-6 relative overflow-hidden">
            <div className="absolute -top-4 -right-4 text-7xl font-display font-bold text-white/[0.03]">
              {i + 1}
            </div>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 grid place-items-center mb-4 shadow-[0_6px_20px_rgba(124,58,237,0.5)]">
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-white/50 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
