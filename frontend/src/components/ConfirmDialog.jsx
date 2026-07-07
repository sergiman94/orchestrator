import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirm'} maxWidth="max-w-[440px]">
      <p className="text-[14px] text-text-secondary mb-6">{message}</p>
      <div className="flex justify-end gap-2 pt-3 border-t border-border">
        <button
          className="px-4 py-2 bg-elevated border border-border rounded-sm text-[13px] font-medium text-text-primary hover:bg-card transition-colors cursor-pointer"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className={`px-4 py-2 border rounded-sm text-[13px] font-medium cursor-pointer transition-colors ${
            danger
              ? 'bg-danger-dim border-danger text-danger hover:bg-danger hover:text-white'
              : 'bg-accent border-accent text-white hover:bg-accent-hover'
          }`}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
