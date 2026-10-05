import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Copy, FileImage, FolderOutput } from "lucide-react";
import { fileUrl, formatDims, type SpriteEntry } from "../api";

const PAD = 16;
const GAP = 12;
const META_HEIGHT = 46;

interface Props {
  items: SpriteEntry[];
  thumbSize: number;
  selected: Set<string>;
  scrollToIndex: number | null;
  onCardClick: (index: number, e: React.MouseEvent) => void;
  onToggle: (index: number, e: React.MouseEvent) => void;
  onCopyImage: (e: SpriteEntry) => void;
  onCopyFile: (e: SpriteEntry) => void;
  onExport: (e: SpriteEntry) => void;
}

export function SpriteGrid(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inner = Math.max(0, width - PAD * 2);
  const columns = Math.max(1, Math.floor((inner + GAP) / (p.thumbSize + GAP)));
  const colWidth = (inner - GAP * (columns - 1)) / columns;
  const rowHeight = colWidth + META_HEIGHT + GAP;
  const rowCount = Math.ceil(p.items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    paddingStart: PAD,
    paddingEnd: PAD,
  });

  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);

  // Keep the last-viewed sprite on screen after closing the viewer.
  useEffect(() => {
    if (p.scrollToIndex != null && columns > 0) {
      virtualizer.scrollToIndex(Math.floor(p.scrollToIndex / columns), { align: "auto" });
    }
  }, [p.scrollToIndex, columns, virtualizer]);

  return (
    <div className="grid-scroll" ref={scrollRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns;
          const rowItems = p.items.slice(start, start + columns);
          return (
            <div
              key={row.key}
              className="grid-row"
              style={{
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columns}, ${colWidth}px)`,
                gap: GAP,
                left: PAD,
                right: PAD,
              }}
            >
              {rowItems.map((entry, i) => (
                <SpriteCard
                  key={entry.path}
                  entry={entry}
                  index={start + i}
                  size={colWidth}
                  selected={p.selected.has(entry.path)}
                  onClick={p.onCardClick}
                  onToggle={p.onToggle}
                  onCopyImage={p.onCopyImage}
                  onCopyFile={p.onCopyFile}
                  onExport={p.onExport}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CardProps {
  entry: SpriteEntry;
  index: number;
  size: number;
  selected: boolean;
  onClick: Props["onCardClick"];
  onToggle: Props["onToggle"];
  onCopyImage: Props["onCopyImage"];
  onCopyFile: Props["onCopyFile"];
  onExport: Props["onExport"];
}

const SpriteCard = memo(function SpriteCard(p: CardProps) {
  const { entry } = p;
  const [failed, setFailed] = useState(false);
  // Crisp pixels when a small sprite is scaled up; smooth when scaled down.
  const pixelated = (entry.width ?? Infinity) < p.size && (entry.height ?? Infinity) < p.size;
  const action = (fn: (e: SpriteEntry) => void) => (ev: React.MouseEvent) => {
    ev.stopPropagation();
    fn(entry);
  };

  return (
    <div
      className={`card ${p.selected ? "selected" : ""}`}
      onClick={(ev) => p.onClick(p.index, ev)}
      title={entry.relPath}
    >
      <div className="thumb checker" style={{ height: p.size }}>
        {failed ? (
          <span className="thumb-error">Preview unavailable</span>
        ) : (
          <img
            src={fileUrl(entry.path)}
            loading="lazy"
            decoding="async"
            draggable={false}
            alt=""
            className={pixelated ? "pixelated" : undefined}
            onError={() => setFailed(true)}
          />
        )}
        <button
          className="select-box"
          onClick={(ev) => {
            ev.stopPropagation();
            p.onToggle(p.index, ev);
          }}
          title="Select"
        >
          {p.selected && <Check size={14} />}
        </button>
        <div className="card-actions">
          <button onClick={action(p.onCopyImage)} title="Copy image">
            <Copy size={14} />
          </button>
          <button onClick={action(p.onCopyFile)} title="Copy file">
            <FileImage size={14} />
          </button>
          <button onClick={action(p.onExport)} title="Export to folder…">
            <FolderOutput size={14} />
          </button>
        </div>
      </div>
      <div className="card-meta">
        <div className="name">{entry.name}</div>
        <div className="sub">
          {formatDims(entry)}
          {entry.folder && <> · {entry.folder}</>}
        </div>
      </div>
    </div>
  );
});
