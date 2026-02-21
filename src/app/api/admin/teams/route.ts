import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Legacy endpoint (admin teams) is disabled in Floorball Portalen." },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { message: "Legacy endpoint (admin teams) is disabled in Floorball Portalen." },
    { status: 410 }
  );
}
