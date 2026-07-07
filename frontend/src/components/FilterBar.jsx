import React from 'react';

export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder, filters, activeFilter, onFilterChange }) {
  return (
    <div className="flex items-center gap-3 mb-4 max-md:flex-col max-md:items-stretch">
      <div className="flex items-center gap-2 bg-card border border-border rounded-sm px-3 py-2 flex-1 max-w-[320px] text-text-muted focus-within:border-accent transition-colors max-md:max-w-none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          className="bg-transparent border-none outline-none text-text-primary text-[13px] font-sans w-full placeholder:text-text-muted"
          placeholder={searchPlaceholder || 'Search...'}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {filters && (
        <div className="flex gap-1 bg-card border border-border rounded-sm p-[3px]">
          {filters.map(f => (
            <button
              key={f.value}
              className={`bg-transparent border-none text-[12px] font-medium font-sans px-3.5 py-1.5 rounded cursor-pointer transition-all duration-150 ${
                activeFilter === f.value
                  ? 'text-accent bg-accent-dim font-semibold'
                  : 'text-text-muted hover:text-text-primary hover:bg-elevated'
              }`}
              onClick={() => onFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
