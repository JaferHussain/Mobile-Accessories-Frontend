import { needsProof } from './proofApi';

export interface ProofFileFieldProps {
  /** The input's id, unique on the page. */
  id: string;
  /** How the money moved. The field appears only for a transfer — cash is its own proof. */
  method: string | null | undefined;
  onFile: (file: File | null) => void;
  label?: string;
}

/**
 * The screenshot asked for at the moment money moves by transfer — on every form that records a
 * payment. Always optional: the record is saved first and the picture attached to it after, so
 * nobody waits on a picture, and a missing one lands on Proof missing for later.
 */
export function ProofFileField({ id, method, onFile, label = 'Screenshot' }: ProofFileFieldProps) {
  if (!needsProof(method)) {
    return null;
  }

  return (
    <div className="field proof-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <small className="field__hint">Optional now — it can be attached later, and Proof missing lists any without one.</small>
    </div>
  );
}
