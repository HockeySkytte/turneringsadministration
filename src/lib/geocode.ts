export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

export async function geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
  const q = norm(query);
  if (!q) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: {
      // Nominatim usage policy requires a descriptive User-Agent.
      "User-Agent": "floorball-platform/turneringsadministration (server-side geocoding)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  const lat = Number.parseFloat(String(first?.lat ?? ""));
  const lon = Number.parseFloat(String(first?.lon ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lng: lon,
    displayName: norm(first?.display_name) || q,
  };
}

export async function reverseGeocodeWithNominatim(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "floorball-platform/turneringsadministration (server-side reverse geocoding)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  const displayName = norm(data?.display_name);
  return displayName || null;
}
