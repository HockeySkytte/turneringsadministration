import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";

const EXTENSIONS = ["jpg", "jpeg", "png", "pdf"] as const;

type MatchFileKind = (typeof EXTENSIONS)[number];

function parseKampId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function exists(url: string): Promise<boolean> {
  // Try HEAD first, then fall back to a small ranged GET.
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    if (head.ok) return true;
    if (head.status !== 405) return false;
  } catch {
    // ignore
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });
    return get.ok;
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kampId: string }> }
) {
  await requireApprovedUser();

  const { kampId: raw } = await params;
  const kampId = parseKampId(raw);
  if (!kampId) {
    return NextResponse.json({ message: "Ugyldigt kampId." }, { status: 400 });
  }

  for (const ext of EXTENSIONS) {
    const url = `https://floora.floorball.dk/Public/MatchFile/${kampId}.${ext}`;
    // eslint-disable-next-line no-await-in-loop
    const ok = await exists(url);
    if (ok) {
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.json({ message: "Ingen kamprapport fundet." }, { status: 404 });
}
