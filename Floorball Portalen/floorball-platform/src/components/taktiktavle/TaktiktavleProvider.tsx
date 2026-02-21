"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

export type TaktikTool =
  | "select"
  | "eraser"
  | "text"
  | "player"
  | "cone"
  | "ball"
  | "line-solid"
  | "line-dashed"
  | "line-wavy"
  | "arrow-solid"
  | "arrow-dashed"
  | "arrow-wavy";

export type LineMode = "straight" | "curve";

export type DocKind = "image" | "animation";

type TaktiktavleUiState = {
  tool: TaktikTool;
  setTool: (t: TaktikTool) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  color: string;
  setColor: (c: string) => void;
  docKind: DocKind | null;
  setDocKind: (k: DocKind | null) => void;
  lineMode: LineMode;
  setLineMode: (m: LineMode) => void;
  accessorySize: number;
  setAccessorySize: (n: number) => void;
};

const Ctx = createContext<TaktiktavleUiState | null>(null);

export default function TaktiktavleProvider({ children }: { children: React.ReactNode }) {
  const [tool, setTool] = useState<TaktikTool>("select");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [color, setColor] = useState("#111827");
  const [docKind, setDocKind] = useState<DocKind | null>(null);
  const [lineMode, setLineMode] = useState<LineMode>("curve");
  const [accessorySize, setAccessorySize] = useState(10);

  const value = useMemo(
    () => ({
      tool,
      setTool,
      strokeWidth,
      setStrokeWidth,
      color,
      setColor,
      docKind,
      setDocKind,
      lineMode,
      setLineMode,
      accessorySize,
      setAccessorySize,
    }),
    [tool, strokeWidth, color, docKind, lineMode, accessorySize]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTaktiktavleUi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTaktiktavleUi must be used within TaktiktavleProvider");
  return v;
}
