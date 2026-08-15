import { redirect } from "next/navigation";
import { getAdminFromCookies } from "@/lib/auth/admin";
import { connectDB } from "@/lib/db";
import { Report } from "@/lib/models/Report";
import { ModerationWorkspace } from "@/components/moderation/ModerationWorkspace";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminFromCookies();
  if (!admin) redirect("/");
  await connectDB();
  const reports = await Report.find().sort({ createdAt: -1 }).limit(100).populate("reporter", "username address").lean();
  const initialReports = reports.map((report) => ({
    _id: String(report._id), targetType: report.targetType, targetId: String(report.targetId), reason: report.reason,
    details: report.details, status: report.status, createdAt: new Date(report.createdAt).toISOString(),
    reporter: report.reporter && typeof report.reporter === "object" ? { username: (report.reporter as { username?: string }).username, address: (report.reporter as { address?: string }).address } : null,
    resolutionNote: report.resolutionNote,
  }));
  return <ModerationWorkspace initialReports={initialReports as never} />;
}
