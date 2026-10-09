import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';
import { customerApi, type Customer } from './customerApi';

const TYPES = ['Retail', 'Wholesale'] as const;

/**
 * Whether a customer is a retail or a wholesale customer — the owner's to set, and what the
 * Customers screen's Wholesale filter reads. A wholesale sale already marks its customer Wholesale
 * on its own; this is for setting it before the first sale, or correcting it.
 */
export function CustomerTypeToggle({ customer }: { customer: Customer }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState(customer.saleType);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: Customer['saleType']) => customerApi.setSaleType(customer, next),
    onSuccess: async (updated) => {
      setType(updated.saleType);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not change the customer type.'),
  });

  return (
    <div className="customer-type">
      <span className="customer-type__label">Customer type</span>
      <div className="view-toggle" role="group" aria-label="Customer type">
        {TYPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={type === option}
            disabled={save.isPending}
            onClick={() => {
              if (option !== type) {
                setError(null);
                save.mutate(option);
              }
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
