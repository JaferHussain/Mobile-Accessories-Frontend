import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi, type Customer } from './customerApi';
import { ApiError } from '@/types/api';

/**
 * The owner's udhaar mark on one customer: whether the field salesman may leave money owing on a
 * sale to them. Owner only — the server ignores it from anyone else, so a salesman can never
 * grant himself a customer to give credit to.
 */
export function UdhaarCustomerToggle({ customer }: { customer: Customer }) {
  const queryClient = useQueryClient();
  const [allowed, setAllowed] = useState(customer.creditAllowed === true);

  const save = useMutation({
    mutationFn: (next: boolean) => customerApi.setCreditAllowed(customer, next),
    onSuccess: async (updated) => {
      setAllowed(updated.creditAllowed === true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer', customer.id] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
    },
  });

  return (
    <div className="field">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={allowed}
          disabled={save.isPending}
          onChange={(event) => save.mutate(event.target.checked)}
        />
        Udhaar customer
      </label>
      <small className="field__hint">
        The salesman in the market may sell to them on udhaar. At the counter only you can.
      </small>
      {save.error && (
        <p className="form-error" role="alert">
          {save.error instanceof ApiError ? save.error.message : 'Could not save the udhaar mark.'}
        </p>
      )}
    </div>
  );
}
