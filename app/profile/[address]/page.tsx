import { notFound } from "next/navigation";
import { getProfileByAddress, getItemsByOwner, getItemsByCreator, getFavoritedItems, getActivity } from "@/lib/queries";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ address: string }>;
}

export default async function ProfilePage({ params }: PageProps) {
  const { address } = await params;
  const [profile, viewer] = await Promise.all([
    getProfileByAddress(address),
    getCurrentUserFromCookies(),
  ]);
  if (!profile) notFound();

  const [owned, created, favorited, activity] = await Promise.all([
    getItemsByOwner(profile.id),
    getItemsByCreator(profile.id),
    getFavoritedItems(profile.id),
    getActivity({ userId: profile.id, page: 1 }),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <ProfileHeader profile={profile} />
      <ProfileTabs
        owned={owned}
        created={created}
        favorited={favorited}
        activity={activity.activity}
        activityPageCount={activity.pageCount}
        activityCount={activity.total}
        userId={profile.id}
        address={profile.address}
        isOwnProfile={viewer?.address?.toLowerCase() === profile.address.toLowerCase()}
      />
    </div>
  );
}
