"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GeneratedArt } from "@/components/nft/GeneratedArt";

interface InitialValues {
  address: string;
  username: string;
  bio: string;
  socials: { twitter: string; discord: string; website: string; instagram: string };
}

export function SettingsForm({ initial }: { initial: InitialValues }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [socials, setSocials] = useState(initial.socials);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, bio, socials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="w-16 h-16 rounded-full overflow-hidden shrink-0 border border-white/10">
          <GeneratedArt seedKey={initial.address} className="w-full h-full" />
        </span>
        <div className="text-sm text-white/40 font-mono">{initial.address}</div>
      </div>

      <Field label="Username" hint="3-20 characters: letters, numbers, underscores">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/60"
        />
      </Field>

      <Field label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="Tell collectors about yourself"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60 resize-none"
        />
        <div className="text-[11px] text-white/30 text-right mt-1">{bio.length}/280</div>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="X / Twitter">
          <input
            value={socials.twitter}
            onChange={(e) => setSocials((s) => ({ ...s, twitter: e.target.value }))}
            placeholder="@username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        </Field>
        <Field label="Discord">
          <input
            value={socials.discord}
            onChange={(e) => setSocials((s) => ({ ...s, discord: e.target.value }))}
            placeholder="username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        </Field>
        <Field label="Website">
          <input
            value={socials.website}
            onChange={(e) => setSocials((s) => ({ ...s, website: e.target.value }))}
            placeholder="https://"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        </Field>
        <Field label="Instagram">
          <input
            value={socials.instagram}
            onChange={(e) => setSocials((s) => ({ ...s, instagram: e.target.value }))}
            placeholder="@username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/60"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving} icon={saved ? <Check className="w-4 h-4" /> : undefined}>
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-white/50 mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-white/30 mt-1">{hint}</p>}
    </div>
  );
}
