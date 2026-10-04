import { useEffect, useState } from 'react';
import { udhaarApi, type IdCardSide, type UdhaarCustomer } from './udhaarApi';

/**
 * Both sides of an udhaar customer's ID card, on the same page. Loaded only when opened — and
 * fetched through the signed-in owner's request, never a link to the file. Owner only.
 */
export function IdCardViewer({ customer }: { customer: UdhaarCustomer }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<Partial<Record<IdCardSide, string>>>({});
  const [failed, setFailed] = useState(false);

  const sides = (['front', 'back'] as const).filter((side) =>
    side === 'front' ? customer.hasIdCardFront : customer.hasIdCardBack,
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let cancelled = false;
    const made: string[] = [];
    const onFile = (['front', 'back'] as const).filter((side) =>
      side === 'front' ? customer.hasIdCardFront : customer.hasIdCardBack,
    );

    void Promise.all(
      onFile.map(async (side) => {
        const url = URL.createObjectURL(await udhaarApi.idCard(customer.id, side));
        made.push(url);
        return [side, url] as const;
      }),
    )
      .then((pairs) => {
        if (!cancelled) {
          setUrls(Object.fromEntries(pairs));
        }
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, customer.id, customer.hasIdCardFront, customer.hasIdCardBack]);

  if (sides.length === 0) {
    return null;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        View ID card
      </button>

      {open && (
        <div className="modal proof-viewer" role="dialog" aria-modal="true" aria-label={`${customer.name} — ID card`}>
          <div className="modal__panel proof-viewer__panel">
            <h3>{customer.name} — ID card</h3>

            {failed && (
              <p className="form-error" role="alert">
                Could not open the ID card. Please try again.
              </p>
            )}

            <div className="id-card-viewer">
              {sides.map((side) =>
                urls[side] ? (
                  <figure key={side}>
                    <img className="proof-viewer__image" src={urls[side]} alt={`ID card ${side}`} />
                    <figcaption>{side === 'front' ? 'Front' : 'Back'}</figcaption>
                  </figure>
                ) : (
                  !failed && (
                    <p key={side} className="field__hint">
                      Loading the {side}…
                    </p>
                  )
                ),
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setUrls({});
                  setFailed(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
