'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ open, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  // 화면 밖으로 안 나가게 위치 보정
  const menuW = 180;
  const menuH = items.length * 30 + 8;
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - menuH - 8);

  return createPortal(
    <div ref={ref} className="ctx-menu" style={{ left, top }}>
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="ctx-divider" />
        ) : (
          <button
            key={i}
            type="button"
            className={`ctx-item ${it.disabled ? 'ctx-item-disabled' : ''} ${it.danger ? 'ctx-item-danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              if (!it.disabled) {
                it.onClick();
                onClose();
              }
            }}
          >
            {it.icon && <span className="ctx-icon">{it.icon}</span>}
            <span>{it.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
