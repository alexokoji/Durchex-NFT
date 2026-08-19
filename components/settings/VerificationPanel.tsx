"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { ImageUploadField } from "@/components/settings/ImageUploadField";
import { ApplicableTier, TIER_LABELS, TIER_MIN_NFTS, VerificationTier } from "@/lib/verification";

type Status = {
  tier: VerificationTier;
  nftsCreated: number;
  blockers: Record<ApplicableTier, string[]>;
  pending: { tier: ApplicableTier; createdAt: string } | null;
  lastDecision: { tier: ApplicableTier; status: string; note: string } | null;
};

/**
 * Where the signed-in user stands on verification, and how to apply.
 *
 * The requirements are shown as a live checklist rather than a form that
 * fails on submit — most of what a badge needs is profile work the user
 * does above this panel anyway, so telling them exactly what is still
 * missing is more useful than a rejection.
 */
export function VerificationPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [applyingFor, setApplyingFor] = useState<ApplicableTier | null>(null);
  const [idDocumentUrl, setIdDocumentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/verification")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStatus(data));
  }
  useEffect(load, []);

  if (!status) return null;

  async function submit(tier: ApplicableTier) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, idDocumentUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.blockers?.join(" ") ?? data.error ?? "Couldn't submit");
      setApplyingFor(null);
      setIdDocumentUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="surface-card p-6 sm:p-8 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-purple-300" />
        <h2 className="text-sm font-semibold text-white">Verification</h2>
      </div>
      <p className="text-xs text-white/45 mb-5">
        A badge sits next to your username everywhere on Durchex. Both are earned — there is no way
        to buy one.
      </p>

      <div className="flex items-center gap-2 mb-6 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
        <VerifiedBadge tier={status.tier} className="w-4 h-4" />
        <span className="text-xs text-white/70">
          {status.tier === "none" ? "You aren't verified yet" : TIER_LABELS[status.tier]}
        </span>
        <span className="text-xs text-white/35 ml-auto tabular-nums">
          {status.nftsCreated.toLocaleString()} NFTs created
        </span>
      </div>

      {status.pending && (
        <div className="flex items-center gap-2 mb-6 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5">
          <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />
          <span className="text-xs text-purple-100">
            Your {TIER_LABELS[status.pending.tier].toLowerCase()} application is under review.
          </span>
        </div>
      )}

      {!status.pending && status.lastDecision?.status === "rejected" && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
          <span className="text-xs text-white/70">Your last application wasn&rsquo;t approved.</span>
          {status.lastDecision.note && (
            <p className="text-xs text-white/45 mt-1">{status.lastDecision.note}</p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {(["white", "purple"] as const).map((tier) => (
          <TierCard
            key={tier}
            tier={tier}
            status={status}
            open={applyingFor === tier}
            onOpen={() => {
              setError(null);
              setApplyingFor(applyingFor === tier ? null : tier);
            }}
            idDocumentUrl={idDocumentUrl}
            setIdDocumentUrl={setIdDocumentUrl}
            submitting={submitting}
            onSubmit={() => submit(tier)}
          />
        ))}
      </div>

      {error && <p className="text-xs text-danger mt-4">{error}</p>}
    </div>
  );
}

function TierCard({
  tier,
  status,
  open,
  onOpen,
  idDocumentUrl,
  setIdDocumentUrl,
  submitting,
  onSubmit,
}: {
  tier: ApplicableTier;
  status: Status;
  open: boolean;
  onOpen: () => void;
  idDocumentUrl: string;
  setIdDocumentUrl: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const held = status.tier === tier || (tier === "white" && status.tier === "purple");
  // The server recomputes blockers with the ID included; the list it sent
  // assumes none was uploaded, so that one line resolves here as the user
  // uploads rather than only after a failed submit.
  const blockers = status.blockers[tier].filter(
    (b) => !(tier === "purple" && idDocumentUrl && b.startsWith("Upload a government-issued ID"))
  );
  const eligible = blockers.length === 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <BadgeCheck
              className={`w-4 h-4 ${tier === "purple" ? "text-purple-400" : "text-white"}`}
            />
            <span className="text-sm font-medium text-white">{TIER_LABELS[tier]}</span>
          </div>
          <p className="text-xs text-white/45 mt-1 max-w-sm">
            {tier === "white"
              ? `A complete public profile and at least ${TIER_MIN_NFTS.white} NFTs you created.`
              : `Everything the white badge needs, at least ${TIER_MIN_NFTS.purple} NFTs, and a government-issued ID checked by a person.`}
          </p>
        </div>
        {held ? (
          <span className="flex items-center gap-1 text-xs text-purple-300 shrink-0">
            <Check className="w-3.5 h-3.5" /> Held
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={onOpen} disabled={!!status.pending}>
            {open ? "Close" : "Apply"}
          </Button>
        )}
      </div>

      {open && !held && (
        <div className="mt-4 pt-4 border-t border-white/10">
          {blockers.length > 0 ? (
            <>
              <div className="text-xs text-white/60 mb-2">Still needed:</div>
              <ul className="space-y-1.5">
                {blockers.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-white/45">
                    <span className="w-1 h-1 rounded-full bg-white/25 mt-1.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-white/60 mb-3">
              Everything checks out. Submitting sends your profile as it stands now for review.
            </p>
          )}

          {tier === "purple" && (
            <div className="mt-4">
              <ImageUploadField
                label="Government-issued ID"
                hint="Passport or driving licence — deleted once reviewed"
                value={idDocumentUrl}
                onChange={setIdDocumentUrl}
                aspect="wide"
              />
            </div>
          )}

          <div className="mt-4">
            <Button size="sm" onClick={onSubmit} disabled={!eligible || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…
                </>
              ) : (
                "Submit application"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
