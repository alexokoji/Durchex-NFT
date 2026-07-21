import Link from "next/link";
import clsx from "clsx";
import { Gavel, Tag, TrendingDown, CheckCircle2, ShoppingBag, UserPlus } from "lucide-react";
import { GeneratedArt } from "@/components/nft/GeneratedArt";
import { NotificationView } from "@/lib/types";

const TYPE_META: Record<
  NotificationView["type"],
  { icon: typeof Gavel; color: string; message: (n: NotificationView) => string }
> = {
  bid: {
    icon: Gavel,
    color: "text-purple-300",
    message: (n) => `${n.fromUser?.username ?? "Someone"} bid ${n.amountEth?.toFixed(2)} ETH on ${n.itemName}`,
  },
  offer: {
    icon: Tag,
    color: "text-purple-300",
    message: (n) => `${n.fromUser?.username ?? "Someone"} offered ${n.amountEth?.toFixed(2)} ETH for ${n.itemName}`,
  },
  outbid: {
    icon: TrendingDown,
    color: "text-danger",
    message: (n) => `You were outbid on ${n.itemName} — new bid ${n.amountEth?.toFixed(2)} ETH`,
  },
  offer_accepted: {
    icon: CheckCircle2,
    color: "text-success",
    message: (n) => `${n.fromUser?.username ?? "The owner"} accepted your offer of ${n.amountEth?.toFixed(2)} ETH on ${n.itemName}`,
  },
  sale: {
    icon: ShoppingBag,
    color: "text-success",
    message: (n) => `${n.itemName} sold for ${n.amountEth?.toFixed(2)} ETH`,
  },
  follow: {
    icon: UserPlus,
    color: "text-pink-purple",
    message: (n) => `${n.fromUser?.username ?? "Someone"} started following you`,
  },
};

export function NotificationRow({
  notification,
  onRead,
}: {
  notification: NotificationView;
  onRead?: (id: string) => void;
}) {
  const meta = TYPE_META[notification.type];
  const href = notification.itemId
    ? `/assets/${notification.itemId}`
    : notification.fromUser
      ? `/profile/${notification.fromUser.address}`
      : "#";

  return (
    <Link
      href={href}
      onClick={() => !notification.read && onRead?.(notification.id)}
      className={clsx(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition hover:bg-white/5",
        !notification.read && "bg-purple-700/10"
      )}
    >
      <span
        className={clsx(
          "w-9 h-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center shrink-0",
          meta.color
        )}
      >
        <meta.icon className="w-4 h-4" />
      </span>

      {notification.itemId ? (
        <span className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
          <GeneratedArt seedKey={notification.itemId} className="w-full h-full" />
        </span>
      ) : (
        notification.fromUser && (
          <span className="w-9 h-9 rounded-full overflow-hidden shrink-0">
            <GeneratedArt seedKey={notification.fromUser.address} className="w-full h-full" />
          </span>
        )
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/85 leading-snug">{meta.message(notification)}</p>
        <p className="text-[11px] text-white/40 mt-0.5">
          {new Date(notification.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {!notification.read && <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />}
    </Link>
  );
}
