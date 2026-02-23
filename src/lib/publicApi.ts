import { NextResponse } from "next/server";

function splitCsvEnv(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function publicApiKeys(): string[] {
  return splitCsvEnv(process.env.PUBLIC_API_KEYS);
}

export function publicApiAllowsAnonymous(): boolean {
  // If no keys are configured, keep API open (backwards-compatible).
  // Configure PUBLIC_API_KEYS to enforce authentication.
  return publicApiKeys().length === 0;
}

export function isValidPublicApiKey(key: string | null | undefined): boolean {
  const k = String(key ?? "").trim();
  if (!k) return false;
  return publicApiKeys().includes(k);
}

export function assertPublicApiAuth(req: Request): NextResponse | null {
  if (publicApiAllowsAnonymous()) return null;

  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get("key");
  const keyFromHeader = req.headers.get("x-api-key") ?? req.headers.get("authorization");

  // Accept either:
  // - x-api-key: <key>
  // - authorization: Bearer <key>
  // - ?key=<key>
  const bearer = keyFromHeader?.match(/^\s*Bearer\s+(.+)\s*$/i);
  const key = bearer?.[1] ?? keyFromQuery ?? keyFromHeader;

  if (!isValidPublicApiKey(key)) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401, headers: corsHeaders(req) }
    );
  }

  return null;
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowed = splitCsvEnv(process.env.PUBLIC_API_ALLOWED_ORIGINS);

  // Default: allow all origins.
  const allowAll = allowed.length === 0 || allowed.includes("*");

  const allowOrigin = (() => {
    if (allowAll) return "*";
    if (!origin) return allowed[0] ?? "";
    if (allowed.includes(origin)) return origin;
    return "";
  })();

  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  return headers;
}

export function optionsResponse(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonResponse(req: Request, body: unknown, init?: ResponseInit): NextResponse {
  const baseHeaders = corsHeaders(req);
  const initHeaders = (init?.headers ?? {}) as HeadersInit;

  return NextResponse.json(body, {
    ...init,
    headers: {
      ...baseHeaders,
      ...initHeaders,
    },
  });
}
