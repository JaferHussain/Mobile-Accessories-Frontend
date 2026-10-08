import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPkr } from '@/lib/money';
import { supplierApi } from '@/features/suppliers/supplierApi';
import { attachProofAfterSave, proofApi, proofOutcomeText } from '@/features/proofs/proofApi';
import { PurchaseBillForm, type PurchaseBillSubmission } from './PurchaseBillForm';
import { PurchaseBillsList, billDay } from './PurchaseBillsList';
import { purchaseBillApi } from './purchaseBillApi';

/**
 * Purchases — a supplier's bill entered the way it arrives: every product on it, how it was paid
 * and when, and a photo of the bill itself, saved at once. Below, every bill with what is still
 * owed on it.
 *
 * <p>The bill is saved first; its two pictures are attached after, to the ids the save returned. A
 * picture that fails to upload is said so — the bill and the payment are already safe.</p>
 */
export function PurchasesPage() {
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => supplierApi.search() });
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // A fresh form after each saved bill.
  const [formKey, setFormKey] = useState(0);

  async function save({ bill, billPhoto, paymentProof }: PurchaseBillSubmission) {
    const result = await purchaseBillApi.record(bill);

    let photoText = '';

    if (billPhoto) {
      try {
        await proofApi.attach('purchase-bill', result.billId, billPhoto);
        photoText = ' Bill photo attached.';
      } catch {
        photoText = ' The bill photo did not attach — add it from the bills list.';
      }
    }

    const proof = await attachProofAfterSave('supplier-payment', result.paymentId, paymentProof, bill.payment?.paymentMethod);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchase-bills'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ]);

    const stocked = result.lines.map((line) => `${line.productName} (stock now ${line.newQuantityOnHand})`).join(', ');
    const paid = bill.payment
      ? ` Paid ${formatPkr(result.paid)} on ${billDay(bill.payment.paidOn)}${result.paid < result.total ? `, ${formatPkr(result.total - result.paid)} left owing` : ''}.`
      : ` The whole ${formatPkr(result.total)} is owed to the supplier.`;

    setConfirmation(`Bill saved — ${stocked}.${paid}${photoText}${proofOutcomeText(proof)}`);
    setFormKey((key) => key + 1);
  }

  return (
    <section>
      <header className="page-header">
        <h2>Purchases</h2>
      </header>

      {confirmation && (
        <p className="form-success" role="status">
          {confirmation}
        </p>
      )}

      {suppliers.data?.items.length === 0 ? (
        <p className="form-error" role="alert">
          Add a supplier before recording a bill.
        </p>
      ) : (
        suppliers.data && (
          <PurchaseBillForm
            key={formKey}
            suppliers={suppliers.data.items.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
            onSubmit={save}
          />
        )
      )}

      <PurchaseBillsList />
    </section>
  );
}
