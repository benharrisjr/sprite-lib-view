import { Copy, Trash2 } from "lucide-react";
import { toHex, toRgbaString, type PickedColor } from "../color";
import type { HoverInfo } from "./Viewer";

interface Props {
  hover: HoverInfo | null;
  picked: PickedColor[];
  onCopy: (text: string) => void;
  onClear: () => void;
}

export function ColorPanel({ hover, picked, onCopy, onClear }: Props) {
  const current = hover ?? (picked[0] ? { x: null, y: null, rgba: picked[0].rgba } : null);
  const hex = current && toHex(current.rgba);
  const rgba = current && toRgbaString(current.rgba);
  const cssColor = current && `rgba(${current.rgba.slice(0, 3).join(",")},${current.rgba[3] / 255})`;

  return (
    <aside className="color-panel">
      <h3>Color</h3>
      <div className="swatch-large checker">
        <div style={{ background: cssColor ?? "transparent" }} />
      </div>

      {current ? (
        <>
          <ValueRow label="HEX" value={hex!} onCopy={onCopy} />
          <ValueRow label="RGB" value={rgba!} onCopy={onCopy} />
          <div className="value-row muted">
            <span>Alpha</span>
            <code>{current.rgba[3]}</code>
          </div>
          {hover && (
            <div className="value-row muted">
              <span>Pixel</span>
              <code>
                {hover.x}, {hover.y}
              </code>
            </div>
          )}
        </>
      ) : (
        <p className="hint">Hover the image to inspect pixels.</p>
      )}

      <p className="hint">
        Pick with the eyedropper tool (I) or Alt+click. Picked colors are copied as hex.
      </p>

      <div className="picked-header">
        <h3>Picked</h3>
        {picked.length > 0 && (
          <button className="btn icon small" onClick={onClear} title="Clear picked colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="picked-list">
        {picked.map((c) => (
          <button
            key={c.hex}
            className="picked checker"
            onClick={() => onCopy(c.hex)}
            title={`${c.hex} — click to copy`}
          >
            <span style={{ background: c.hex }} />
          </button>
        ))}
        {picked.length === 0 && <p className="hint">None yet.</p>}
      </div>
    </aside>
  );
}

function ValueRow({ label, value, onCopy }: { label: string; value: string; onCopy: (t: string) => void }) {
  return (
    <div className="value-row">
      <span>{label}</span>
      <code>{value}</code>
      <button className="btn icon small" onClick={() => onCopy(value)} title={`Copy ${label}`}>
        <Copy size={12} />
      </button>
    </div>
  );
}
