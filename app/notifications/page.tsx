import { Wallet } from "lucide-react";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";
import { getNotifications } from "@/lib/queries";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export default async function NotificationsPage() {
  const user = await getCurrentUserFromCookies();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mb-2">
        Notifications
      </h1>
      <p className="text-white/50 text-sm mb-8">
        Offers, bids and updates on the items you own or created.
      </p>

      {!user ? (
        <div className="surface-card p-8 text-center">
          <Wallet className="w-10 h-10 text-purple-500/40 mx-auto mb-3" />
          <p className="text-sm text-white/50">
            Connect your wallet to see notifications about your items.
          </p>
        </div>
      ) : (
        <NotificationsPageData userId={String(user._id)} />
      )}
    </div>
  );
}

async function NotificationsPageData({ userId }: { userId: string }) {
  const { notifications } = await getNotifications(userId);
  return <NotificationsList initial={notifications} />;
}
