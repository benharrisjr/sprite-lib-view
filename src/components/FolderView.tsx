import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, pickFolder, type SpriteEntry } from "../api";
import type { PickedColor } from "../color";
import { load, save } from "../storage";
import { Toolbar, type SortKey } from "./Toolbar";
import { SpriteGrid } from "./SpriteGrid";
import { Viewer } from "./Viewer";
import type { ToastState } from "./Toast";

const SORT_KEY = "slv.sort";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const comparators: Record<SortKey, (a: SpriteEntry, b: SpriteEntry) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  folder: (a, b) => collator.compare(a.folder, b.folder) || collator.compare(a.name, b.name),
  size: (a, b) => b.size - a.size,
  dims: (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  modified: (a, b) => (b.modified ?? 0) - (a.modified ?? 0),
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Settings and callbacks shared by every tab. */
export interface SharedProps {
  thumbSize: number;
  onThumbSizeChange: (n: number) => void;
  keepStructure: boolean;
  onKeepStructureChange: (b: boolean) => void;
  pickedColors: PickedColor[];
  onPickColor: (c: PickedColor) => void;
  onClearColors: () => void;
  showToast: (message: string, kind?: ToastState["kind"]) => void;
}

interface Props extends SharedProps {
  root: string | null;
  active: boolean;
  onRootChange: (root: string) => void;
}

/** One tab: a scanned folder with its own search, selection and viewer. */
export function FolderView({ root, active, onRootChange, ...shared }: Props) {
  const { thumbSize, keepStructure, pickedColors, showToast } = shared;
  const [entries, setEntries] = useState<SpriteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 120);
  const [extFilter, setExtFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>(() => load(SORT_KEY, "folder") as SortKey);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [lastViewed, setLastViewed] = useState<number | null>(null);

  useEffect(() => save(SORT_KEY, sort), [sort]);

  const scan = useCallback(
    async (dir: string) => {
      setLoading(true);
      setViewerIndex(null);
      setSelected(new Set());
      anchorRef.current = null;
      setScanError(null);
      try {
        setEntries(await api.scanFolder(dir));
      } catch (e) {
        setEntries([]);
        setScanError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (root) scan(root);
  }, [root, scan]);

  const openFolder = useCallback(async () => {
    const dir = await pickFolder("Choose a sprite folder");
    if (!dir) return;
    if (dir === root) scan(dir);
    else onRootChange(dir);
  }, [root, scan, onRootChange]);

  const availableExts = useMemo(
    () => [...new Set(entries.map((e) => e.ext))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const terms = debouncedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const list = entries.filter((e) => {
      if (extFilter.size > 0 && !extFilter.has(e.ext)) return false;
      if (terms.length === 0) return true;
      const haystack = e.relPath.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
    return list.sort(comparators[sort]);
  }, [entries, debouncedQuery, extFilter, sort]);

  // Generic wrapper so every action reports success or failure.
  const run = useCallback(
    async (action: () => Promise<string | void>) => {
      try {
        const message = await action();
        if (message) showToast(message);
      } catch (e) {
        showToast(errorMessage(e), "error");
      }
    },
    [showToast],
  );

  const actions = useMemo(
    () => ({
      copyImage: (e: SpriteEntry) =>
        run(async () => {
          await api.copyImage(e.path);
          return `Copied image ${e.name}`;
        }),
      copyFiles: (paths: string[]) =>
        run(async () => {
          await api.copyFiles(paths);
          return paths.length === 1 ? "Copied file" : `Copied ${paths.length} files`;
        }),
      copyText: (text: string, label: string) =>
        run(async () => {
          await api.copyText(text);
          return `Copied ${label}`;
        }),
      exportFiles: (paths: string[]) =>
        run(async () => {
          const dest = await pickFolder(
            paths.length === 1 ? "Export file to…" : `Export ${paths.length} files to…`,
          );
          if (!dest) return;
          const result = await api.exportFiles(paths, dest, keepStructure ? root : null);
          if (result.errors.length > 0) {
            console.error(result.errors);
            throw new Error(
              `Exported ${result.copied}, failed ${result.errors.length}: ${result.errors[0]}`,
            );
          }
          return `Exported ${result.copied} file${result.copied === 1 ? "" : "s"} to ${dest}`;
        }),
      reveal: (e: SpriteEntry) => run(() => api.reveal(e.path)),
    }),
    [run, keepStructure, root],
  );

  const toggleSelected = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const handleCardClick = useCallback(
    (index: number, ev: React.MouseEvent) => {
      const entry = filtered[index];
      if (ev.shiftKey && anchorRef.current != null) {
        const [a, b] = [anchorRef.current, index].sort((x, y) => x - y);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = a; i <= b; i++) next.add(filtered[i].path);
          return next;
        });
      } else if (ev.metaKey || ev.ctrlKey) {
        toggleSelected(entry.path);
        anchorRef.current = index;
      } else {
        setViewerIndex(index);
      }
    },
    [filtered],
  );

  const handleToggle = useCallback(
    (index: number, ev: React.MouseEvent) => {
      if (ev.shiftKey) return handleCardClick(index, ev);
      toggleSelected(filtered[index].path);
      anchorRef.current = index;
    },
    [filtered, handleCardClick],
  );

  const closeViewer = useCallback(() => {
    setLastViewed(viewerIndex);
    setViewerIndex(null);
  }, [viewerIndex]);

  // Cmd/Ctrl+A selects all visible, Escape clears selection.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (viewerIndex != null) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(filtered.map((f) => f.path)));
      } else if (e.key === "Escape") {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filtered, viewerIndex]);

  const selectedPaths = useMemo(
    () => filtered.filter((e) => selected.has(e.path)).map((e) => e.path),
    [filtered, selected],
  );

  const copyFile = useCallback((e: SpriteEntry) => actions.copyFiles([e.path]), [actions]);
  const exportFile = useCallback((e: SpriteEntry) => actions.exportFiles([e.path]), [actions]);

  return (
    <div className={`folder-view ${active ? "" : "inactive"}`} aria-hidden={!active}>
      <Toolbar
        active={active}
        root={root}
        loading={loading}
        onOpenFolder={openFolder}
        onRescan={() => root && scan(root)}
        query={query}
        onQueryChange={setQuery}
        availableExts={availableExts}
        extFilter={extFilter}
        onExtFilterChange={setExtFilter}
        sort={sort}
        onSortChange={setSort}
        thumbSize={thumbSize}
        onThumbSizeChange={shared.onThumbSizeChange}
        keepStructure={keepStructure}
        onKeepStructureChange={shared.onKeepStructureChange}
        total={entries.length}
        shown={filtered.length}
        selectedCount={selectedPaths.length}
        onSelectAll={() => setSelected(new Set(filtered.map((f) => f.path)))}
        onClearSelection={() => setSelected(new Set())}
        onCopySelected={() => actions.copyFiles(selectedPaths)}
        onExportSelected={() => actions.exportFiles(selectedPaths)}
      />

      {root == null && !loading ? (
        <div className="empty">
          <p>Open a folder to browse every sprite sheet inside it and its subfolders.</p>
          <button className="btn primary" onClick={openFolder}>
            Open Folder
          </button>
        </div>
      ) : scanError && !loading ? (
        <div className="empty">
          <p className="error-text">Could not read folder: {scanError}</p>
          <button className="btn" onClick={openFolder}>
            Choose Another Folder
          </button>
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="empty">
          <p>{entries.length === 0 ? "No images found in this folder." : "No images match your search."}</p>
        </div>
      ) : (
        <SpriteGrid
          items={filtered}
          thumbSize={thumbSize}
          selected={selected}
          scrollToIndex={lastViewed}
          onCardClick={handleCardClick}
          onToggle={handleToggle}
          onCopyImage={actions.copyImage}
          onCopyFile={copyFile}
          onExport={exportFile}
        />
      )}

      {loading && <div className="loading-bar" />}

      {viewerIndex != null && filtered[viewerIndex] && (
        <Viewer
          active={active}
          items={filtered}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={closeViewer}
          pickedColors={pickedColors}
          onPickColor={shared.onPickColor}
          onClearColors={shared.onClearColors}
          onCopyImage={actions.copyImage}
          onCopyFile={copyFile}
          onCopyText={actions.copyText}
          onExport={exportFile}
          onReveal={actions.reveal}
        />
      )}
    </div>
  );
}
