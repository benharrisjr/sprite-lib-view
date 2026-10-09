import { useEffect, useRef } from "react";
import { Copy, FolderOpen, FolderOutput, RefreshCw, Search, X } from "lucide-react";

export type SortKey = "name" | "folder" | "size" | "dims" | "modified";

const SORT_LABELS: Record<SortKey, string> = {
  folder: "Folder",
  name: "Name",
  size: "File size",
  dims: "Dimensions",
  modified: "Modified",
};

interface Props {
  active: boolean;
  root: string | null;
  loading: boolean;
  onOpenFolder: () => void;
  onRescan: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  availableExts: string[];
  extFilter: Set<string>;
  onExtFilterChange: (s: Set<string>) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  thumbSize: number;
  onThumbSizeChange: (n: number) => void;
  keepStructure: boolean;
  onKeepStructureChange: (b: boolean) => void;
  total: number;
  shown: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCopySelected: () => void;
  onExportSelected: () => void;
}

export function Toolbar(p: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+F focuses search.
  useEffect(() => {
    if (!p.active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.active]);

  const toggleExt = (ext: string) => {
    const next = new Set(p.extFilter);
    if (next.has(ext)) next.delete(ext);
    else next.add(ext);
    p.onExtFilterChange(next);
  };

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <button className="btn primary" onClick={p.onOpenFolder}>
          <FolderOpen size={16} /> Open Folder
        </button>
        <button
          className="btn icon"
          onClick={p.onRescan}
          disabled={!p.root || p.loading}
          title="Rescan folder"
        >
          <RefreshCw size={16} className={p.loading ? "spin" : undefined} />
        </button>
        <div className="root-path" title={p.root ?? ""}>
          {p.root ?? "No folder open"}
        </div>

        <div className="search">
          <Search size={16} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search file names and folders…"
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && p.onQueryChange("")}
            spellCheck={false}
          />
          {p.query && (
            <button className="clear" onClick={() => p.onQueryChange("")} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-row secondary">
        <div className="chips">
          {p.availableExts.map((ext) => (
            <button
              key={ext}
              className={`chip ${p.extFilter.has(ext) ? "active" : ""}`}
              onClick={() => toggleExt(ext)}
            >
              .{ext}
            </button>
          ))}
        </div>

        <label className="field">
          Sort
          <select value={p.sort} onChange={(e) => p.onSortChange(e.target.value as SortKey)}>
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Size
          <input
            type="range"
            min={64}
            max={320}
            step={16}
            value={p.thumbSize}
            onChange={(e) => p.onThumbSizeChange(Number(e.target.value))}
          />
        </label>

        <label className="field checkbox" title="When exporting, recreate subfolders relative to the open folder">
          <input
            type="checkbox"
            checked={p.keepStructure}
            onChange={(e) => p.onKeepStructureChange(e.target.checked)}
          />
          Keep folders on export
        </label>

        <div className="count">
          {p.shown === p.total ? `${p.total} images` : `${p.shown} of ${p.total} images`}
        </div>
      </div>

      {p.selectedCount > 0 && (
        <div className="toolbar-row selection">
          <span>{p.selectedCount} selected</span>
          <button className="btn" onClick={p.onCopySelected}>
            <Copy size={14} /> Copy Files
          </button>
          <button className="btn" onClick={p.onExportSelected}>
            <FolderOutput size={14} /> Export…
          </button>
          <button className="btn ghost" onClick={p.onSelectAll}>
            Select all
          </button>
          <button className="btn ghost" onClick={p.onClearSelection}>
            Clear
          </button>
        </div>
      )}
    </header>
  );
}
