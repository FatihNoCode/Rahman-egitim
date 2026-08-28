import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Small line under the title — a date, whose child it is about. */
  subtitle?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
  /** Sticks to the bottom of the panel, outside the scrolling body. */
  footer?: ReactNode;
  className?: string;
}

/**
 * The one dialog shell in the app.
 *
 * Every dialog here had grown its own idea of how to leave: some had a
 * "Annuleren" button and nothing else, one had neither and could only be
 * dismissed by completing it. So this shell gives all of them the same three
 * ways out, which is what makes a dialog feel safe to open in the first place:
 *
 *   • an X in the top-right corner — the one place a thumb goes looking,
 *   • a tap on the backdrop,
 *   • the Escape key, for the website.
 *
 * A dialog that additionally needs a *decision* (send this / delete that)
 * still puts its own buttons in `footer`; a dialog that is only showing
 * something does not, because a "Annuleren" next to an X is two controls for
 * one job.
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  closeLabel = 'Sluiten',
  children,
  footer,
  className = '',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while a dialog is up — on a phone that
    // reads as the dialog itself sliding around.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${className}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          className="absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>

        {(title || subtitle) && (
          // pr-12 keeps the heading clear of the close button rather than
          // running underneath it.
          <div className="shrink-0 px-5 pb-2 pr-12 pt-5">
            {title && <h3 className="text-lg font-semibold text-emerald-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-5 ${title || subtitle ? '' : 'pr-12 pt-5'}`}>
          {children}
        </div>

        {footer && <div className="shrink-0 border-t border-gray-100 p-4">{footer}</div>}
      </div>
    </div>
  );
}
