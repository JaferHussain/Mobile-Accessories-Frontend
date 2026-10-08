import { useEffect, useRef, type ReactNode } from 'react';

export interface SendMenuProps {
  /** The one button's label: "Share", "Send reminder". */
  label: string;

  /** Which icon the button carries. */
  kind: 'share' | 'remind';

  /** The question the panel asks, e.g. "Please select an option to send the invoice." */
  prompt: string;

  /** Controlled, so the caller can close it once a message is on its way. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;

  disabled?: boolean;

  /** The choices — WhatsApp and SMS — and anything the choice needs, such as a typed number. */
  children: ReactNode;
}

/**
 * One button, and the choice of app behind it.
 *
 * <p>Shared by Share (a bill or receipt) and Send reminder, so the two behave the same way: the
 * row or header stays short, and the shopkeeper is asked which app at the moment they mean to
 * send. Closed by Escape, by a click anywhere else, or by pressing the button again.</p>
 */
export function SendMenu({
  label,
  kind,
  prompt,
  isOpen,
  onOpenChange,
  disabled = false,
  children,
}: SendMenuProps) {
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    function onPointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [isOpen, onOpenChange]);

  return (
    <span className="send-menu" ref={menuRef}>
      <button
        type="button"
        className={`send-menu__toggle send-menu__toggle--${kind}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        disabled={disabled}
      >
        {label}
      </button>

      {isOpen && (
        <div className="send-menu__panel" role="group" aria-label={label}>
          <p className="send-menu__prompt">{prompt}</p>
          {children}
        </div>
      )}
    </span>
  );
}
