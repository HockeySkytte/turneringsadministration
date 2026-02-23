import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function IndstillingerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isSuperuser && !user.isSuperuserApproved && !user.isAdmin) {
    redirect("/afventer");
  }

  // Blank page for now.
  return null;
}
