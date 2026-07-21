import clsx from "clsx";
import { Check } from "lucide-react";

const STEPS = ["Details", "Properties", "Pricing", "Review & Sign"];

export function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-2">
            <div
              className={clsx(
                "w-8 h-8 rounded-full grid place-items-center text-xs font-bold border transition",
                i < step
                  ? "bg-purple-600 border-purple-500 text-white"
                  : i === step
                    ? "border-purple-500 text-purple-300 bg-purple-700/20"
                    : "border-white/15 text-white/30"
              )}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span
              className={clsx(
                "text-[11px] font-medium whitespace-nowrap",
                i <= step ? "text-white/80" : "text-white/30"
              )}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={clsx(
                "h-px flex-1 mx-2 -mt-5 transition",
                i < step ? "bg-purple-500" : "bg-white/10"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
