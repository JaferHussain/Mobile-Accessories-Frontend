import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProofFileField } from '@/features/proofs/ProofFileField';
import { attachProofAfterSave, proofApi, proofOutcomeText } from '@/features/proofs/proofApi';

/**
 * The screenshot asked for at the moment money moves by transfer, on every payment form — and
 * what becomes of it once the record is saved. Cash never asks: it is its own proof.
 */

const shot = new File(['jpeg'], 'transfer.jpg', { type: 'image/jpeg' });

afterEach(() => vi.restoreAllMocks());

describe('the screenshot field', () => {
  it.each(['Cash', 'Credit', 'Partial', '', null])('is not offered for %s', (method) => {
    render(<ProofFileField id="p" method={method} onFile={vi.fn()} />);

    expect(screen.queryByLabelText(/screenshot/i)).not.toBeInTheDocument();
  });

  it.each(['BankTransfer', 'JazzCash', 'EasyPaisa', 'Raast'])('is offered for %s, and is optional', (method) => {
    render(<ProofFileField id="p" method={method} onFile={vi.fn()} />);

    expect(screen.getByLabelText(/screenshot/i)).not.toBeRequired();
    expect(screen.getByText(/optional now/i)).toBeInTheDocument();
  });
});

describe('attaching it once the record is saved', () => {
  it('attaches the screenshot to the record just saved', async () => {
    const attach = vi.spyOn(proofApi, 'attach').mockResolvedValue(undefined);

    expect(await attachProofAfterSave('customer-payment', 12, shot, 'JazzCash')).toBe('attached');
    expect(attach).toHaveBeenCalledWith('customer-payment', 12, shot);
  });

  it('reports a failed upload as exactly that — the payment is already saved', async () => {
    vi.spyOn(proofApi, 'attach').mockRejectedValue(new Error('network'));

    const outcome = await attachProofAfterSave('refund', 12, shot, 'EasyPaisa');

    expect(outcome).toBe('failed');
    expect(proofOutcomeText(outcome)).toMatch(/did not attach — add it from proof missing/i);
  });

  it('sends nothing when no screenshot was chosen, or the money was cash', async () => {
    const attach = vi.spyOn(proofApi, 'attach').mockResolvedValue(undefined);

    expect(await attachProofAfterSave('supplier-payment', 12, null, 'BankTransfer')).toBe('none');
    expect(await attachProofAfterSave('supplier-payment', 12, shot, 'Cash')).toBe('none');
    expect(attach).not.toHaveBeenCalled();
    expect(proofOutcomeText('none')).toBe('');
  });
});
