import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '@/types/api';
import type { UdhaarCustomer } from './udhaarApi';

export interface UdhaarRegistrationValues {
  name: string;
  mobileNumber: string;
  idCardFront: File | null;
  idCardBack: File | null;
}

export interface UdhaarRegistrationFormProps {
  /** An existing customer being made an udhaar customer, or completing their ID card. Absent for a new one. */
  existing?: UdhaarCustomer;
  /**
   * Editing a registered udhaar customer's details rather than registering one: the name is
   * editable, and the ID card photos are optional — a photo replaces only the side it is for.
   */
  isEdit?: boolean;
  onSubmit: (values: UdhaarRegistrationValues) => Promise<void>;
  onCancel: () => void;
}

/** One side of the card: a file picker that shows what was chosen, so the wrong photo is caught here. */
function CardSide({
  id,
  label,
  file,
  onFile: setFile,
  alreadyOnFile,
}: {
  id: string;
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  alreadyOnFile: boolean;
}) {
  // Derived from the chosen file, and the object URL is released when the file changes or the form closes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  return (
    <div className="field id-card-side">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      {preview ? (
        <img className="id-card-side__preview" src={preview} alt={`${label} chosen`} />
      ) : (
        <small className="field__hint">{alreadyOnFile ? 'On file — choose a photo only to replace it.' : 'Required.'}</small>
      )}
    </div>
  );
}

/**
 * Registering an udhaar customer: name, phone, and a photo of both sides of the ID card. All are
 * required for a new registration; for an existing customer a side already on file may be kept.
 * The server checks the same again — this only says what is missing before anything is sent.
 */
export function UdhaarRegistrationForm({ existing, isEdit = false, onSubmit, onCancel }: UdhaarRegistrationFormProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [mobileNumber, setMobileNumber] = useState(existing?.mobileNumber ?? '');
  const [idCardFront, setIdCardFront] = useState<File | null>(null);
  const [idCardBack, setIdCardBack] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const frontOnFile = existing?.hasIdCardFront === true;
  const backOnFile = existing?.hasIdCardBack === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if ((!existing || isEdit) && !name.trim()) {
      setError("Enter the customer's name.");
      return;
    }

    if (!mobileNumber.trim()) {
      setError("Enter the customer's phone number — it is how the udhaar is collected.");
      return;
    }

    // Editing never forces a photo: the card on file stays unless a new one is chosen.
    if (!isEdit && ((!idCardFront && !frontOnFile) || (!idCardBack && !backOnFile))) {
      setError('Add a photo of both sides of the customer’s ID card.');
      return;
    }

    setIsSaving(true);

    try {
      await onSubmit({ name: name.trim(), mobileNumber: mobileNumber.trim(), idCardFront, idCardBack });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the udhaar customer. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="card udhaar-form" onSubmit={(event) => void submit(event)} noValidate>
      <h3>
        {isEdit && existing
          ? `Edit ${existing.name}`
          : existing
            ? `Make ${existing.name} an udhaar customer`
            : 'Register udhaar customer'}
      </h3>
      <p className="field__hint">
        {isEdit
          ? 'Correct the name or phone number. Choose an ID card photo only to replace that side — what they owe does not change.'
          : 'Only registered udhaar customers can be sold to on full udhaar.'}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {(!existing || isEdit) && (
        <div className="field">
          <label htmlFor="udhaarName">Name</label>
          <input id="udhaarName" value={name} maxLength={150} onChange={(event) => setName(event.target.value)} />
        </div>
      )}

      <div className="field">
        <label htmlFor="udhaarMobile">Phone number</label>
        <input
          id="udhaarMobile"
          inputMode="tel"
          maxLength={20}
          value={mobileNumber}
          onChange={(event) => setMobileNumber(event.target.value)}
        />
      </div>

      <div className="id-card-sides">
        <CardSide
          id="idCardFront"
          label="ID card — front"
          file={idCardFront}
          onFile={setIdCardFront}
          alreadyOnFile={frontOnFile}
        />
        <CardSide id="idCardBack" label="ID card — back" file={idCardBack} onFile={setIdCardBack} alreadyOnFile={backOnFile} />
      </div>

      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={isSaving}>
          {isSaving ? 'Saving…' : isEdit ? 'Save changes' : existing ? 'Save udhaar customer' : 'Register'}
        </button>
        <button type="button" disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
