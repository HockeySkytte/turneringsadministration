import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ensureGuestDefaults } from "@/lib/guestDefaults";

export async function POST() {
  const session = await getSession();
  const { changed } = await ensureGuestDefaults(session);

  if (changed) {
    await session.save();
  }

  return NextResponse.json({ ok: true, changed });
}
