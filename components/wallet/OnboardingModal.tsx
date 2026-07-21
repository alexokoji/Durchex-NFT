"use client";

import { useState } from "react";
import { X, Compass, Zap, Heart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import clsx from "clsx";

const STEPS = [
  {
    icon: Compass,
    title: "Welcome to Durchex",
    body: "You're signed in. Explore a purple x black marketplace full of live auctions, curated drops and one-of-one collectibles.",
  },
  {
    icon: Zap,
    title: "List for free — mint on sale",
    body: "Creating an item costs nothing upfront. Your listing goes live instantly and only mints on-chain the moment someone buys it.",
  },
  {
    icon: Heart,
    title: "Favorite, follow, collect",
    body: "Heart items to track them, follow creators you like, and everything you own or create shows up on your profile.",
  },
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-2xl w-full max-w-sm p-7 relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full grid place-items-center text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 grid place-items-center mb-5 shadow-[0_6px_20px_rgba(124,58,237,0.5)]">
          <current.icon className="w-6 h-6 text-white" />
        </div>

        <h2 className="font-display text-xl font-semibold text-white mb-2">{current.title}</h2>
        <p className="text-sm text-white/55 leading-relaxed mb-7">{current.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-purple-500" : "w-1.5 bg-white/15"
                )}
              />
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
          >
            {isLast ? "Get Started" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
