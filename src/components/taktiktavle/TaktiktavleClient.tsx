"use client";

export { default } from "./TaktiktavleEditorClient";

/*

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTaktiktavleUi } from "@/components/taktiktavle/TaktiktavleProvider";

type TemplateId = "full-h" | "full-v" | "half-left" | "half-right";

type Template = {
  id: TemplateId;
  label: string;
  rotateDeg: 0 | 90;
  crop: "full" | "left" | "right";
  aspect: number; // width/height
};

const TEMPLATES: Template[] = [
  { id: "full-h", label: "Fuld bane (horisontal)", rotateDeg: 0, crop: "full", aspect: 16 / 9 },
  { id: "full-v", label: "Fuld bane (vertikal)", rotateDeg: 90, crop: "full", aspect: 9 / 16 },
  { id: "half-left", label: "Halvbane (venstre)", rotateDeg: 0, crop: "left", aspect: 16 / 9 },
  { id: "half-right", label: "Halvbane (højre)", rotateDeg: 0, crop: "right", aspect: 16 / 9 },
];

type DocKind = "image" | "animation";

type ShapeBase = {
  id: string;
  color: string;
  width: number;
};

type LineShape = ShapeBase & {
  type: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type DotShape = ShapeBase & {
  type: "player";
  x: number;
  y: number;
  r: number;
};

type ConeShape = ShapeBase & {
  type: "cone";
  x: number;
  y: number;
  size: number;
};

type TextShape = ShapeBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
};

type Shape = LineShape | DotShape | ConeShape | TextShape;

type Frame = {
  id: string;
  durationMs: number;
  shapes: Shape[];
};

type DocumentState = {
  id: string;
  kind: DocKind;
  name: string;
  templateId: TemplateId;
  frames: Frame[];
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 7);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const cx = x1 + tt * dx;
  const cy = y1 + tt * dy;
  return Math.hypot(px - cx, py - cy);
}

function hitTest(shape: Shape, x: number, y: number) {
  if (shape.type === "player") {
    return Math.hypot(x - shape.x, y - shape.y) <= shape.r + 6;
  }
  if (shape.type === "cone") {
    return Math.hypot(x - shape.x, y - shape.y) <= shape.size + 8;
  }
  if (shape.type === "text") {
    return Math.hypot(x - shape.x, y - shape.y) <= 20;
  }
  return distToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= 10;
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 14;
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + headLen * Math.cos(a1), y2 + headLen * Math.sin(a1));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 + headLen * Math.cos(a2), y2 + headLen * Math.sin(a2));
  ctx.stroke();
}

export default function TaktiktavleClient() {
  const { tool, color, strokeWidth } = useTaktiktavleUi();

  const [doc, setDoc] = useState<DocumentState | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<DocKind>("image");

  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const [containerSize, setContainerSize] = useState({ w: 900, h: 600 });

  useEffect(() => {
    const img = new Image();
    img.src = "/bane.png";
    img.onload = () => {
      bgImgRef.current = img;
      redraw();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: Math.max(320, r.width), h: Math.max(240, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const template = useMemo(() => {
    if (!doc) return null;
    return TEMPLATES.find((t) => t.id === doc.templateId) ?? null;
  }, [doc]);

  const activeFrame = useMemo(() => {
    if (!doc) return null;
    return doc.frames[Math.min(activeFrameIndex, doc.frames.length - 1)] ?? null;
  }, [doc, activeFrameIndex]);

  function createNew(kind: DocKind) {
    setPendingKind(kind);
    setSelectOpen(true);
  }

  function pickTemplate(t: Template) {
    const firstFrame: Frame = { id: uid(), durationMs: 1500, shapes: [] };
    const next: DocumentState = {
      id: uid(),
      kind: pendingKind,
      name: pendingKind === "image" ? "Nyt billede" : "Ny animation",
      templateId: t.id,
      frames: [firstFrame],
    };
    setDoc(next);
    setActiveFrameIndex(0);
    setIsPlaying(false);
    setSelectOpen(false);
    requestAnimationFrame(redraw);
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t = template ?? TEMPLATES[0];
    const w = Math.floor(containerSize.w);
    const h = Math.floor(Math.min(containerSize.h, Math.max(260, w / t.aspect)));

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);

    const img = bgImgRef.current;
    if (img) {
      ctx.save();
      if (t.rotateDeg === 90) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-h / 2, -w / 2);
        // draw into swapped dimensions
        drawCroppedImage(ctx, img, h, w, t.crop);
      } else {
        drawCroppedImage(ctx, img, w, h, t.crop);
      }
      ctx.restore();
    }

    // Shapes
    if (activeFrame) {
      for (const s of activeFrame.shapes) {
        ctx.lineWidth = s.width;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (s.type === "line") {
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        } else if (s.type === "arrow") {
          drawArrow(ctx, s.x1, s.y1, s.x2, s.y2);
        } else if (s.type === "player") {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.15)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (s.type === "cone") {
          const size = s.size;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - size);
          ctx.lineTo(s.x - size * 0.9, s.y + size);
          ctx.lineTo(s.x + size * 0.9, s.y + size);
          ctx.closePath();
          ctx.fill();
        } else if (s.type === "text") {
          ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
          ctx.fillStyle = s.color;
          ctx.fillText(s.text, s.x, s.y);
        }
      }
    }

    // Help overlay if no doc
    if (!doc) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "white";
      ctx.font = "700 20px ui-sans-serif, system-ui";
      ctx.fillText("Opret et billede eller en animation", 24, 48);
      ctx.font = "400 14px ui-sans-serif, system-ui";
      ctx.fillText("Brug knapperne ovenfor for at komme i gang.", 24, 76);
    }
  }

  function drawCroppedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    crop: Template["crop"]
  ) {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    let sx = 0;
    let sw = srcW;
    if (crop === "left") {
      sw = Math.floor(srcW / 2);
      sx = 0;
    } else if (crop === "right") {
      sw = Math.floor(srcW / 2);
      sx = srcW - sw;
    }

    const sy = 0;
    const sh = srcH;

    // Cover fit
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.globalAlpha = 1;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // Redraw on dependencies
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, doc?.templateId, activeFrameIndex, doc?.frames.length]);

  // Basic play loop for animations
  useEffect(() => {
    if (!doc || doc.kind !== "animation") return;
    if (!isPlaying) return;

    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        const frame = doc.frames[activeFrameIndex];
        const dur = Math.max(200, frame?.durationMs ?? 1000);
        await new Promise((r) => setTimeout(r, dur));
        if (cancelled) return;
        setActiveFrameIndex((i) => (i + 1) % doc.frames.length);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [doc, isPlaying, activeFrameIndex]);

  // Drawing interactions
  const draftRef = useRef<Shape | null>(null);

  function canvasPoint(ev: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ev.clientX - r.left,
      y: ev.clientY - r.top,
    };
  }

  function commitShape(s: Shape) {
    if (!doc) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const frames = [...prev.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [...f.shapes, s] };
      return { ...prev, frames };
    });
  }

  function deleteAt(x: number, y: number) {
    if (!doc) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const frames = [...prev.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      const nextShapes = [...f.shapes];
      for (let i = nextShapes.length - 1; i >= 0; i--) {
        if (hitTest(nextShapes[i]!, x, y)) {
          nextShapes.splice(i, 1);
          break;
        }
      }
      frames[idx] = { ...f, shapes: nextShapes };
      return { ...prev, frames };
    });
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!doc || !activeFrame) return;
    const p = canvasPoint(ev);

    if (tool === "eraser") {
      deleteAt(p.x, p.y);
      requestAnimationFrame(redraw);
      return;
    }

    if (tool === "player") {
      commitShape({ id: uid(), type: "player", x: p.x, y: p.y, r: 9, color, width: strokeWidth });
      requestAnimationFrame(redraw);
      return;
    }

    if (tool === "cone") {
      commitShape({ id: uid(), type: "cone", x: p.x, y: p.y, size: 10, color, width: strokeWidth });
      requestAnimationFrame(redraw);
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Tekst:") ?? "";
      if (text.trim()) {
        commitShape({ id: uid(), type: "text", x: p.x, y: p.y, text: text.trim(), color, width: strokeWidth });
        requestAnimationFrame(redraw);
      }
      return;
    }

    if (tool === "line" || tool === "arrow") {
      draftRef.current = {
        id: uid(),
        type: tool,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        color,
        width: strokeWidth,
      } as LineShape;
      (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    }
  }

  function onPointerMove(ev: React.PointerEvent) {
    const d = draftRef.current;
    if (!d) return;
    const p = canvasPoint(ev);
    if (d.type === "line" || d.type === "arrow") {
      (d as LineShape).x2 = p.x;
      (d as LineShape).y2 = p.y;
      // redraw with draft
      const saved = activeFrame?.shapes ?? [];
      if (!canvasRef.current) return;
      redraw();
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.lineWidth = d.width;
      ctx.strokeStyle = d.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (d.type === "line") {
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        ctx.stroke();
      } else {
        drawArrow(ctx, d.x1, d.y1, d.x2, d.y2);
      }
      // restore not needed; we re-rendered full scene
      void saved;
    }
  }

  function onPointerUp(ev: React.PointerEvent) {
    const d = draftRef.current;
    if (!d) return;
    draftRef.current = null;
    if (d.type === "line" || d.type === "arrow") {
      const len = Math.hypot((d as LineShape).x2 - (d as LineShape).x1, (d as LineShape).y2 - (d as LineShape).y1);
      if (len > 4) commitShape(d);
      requestAnimationFrame(redraw);
    }
    try {
      (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  }

  function addFrame() {
    if (!doc) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        frames: [...prev.frames, { id: uid(), durationMs: 1500, shapes: [] }],
      };
      return next;
    });
    setActiveFrameIndex((i) => i + 1);
  }

  function duplicateFrame() {
    if (!doc || !activeFrame) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const frames = [...prev.frames];
      frames.splice(activeFrameIndex + 1, 0, {
        id: uid(),
        durationMs: activeFrame.durationMs,
        shapes: activeFrame.shapes.map((s) => ({ ...s, id: uid() })),
      });
      return { ...prev, frames };
    });
    setActiveFrameIndex((i) => i + 1);
  }

  function deleteFrame() {
    if (!doc) return;
    if (doc.frames.length <= 1) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const frames = [...prev.frames];
      frames.splice(activeFrameIndex, 1);
      return { ...prev, frames };
    });
    setActiveFrameIndex((i) => Math.max(0, i - 1));
  }

  function exportJson() {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    if (!doc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    const suffix = doc.kind === "animation" ? `frame_${activeFrameIndex + 1}` : "billede";
    a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}_${suffix}.png`;
    a.click();
  }

  function clearFrame() {
    if (!doc) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const frames = [...prev.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [] };
      return { ...prev, frames };
    });
    requestAnimationFrame(redraw);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Taktiktavle</h1>
          <div className="text-sm text-zinc-600">Tegn taktik og øvelser som billeder eller animationer.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => createNew("image")}
            className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
          >
            Opret Billede
          </button>
          <button
            type="button"
            onClick={() => createNew("animation")}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold"
          >
            Opret Animation
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={exportJson}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Eksportér JSON
          </button>
          <button
            type="button"
            onClick={clearFrame}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Ryd
          </button>
        </div>
      </div>

      {doc ? (
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <input
                value={doc.name}
                onChange={(e) => setDoc((d) => (d ? { ...d, name: e.target.value } : d))}
                className="w-full max-w-[420px] rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1 text-sm"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Lærred: {template?.label ?? ""} • Værktøj: {tool}
              </div>
            </div>

            {doc.kind === "animation" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                >
                  {isPlaying ? "Stop" : "Afspil"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={containerRef} className="rounded-md border border-[color:var(--surface-border)] bg-white p-3">
        <canvas
          ref={canvasRef}
          className="block w-full rounded-md border border-zinc-200"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>

      {doc && doc.kind === "animation" ? (
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Frames</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addFrame}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
              >
                Ny frame
              </button>
              <button
                type="button"
                onClick={duplicateFrame}
                className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm font-semibold"
              >
                Duplikér
              </button>
              <button
                type="button"
                onClick={deleteFrame}
                disabled={doc.frames.length <= 1}
                className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                Slet
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {doc.frames.map((f, idx) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setActiveFrameIndex(idx);
                }}
                className={
                  "rounded-md px-3 py-2 text-sm font-semibold " +
                  (idx === activeFrameIndex
                    ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                    : "border border-[color:var(--surface-border)]")
                }
              >
                Frame {idx + 1}
              </button>
            ))}
          </div>

          {activeFrame ? (
            <div className="mt-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold opacity-80">Varighed (sek)</span>
                <input
                  type="number"
                  min={0.2}
                  step={0.1}
                  value={(activeFrame.durationMs / 1000).toFixed(1)}
                  onChange={(e) => {
                    const next = Math.max(0.2, Number(e.target.value || 1.5));
                    setDoc((prev) => {
                      if (!prev) return prev;
                      const frames = [...prev.frames];
                      frames[activeFrameIndex] = { ...frames[activeFrameIndex]!, durationMs: Math.round(next * 1000) };
                      return { ...prev, frames };
                    });
                  }}
                  className="w-24 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Vælg lærred</div>
                <div className="text-sm text-zinc-600">
                  Vælg en variation af bane.png (horisontal/vertikal/halvbane).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectOpen(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-semibold"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="rounded-md border border-zinc-200 p-3 text-left hover:bg-zinc-50"
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="mt-1 text-xs text-zinc-600">Rotation: {t.rotateDeg}° • Crop: {t.crop}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

*/
