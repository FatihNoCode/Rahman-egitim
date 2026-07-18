import { useState } from 'react';
import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  storageKey: string;
  collapseLabel: string;
  expandLabel: string;
}

export default function Sidebar({ items, activeId, onSelect, storageKey, collapseLabel, expandLabel }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        // ignore (e.g. private browsing)
      }
      return next;
    });
  };

  return (
    <aside
      className={`shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 h-fit sticky top-3 sm:top-4 md:top-6 transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className={`flex items-center p-2 border-b border-gray-100 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={toggle}
          title={collapsed ? expandLabel : collapseLabel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="p-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap overflow-hidden ${
                active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
