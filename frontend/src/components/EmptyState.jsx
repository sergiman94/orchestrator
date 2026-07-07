import React from 'react';

export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="text-center py-12 px-5 text-text-muted">
      {icon && (
        <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-4 text-text-muted animate-float">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-text-secondary mb-1.5">{title}</h3>
      {description && <p className="text-[13px] max-w-[300px] mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
