import { ReactNode } from "react";

export function StatWidget({
  label,
  value,
  icon,
  suffix,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center sm:items-start gap-1 text-center sm:text-left">
      <div className="flex items-center gap-2 text-purple-300">
        {icon}
        <span className="text-[11px] uppercase tracking-wider text-white/45 font-medium">
          {label}
        </span>
      </div>
      <div className="font-display text-2xl sm:text-3xl font-semibold text-white tabular-nums">
        {value}
        {suffix && <span className="text-purple-300 text-lg ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
