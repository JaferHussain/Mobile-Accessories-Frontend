import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { IdCardViewer } from './IdCardViewer';
import { UdhaarRegistrationForm, type UdhaarRegistrationValues } from './UdhaarRegistrationForm';
import { udhaarApi } from './udhaarApi';

/**
 * A customer's udhaar standing, on their ledger — the owner's only. Not an udhaar customer:
 * <b>Make udhaar customer</b>, which asks for the phone and ID card (a tick would get round it).
 * Already one: a highlighted badge, the ID card, and — if they were marked before cards were
 * asked for — a prompt to complete it.
 */
export function UdhaarStatusPanel({ customerId }: { customerId: number }) {
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ['udhaar-status', customerId], queryFn: () => udhaarApi.status(customerId) });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['udhaar-status', customerId] }),
      queryClient.invalidateQueries({ queryKey: ['udhaar-customers'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] }),
    ]);

  const remove = useMutation({
    mutationFn: () => udhaarApi.remove(customerId),
    onSuccess: refresh,
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not take the udhaar mark away.'),
  });

  async function register(values: UdhaarRegistrationValues) {
    await udhaarApi.registerExisting(customerId, {
      mobileNumber: values.mobileNumber,
      idCardFront: values.idCardFront,
      idCardBack: values.idCardBack,
    });
    setIsRegistering(false);
    await refresh();
  }

  const data = status.data;

  if (!data) {
    return null;
  }

  if (isRegistering) {
    return <UdhaarRegistrationForm existing={data} onSubmit={register} onCancel={() => setIsRegistering(false)} />;
  }

  return (
    <div className={`udhaar-status${data.isUdhaarCustomer ? ' udhaar-status--on' : ''}`}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {data.isUdhaarCustomer ? (
        <>
          <span className="badge badge--udhaar">Udhaar customer</span>
          {data.idCardMissing && <span className="badge badge--low">ID card missing</span>}

          <span className="udhaar-status__actions">
            <IdCardViewer customer={data} />
            {data.idCardMissing && (
              <button type="button" onClick={() => setIsRegistering(true)}>
                Complete ID card
              </button>
            )}
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Take ${data.name} off the udhaar customers? What they owe stays as it is.`)) {
                  setError(null);
                  remove.mutate();
                }
              }}
            >
              Remove from udhaar
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="field__hint">Not an udhaar customer — can pay in full, or part with their phone on file.</span>
          <button type="button" className="button--primary" onClick={() => setIsRegistering(true)}>
            Make udhaar customer
          </button>
        </>
      )}
    </div>
  );
}
