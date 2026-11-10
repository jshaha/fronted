'use client';

import { useEffect, useRef } from 'react';

export interface ScreenshotDialogProps {
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function ScreenshotDialog({ src, alt, onClose }: ScreenshotDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (src) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [src]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleEscapeKey = () => {
    onClose();
    // Return focus to the button that opened this dialog
    triggerRef.current?.focus();
  };

  if (!src) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={handleEscapeKey}
      className="backdrop:bg-black/50 max-w-[min(1100px,92vw)] max-h-[90vh] rounded-lg border border-line bg-surface shadow-lg p-6 overscroll-behavior-contain"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Screenshot</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close screenshot"
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted hover:text-ink hover:bg-[color:var(--line)] transition-colors duration-150"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto max-h-[calc(90vh-120px)]">
          { }
          <img
            src={src}
            alt={alt}
            width={1160}
            height={860}
            loading="lazy"
            className="max-w-full h-auto rounded-lg border border-line object-cover object-top"
          />
        </div>
      </div>
    </dialog>
  );
}
