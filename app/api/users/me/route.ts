import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getCurrentUser } from "@/lib/auth/currentUser";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const bio = String(body.bio ?? "").slice(0, 280);
  const socials = {
    twitter: String(body.socials?.twitter ?? "").slice(0, 100),
    discord: String(body.socials?.discord ?? "").slice(0, 100),
    website: String(body.socials?.website ?? "").slice(0, 200),
    instagram: String(body.socials?.instagram ?? "").slice(0, 100),
  };

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters: letters, numbers, underscores only" },
      { status: 400 }
    );
  }

  await connectDB();
  if (username.toLowerCase() !== user.username.toLowerCase()) {
    const taken = await User.exists({
      username: new RegExp(`^${username}$`, "i"),
      _id: { $ne: user._id },
    });
    if (taken) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
  }

  user.username = username;
  user.bio = bio;
  user.socials = socials;
  await user.save();

  return NextResponse.json({
    address: user.address,
    username: user.username,
    bio: user.bio,
    socials: user.socials,
  });
}
