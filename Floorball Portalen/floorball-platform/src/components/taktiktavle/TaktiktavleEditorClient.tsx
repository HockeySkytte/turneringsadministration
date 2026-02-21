"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTaktiktavleUi } from "@/components/taktiktavle/TaktiktavleProvider";

type DocKind = "image" | "animation";

type CanvasTemplate = {
  crop: "full" | "half";
  rotationDeg: 0 | 90 | 180 | 270;
};

type ShapeBase = {
  id: string;
  color: string;
  width: number;
};

type PathStyle = "solid" | "dashed" | "wavy";

type PathShape = ShapeBase & {
  type: "path";
  style: PathStyle;
  arrow: boolean;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  attachId?: string | null;
};

type PlayerShape = ShapeBase & {
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

type BallShape = ShapeBase & {
  type: "ball";
  x: number;
  y: number;
  r: number;
};

type TextShape = ShapeBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

type Shape = PathShape | PlayerShape | ConeShape | BallShape | TextShape;

type Frame = {
  id: string;
  durationMs: number;
  shapes: Shape[];
};

type DocumentState = {
  id: string;
  kind: DocKind;
  name: string;
  template: CanvasTemplate;
  frames: Frame[];
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 7);
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function pointOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = clamp01(t);
  const a = 1 - tt;
  const x = a * a * x1 + 2 * a * tt * cx + tt * tt * x2;
  const y = a * a * y1 + 2 * a * tt * cy + tt * tt * y2;
  return { x, y };
}

function derivOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = clamp01(t);
  const dx = 2 * (1 - tt) * (cx - x1) + 2 * tt * (x2 - cx);
  const dy = 2 * (1 - tt) * (cy - y1) + 2 * tt * (y2 - cy);
  return { dx, dy };
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
  if (shape.type === "player") return Math.hypot(x - shape.x, y - shape.y) <= shape.r + 8;
  if (shape.type === "cone") return Math.hypot(x - shape.x, y - shape.y) <= shape.size + 10;
  if (shape.type === "ball") return Math.hypot(x - shape.x, y - shape.y) <= shape.r + 8;
  if (shape.type === "text") {
    const w = shape.text.length * shape.fontSize * 0.55 + 14;
    const h = shape.fontSize + 14;
    return x >= shape.x - 8 && x <= shape.x + w && y >= shape.y - h && y <= shape.y + 8;
  }

  // Path: sample points and compute min distance to polyline segments
  const pts: Array<{ x: number; y: number }> = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    pts.push(pointOnQuad(shape.x1, shape.y1, shape.cx, shape.cy, shape.x2, shape.y2, i / n));
  }
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    best = Math.min(best, distToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best <= 12;
}

function computeDefaultControl(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.min(80, len * 0.25);
  return { cx: mx + nx * bend, cy: my + ny * bend };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) {
  const angle = Math.atan2(dy, dx);
  const headLen = 14;
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + headLen * Math.cos(a1), y + headLen * Math.sin(a1));
  ctx.moveTo(x, y);
  ctx.lineTo(x + headLen * Math.cos(a2), y + headLen * Math.sin(a2));
  ctx.stroke();
}

function drawWavyQuad(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  amp: number,
  waveLen: number
) {
  const steps = 80;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointOnQuad(x1, y1, cx, cy, x2, y2, t);
    const d = derivOnQuad(x1, y1, cx, cy, x2, y2, t);
    const len = Math.max(1e-6, Math.hypot(d.dx, d.dy));
    const nx = -d.dy / len;
    const ny = d.dx / len;
    const phase = (t * Math.hypot(x2 - x1, y2 - y1) * (2 * Math.PI)) / Math.max(1, waveLen);
    const off = i === 0 || i === steps ? 0 : Math.sin(phase) * amp;
    const xx = p.x + nx * off;
    const yy = p.y + ny * off;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

function templateLabel(t: CanvasTemplate) {
  const base = t.crop === "full" ? "Fuld bane" : "Halv bane";
  return `${base} • Rotation ${t.rotationDeg}°`;
}

export default function TaktiktavleEditorClient() {
  const { tool, color, strokeWidth, lineMode, accessorySize, setDocKind } = useTaktiktavleUi();

  const STORAGE_KEY = "taktiktavle:state:v1";

  const [doc, setDoc] = useState<DocumentState | null>(null);
  const [past, setPast] = useState<DocumentState[]>([]);
  const [future, setFuture] = useState<DocumentState[]>([]);

  const [selectOpen, setSelectOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<DocKind>("image");
  const [pendingCrop, setPendingCrop] = useState<CanvasTemplate["crop"]>("full");
  const [pendingRotation, setPendingRotation] = useState<CanvasTemplate["rotationDeg"]>(0);

  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTeams, setUploadTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [uploadKind, setUploadKind] = useState<"PLAYBOOK" | "EXERCISE">("PLAYBOOK");
  const [uploadScope, setUploadScope] = useState<"TEAM" | "PUBLIC">("TEAM");
  const [uploadTeamId, setUploadTeamId] = useState<string>("");
  const [uploadTitle, setUploadTitle] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const [containerSize, setContainerSize] = useState({ w: 900, h: 560 });

  const playRef = useRef<{ frameStart: number; frameIndex: number } | null>(null);
  const draftRef = useRef<(PathShape & { draftStage?: 1 | 2; draftMode?: "straight" | "curve" }) | null>(null);
  const dragRef = useRef<
    | null
    | {
        shapeId: string;
        startX: number;
        startY: number;
        baseDoc: DocumentState;
      }
  >(null);

  const activeFrame = useMemo(() => {
    if (!doc) return null;
    return doc.frames[Math.min(activeFrameIndex, doc.frames.length - 1)] ?? null;
  }, [doc, activeFrameIndex]);

  const selectedShape = useMemo(() => {
    if (!activeFrame || !selectedId) return null;
    return activeFrame.shapes.find((s) => s.id === selectedId) ?? null;
  }, [activeFrame, selectedId]);

  // Restore last state when returning to the page
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { doc?: DocumentState; activeFrameIndex?: number };
      if (!parsed?.doc || !Array.isArray(parsed.doc.frames) || parsed.doc.frames.length === 0) return;
      setDoc(parsed.doc);
      setPast([]);
      setFuture([]);
      setActiveFrameIndex(Math.max(0, Math.min(parsed.activeFrameIndex ?? 0, parsed.doc.frames.length - 1)));
      setIsPlaying(false);
      setSelectedId(null);
      setSelectOpen(false);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state so navigation away/back keeps the current board
  useEffect(() => {
    try {
      if (!doc) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ doc, activeFrameIndex: Math.min(activeFrameIndex, doc.frames.length - 1) })
      );
    } catch {
      // ignore
    }
  }, [doc, activeFrameIndex]);

  // Expose doc kind to the sidebar (image vs animation)
  useEffect(() => {
    setDocKind(doc?.kind ?? null);
  }, [doc?.kind, setDocKind]);

  useEffect(() => {
    if (tool.startsWith("line-") || tool.startsWith("arrow-")) return;
    if (draftRef.current) {
      draftRef.current = null;
      requestAnimationFrame(() => redraw(performance.now()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    const img = new Image();
    img.src = "/bane.png";
    img.onload = () => {
      bgImgRef.current = img;
      redraw(performance.now());
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

  function pushHistory(snapshot: DocumentState) {
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  }

  function applyMutation(mutator: (d: DocumentState) => DocumentState) {
    if (!doc) return;
    pushHistory(doc);
    setDoc(mutator(doc));
  }

  function undo() {
    if (past.length === 0 || !doc) return;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDoc(prev);
    setIsPlaying(false);
    setSelectedId(null);
  }

  function redo() {
    if (future.length === 0 || !doc) return;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, doc]);
    setDoc(next);
    setIsPlaying(false);
    setSelectedId(null);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "y") || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, past.length, future.length]);

  function createNew(kind: DocKind) {
    setPendingKind(kind);
    setPendingCrop("full");
    setPendingRotation(0);
    setSelectOpen(true);
  }

  function confirmTemplate() {
    const firstFrame: Frame = { id: uid(), durationMs: 1500, shapes: [] };
    const next: DocumentState = {
      id: uid(),
      kind: pendingKind,
      name: pendingKind === "image" ? "Nyt billede" : "Ny animation",
      template: { crop: pendingCrop, rotationDeg: pendingRotation },
      frames: [firstFrame],
    };
    setDoc(next);
    setPast([]);
    setFuture([]);
    setActiveFrameIndex(0);
    setIsPlaying(false);
    setSelectedId(null);
    setSelectOpen(false);
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function currentLineConfig(): { style: PathStyle; arrow: boolean } | null {
    // For animations: simplified toolset (Solid + pil)
    // - only solid
    // - arrow allowed for direction (hidden during playback)
    if (doc?.kind === "animation") {
      if (tool === "arrow-solid") return { style: "solid", arrow: true };
      // Allow other legacy selections (if any) but force solid
      if (tool.startsWith("line-") || tool.startsWith("arrow-")) return { style: "solid", arrow: tool.startsWith("arrow-") };
      return null;
    }

    if (tool.startsWith("line-")) {
      const s = tool.replace("line-", "") as PathStyle;
      return { style: s, arrow: false };
    }
    if (tool.startsWith("arrow-")) {
      const s = tool.replace("arrow-", "") as PathStyle;
      return { style: s, arrow: true };
    }
    return null;
  }

  function positionOfAccessory(s: Shape): { x: number; y: number } | null {
    if (s.type === "player" || s.type === "cone" || s.type === "ball" || s.type === "text") return { x: s.x, y: s.y };
    return null;
  }

  function endPositionsForFrame(frame: Frame) {
    const ends = new Map<string, { x: number; y: number }>();
    for (const s of frame.shapes) {
      if (s.type !== "path") continue;
      const aid = s.attachId ?? null;
      if (!aid) continue;
      // If multiple paths exist for the same accessory, the last one wins.
      ends.set(aid, { x: s.x2, y: s.y2 });
    }
    return ends;
  }

  function canvasPoint(ev: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function commitShape(s: Shape) {
    if (!doc) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [...f.shapes, s] };
      return { ...d, frames };
    });
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function deleteAt(x: number, y: number) {
    if (!doc || !activeFrame) return;
    const idx = (() => {
      for (let i = activeFrame.shapes.length - 1; i >= 0; i--) {
        if (hitTest(activeFrame.shapes[i]!, x, y)) return i;
      }
      return -1;
    })();

    if (idx < 0) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const fi = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[fi]!;
      const shapes = [...f.shapes];
      const removed = shapes.splice(idx, 1)[0];
      // Clear attachments pointing to removed shape
      const cleaned = shapes.map((s) => {
        if (s.type !== "path") return s;
        if (removed && s.attachId === removed.id) return { ...s, attachId: null };
        return s;
      });
      frames[fi] = { ...f, shapes: cleaned };
      return { ...d, frames };
    });
    setSelectedId(null);
  }

  function moveShape(base: Shape, dx: number, dy: number): Shape {
    if (base.type === "player") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "cone") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "ball") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "text") return { ...base, x: base.x + dx, y: base.y + dy };
    return {
      ...base,
      x1: base.x1 + dx,
      y1: base.y1 + dy,
      cx: base.cx + dx,
      cy: base.cy + dy,
      x2: base.x2 + dx,
      y2: base.y2 + dy,
    };
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!doc || !activeFrame) return;
    const p = canvasPoint(ev);

    // Right click = select/mark without switching tools
    if (ev.button === 2) {
      ev.preventDefault();
      let hit: Shape | null = null;
      for (let i = activeFrame.shapes.length - 1; i >= 0; i--) {
        const s = activeFrame.shapes[i]!;
        if (hitTest(s, p.x, p.y)) {
          hit = s;
          break;
        }
      }
      setSelectedId(hit?.id ?? null);
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Eraser
    if (tool === "eraser") {
      deleteAt(p.x, p.y);
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Select/move
    if (tool === "select") {
      let hit: Shape | null = null;
      for (let i = activeFrame.shapes.length - 1; i >= 0; i--) {
        const s = activeFrame.shapes[i]!;
        if (hitTest(s, p.x, p.y)) {
          hit = s;
          break;
        }
      }
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragRef.current = { shapeId: hit.id, startX: p.x, startY: p.y, baseDoc: doc };
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
      }
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Accessories
    if (tool === "player") {
      commitShape({
        id: uid(),
        type: "player",
        x: p.x,
        y: p.y,
        r: Math.max(4, accessorySize),
        color,
        width: strokeWidth,
      });
      return;
    }
    if (tool === "cone") {
      commitShape({
        id: uid(),
        type: "cone",
        x: p.x,
        y: p.y,
        size: Math.max(4, accessorySize),
        color,
        width: strokeWidth,
      });
      return;
    }
    if (tool === "ball") {
      commitShape({
        id: uid(),
        type: "ball",
        x: p.x,
        y: p.y,
        r: Math.max(3, Math.round(accessorySize * 0.75)),
        color,
        width: strokeWidth,
      });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Tekst:") ?? "";
      if (text.trim()) {
        commitShape({
          id: uid(),
          type: "text",
          x: p.x,
          y: p.y,
          text: text.trim(),
          fontSize: Math.max(10, Math.round(accessorySize * 1.35)),
          color,
          width: strokeWidth,
        });
      }
      return;
    }

    // Path tools (click-based)
    const cfg = currentLineConfig();
    if (!cfg) return;

    const existing = draftRef.current;

    // First click = start
    if (!existing) {
      if (doc.kind === "animation") {
        if (!selectedShape || selectedShape.type === "path") {
          window.alert("Vælg en spiller/bold/kegle først, så linjen kan tilknyttes.");
          return;
        }
      }

      const attachId =
        doc.kind === "animation" ? selectedShape!.id : selectedShape && selectedShape.type !== "path" ? selectedShape.id : null;

      const start = doc.kind === "animation" && selectedShape ? positionOfAccessory(selectedShape) : null;
      const x1 = start?.x ?? p.x;
      const y1 = start?.y ?? p.y;
      draftRef.current = {
        id: uid(),
        type: "path",
        style: cfg.style,
        arrow: cfg.arrow,
        x1,
        y1,
        cx: x1,
        cy: y1,
        x2: x1,
        y2: y1,
        attachId,
        color,
        width: strokeWidth,
        draftStage: 1,
        draftMode: lineMode,
      };
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    const stage = existing.draftStage ?? 1;
    const mode = existing.draftMode ?? "curve";

    // Second click = end (straight commits; curve advances to pick control point)
    if (stage === 1) {
      existing.x2 = p.x;
      existing.y2 = p.y;
      const len = Math.hypot(existing.x2 - existing.x1, existing.y2 - existing.y1);
      if (len <= 4) {
        draftRef.current = null;
        requestAnimationFrame(() => redraw(performance.now()));
        return;
      }

      if (mode === "straight") {
        existing.cx = (existing.x1 + existing.x2) / 2;
        existing.cy = (existing.y1 + existing.y2) / 2;
        const { draftStage, draftMode, ...toCommit } = existing;
        draftRef.current = null;
        commitShape(toCommit);
        return;
      }

      const ctrl = computeDefaultControl(existing.x1, existing.y1, existing.x2, existing.y2);
      existing.cx = ctrl.cx;
      existing.cy = ctrl.cy;
      existing.draftStage = 2;
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Third click = control point (curve commits)
    if (stage === 2) {
      existing.cx = p.x;
      existing.cy = p.y;
      const { draftStage, draftMode, ...toCommit } = existing;
      draftRef.current = null;
      commitShape(toCommit);
      return;
    }

  }

  function onPointerMove(ev: React.PointerEvent) {
    const p = canvasPoint(ev);

    // Drag move
    if (dragRef.current && doc && activeFrame) {
      const { shapeId, startX, startY, baseDoc } = dragRef.current;
      const dx = p.x - startX;
      const dy = p.y - startY;

      const fi = Math.min(activeFrameIndex, baseDoc.frames.length - 1);
      const baseFrame = baseDoc.frames[fi]!;
      const nextShapes = baseFrame.shapes.map((s) => (s.id === shapeId ? moveShape(s, dx, dy) : s));
      const nextFrames = [...baseDoc.frames];
      nextFrames[fi] = { ...baseFrame, shapes: nextShapes };
      setDoc({ ...baseDoc, frames: nextFrames });
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Draft path preview
    const d = draftRef.current;
    if (!d || d.type !== "path") return;
    const stage = d.draftStage ?? 1;
    const mode = d.draftMode ?? "curve";

    if (stage === 1) {
      d.x2 = p.x;
      d.y2 = p.y;
      if (mode === "straight") {
        d.cx = (d.x1 + d.x2) / 2;
        d.cy = (d.y1 + d.y2) / 2;
      } else {
        const ctrl = computeDefaultControl(d.x1, d.y1, d.x2, d.y2);
        d.cx = ctrl.cx;
        d.cy = ctrl.cy;
      }
    } else if (stage === 2) {
      d.cx = p.x;
      d.cy = p.y;
    }
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function onPointerUp(ev: React.PointerEvent) {
    // End drag
    if (dragRef.current && doc) {
      const base = dragRef.current.baseDoc;
      dragRef.current = null;
      // push base snapshot once
      setPast((p) => [...p, base]);
      setFuture([]);
      try {
        (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }
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

  async function downloadCurrent() {
    if (!doc) return;
    if (isDownloading) return;

    if (doc.kind === "image") {
      exportPng();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDownloading(true);

    const prevFrameIndex = activeFrameIndex;
    const prevPlaying = isPlaying;
    const prevSelected = selectedId;

    try {
      // Play from frame 1 and capture canvas
      setSelectedId(null);
      setActiveFrameIndex(0);
      playRef.current = { frameStart: performance.now(), frameIndex: 0 };
      setIsPlaying(true);

      // Wait a tick so canvas draws the first frame
      await new Promise((r) => setTimeout(r, 50));

      const fps = 30;
      const stream = (canvas as any).captureStream?.(fps) as MediaStream | undefined;
      if (!stream) {
        window.alert("Din browser understøtter ikke video-download her.");
        return;
      }

      const chunks: BlobPart[] = [];
      const preferredTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mimeType = preferredTypes.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? "video/webm";

      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const totalMs = doc.frames.reduce((sum, f) => sum + Math.max(200, f.durationMs), 0);

      const done = new Promise<Blob>((resolve, reject) => {
        rec.onerror = () => reject(new Error("RECORDER_ERROR"));
        rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      rec.start(250);
      await new Promise((r) => setTimeout(r, totalMs + 120));
      rec.stop();

      const webm = await done;

      // Convert to MP4 via ffmpeg.wasm (loaded on-demand)
      try {
        const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
          import("@ffmpeg/ffmpeg"),
          import("@ffmpeg/util"),
        ]);

        const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.6/dist";

        const ffmpeg = new FFmpeg();
        await ffmpeg.load({
          coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
        });

        await ffmpeg.writeFile("in.webm", await fetchFile(webm));
        await ffmpeg.exec(["-i", "in.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "out.mp4"]);
        const out = await ffmpeg.readFile("out.mp4");
        if (typeof out === "string") throw new Error("FFMPEG_OUTPUT_NOT_BINARY");
        // Copy to ensure an ArrayBuffer-backed view (avoids SharedArrayBuffer typing issues in TS)
        const copy = new Uint8Array(out.byteLength);
        copy.set(out);
        const mp4Blob = new Blob([copy.buffer], { type: "video/mp4" });

        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback to WebM download if MP4 conversion fails
        const url = URL.createObjectURL(webm);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsPlaying(prevPlaying);
      setActiveFrameIndex(prevFrameIndex);
      setSelectedId(prevSelected);
      playRef.current = { frameStart: performance.now(), frameIndex: prevFrameIndex };
      setIsDownloading(false);
      requestAnimationFrame(() => redraw(performance.now()));
    }
  }

  async function openUpload() {
    if (!doc) return;
    setUploadError(null);
    setUploadBusy(false);
    setUploadTitle(doc.name ?? "");
    setUploadKind("PLAYBOOK");
    setUploadScope("TEAM");
    setUploadTeams([]);
    setUploadTeamId("");
    setUploadOpen(true);

    try {
      const res = await fetch("/api/ui/my-teams", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data?.message ?? "Kunne ikke hente hold.");
        return;
      }
      const teams = Array.isArray(data?.teams) ? (data.teams as Array<{ id: string; name: string }>) : [];
      setUploadTeams(teams);
      const activeTeamId = typeof data?.activeTeamId === "string" ? data.activeTeamId : "";
      if (activeTeamId) setUploadTeamId(activeTeamId);
      else if (teams[0]?.id) setUploadTeamId(teams[0].id);
    } catch {
      setUploadError("Kunne ikke hente hold.");
    }
  }

  async function doUpload() {
    if (uploadBusy) return;
    setUploadError(null);

    if (!doc) {
      setUploadError("Ingen taktiktavle at uploade.");
      return;
    }

    const title = uploadTitle.trim() || doc.name || "Taktiktavle";
    if (!title) {
      setUploadError("Titel mangler.");
      return;
    }

    if (uploadScope === "TEAM" && !uploadTeamId) {
      setUploadError("Vælg et hold.");
      return;
    }

    const text = JSON.stringify(doc);

    setUploadBusy(true);
    try {
      const res = await fetch("/api/json-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind: uploadKind,
          scope: uploadScope,
          teamId: uploadScope === "TEAM" ? uploadTeamId : null,
          content: text,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data?.message ?? "Upload fejlede.");
        return;
      }

      setUploadOpen(false);
      window.alert("Upload gennemført.");
    } finally {
      setUploadBusy(false);
    }
  }

  function clearFrame() {
    if (!doc) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [] };
      return { ...d, frames };
    });
    setSelectedId(null);
  }

  function addFrame() {
    if (!doc) return;

    if (doc.kind === "animation" && activeFrame) {
      const endPos = endPositionsForFrame(activeFrame);
      const carried = activeFrame.shapes
        .filter((s) => s.type !== "path")
        .map((s) => {
          const end = endPos.get(s.id);
          if (!end) return s;
          if (s.type === "player" || s.type === "cone" || s.type === "ball" || s.type === "text") {
            return { ...s, x: end.x, y: end.y };
          }
          return s;
        });
      applyMutation((d) => ({ ...d, frames: [...d.frames, { id: uid(), durationMs: 1500, shapes: carried }] }));
      setActiveFrameIndex((i) => i + 1);
      setSelectedId(null);
      return;
    }

    applyMutation((d) => ({ ...d, frames: [...d.frames, { id: uid(), durationMs: 1500, shapes: [] }] }));
    setActiveFrameIndex((i) => i + 1);
    setSelectedId(null);
  }

  function duplicateFrame() {
    if (!doc || !activeFrame) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      frames.splice(activeFrameIndex + 1, 0, {
        id: uid(),
        durationMs: activeFrame.durationMs,
        shapes: activeFrame.shapes.map((s) => ({ ...s, id: uid() })),
      });
      return { ...d, frames };
    });
    setActiveFrameIndex((i) => i + 1);
    setSelectedId(null);
  }

  function deleteFrame() {
    if (!doc || doc.frames.length <= 1) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      frames.splice(activeFrameIndex, 1);
      return { ...d, frames };
    });
    setActiveFrameIndex((i) => Math.max(0, i - 1));
    setSelectedId(null);
  }

  function redraw(now: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wCss = Math.floor(containerSize.w);
    const hCss = Math.floor(Math.min(containerSize.h, Math.max(320, wCss * 0.62)));

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(wCss * dpr);
    canvas.height = Math.floor(hCss * dpr);
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${hCss}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);

    // Background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, wCss, hCss);

    if (doc) {
      const img = bgImgRef.current;
      if (img) {
        drawTemplateBackground(ctx, img, wCss, hCss, doc.template);
      }
    }

    // Overlay if no doc
    if (!doc) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, wCss, hCss);
      ctx.fillStyle = "white";
      ctx.font = "700 20px ui-sans-serif, system-ui";
      ctx.fillText("Opret et billede eller en animation", 24, 48);
      ctx.font = "400 14px ui-sans-serif, system-ui";
      ctx.fillText("Brug knapperne ovenfor for at komme i gang.", 24, 76);
      return;
    }

    const playbackIndex =
      doc.kind === "animation" && isPlaying && playRef.current
        ? playRef.current.frameIndex
        : activeFrameIndex;
    const frame = doc.frames[Math.min(playbackIndex, doc.frames.length - 1)]!;

    // Playback progress for attached objects
    const progress = (() => {
      if (!isPlaying || doc.kind !== "animation") return null;
      const start = playRef.current?.frameStart ?? now;
      const dur = Math.max(200, frame.durationMs);
      const t = (now - start) / dur;
      return clamp01(t);
    })();

    const attachedPos = new Map<string, { x: number; y: number }>();
    if (progress !== null) {
      for (const s of frame.shapes) {
        if (s.type !== "path") continue;
        const aid = s.attachId ?? null;
        if (!aid) continue;
        const p = pointOnQuad(s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, progress);
        attachedPos.set(aid, p);
      }
    }

    const hidePaths = doc.kind === "animation" && isPlaying;

    // Draw paths first (hidden during animation playback)
    for (const s of frame.shapes) {
      if (s.type !== "path") continue;
      if (hidePaths) continue;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (s.style === "dashed") ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);

      if (s.style === "wavy") {
        drawWavyQuad(ctx, s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, 4, 22);
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
        ctx.stroke();
      }

      if (s.arrow) {
        const d = derivOnQuad(s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, 0.995);
        ctx.setLineDash([]);
        drawArrowHead(ctx, s.x2, s.y2, d.dx, d.dy);
      }

      // Selected highlight
      if (s.id === selectedId) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draw accessories (with attachment override)
    for (const s of frame.shapes) {
      if (s.type === "path") continue;
      const pos = attachedPos.get(s.id);
      const x = pos?.x ?? ("x" in s ? s.x : 0);
      const y = pos?.y ?? ("y" in s ? s.y : 0);

      ctx.save();
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.width);

      if (s.type === "player") {
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (s.type === "cone") {
        ctx.beginPath();
        ctx.moveTo(x, y - s.size);
        ctx.lineTo(x - s.size * 0.9, y + s.size);
        ctx.lineTo(x + s.size * 0.9, y + s.size);
        ctx.closePath();
        ctx.fill();
      } else if (s.type === "ball") {
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Floorball-ish holes
        const holeR = Math.max(1.2, s.r * 0.18);
        const ringR = Math.max(2.2, s.r * 0.55);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * ringR, y + Math.sin(a) * ringR, holeR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, s.r * 0.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === "text") {
        ctx.font = `700 ${s.fontSize}px ui-sans-serif, system-ui`;
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, x, y);
      }

      if (s.id === selectedId) {
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        const r =
          s.type === "player" ? s.r + 8 : s.type === "cone" ? s.size + 10 : s.type === "ball" ? s.r + 8 : s.fontSize + 10;
        ctx.arc(x, y, Math.max(16, r), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draft preview
    const draft = draftRef.current;
    if (draft && draft.type === "path") {
      if (hidePaths) return;
      ctx.save();
      ctx.strokeStyle = draft.color;
      ctx.lineWidth = draft.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.85;
      if (draft.style === "dashed") ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);
      if (draft.style === "wavy") {
        drawWavyQuad(ctx, draft.x1, draft.y1, draft.cx, draft.cy, draft.x2, draft.y2, 4, 22);
      } else {
        ctx.beginPath();
        ctx.moveTo(draft.x1, draft.y1);
        ctx.quadraticCurveTo(draft.cx, draft.cy, draft.x2, draft.y2);
        ctx.stroke();
      }
      if (draft.arrow) {
        const d = derivOnQuad(draft.x1, draft.y1, draft.cx, draft.cy, draft.x2, draft.y2, 0.995);
        ctx.setLineDash([]);
        drawArrowHead(ctx, draft.x2, draft.y2, d.dx, d.dy);
      }
      ctx.restore();
    }
  }

  function drawTemplateBackground(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    t: CanvasTemplate
  ) {
    // Crop
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    const sx = t.crop === "half" ? 0 : 0;
    const sw = t.crop === "half" ? Math.floor(srcW / 2) : srcW;
    const sy = 0;
    const sh = srcH;

    // Contain fit (smaller rink)
    const pad = 0.92;
    const scale = Math.min((w * pad) / sw, (h * pad) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((t.rotationDeg * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  // Playback loop (requestAnimationFrame)
  useEffect(() => {
    if (!doc || doc.kind !== "animation" || !isPlaying) return;

    let raf = 0;
    playRef.current = {
      frameStart: performance.now(),
      frameIndex: Math.min(activeFrameIndex, doc.frames.length - 1),
    };

    const tick = (now: number) => {
      if (!doc) return;
      const curIndex = playRef.current?.frameIndex ?? Math.min(activeFrameIndex, doc.frames.length - 1);
      const frame = doc.frames[Math.min(curIndex, doc.frames.length - 1)]!;
      const dur = Math.max(200, frame.durationMs);
      const start = playRef.current?.frameStart ?? now;
      if (now - start >= dur) {
        const nextIndex = (curIndex + 1) % doc.frames.length;
        playRef.current = { frameStart: now, frameIndex: nextIndex };
        setActiveFrameIndex(nextIndex);
      }
      redraw(now);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isPlaying, activeFrameIndex]);

  // Redraw on key deps
  useLayoutEffect(() => {
    redraw(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, doc, activeFrameIndex, selectedId, isPlaying, tool, color, strokeWidth, lineMode, accessorySize]);

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
            className={
              "rounded-md px-3 py-2 text-sm font-semibold " +
              ((doc?.kind ?? "image") === "image"
                ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                : "border border-[color:var(--surface-border)] bg-transparent")
            }
          >
            Opret Billede
          </button>
          <button
            type="button"
            onClick={() => createNew("animation")}
            className={
              "rounded-md px-3 py-2 text-sm font-semibold " +
              ((doc?.kind ?? "image") === "animation"
                ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                : "border border-[color:var(--surface-border)] bg-transparent")
            }
          >
            Opret Animation
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!doc || past.length === 0}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!doc || future.length === 0}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={downloadCurrent}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {isDownloading ? "Downloader…" : "Download"}
          </button>
          <button
            type="button"
            onClick={openUpload}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Upload
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
                Lærred: {templateLabel(doc.template)}
                {doc.kind === "animation" && selectedShape && selectedShape.type !== "path" ? (
                  <> • Tilknyt ved linje: {selectedShape.type}</>
                ) : null}
              </div>
            </div>

            {doc.kind === "animation" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying((p) => !p);
                    playRef.current = { frameStart: performance.now(), frameIndex: Math.min(activeFrameIndex, doc.frames.length - 1) };
                  }}
                  className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                >
                  {isPlaying ? "Stop" : "Afspil"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setUploadOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold">Upload Taktiktavle</div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                Luk
              </button>
            </div>

            <div className="space-y-3 p-4 text-sm">
              {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                Uploader nuværende taktiktavle som JSON til databasen.
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Type</div>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as "PLAYBOOK" | "EXERCISE")}
                  >
                    <option value="PLAYBOOK">Playbook</option>
                    <option value="EXERCISE">Øvelse</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Synlighed</div>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={uploadScope}
                    onChange={(e) => setUploadScope(e.target.value as "TEAM" | "PUBLIC")}
                  >
                    <option value="TEAM">Hold</option>
                    <option value="PUBLIC">Offentligt</option>
                  </select>
                </label>
              </div>

              {uploadScope === "TEAM" ? (
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Hold</div>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={uploadTeamId}
                    onChange={(e) => setUploadTeamId(e.target.value)}
                    disabled={uploadTeams.length === 0}
                  >
                    {uploadTeams.length === 0 ? <option value="">Ingen hold</option> : null}
                    {uploadTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Titel</div>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={uploadBusy}
                >
                  Annuller
                </button>
                <button
                  type="button"
                  onClick={doUpload}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={uploadBusy}
                >
                  {uploadBusy ? "Uploader…" : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div ref={containerRef} className="mx-auto max-w-[980px] bg-transparent">
        <canvas
          ref={canvasRef}
          className="block w-full"
          onContextMenu={(e) => e.preventDefault()}
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
                  playRef.current = { frameStart: performance.now(), frameIndex: idx };
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
                    applyMutation((d) => {
                      const frames = [...d.frames];
                      frames[activeFrameIndex] = { ...frames[activeFrameIndex]!, durationMs: Math.round(next * 1000) };
                      return { ...d, frames };
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
                <div className="text-sm text-zinc-600">Fuld/halv bane + rotation.</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectOpen(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-semibold"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Bane</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingCrop("full")}
                    className={
                      "rounded-md px-3 py-2 text-sm font-semibold " +
                      (pendingCrop === "full"
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : "border border-zinc-200")
                    }
                  >
                    Fuld bane
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCrop("half")}
                    className={
                      "rounded-md px-3 py-2 text-sm font-semibold " +
                      (pendingCrop === "half"
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : "border border-zinc-200")
                    }
                  >
                    Halv bane
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Rotation</div>
                <div className="flex flex-wrap gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setPendingRotation(deg as CanvasTemplate["rotationDeg"])}
                      className={
                        "rounded-md px-3 py-2 text-sm font-semibold " +
                        (pendingRotation === deg
                          ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                          : "border border-zinc-200")
                      }
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                Valgt: {pendingCrop === "full" ? "Fuld bane" : "Halv bane"} • Rotation {pendingRotation}°
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={confirmTemplate}
                  className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
                >
                  Opret
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
