import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProofAttachment } from '@/features/proofs/ProofAttachment';
import { needsProof } from '@/features/proofs/proofApi';

/**
 * The one control every screen uses for a transaction's proof: attach it, open it, replace it.
 *
 * <p>The same control on a sale, a recovery, a supplier payment, a refund and an expense, so the
 * owner learns it once. It only ever appears on a non-cash transaction — cash is its own proof.</p>
 */

const screenshot = () => new File(['png'], 'transfer.png', { type: 'image/png' });

function setup(hasProof: boolean) {
  const attach = vi.fn().mockResolvedValue(undefined);
  const view = vi.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' }));
  const openUrl = vi.fn();
  const onAttached = vi.fn();

  render(
    <ProofAttachment
      kind="customer-payment"
      id={12}
      hasProof={hasProof}
      onAttached={onAttached}
      attach={attach}
      view={view}
      openUrl={openUrl}
    />,
  );

  return { attach, view, openUrl, onAttached };
}

describe('ProofAttachment', () => {
  it('offers to attach a proof when there is none', () => {
    setup(false);

    expect(screen.getByLabelText(/attach proof/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view proof/i })).not.toBeInTheDocument();
  });

  it('uploads the chosen screenshot to that transaction and says it is attached', async () => {
    const { attach, onAttached } = setup(false);

    await userEvent.upload(screen.getByLabelText(/attach proof/i), screenshot());

    await waitFor(() => expect(attach).toHaveBeenCalledWith('customer-payment', 12, expect.any(File)));
    expect(onAttached).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /view proof/i })).toBeInTheDocument();
  });

  it('shows an attached proof on the same page, at a readable size', async () => {
    const { view, openUrl } = setup(true);

    await userEvent.click(screen.getByRole('button', { name: /view proof/i }));

    await waitFor(() => expect(view).toHaveBeenCalledWith('customer-payment', 12));

    // A popup over the page, not a new tab — the list stays where it was.
    const popup = await screen.findByRole('dialog', { name: /payment proof/i });
    expect(popup.querySelector('img')).not.toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens it full size, or closes it, from the popup', async () => {
    const { openUrl } = setup(true);

    await userEvent.click(screen.getByRole('button', { name: /view proof/i }));
    await userEvent.click(await screen.findByRole('button', { name: /open full size/i }));
    expect(openUrl).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can replace a proof that is already attached', () => {
    setup(true);

    expect(screen.getByLabelText(/replace/i)).toBeInTheDocument();
  });

  it('says so when the upload fails, and keeps the transaction untouched', async () => {
    const attach = vi.fn().mockRejectedValue(new Error('offline'));

    render(<ProofAttachment kind="sale" id={1} hasProof={false} attach={attach} view={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText(/attach proof/i), screenshot());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not attach/i);
  });
});

describe('which methods take a proof', () => {
  it('asks for one on every transfer, never on cash, credit or part payment', () => {
    expect(['BankTransfer', 'JazzCash', 'EasyPaisa', 'Raast'].every(needsProof)).toBe(true);
    expect(['Cash', 'Credit', 'Partial', null, undefined].some(needsProof)).toBe(false);
  });
});
