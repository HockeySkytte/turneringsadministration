import { redirect } from "next/navigation";
import { ApprovalStatus, TeamRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

export default async function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isAdmin) return <>{children}</>;
  if (user.activeMembership?.status !== ApprovalStatus.APPROVED) redirect("/statistik");
  if (user.activeMembership?.role !== TeamRole.LEADER) redirect("/statistik");

  return <>{children}</>;
}
