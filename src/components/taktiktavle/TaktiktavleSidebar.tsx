"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTaktiktavleUi, type TaktikTool } from "@/components/taktiktavle/TaktiktavleProvider";

function ToolButton({
  tool,
  activeTool,
  setTool,
  label,
  icon,
}: {
  tool: TaktikTool;
  activeTool: TaktikTool;
  setTool: (t: TaktikTool) => void;
  label: string;
  icon?: React.ReactNode;
}) {
  const active = activeTool === tool;
  return (
    <button
      type="button"
      onClick={() => setTool(tool)}
      className={
        "w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition " +
        (active ? "bg-white/15" : "hover:bg-white/10")
      }
    >
      <span className="flex items-center gap-2">
        {icon ? <span className="grid h-6 w-10 place-items-center rounded bg-white/10">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </span>
    </button>
  );
}

function LineIcon({ dashed, wavy, arrow }: { dashed?: boolean; wavy?: boolean; arrow?: boolean }) {
  const dash = dashed ? "4 4" : undefined;
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
      {wavy ? (
        <path
          d="M2 8 C 7 2, 11 14, 16 8 S 25 2, 32 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <line
          x1="2"
          y1="8"
          x2="30"
          y2="8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      )}
      {arrow ? (
        <path d="M30 8 L24 5 M30 8 L24 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function AccessoryIcon({ type }: { type: "player" | "cone" | "ball" | "text" }) {
  if (type === "player") {
    return (
      <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
        <circle cx="17" cy="8" r="5" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }
  if (type === "cone") {
    return (
      <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
        <path d="M17 2 L11 14 H23 Z" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }
  if (type === "ball") {
    return (
      <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
        <circle cx="17" cy="8" r="4.5" fill="white" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="8" r="1.4" fill="rgba(0,0,0,0.18)" />
        <circle cx="14.7" cy="6.4" r="0.9" fill="rgba(0,0,0,0.18)" />
        <circle cx="19.3" cy="6.4" r="0.9" fill="rgba(0,0,0,0.18)" />
        <circle cx="14.7" cy="9.6" r="0.9" fill="rgba(0,0,0,0.18)" />
        <circle cx="19.3" cy="9.6" r="0.9" fill="rgba(0,0,0,0.18)" />
      </svg>
    );
  }
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
      <text x="11" y="12" fontSize="12" fontFamily="ui-sans-serif, system-ui" fill="currentColor">
        T
      </text>
    </svg>
  );
}

export default function TaktiktavleSidebar() {
  const pathname = usePathname();
  const show = pathname === "/taktiktavle" || pathname.startsWith("/taktiktavle/");
  const {
    tool,
    setTool,
    strokeWidth,
    setStrokeWidth,
    color,
    setColor,
    docKind,
    lineMode,
    setLineMode,
    accessorySize,
    setAccessorySize,
  } = useTaktiktavleUi();

  if (!show) return null;

  const isAnimation = docKind === "animation";

  // Keep UI consistent when switching between image/animation docs
  useEffect(() => {
    if (!isAnimation) return;
    const allowed = tool === "select" || tool === "eraser" || tool === "player" || tool === "cone" || tool === "ball" || tool === "text" || tool === "arrow-solid";
    if (!allowed) setTool("arrow-solid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnimation]);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-extrabold tracking-wide opacity-90">TAKTIKTAVLE</div>
          <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
            {docKind === "animation" ? "Animation" : docKind === "image" ? "Billede" : "Ingen"}
          </div>
        </div>
        <div className="mt-1 text-[11px] leading-4 opacity-85">
          {isAnimation
            ? "I animation bruges linjer som usynlige bevægelsesbaner."
            : "Tegn taktik og øvelser som et billede."}
        </div>
      </div>

      <div>
        <div className="text-xs font-extrabold tracking-wide opacity-90">VÆRKTØJ</div>
        <div className="mt-2 space-y-1">
          <ToolButton tool="select" activeTool={tool} setTool={setTool} label="Marker / Flyt" />
          <ToolButton tool="eraser" activeTool={tool} setTool={setTool} label="Slet (klik)" />
        </div>
      </div>

      <div>
        <div className="text-xs font-extrabold tracking-wide opacity-90">LINJER</div>
        <div className="mt-2 space-y-1">
          {isAnimation ? (
            <ToolButton
              tool="arrow-solid"
              activeTool={tool}
              setTool={setTool}
              label="Solid + pil"
              icon={<LineIcon arrow />}
            />
          ) : (
            <>
              <ToolButton tool="line-solid" activeTool={tool} setTool={setTool} label="Solid" icon={<LineIcon />} />
              <ToolButton tool="line-dashed" activeTool={tool} setTool={setTool} label="Stiplet" icon={<LineIcon dashed />} />
              <ToolButton tool="line-wavy" activeTool={tool} setTool={setTool} label="Bølget" icon={<LineIcon wavy />} />
              <ToolButton tool="arrow-solid" activeTool={tool} setTool={setTool} label="Solid + pil" icon={<LineIcon arrow />} />
              <ToolButton tool="arrow-dashed" activeTool={tool} setTool={setTool} label="Stiplet + pil" icon={<LineIcon dashed arrow />} />
              <ToolButton tool="arrow-wavy" activeTool={tool} setTool={setTool} label="Bølget + pil" icon={<LineIcon wavy arrow />} />
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-extrabold tracking-wide opacity-90">TILBEHØR</div>
        <div className="mt-2 space-y-1">
          <ToolButton
            tool="player"
            activeTool={tool}
            setTool={setTool}
            label="Spiller"
            icon={<AccessoryIcon type="player" />}
          />
          <ToolButton
            tool="cone"
            activeTool={tool}
            setTool={setTool}
            label="Kegle"
            icon={<AccessoryIcon type="cone" />}
          />
          <ToolButton
            tool="ball"
            activeTool={tool}
            setTool={setTool}
            label="Floorballbold"
            icon={<AccessoryIcon type="ball" />}
          />
          <ToolButton
            tool="text"
            activeTool={tool}
            setTool={setTool}
            label="Tekst"
            icon={<AccessoryIcon type="text" />}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-extrabold tracking-wide opacity-90">INDSTILLINGER</div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLineMode("straight")}
            className={
              "rounded-md px-2 py-2 text-xs font-semibold transition " +
              (lineMode === "straight" ? "bg-white/15" : "bg-white/5 hover:bg-white/10")
            }
          >
            Lige
          </button>
          <button
            type="button"
            onClick={() => setLineMode("curve")}
            className={
              "rounded-md px-2 py-2 text-xs font-semibold transition " +
              (lineMode === "curve" ? "bg-white/15" : "bg-white/5 hover:bg-white/10")
            }
          >
            Kurve
          </button>
        </div>

        <label className="block text-xs font-semibold">
          <div className="mb-1 opacity-90">Farve</div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-white/20 bg-white/10"
          />
        </label>

        <label className="block text-xs font-semibold">
          <div className="mb-1 opacity-90">Bredde: {strokeWidth}</div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block text-xs font-semibold">
          <div className="mb-1 opacity-90">Tilbehør størrelse: {accessorySize}</div>
          <input
            type="range"
            min={6}
            max={22}
            step={1}
            value={accessorySize}
            onChange={(e) => setAccessorySize(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <div className="rounded-md border border-white/15 bg-white/5 p-2 text-[11px] leading-4 opacity-90">
        Tips: Klik for at tegne. Lige = 2 klik. Kurve = 3 klik. Vælg "Slet" og klik på et objekt for at fjerne det.
        {isAnimation ? " (I animation skal du vælge et tilbehør før du tegner en bane.)" : null}
      </div>
    </div>
  );
}
