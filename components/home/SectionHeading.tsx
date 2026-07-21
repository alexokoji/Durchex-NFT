import { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeading({
  eyebrow,
  title,
  href,
  hrefLabel = "View all",
  children,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  hrefLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6 sm:mb-8 gap-4">
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold tracking-wider text-purple-400 uppercase mb-1.5">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">{title}</h2>
        {children}
      </div>
      {href && (
        <Link
          href={href}
          className="hidden sm:flex items-center gap-1 text-sm font-medium text-purple-300 hover:text-white transition shrink-0"
        >
          {hrefLabel} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
