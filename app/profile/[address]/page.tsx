import { notFound } from "next/navigation";
import { getProfileByAddress, getItemsByOwner, getItemsByCreator, getFavoritedItems } from "@/lib/queries";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";

// Live marketplace data — never prerender a stale snapshot at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ address: string }>;
}

export default async function ProfilePage({ params }: PageProps) {
  const { address } = await params;
  const profile = await getProfileByAddress(address);
  if (!profile) notFound();

  const [owned, created, favorited] = await Promise.all([
    getItemsByOwner(profile.id),
    getItemsByCreator(profile.id),
    getFavoritedItems(profile.id),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <ProfileHeader profile={profile} />
      <ProfileTabs owned={owned} created={created} favorited={favorited} />
    </div>
  );
}
