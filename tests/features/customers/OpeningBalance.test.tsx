import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpeningBalanceForm } from '@/features/customers/OpeningBalanceForm';
import { ApiError } from '@/types/api';

/**
 * T032 — recording what a customer already owed on paper.
 *
 * The rule worth guarding on screen is the same one guarded on the server: recording a figure a
 * second time is a correction, not a second debt. The form must make that obvious to whoever is
 * typing, because they are the one who will be blamed if a customer's balance doubles.
 */

const customer = { id: 7, name: 'Ali Mobile Shop', outstandingBalance: 12_000 };

const makeSubmit = () =>
  vi.fn<(amount: number, reason: string | null) => Promise<void>>().mockResolvedValue(undefined);

describe('OpeningBalanceForm', () => {
  let onSubmit: ReturnType<typeof makeSubmit>;

  beforeEach(() => {
    onSubmit = makeSubmit();
  });

  it('records a first carried-forward amount', async () => {
    const user = userEvent.setup();
    render(<OpeningBalanceForm customer={customer} openingBalance={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/amount already owed/i), '12000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(12_000, null));
  });

  it('needs no reason the first time', async () => {
    const user = userEvent.setup();
    render(<OpeningBalanceForm customer={customer} openingBalance={null} onSubmit={onSubmit} />);

    // It is a statement of fact copied from the register.
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/amount already owed/i), '500');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('warns that a second recording corrects rather than adds', async () => {
    render(
      <OpeningBalanceForm customer={customer} openingBalance={12_000} onSubmit={onSubmit} />,
    );

    // The one thing the person typing must understand before they press save.
    expect(screen.getByText(/corrects the existing figure/i)).toBeInTheDocument();
    expect(screen.getByText(/12,000/)).toBeInTheDocument();
  });

  it('requires a reason when correcting', async () => {
    const user = userEvent.setup();
    render(
      <OpeningBalanceForm customer={customer} openingBalance={12_000} onSubmit={onSubmit} />,
    );

    await user.clear(screen.getByLabelText(/amount already owed/i));
    await user.type(screen.getByLabelText(/amount already owed/i), '10000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a correction with its reason', async () => {
    const user = userEvent.setup();
    render(
      <OpeningBalanceForm customer={customer} openingBalance={12_000} onSubmit={onSubmit} />,
    );

    const amount = screen.getByLabelText(/amount already owed/i);
    await user.clear(amount);
    await user.type(amount, '10000');
    await user.type(screen.getByLabelText(/reason/i), 'Mistyped from the register.');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(10_000, 'Mistyped from the register.'),
    );
  });

  it('refuses a negative amount without troubling the server', async () => {
    const user = userEvent.setup();
    render(<OpeningBalanceForm customer={customer} openingBalance={null} onSubmit={onSubmit} />);

    // A negative figure would mean the shop owes the customer, which is a different thing.
    const amount = screen.getByLabelText(/amount already owed/i);
    await user.clear(amount);
    await user.type(amount, '-500');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/cannot be negative/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows what the server said when it refuses', async () => {
    const failing = vi.fn().mockRejectedValue(
      new ApiError('BUSINESS_RULE_VIOLATION', 'Changing a carried-forward amount needs a reason.', 422),
    );

    const user = userEvent.setup();
    render(
      <OpeningBalanceForm customer={customer} openingBalance={null} onSubmit={failing} />,
    );

    await user.type(screen.getByLabelText(/amount already owed/i), '12000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a reason/i);
  });

  it('does not let the same figure be submitted twice while saving', async () => {
    let release: () => void = () => {};
    const slow = vi.fn().mockReturnValue(new Promise<void>((r) => (release = r)));

    const user = userEvent.setup();
    render(<OpeningBalanceForm customer={customer} openingBalance={null} onSubmit={slow} />);

    await user.type(screen.getByLabelText(/amount already owed/i), '12000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();

    release();
  });
});
