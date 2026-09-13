import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerLedger } from '@/features/customers/CustomerLedger';
import { ReceivePaymentModal } from '@/features/customers/ReceivePaymentModal';
import type { Customer, CustomerSummary, LedgerEntry } from '@/features/customers/customerApi';
import { ApiError } from '@/types/api';

/** T109 — the udhaar register as the shopkeeper reads it, and the payment modal. */

const customer: Customer = {
  id: 1,
  name: 'Bilal',
  mobileNumber: '923001234567',
  outstandingBalance: 500,
  isActive: true,
};

// The shop owner's worked example: bill 3,000 paid 1,000 -> 2,000; then paid 1,500 -> 500.
const entries: LedgerEntry[] = [
  {
    id: 1,
    entryDateUtc: '2026-09-01T08:00:00Z',
    entryType: 'Invoice',
    referenceNumber: 'INV-2026-000001',
    billAmount: 3000,
    paidAmount: 1000,
    balanceAfter: 2000,
  },
  {
    id: 2,
    entryDateUtc: '2026-09-05T09:30:00Z',
    entryType: 'Payment',
    referenceNumber: 'RCP-2026-000001',
    billAmount: 0,
    paidAmount: 1500,
    balanceAfter: 500,
  },
];

const summary: CustomerSummary = {
  totalPurchased: 3000,
  totalPaid: 2500,
  totalOutstanding: 500,
  invoiceCount: 1,
};

describe('CustomerLedger', () => {
  it('shows the customer and their mobile number', () => {
    render(
      <CustomerLedger
        customer={customer}
        summary={summary}
        entries={entries}
        onReceivePayment={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Bilal' })).toBeInTheDocument();
    expect(screen.getByText('923001234567')).toBeInTheDocument();
  });

  it('shows the profile totals', () => {
    render(
      <CustomerLedger customer={customer} summary={summary} entries={entries} onReceivePayment={vi.fn()} />,
    );

    expect(screen.getByTestId('total-purchased')).toHaveTextContent('Rs 3,000.00');
    expect(screen.getByTestId('total-paid')).toHaveTextContent('Rs 2,500.00');
    expect(screen.getByTestId('total-outstanding')).toHaveTextContent('Rs 500.00');
  });

  it('shows the running balance for each entry', () => {
    render(
      <CustomerLedger customer={customer} summary={summary} entries={entries} onReceivePayment={vi.fn()} />,
    );

    expect(screen.getByTestId('balance-1')).toHaveTextContent('Rs 2,000.00');
    expect(screen.getByTestId('balance-2')).toHaveTextContent('Rs 500.00');
  });

  it('shows bill and paid columns with a dash where there is nothing', () => {
    render(
      <CustomerLedger customer={customer} summary={summary} entries={entries} onReceivePayment={vi.fn()} />,
    );

    const paymentRow = screen.getByText('RCP-2026-000001').closest('tr')!;

    expect(paymentRow).toHaveTextContent('Rs 1,500.00');
    expect(paymentRow).toHaveTextContent('—');
  });

  it('labels each entry type in plain words', () => {
    render(
      <CustomerLedger customer={customer} summary={summary} entries={entries} onReceivePayment={vi.fn()} />,
    );

    expect(screen.getByText('Sale')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
  });

  it('offers to receive a payment when money is owed', async () => {
    const onReceivePayment = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerLedger
        customer={customer}
        summary={summary}
        entries={entries}
        onReceivePayment={onReceivePayment}
      />,
    );

    await user.click(screen.getByRole('button', { name: /receive payment/i }));

    expect(onReceivePayment).toHaveBeenCalledOnce();
  });

  it('disables the payment button when nothing is owed', () => {
    render(
      <CustomerLedger
        customer={{ ...customer, outstandingBalance: 0 }}
        summary={{ ...summary, totalOutstanding: 0 }}
        entries={entries}
        onReceivePayment={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /receive payment/i })).toBeDisabled();
  });

  it('says so when the ledger is empty', () => {
    render(
      <CustomerLedger
        customer={customer}
        summary={{ totalPurchased: 0, totalPaid: 0, totalOutstanding: 0, invoiceCount: 0 }}
        entries={[]}
        onReceivePayment={vi.fn()}
      />,
    );

    expect(screen.getByText('No entries yet.')).toBeInTheDocument();
  });
});

describe('ReceivePaymentModal', () => {
  function renderModal(onReceive = vi.fn().mockResolvedValue(undefined), balance = 500) {
    render(
      <ReceivePaymentModal
        customerName="Bilal"
        outstandingBalance={balance}
        onReceive={onReceive}
        onCancel={vi.fn()}
      />,
    );

    return onReceive;
  }

  it('shows what the customer owes', () => {
    renderModal();

    expect(screen.getByText(/owes rs 500\.00/i)).toBeInTheDocument();
  });

  it('requires an amount greater than zero', async () => {
    const user = userEvent.setup();
    const onReceive = renderModal();

    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText(/greater than zero/i)).toBeInTheDocument();
    expect(onReceive).not.toHaveBeenCalled();
  });

  it('records a payment', async () => {
    const user = userEvent.setup();
    const onReceive = renderModal();

    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '300' } });
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(onReceive).toHaveBeenCalledWith(300, 'Cash', null, false));
  });

  it('passes along a note', async () => {
    const user = userEvent.setup();
    const onReceive = renderModal();

    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '300' } });
    await user.type(screen.getByLabelText('Note'), 'Paid at shop');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(onReceive).toHaveBeenCalledWith(300, 'Cash', 'Paid at shop', false));
  });

  it('warns before submitting when the amount exceeds the balance', () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '900' } });

    expect(screen.getByText(/more than bilal owes/i)).toBeInTheDocument();
  });

  it('asks for explicit confirmation when the server refuses an overpayment', async () => {
    const user = userEvent.setup();
    const onReceive = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          'OVERPAYMENT_NOT_CONFIRMED',
          'Payment 900.00 exceeds the outstanding 500.00.',
          400,
        ),
      )
      .mockResolvedValueOnce(undefined);

    renderModal(onReceive);

    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '900' } });
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    // FR-022: never a negative balance by accident.
    expect(await screen.findByRole('alert')).toHaveTextContent(/exceeds the outstanding/i);

    const confirm = screen.getByRole('button', { name: /yes, accept the extra/i });
    await user.click(confirm);

    await waitFor(() => expect(onReceive).toHaveBeenLastCalledWith(900, 'Cash', null, true));
  });

  it('does not offer credit or partial as a payment method', () => {
    renderModal();

    const options = Array.from(
      screen.getByLabelText('Method').querySelectorAll('option'),
    ).map((option) => option.value);

    // Settling a debt with more debt is not a payment.
    expect(options).not.toContain('Credit');
    expect(options).not.toContain('Partial');
  });

  it('shows the server message on an unexpected failure', async () => {
    const user = userEvent.setup();
    const onReceive = vi
      .fn()
      .mockRejectedValue(new ApiError('NOT_FOUND', "Customer '1' was not found.", 404));

    renderModal(onReceive);

    fireEvent.change(screen.getByLabelText(/amount received/i), { target: { value: '100' } });
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found/i);
  });
});
