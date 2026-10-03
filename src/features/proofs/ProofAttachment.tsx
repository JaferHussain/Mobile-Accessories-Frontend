import { useId, useState } from 'react';
import { proofApi, type ProofKind } from './proofApi';

export interface ProofAttachmentProps {
  kind: ProofKind;
  id: number;
  hasProof: boolean;

  /** Told once a proof is safely stored, so a list can refresh. */
  onAttached?: () => void;

  /** Injected so tests need no server; the real API by default. */
  attach?: (kind: ProofKind, id: number, picture: File) => Promise<void>;
  view?: (kind: ProofKind, id: number) => Promise<Blob>;
  openUrl?: (url: string) => void;
}

/**
 * Attach, open or replace the proof behind one non-cash transaction.
 *
 * <p>One control on every screen that shows such a transaction — the sale, the recovery, the
 * supplier payment, the refund, the bank expense — so it is learnt once. Attaching is never part
 * of saving: the transaction already exists, and a screenshot that fails to upload says so without
 * suggesting the transaction failed.</p>
 */
export function ProofAttachment({
  kind,
  id,
  hasProof,
  onAttached,
  attach = proofApi.attach,
  view = proofApi.view,
  openUrl = (url) => window.open(url, '_blank', 'noopener'),
}: ProofAttachmentProps) {
  const inputId = useId();
  const [attached, setAttached] = useState(hasProof);
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  // The proof being looked at, as a local object URL — shown in a popup over the page.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function upload(picture: File | undefined) {
    if (!picture) {
      return;
    }

    setState('sending');

    try {
      await attach(kind, id, picture);
      setAttached(true);
      setState('idle');
      onAttached?.();
    } catch {
      setState('failed');
    }
  }

  async function open() {
    try {
      setPreviewUrl(URL.createObjectURL(await view(kind, id)));
    } catch {
      setState('failed');
    }
  }

  function closePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
  }

  return (
    <span className="proof">
      {attached && (
        <button type="button" className="proof__view" onClick={() => void open()}>
          View proof
        </button>
      )}

      <label className="proof__attach" htmlFor={inputId}>
        {state === 'sending' ? 'Attaching…' : attached ? 'Replace' : 'Attach proof'}
      </label>
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={state === 'sending'}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          // Cleared so choosing the same file again still fires a change.
          event.target.value = '';
        }}
      />

      {state === 'failed' && (
        <span className="proof__failed" role="alert">
          Could not attach the proof — try again.
        </span>
      )}

      {/* On the same page, at a readable size: the list underneath stays where it was. Loaded
          only when asked for — a list of thirty would otherwise fetch thirty screenshots. */}
      {previewUrl && (
        <div className="modal proof-viewer" role="dialog" aria-modal="true" aria-label="Payment proof">
          <div className="modal__panel proof-viewer__panel">
            <img className="proof-viewer__image" src={previewUrl} alt="Payment proof" />

            <div className="form-actions">
              <button type="button" onClick={() => openUrl(previewUrl)}>
                Open full size
              </button>
              <a className="button-link" href={previewUrl} download={`proof-${kind}-${id}`}>
                Download
              </a>
              <button type="button" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
