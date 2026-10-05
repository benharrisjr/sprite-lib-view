import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileImage,
  FolderOpen,
  FolderOutput,
  Grid3x3,
  Hand,
  Link,
  Maximize,
  Pipette,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, errorMessage, formatBytes, formatDims, mimeFor, type SpriteEntry } from "../api";
import { toHex, type PickedColor, type RGBA } from "../color";
import { ColorPanel } from "./ColorPanel";

type Tool = "pan" | "pick";
type Background = "checker" | "dark" | "light" | "magenta";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const FIT_MARGIN = 32;
const GRID_MIN_ZOOM = 8;
const ZOOM_STEPS = [
  0.05, 0.1, 0.125, 0.25, 0.33, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64,
];

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

export interface HoverInfo {
  x: number;
  y: number;
  rgba: RGBA;
}

interface Props {
  items: SpriteEntry[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  pickedColors: PickedColor[];
  onPickColor: (c: PickedColor) => void;
  onClearColors: () => void;
  onCopyImage: (e: SpriteEntry) => void;
  onCopyFile: (e: SpriteEntry) => void;
  onCopyText: (text: string, label: string) => void;
  onExport: (e: SpriteEntry) => void;
  onReveal: (e: SpriteEntry) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Viewer(p: Props) {
  const entry = p.items[p.index];
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const sampleRef = useRef<CanvasRenderingContext2D | null>(null);
  const viewRef = useRef<ViewState>({ scale: 1, x: 0, y: 0 });
  const hoverPxRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(
    null,
  );
  const spaceRef = useRef(false);
  const rafRef = useRef(0);
  const showGridRef = useRef(true);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("pan");
  const [showGrid, setShowGrid] = useState(true);
  const [background, setBackground] = useState<Background>("checker");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const draw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bmp = bitmapRef.current;
      if (!bmp) return;

      const { scale, x, y } = viewRef.current;
      const w = bmp.width * scale;
      const h = bmp.height * scale;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, x, y, w, h);

      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;

      if (showGridRef.current && scale >= GRID_MIN_ZOOM) {
        const x0 = Math.max(0, Math.floor(-x / scale));
        const x1 = Math.min(bmp.width, Math.ceil((viewW - x) / scale));
        const y0 = Math.max(0, Math.floor(-y / scale));
        const y1 = Math.min(bmp.height, Math.ceil((viewH - y) / scale));
        ctx.beginPath();
        for (let i = x0; i <= x1; i++) {
          const px = Math.round(x + i * scale) + 0.5;
          ctx.moveTo(px, Math.max(y, 0));
          ctx.lineTo(px, Math.min(y + h, viewH));
        }
        for (let j = y0; j <= y1; j++) {
          const py = Math.round(y + j * scale) + 0.5;
          ctx.moveTo(Math.max(x, 0), py);
          ctx.lineTo(Math.min(x + w, viewW), py);
        }
        ctx.strokeStyle = "rgba(128, 128, 128, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const hp = hoverPxRef.current;
      if (hp && scale >= 4) {
        const rx = Math.round(x + hp.x * scale) + 0.5;
        const ry = Math.round(y + hp.y * scale) + 0.5;
        const size = Math.round(scale);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.strokeRect(rx - 1, ry - 1, size + 2, size + 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.strokeRect(rx, ry, size, size);
      }
    });
  }, []);

  const stageSize = () => {
    const el = stageRef.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 };
  };

  const setView = useCallback(
    (v: ViewState) => {
      viewRef.current = v;
      setZoom(v.scale);
      draw();
    },
    [draw],
  );

  const fit = useCallback(() => {
    const bmp = bitmapRef.current;
    if (!bmp) return;
    const { w, h } = stageSize();
    let scale = Math.min((w - FIT_MARGIN * 2) / bmp.width, (h - FIT_MARGIN * 2) / bmp.height);
    // Snap upscales to whole numbers so pixel art stays crisp.
    scale = scale >= 1 ? Math.floor(scale) : scale;
    scale = clamp(scale, MIN_ZOOM, MAX_ZOOM);
    setView({
      scale,
      x: Math.round((w - bmp.width * scale) / 2),
      y: Math.round((h - bmp.height * scale) / 2),
    });
  }, [setView]);

  const zoomAt = useCallback(
    (target: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const scale = clamp(target, MIN_ZOOM, MAX_ZOOM);
      const k = scale / v.scale;
      setView({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    },
    [setView],
  );

  const zoomCenter = useCallback(
    (target: number) => {
      const { w, h } = stageSize();
      zoomAt(target, w / 2, h / 2);
    },
    [zoomAt],
  );

  // Step through "nice" zoom levels for buttons/keys.
  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const s = viewRef.current.scale;
      const next =
        dir > 0
          ? ZOOM_STEPS.find((z) => z > s * 1.001)
          : [...ZOOM_STEPS].reverse().find((z) => z < s * 0.999);
      if (next != null) zoomCenter(next);
    },
    [zoomCenter],
  );

  // Load the image whenever the entry changes.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHover(null);
    hoverPxRef.current = null;

    api
      .readImageBytes(entry.path)
      .then((buf) => createImageBitmap(new Blob([buf], { type: mimeFor(entry.ext) })))
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmapRef.current?.close();
        bitmapRef.current = bmp;
        const sample = document.createElement("canvas");
        sample.width = bmp.width;
        sample.height = bmp.height;
        const sctx = sample.getContext("2d", { willReadFrequently: true })!;
        sctx.drawImage(bmp, 0, 0);
        sampleRef.current = sctx;
        setStatus("ready");
        fit();
      })
      .catch((e) => {
        if (cancelled) return;
        bitmapRef.current?.close();
        bitmapRef.current = null;
        sampleRef.current = null;
        setError(errorMessage(e));
        setStatus("error");
        draw();
      });

    return () => {
      cancelled = true;
    };
  }, [entry.path, entry.ext, fit, draw]);

  useEffect(() => () => bitmapRef.current?.close(), []);

  // Keep the canvas backing store matched to the stage size and DPR.
  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(stage.clientWidth * dpr);
      canvas.height = Math.round(stage.clientHeight * dpr);
      canvas.style.width = `${stage.clientWidth}px`;
      canvas.style.height = `${stage.clientHeight}px`;
      draw();
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    showGridRef.current = showGrid;
    draw();
  }, [showGrid, draw]);

  // Wheel zoom (non-passive so we can prevent page scroll). Pinch on
  // trackpads arrives as ctrl+wheel with small deltas.
  useEffect(() => {
    const stage = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(viewRef.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const sampleAt = (clientX: number, clientY: number): HoverInfo | null => {
    const bmp = bitmapRef.current;
    const sctx = sampleRef.current;
    const stage = stageRef.current;
    if (!bmp || !sctx || !stage) return null;
    const rect = stage.getBoundingClientRect();
    const { scale, x, y } = viewRef.current;
    const px = Math.floor((clientX - rect.left - x) / scale);
    const py = Math.floor((clientY - rect.top - y) / scale);
    if (px < 0 || py < 0 || px >= bmp.width || py >= bmp.height) return null;
    const d = sctx.getImageData(px, py, 1, 1).data;
    return { x: px, y: py, rgba: [d[0], d[1], d[2], d[3]] };
  };

  const pick = (info: HoverInfo) => {
    const hex = toHex(info.rgba);
    p.onPickColor({ hex, rgba: info.rgba });
    p.onCopyText(hex, hex);
  };

  const isPanGesture = (e: React.PointerEvent) =>
    e.button === 1 || (e.button === 0 && (tool === "pan" || spaceRef.current) && !e.altKey);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isPanGesture(e)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const v = viewRef.current;
      dragRef.current = { startX: e.clientX, startY: e.clientY, viewX: v.x, viewY: v.y };
      setDragging(true);
    } else if (e.button === 0) {
      const info = sampleAt(e.clientX, e.clientY);
      if (info) pick(info);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag) {
      viewRef.current = {
        ...viewRef.current,
        x: drag.viewX + e.clientX - drag.startX,
        y: drag.viewY + e.clientY - drag.startY,
      };
    }
    const info = sampleAt(e.clientX, e.clientY);
    hoverPxRef.current = info && { x: info.x, y: info.y };
    setHover(info);
    draw();
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onPointerLeave = () => {
    hoverPxRef.current = null;
    setHover(null);
    draw();
  };

  const go = useCallback(
    (delta: number) => {
      const next = p.index + delta;
      if (next >= 0 && next < p.items.length) p.onIndexChange(next);
    },
    [p.index, p.items.length, p.onIndexChange],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          p.onCopyImage(entry);
        }
        return;
      }
      switch (e.key) {
        case "Escape":
          p.onClose();
          break;
        case "ArrowLeft":
          go(-1);
          break;
        case "ArrowRight":
          go(1);
          break;
        case "+":
        case "=":
          stepZoom(1);
          break;
        case "-":
        case "_":
          stepZoom(-1);
          break;
        case "0":
          fit();
          break;
        case "1":
          zoomCenter(1);
          break;
        case "i":
        case "I":
          setTool("pick");
          break;
        case "h":
        case "H":
          setTool("pan");
          break;
        case "g":
        case "G":
          setShowGrid((g) => !g);
          break;
        case " ":
          e.preventDefault();
          spaceRef.current = true;
          setSpaceHeld(true);
          break;
        default:
          return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [entry, go, fit, stepZoom, zoomCenter, p.onClose, p.onCopyImage]);

  const panning = tool === "pan" || spaceHeld;
  const cursor = dragging ? "grabbing" : panning ? "grab" : "crosshair";

  return (
    <div className="viewer" role="dialog" aria-modal="true">
      <div className="viewer-header">
        <button className="btn icon" onClick={() => go(-1)} disabled={p.index === 0} title="Previous (←)">
          <ChevronLeft size={18} />
        </button>
        <div className="viewer-title">
          <div className="name">{entry.name}</div>
          <div className="sub">
            {entry.relPath} · {formatDims(entry)} · {formatBytes(entry.size)} · {p.index + 1} /{" "}
            {p.items.length}
          </div>
        </div>
        <button
          className="btn icon"
          onClick={() => go(1)}
          disabled={p.index === p.items.length - 1}
          title="Next (→)"
        >
          <ChevronRight size={18} />
        </button>
        <div className="spacer" />
        <button className="btn" onClick={() => p.onCopyImage(entry)} title="Copy image pixels (⌘/Ctrl+C)">
          <Copy size={14} /> Copy Image
        </button>
        <button className="btn" onClick={() => p.onCopyFile(entry)} title="Copy file for pasting into a file manager">
          <FileImage size={14} /> Copy File
        </button>
        <button className="btn" onClick={() => p.onCopyText(entry.path, "path")} title="Copy full path">
          <Link size={14} /> Copy Path
        </button>
        <button className="btn" onClick={() => p.onExport(entry)} title="Copy file to a folder">
          <FolderOutput size={14} /> Export…
        </button>
        <button className="btn icon" onClick={() => p.onReveal(entry)} title="Show in folder">
          <FolderOpen size={16} />
        </button>
        <button className="btn icon" onClick={p.onClose} title="Close (Esc)">
          <X size={18} />
        </button>
      </div>

      <div className="viewer-body">
        <div
          ref={stageRef}
          className={`stage bg-${background}`}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={onPointerLeave}
          onDoubleClick={fit}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={canvasRef} />
          {status === "loading" && <div className="stage-message">Loading…</div>}
          {status === "error" && <div className="stage-message error">Could not load image: {error}</div>}
        </div>

        <ColorPanel
          hover={hover}
          picked={p.pickedColors}
          onCopy={(text) => p.onCopyText(text, text)}
          onClear={p.onClearColors}
        />
      </div>

      <div className="viewer-footer">
        <div className="segmented">
          <button className={tool === "pan" ? "active" : ""} onClick={() => setTool("pan")} title="Pan (H) — or hold Space">
            <Hand size={16} />
          </button>
          <button className={tool === "pick" ? "active" : ""} onClick={() => setTool("pick")} title="Color picker (I) — or Alt+click">
            <Pipette size={16} />
          </button>
        </div>

        <div className="zoom-controls">
          <button className="btn icon" onClick={() => stepZoom(-1)} title="Zoom out (-)">
            <ZoomOut size={16} />
          </button>
          <span className="zoom-label">{zoom >= 1 ? `${+zoom.toFixed(2)}×` : `${Math.round(zoom * 100)}%`}</span>
          <button className="btn icon" onClick={() => stepZoom(1)} title="Zoom in (+)">
            <ZoomIn size={16} />
          </button>
          <button className="btn" onClick={fit} title="Fit to window (0 or double-click)">
            <Maximize size={14} /> Fit
          </button>
          <button className="btn" onClick={() => zoomCenter(1)} title="Actual size (1)">
            1:1
          </button>
        </div>

        <button
          className={`btn icon ${showGrid ? "active" : ""}`}
          onClick={() => setShowGrid((g) => !g)}
          title={`Pixel grid at ≥${GRID_MIN_ZOOM}× (G)`}
        >
          <Grid3x3 size={16} />
        </button>

        <div className="bg-swatches" title="Background">
          {(["checker", "dark", "light", "magenta"] as Background[]).map((bg) => (
            <button
              key={bg}
              className={`bg-swatch bg-${bg} ${background === bg ? "active" : ""}`}
              onClick={() => setBackground(bg)}
              title={`${bg} background`}
            />
          ))}
        </div>

        <div className="spacer" />
        <div className="cursor-readout">
          {hover ? `x ${hover.x}, y ${hover.y}` : ""}
        </div>
      </div>
    </div>
  );
}
