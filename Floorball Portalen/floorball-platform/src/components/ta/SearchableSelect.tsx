"use client";

import { useMemo, useState } from "react";

export default function SearchableSelect({
  label,
  placeholder,
  options,
  valueId,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: Array<{ id: string; label: string }>;
  valueId: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.id === valueId) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query]);

  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          value={open ? query : selected?.label ?? query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(null);
          }}
          placeholder={placeholder}
          onFocus={() => {
            setQuery(selected?.label ?? "");
            setOpen(true);
          }}
          onBlur={() => {
            // Let click selection win.
            setTimeout(() => setOpen(false), 120);
          }}
          disabled={disabled}
        />

        {open && !disabled ? (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-600">Ingen resultater.</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={
                    "block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 " +
                    (o.id === valueId ? "bg-zinc-50 font-semibold" : "")
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.id);
                    setQuery(o.label);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
