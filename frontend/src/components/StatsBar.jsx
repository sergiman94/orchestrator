import React from 'react';

export default function StatsBar({ items }) {
  return (
    <div className="flex items-center bg-card border border-border rounded-[10px] px-5 py-3.5 mb-4">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className="w-px h-6 bg-border flex-shrink-0 max-md:hidden" />}
          <div className="flex items-center gap-2 px-4 first:pl-0 max-md:px-2">
            <span
              className="text-lg font-bold tabular-nums leading-none"
              style={{ color: item.color || 'inherit', fontSize: item.smallValue ? '13px' : undefined }}
            >
              {item.value}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {item.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
