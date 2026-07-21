import { hashSeed, pick } from "@/lib/seed";

const PALETTES: [string, string, string][] = [
  ["#c084fc", "#7c3aed", "#0b0a10"],
  ["#a78bfa", "#5b21b6", "#150e28"],
  ["#e9d8fd", "#8b4feb", "#1a1030"],
  ["#f0abfc", "#6d28d9", "#120a22"],
  ["#d8b4fe", "#4c1d95", "#0f0a1e"],
];

const SHAPES = ["circles", "triangles", "waves", "grid", "blobs"] as const;

export function GeneratedArt({ seedKey, className }: { seedKey: string; className?: string }) {
  const seed = hashSeed(seedKey);
  const palette = pick(PALETTES, seed);
  const shape = pick([...SHAPES], seed >> 3);
  const rot = seed % 360;
  const uid = `g${seed}`;

  return (
    <svg viewBox="0 0 400 400" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette[2]} />
          <stop offset="100%" stopColor={palette[1]} stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor={palette[0]} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette[0]} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${uid}-bg)`} />
      <rect width="400" height="400" fill={`url(#${uid}-glow)`} />
      <g transform={`rotate(${rot} 200 200)`} opacity="0.9">
        {shape === "circles" && (
          <>
            <circle cx="150" cy="160" r={70 + (seed % 40)} fill={palette[0]} opacity="0.35" />
            <circle cx="250" cy="240" r={50 + (seed % 30)} fill={palette[1]} opacity="0.55" />
            <circle cx="230" cy="140" r={26} fill="#ffffff" opacity="0.25" />
          </>
        )}
        {shape === "triangles" && (
          <>
            <polygon points="200,90 320,300 80,300" fill={palette[1]} opacity="0.5" />
            <polygon points="200,150 290,300 110,300" fill={palette[0]} opacity="0.4" />
          </>
        )}
        {shape === "waves" && (
          <>
            <path d="M0 220 Q100 160 200 220 T400 220 V400 H0 Z" fill={palette[1]} opacity="0.5" />
            <path d="M0 260 Q100 320 200 260 T400 260 V400 H0 Z" fill={palette[0]} opacity="0.35" />
          </>
        )}
        {shape === "grid" && (
          <>
            {Array.from({ length: 5 }).map((_, r) =>
              Array.from({ length: 5 }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={40 + c * 65}
                  y={40 + r * 65}
                  width="46"
                  height="46"
                  rx="10"
                  fill={(r + c + seed) % 3 === 0 ? palette[0] : palette[1]}
                  opacity={(r + c) % 2 === 0 ? 0.5 : 0.25}
                />
              ))
            )}
          </>
        )}
        {shape === "blobs" && (
          <>
            <ellipse cx="180" cy="180" rx="120" ry="90" fill={palette[1]} opacity="0.5" />
            <ellipse cx="260" cy="230" rx="80" ry="60" fill={palette[0]} opacity="0.4" />
          </>
        )}
      </g>
    </svg>
  );
}
