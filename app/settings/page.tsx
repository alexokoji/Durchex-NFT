import { Wallet } from "lucide-react";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { VerificationPanel } from "@/components/settings/VerificationPanel";

export default async function SettingsPage() {
  const user = await getCurrentUserFromCookies();

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">Settings</h1>
      <p className="text-white/50 text-sm mb-8">Manage your public profile.</p>

      {!user ? (
        <div className="surface-card p-8 text-center">
          <Wallet className="w-10 h-10 text-purple-500/40 mx-auto mb-3" />
          <p className="text-sm text-white/50">Connect your wallet to edit your profile.</p>
        </div>
      ) : (
        <div className="surface-card p-6 sm:p-8">
          <SettingsForm
            initial={{
              address: user.address,
              username: user.username,
              bio: user.bio || "",
              avatarUrl: user.avatarUrl || "",
              bannerUrl: user.bannerUrl || "",
              socials: {
                twitter: user.socials?.twitter || "",
                discord: user.socials?.discord || "",
                website: user.socials?.website || "",
                instagram: user.socials?.instagram || "",
              },
            }}
          />
        </div>
      )}

      {user && <VerificationPanel />}
    </div>
  );
}
