export type CategoryKey =
  | "art"
  | "pfp"
  | "gaming"
  | "music"
  | "photography"
  | "sports"
  | "virtual-worlds"
  | "collectibles";

const GRADIENTS = (
  <defs>
    <linearGradient id="cat-grad-a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#c084fc" />
      <stop offset="100%" stopColor="#7c3aed" />
    </linearGradient>
    <linearGradient id="cat-grad-b" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stopColor="#5b21b6" />
      <stop offset="100%" stopColor="#a78bfa" />
    </linearGradient>
    <filter id="cat-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#7c3aed" floodOpacity="0.45" />
    </filter>
  </defs>
);

const ICONS: Record<CategoryKey, ReactSvg> = {
  art: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <ellipse cx="32" cy="36" rx="22" ry="17" fill="url(#cat-grad-a)" />
        <ellipse cx="32" cy="33" rx="22" ry="17" fill="url(#cat-grad-b)" opacity="0.85" />
        <circle cx="22" cy="28" r="3.2" fill="#0b0a10" opacity="0.55" />
        <circle cx="34" cy="24" r="2.6" fill="#0b0a10" opacity="0.4" />
        <circle cx="41" cy="33" r="3" fill="#0b0a10" opacity="0.5" />
        <circle cx="27" cy="39" r="2.4" fill="#0b0a10" opacity="0.35" />
        <rect x="30" y="8" width="4" height="14" rx="2" fill="#e9d8fd" transform="rotate(20 32 15)" />
      </g>
    </>
  ),
  pfp: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <rect x="12" y="12" width="40" height="40" rx="12" fill="url(#cat-grad-a)" />
        <rect x="12" y="12" width="40" height="20" rx="12" fill="url(#cat-grad-b)" opacity="0.5" />
        <circle cx="32" cy="28" r="8" fill="#0b0a10" opacity="0.85" />
        <path d="M18 46c2-8 8-12 14-12s12 4 14 12" fill="#0b0a10" opacity="0.85" />
      </g>
    </>
  ),
  gaming: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <path
          d="M16 26h32a8 8 0 0 1 8 8v6a8 8 0 0 1-14.9 4L38 40H26l-3.1 4A8 8 0 0 1 8 40v-6a8 8 0 0 1 8-8Z"
          fill="url(#cat-grad-a)"
        />
        <path
          d="M16 26h32a8 8 0 0 1 8 8v1a8 8 0 0 0-8-7H16a8 8 0 0 0-8 7v-1a8 8 0 0 1 8-8Z"
          fill="url(#cat-grad-b)"
          opacity="0.6"
        />
        <rect x="20" y="32" width="8" height="2.6" rx="1.3" fill="#0b0a10" />
        <rect x="23" y="29" width="2.6" height="8" rx="1.3" fill="#0b0a10" />
        <circle cx="42" cy="32" r="2.2" fill="#0b0a10" />
        <circle cx="47" cy="37" r="2.2" fill="#0b0a10" />
      </g>
    </>
  ),
  music: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <path
          d="M20 40a8 8 0 1 1-3-15.3V15l24-5v22.7A8 8 0 1 1 38 24V16l-15 3v17.3A8 8 0 0 1 20 40Z"
          fill="url(#cat-grad-a)"
        />
        <path d="M17 10l24-5v6l-24 5V10Z" fill="url(#cat-grad-b)" />
      </g>
    </>
  ),
  photography: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <rect x="10" y="20" width="44" height="30" rx="7" fill="url(#cat-grad-a)" />
        <rect x="10" y="20" width="44" height="10" rx="7" fill="url(#cat-grad-b)" opacity="0.7" />
        <rect x="24" y="14" width="16" height="8" rx="3" fill="url(#cat-grad-b)" />
        <circle cx="32" cy="36" r="9" fill="#0b0a10" opacity="0.85" />
        <circle cx="32" cy="36" r="4.5" fill="#c4b5fd" opacity="0.7" />
      </g>
    </>
  ),
  sports: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <path
          d="M32 10c9 0 15 4 15 4v6c0 10-7 17-15 17s-15-7-15-17v-6s6-4 15-4Z"
          fill="url(#cat-grad-a)"
        />
        <rect x="27" y="37" width="10" height="9" fill="url(#cat-grad-b)" />
        <rect x="20" y="46" width="24" height="6" rx="3" fill="url(#cat-grad-b)" />
        <path d="M22 16c4-2 16-2 20 0" stroke="#0b0a10" strokeWidth="2" fill="none" opacity="0.5" />
      </g>
    </>
  ),
  "virtual-worlds": (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <path d="M32 8 54 20v24L32 56 10 44V20L32 8Z" fill="url(#cat-grad-a)" />
        <path d="M32 8 54 20 32 32 10 20 32 8Z" fill="url(#cat-grad-b)" />
        <path d="M32 32v24L10 44V20l22 12Z" fill="#0b0a10" opacity="0.25" />
      </g>
    </>
  ),
  collectibles: (
    <>
      {GRADIENTS}
      <g filter="url(#cat-shadow)">
        <circle cx="24" cy="30" r="14" fill="url(#cat-grad-b)" opacity="0.85" />
        <circle cx="38" cy="34" r="16" fill="url(#cat-grad-a)" />
        <circle cx="38" cy="34" r="6" fill="#0b0a10" opacity="0.4" />
      </g>
    </>
  ),
};

type ReactSvg = React.ReactNode;

export function CategoryIcon({
  category,
  size = 40,
  className,
}: {
  category: CategoryKey;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      {ICONS[category]}
    </svg>
  );
}

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  art: "Art",
  pfp: "PFPs",
  gaming: "Gaming",
  music: "Music",
  photography: "Photography",
  sports: "Sports",
  "virtual-worlds": "Virtual Worlds",
  collectibles: "Collectibles",
};
