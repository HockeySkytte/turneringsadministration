import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ensureTaUserNotificationPreferenceColumns } from "@/lib/turnering/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationChannel = "EMAIL" | "SMS" | "NONE";

type RoleKey = "TOURNAMENT_ADMIN" | "REF_ADMIN" | "CLUB_LEADER" | "TEAM_LEADER" | "REFEREE";

type RoleNotificationKey =
  | "APPROVE_CLUB_LEADER"
  | "MATCH_MOVE_REQUEST"
  | "LICENSE_CHANGE_REQUEST"
  | "APPROVE_REFEREE"
  | "REFEREE_DECLINES_MATCH"
  | "MATCH_MOVED"
  | "APPROVE_TEAM_LEADER_OR_SECRETARIAT"
  | "APPROVE_LICENSE_CHANGE"
  | "MATCH_COMMENT"
  | "ASSIGNED_MATCH";

const ALLOWED_CHANNELS = new Set<NotificationChannel>(["EMAIL", "SMS", "NONE"]);

const ROLE_NOTIFICATION_KEYS: Record<RoleKey, RoleNotificationKey[]> = {
  TOURNAMENT_ADMIN: ["APPROVE_CLUB_LEADER", "MATCH_MOVE_REQUEST", "LICENSE_CHANGE_REQUEST"],
  REF_ADMIN: ["APPROVE_REFEREE", "REFEREE_DECLINES_MATCH", "MATCH_MOVED"],
  CLUB_LEADER: ["APPROVE_TEAM_LEADER_OR_SECRETARIAT", "APPROVE_LICENSE_CHANGE"],
  TEAM_LEADER: ["MATCH_COMMENT", "MATCH_MOVE_REQUEST"],
  REFEREE: ["ASSIGNED_MATCH", "MATCH_MOVED"],
};

function isRoleKey(v: unknown): v is RoleKey {
  return typeof v === "string" && (v as string) in ROLE_NOTIFICATION_KEYS;
}

function isRoleNotificationKey(role: RoleKey, v: unknown): v is RoleNotificationKey {
  return typeof v === "string" && ROLE_NOTIFICATION_KEYS[role].includes(v as RoleNotificationKey);
}

function normChannel(v: unknown): NotificationChannel {
  const c = String(v ?? "NONE").trim().toUpperCase();
  if (ALLOWED_CHANNELS.has(c as NotificationChannel)) return c as NotificationChannel;
  return "NONE";
}

type StoredPrefs = Partial<Record<RoleKey, Partial<Record<RoleNotificationKey, NotificationChannel>>>>;

export async function GET() {
  try {
    const user = await requireUser();
    await ensureTaUserNotificationPreferenceColumns();

    const me = await (prisma.taUser as any).findUnique({
      where: { id: user.id },
      select: { id: true, notificationPreferences: true },
    });

    if (!me) {
      return NextResponse.json({ message: "Bruger ikke fundet." }, { status: 404 });
    }

    const prefs = (me.notificationPreferences ?? {}) as StoredPrefs;

    return NextResponse.json({ ok: true, preferences: prefs });
  } catch (err) {
    console.error("[api/auth/notification-preferences] GET failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ message: "Kunne ikke hente notifikationsindstillinger." }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await ensureTaUserNotificationPreferenceColumns();

    const body = await req.json().catch(() => null);

    const role = body?.role;
    const key = body?.key;
    const channel = normChannel(body?.channel);

    if (!isRoleKey(role)) {
      return NextResponse.json({ message: "Ugyldig rolletype." }, { status: 400 });
    }

    if (!isRoleNotificationKey(role, key)) {
      return NextResponse.json({ message: "Ugyldig notifikationstype." }, { status: 400 });
    }

    const current = await (prisma.taUser as any).findUnique({
      where: { id: user.id },
      select: { id: true, notificationPreferences: true },
    });

    if (!current) {
      return NextResponse.json({ message: "Bruger ikke fundet." }, { status: 404 });
    }

    const prefs = ((current.notificationPreferences ?? {}) as StoredPrefs) ?? {};
    const nextRolePrefs = { ...(prefs[role] ?? {}) };

    nextRolePrefs[key] = channel;

    const next: StoredPrefs = {
      ...prefs,
      [role]: nextRolePrefs,
    };

    await (prisma.taUser as any).update({
      where: { id: user.id },
      data: { notificationPreferences: next as any },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/notification-preferences] POST failed", err);
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    const status = message === "NOT_AUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ message: "Kunne ikke gemme notifikationsindstillinger." }, { status });
  }
}
