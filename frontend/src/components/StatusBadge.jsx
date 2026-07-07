import React from 'react';

const badgeStyles = {
  completed: 'bg-success-dim text-success',
  success: 'bg-success-dim text-success',
  failed: 'bg-danger-dim text-danger',
  error: 'bg-danger-dim text-danger',
  running: 'bg-warning-dim text-warning',
  pending: 'bg-warning-dim text-warning',
  retrying: 'bg-warning-dim text-warning',
  cancelled: 'bg-[rgba(107,114,128,0.15)] text-[#9ca3af]',
  active: 'bg-success-dim text-success',
  paused: 'bg-warning-dim text-warning',
  archived: 'bg-[rgba(107,114,128,0.15)] text-[#9ca3af]',
  independent: 'bg-accent-dim text-accent',
  chained: 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]',
  script: 'bg-accent-dim text-accent',
  http_request: 'bg-[rgba(14,165,233,0.15)] text-[#0ea5e9]',
  transform: 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]',
  enabled: 'bg-success-dim text-success',
  disabled: 'bg-[rgba(107,114,128,0.15)] text-[#9ca3af]',
};

export default function StatusBadge({ status, className = '' }) {
  const style = badgeStyles[status] || 'bg-elevated text-text-muted';

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${style} ${className}`}>
      {status}
    </span>
  );
}
