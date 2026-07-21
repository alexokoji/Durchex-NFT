export function TraitPill({
  traitType,
  value,
  rarity,
}: {
  traitType: string;
  value: string;
  rarity?: number;
}) {
  return (
    <div className="rounded-xl border border-purple-500/25 bg-purple-700/10 hover:bg-purple-700/20 hover:border-purple-400/50 transition px-3 py-2 text-center cursor-default">
      <div className="text-[10px] uppercase tracking-wide text-purple-300 font-semibold mb-0.5">
        {traitType}
      </div>
      <div className="text-sm text-white font-semibold truncate">{value}</div>
      {rarity !== undefined && (
        <div className="text-[10px] text-white/40 mt-0.5">{rarity.toFixed(0)}% have this</div>
      )}
    </div>
  );
}
