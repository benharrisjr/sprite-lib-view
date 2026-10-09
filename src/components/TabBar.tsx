import { Plus, X } from "lucide-react";

export interface Tab {
  id: string;
  root: string | null;
}

export function tabTitle(root: string | null): string {
  if (!root) return "New Tab";
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
}

interface Props {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: Props) {
  return (
    <nav className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab ${tab.id === activeId ? "active" : ""}`}
          title={tab.root ?? "No folder open"}
          onMouseDown={(e) => {
            // Middle-click closes, like a browser.
            if (e.button === 1) {
              e.preventDefault();
              onClose(tab.id);
            }
          }}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-title">{tabTitle(tab.root)}</span>
          <button
            className="tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} title="New tab">
        <Plus size={16} />
      </button>
    </nav>
  );
}
