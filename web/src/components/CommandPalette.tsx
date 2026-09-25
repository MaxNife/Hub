import { useEffect, useRef, useState } from 'react';
import { useCommands } from '../commands';
import { IconSearch } from './Icons';

// Ctrl+K launcher over apps and actions, from anywhere (including over an
// open app). ↑/↓ select, Enter runs, Esc closes.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const { items, status, appCount } = useCommands(q, onClose);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setQ('');
      setActive(0);
    } else if (returnFocus.current instanceof HTMLElement) {
      returnFocus.current.focus();
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette" role="dialog" aria-modal="true" aria-label="Search apps and actions"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-search">
          <IconSearch size={20} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${items[active].key}` : undefined}
            placeholder="Open an app or run a command"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[active]?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" ref={listRef}>
          {items.map((item, i) => {
            const head = i === 0 || items[i - 1].group !== item.group ? item.group : null;
            return (
              <li key={item.key} role="presentation">
                {head && <div className="palette-group">{head}</div>}
                <button
                  type="button"
                  id={`pi-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  className={`cmd-row${i === active ? ' active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => item.run()}
                  tabIndex={-1}
                >
                  <span className={`cmd-icon${item.kind === 'Action' ? ' action' : ''}`}>{item.icon}</span>
                  <span className="cmd-text">
                    <b>{item.label}</b>
                    <small>{item.hint}</small>
                  </span>
                  <span className="cmd-kind">{item.kind}</span>
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="palette-empty">Nothing matches that. Try an app name, or “dark”.</li>
          )}
        </ul>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span className="spacer" />
          <span>{status === 'demo' ? 'Demo data' : `${appCount} apps`}</span>
        </footer>
      </div>
    </div>
  );
}
