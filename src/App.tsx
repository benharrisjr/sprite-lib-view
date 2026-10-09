import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { pickFolder } from "./api";
import type { PickedColor } from "./color";
import { load, save } from "./storage";
import { FolderView } from "./components/FolderView";
import { TabBar, type Tab } from "./components/TabBar";
import { Toast, useToast } from "./components/Toast";

const KEYS = {
  tabs: "slv.tabs",
  legacyRoot: "slv.root",
  thumb: "slv.thumbSize",
  keepStructure: "slv.keepStructure",
  colors: "slv.pickedColors",
};

// On macOS, tab shortcuts come from the native menu (see src-tauri/src/menu.rs).
const IS_MAC = navigator.userAgent.includes("Mac");

const newTab = (root: string | null = null): Tab => ({ id: crypto.randomUUID(), root });

interface SavedTabs {
  roots: (string | null)[];
  active: number;
}

function loadTabs(): { tabs: Tab[]; activeId: string } {
  let saved: SavedTabs | null = null;
  try {
    saved = JSON.parse(load(KEYS.tabs, "null"));
  } catch {
    // fall through
  }
  if (!saved?.roots?.length) {
    const legacy = load(KEYS.legacyRoot, "");
    saved = { roots: [legacy || null], active: 0 };
  }
  const tabs = saved.roots.map((r) => newTab(r));
  return { tabs, activeId: tabs[Math.min(saved.active, tabs.length - 1)]?.id ?? tabs[0].id };
}

function loadColors(): PickedColor[] {
  try {
    return JSON.parse(load(KEYS.colors, "[]"));
  } catch {
    return [];
  }
}

export default function App() {
  const [{ tabs, activeId }, setTabState] = useState(loadTabs);
  const [thumbSize, setThumbSize] = useState(() => Number(load(KEYS.thumb, "128")));
  const [keepStructure, setKeepStructure] = useState(() => load(KEYS.keepStructure, "0") === "1");
  const [pickedColors, setPickedColors] = useState<PickedColor[]>(loadColors);
  const { toast, showToast } = useToast();

  useEffect(() => save(KEYS.thumb, String(thumbSize)), [thumbSize]);
  useEffect(() => save(KEYS.keepStructure, keepStructure ? "1" : "0"), [keepStructure]);
  useEffect(() => save(KEYS.colors, JSON.stringify(pickedColors)), [pickedColors]);
  useEffect(() => {
    const saved: SavedTabs = {
      roots: tabs.map((t) => t.root),
      active: Math.max(0, tabs.findIndex((t) => t.id === activeId)),
    };
    save(KEYS.tabs, JSON.stringify(saved));
  }, [tabs, activeId]);

  const selectTab = useCallback((id: string) => setTabState((s) => ({ ...s, activeId: id })), []);

  const setTabRoot = useCallback((id: string, root: string) => {
    setTabState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, root } : t)) }));
  }, []);

  const openNewTab = useCallback(async () => {
    const dir = await pickFolder("Open folder in new tab");
    if (!dir) return;
    const tab = newTab(dir);
    setTabState((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabState((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      if (index < 0) return s;
      const remaining = s.tabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        const tab = newTab();
        return { tabs: [tab], activeId: tab.id };
      }
      const activeId =
        s.activeId === id ? remaining[Math.min(index, remaining.length - 1)].id : s.activeId;
      return { tabs: remaining, activeId };
    });
  }, []);

  const openFolderInActiveTab = useCallback(async () => {
    const dir = await pickFolder("Choose a sprite folder");
    if (dir) setTabRoot(activeId, dir);
  }, [activeId, setTabRoot]);

  const cycleTab = useCallback((delta: number) => {
    setTabState((s) => {
      const i = s.tabs.findIndex((t) => t.id === s.activeId);
      const next = (i + delta + s.tabs.length) % s.tabs.length;
      return { ...s, activeId: s.tabs[next].id };
    });
  }, []);

  // Keep the latest handlers reachable from long-lived listeners.
  const commands = useRef({ openNewTab, openFolderInActiveTab, closeTab: () => closeTab(activeId) });
  commands.current = { openNewTab, openFolderInActiveTab, closeTab: () => closeTab(activeId) };

  // Native menu (macOS).
  useEffect(() => {
    const unlisten = listen<string>("menu", ({ payload }) => {
      if (payload === "new_tab") commands.current.openNewTab();
      else if (payload === "open_folder") commands.current.openFolderInActiveTab();
      else if (payload === "close_tab") commands.current.closeTab();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Keyboard shortcuts for tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        setTabState((s) => {
          const index = e.key === "9" ? s.tabs.length - 1 : Number(e.key) - 1;
          return s.tabs[index] ? { ...s, activeId: s.tabs[index].id } : s;
        });
      } else if (!IS_MAC && mod && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === "t") commands.current.openNewTab();
        else if (key === "o") commands.current.openFolderInActiveTab();
        else if (key === "w") commands.current.closeTab();
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleTab]);

  const addPickedColor = useCallback((color: PickedColor) => {
    setPickedColors((prev) => [color, ...prev.filter((c) => c.hex !== color.hex)].slice(0, 24));
  }, []);
  const clearColors = useCallback(() => setPickedColors([]), []);

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={selectTab}
        onClose={closeTab}
        onNew={openNewTab}
      />
      <div className="tab-panels">
        {tabs.map((tab) => (
          <FolderView
            key={tab.id}
            root={tab.root}
            active={tab.id === activeId}
            onRootChange={(root) => setTabRoot(tab.id, root)}
            thumbSize={thumbSize}
            onThumbSizeChange={setThumbSize}
            keepStructure={keepStructure}
            onKeepStructureChange={setKeepStructure}
            pickedColors={pickedColors}
            onPickColor={addPickedColor}
            onClearColors={clearColors}
            showToast={showToast}
          />
        ))}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
