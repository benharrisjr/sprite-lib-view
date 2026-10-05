import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, pickFolder, type SpriteEntry } from "./api";
import type { PickedColor } from "./color";
import { load, save } from "./storage";
import { Toolbar, type SortKey } from "./components/Toolbar";
import { SpriteGrid } from "./components/SpriteGrid";
import { Viewer } from "./components/Viewer";
import { Toast, useToast } from "./components/Toast";

const KEYS = {
  root: "slv.root",
  sort: "slv.sort",
  thumb: "slv.thumbSize",
  keepStructure: "slv.keepStructure",
  colors: "slv.pickedColors",
};

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

function loadColors(): PickedColor[] {
  try {
    return JSON.parse(load(KEYS.colors, "[]"));
  } catch {
    return [];
  }
}

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<SpriteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 120);
  const [extFilter, setExtFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>(() => load(KEYS.sort, "folder") as SortKey);
  const [thumbSize, setThumbSize] = useState(() => Number(load(KEYS.thumb, "128")));
  const [keepStructure, setKeepStructure] = useState(() => load(KEYS.keepStructure, "0") === "1");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [lastViewed, setLastViewed] = useState<number | null>(null);
  const [pickedColors, setPickedColors] = useState<PickedColor[]>(loadColors);
  const { toast, showToast } = useToast();

  useEffect(() => save(KEYS.sort, sort), [sort]);
  useEffect(() => save(KEYS.thumb, String(thumbSize)), [thumbSize]);
  useEffect(() => save(KEYS.keepStructure, keepStructure ? "1" : "0"), [keepStructure]);
  useEffect(() => save(KEYS.colors, JSON.stringify(pickedColors)), [pickedColors]);

  const scan = useCallback(
    async (dir: string) => {
      setLoading(true);
      setViewerIndex(null);
      setSelected(new Set());
      anchorRef.current = null;
      try {
        const list = await api.scanFolder(dir);
        setRoot(dir);
        setEntries(list);
        save(KEYS.root, dir);
      } catch (e) {
        showToast(errorMessage(e), "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    const last = load(KEYS.root, "");
    if (last) scan(last);
  }, [scan]);

  const openFolder = useCallback(async () => {
    const dir = await pickFolder("Choose a sprite folder");
    if (dir) scan(dir);
  }, [scan]);

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
  }, [filtered, viewerIndex]);

  const selectedPaths = useMemo(
    () => filtered.filter((e) => selected.has(e.path)).map((e) => e.path),
    [filtered, selected],
  );

  const addPickedColor = useCallback((color: PickedColor) => {
    setPickedColors((prev) => [color, ...prev.filter((c) => c.hex !== color.hex)].slice(0, 24));
  }, []);

  return (
    <div className="app">
      <Toolbar
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
        onThumbSizeChange={setThumbSize}
        keepStructure={keepStructure}
        onKeepStructureChange={setKeepStructure}
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
          onCopyFile={(e) => actions.copyFiles([e.path])}
          onExport={(e) => actions.exportFiles([e.path])}
        />
      )}

      {loading && <div className="loading-bar" />}

      {viewerIndex != null && filtered[viewerIndex] && (
        <Viewer
          items={filtered}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={closeViewer}
          pickedColors={pickedColors}
          onPickColor={addPickedColor}
          onClearColors={() => setPickedColors([])}
          onCopyImage={actions.copyImage}
          onCopyFile={(e) => actions.copyFiles([e.path])}
          onCopyText={actions.copyText}
          onExport={(e) => actions.exportFiles([e.path])}
          onReveal={actions.reveal}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
