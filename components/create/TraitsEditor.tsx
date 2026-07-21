"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface TraitInput {
  traitType: string;
  value: string;
}

export function TraitsEditor({
  traits,
  onChange,
}: {
  traits: TraitInput[];
  onChange: (traits: TraitInput[]) => void;
}) {
  function update(i: number, patch: Partial<TraitInput>) {
    onChange(traits.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function remove(i: number) {
    onChange(traits.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...traits, { traitType: "", value: "" }]);
  }

  return (
    <div>
      {traits.length === 0 && (
        <p className="text-sm text-white/40 mb-4">
          Properties are optional but help buyers filter and compare rarity.
        </p>
      )}
      <div className="space-y-2.5">
        {traits.map((t, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={t.traitType}
              onChange={(e) => update(i, { traitType: e.target.value })}
              placeholder="Trait (e.g. Background)"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
            />
            <input
              value={t.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="Value (e.g. Nebula)"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
            />
            <button
              onClick={() => remove(i)}
              aria-label="Remove trait"
              className="w-9 h-9 shrink-0 rounded-lg grid place-items-center text-white/40 hover:text-danger hover:bg-danger/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="secondary" size="sm" className="mt-3" icon={<Plus className="w-3.5 h-3.5" />} onClick={add}>
        Add property
      </Button>
    </div>
  );
}
