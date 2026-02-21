import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTournamentAdmin } from "@/lib/auth";
import * as XLSX from "xlsx";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asArrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((r) => r && typeof r === "object") as Array<Record<string, unknown>>;
}

function normalizeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows
    .map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        const key = String(k ?? "").trim();
        if (!key) continue;
        const val = typeof v === "string" ? v.trim() : v;
        out[key] = val;
      }
      return out;
    })
    .filter((r) => Object.keys(r).length > 0);
}

async function ensureTurneringImportTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ta_turnering_imports (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by_id TEXT NOT NULL,
      filename TEXT,
      kampe JSONB NOT NULL,
      holdliste JSONB NOT NULL,
      klubliste JSONB NOT NULL
    );
  `);
}

function readSheet(workbook: XLSX.WorkBook, sheetName: string): Array<Record<string, unknown>> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) as unknown;
  return normalizeRows(asArrayOfObjects(json));
}

export async function POST(req: Request) {
  const user = await requireTournamentAdmin();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Mangler fil." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ ok: false, message: "Kunne ikke læse Excel-filen." }, { status: 400 });
  }

  const kampe = readSheet(workbook, "Kampprogram");
  const holdliste = readSheet(workbook, "Holdliste");
  const klubliste = readSheet(workbook, "Klubliste");

  if (kampe.length === 0 && holdliste.length === 0 && klubliste.length === 0) {
    const present = workbook.SheetNames.join(", ");
    return NextResponse.json(
      {
        ok: false,
        message:
          "Excel indeholder ingen data i sheets 'Kampprogram', 'Holdliste' og 'Klubliste'. " +
          (present ? `Fundne sheets: ${present}` : ""),
      },
      { status: 400 }
    );
  }

  await ensureTurneringImportTable();

  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ta_turnering_imports (id, created_by_id, filename, kampe, holdliste, klubliste)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
    id,
    user.id,
    file.name ?? null,
    JSON.stringify(kampe),
    JSON.stringify(holdliste),
    JSON.stringify(klubliste)
  );

  return NextResponse.json({
    ok: true,
    import: {
      id,
      filename: file.name ?? null,
      counts: { kampe: kampe.length, holdliste: holdliste.length, klubliste: klubliste.length },
      preview: {
        kampe: kampe.slice(0, 20),
        holdliste: holdliste.slice(0, 20),
        klubliste: klubliste.slice(0, 20),
      },
    },
  });
}
