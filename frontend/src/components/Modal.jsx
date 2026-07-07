import React, { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-[800px]' }) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-card border border-border rounded-[10px] ${maxWidth} w-[90%] max-h-[80vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)]`}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
          <button
            className="bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer text-xl p-1"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
