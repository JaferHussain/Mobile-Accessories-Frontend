import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerLedger } from '@/features/customers/CustomerLedger';
import type { Customer, CustomerSummary, LedgerEntry } from '@/features/customers/customerApi';

/**
 * Sharing from the customer's own register.
 *
 * <p>A ledger row already carries everything a share needs: <code>entryType</code> says which
 * kind of document it is, and <code>referenceId</code> says which one. No second lookup, no new
 * field — the register has been holding both since it was built.</p>
 */

const customer: Customer = {
  id: 5,
  name: 'Bilal Traders',
  mobileNumber: '03001234567',
  outstandingBalance: 1500,
  isActive: true,
} as Customer;

const summary: CustomerSummary = {
  totalPurchased: 5000,
  totalPaid: 3500,
  totalOutstanding: 1500,
} as CustomerSummary;

const sale: LedgerEntry = {
  id: 1,
  entryDateUtc: '2026-09-20T09:00:00Z',
  entryType: 'Invoice',
  referenceId: 77,
  referenceNumber: 'INV-2026-000077',
  billAmount: 2000,
  paidAmount: 500,
  balanceAfter: 1500,
};

const payment: LedgerEntry = {
  id: 2,
  entryDateUtc: '2026-09-21T09:00:00Z',
  entryType: 'Payment',
  referenceId: 12,
  referenceNumber: 'RCP-2026-000012',
  billAmount: 0,
  paidAmount: 500,
  balanceAfter: 1000,
};

const openingBalance: LedgerEntry = {
  id: 3,
  entryDateUtc: '2026-09-01T09:00:00Z',
  entryType: 'OpeningBalance',
  referenceId: null,
  referenceNumber: null,
  note: 'Brought forward from the register',
  billAmount: 1000,
  paidAmount: 0,
  balanceAfter: 1000,
};

function renderLedger(
  entries: LedgerEntry[],
  overrides: Partial<Parameters<typeof CustomerLedger>[0]> = {},
) {
  const onFetchDocument = vi.fn().mockResolvedValue(new Blob(['%PDF']));
  const onCreateShareLink = vi.fn().mockResolvedValue({
    shareUrl: 'https://shop/x',
    whatsAppUrl: 'https://wa.me/923001234567?text=x',
    smsUrl: 'sms:+923001234567?body=x',
    expiresAtUtc: '2026-10-23T12:00:00Z',
  });

  render(
    <CustomerLedger
      customer={customer}
      summary={summary}
      entries={entries}
      onReceivePayment={vi.fn()}
      onFetchDocument={onFetchDocument}
      onCreateShareLink={onCreateShareLink}
      {...overrides}
    />,
  );

  return { onFetchDocument, onCreateShareLink };
}

const rowFor = (reference: string) => screen.getByText(reference).closest('tr')!;

describe('sharing a sale from the ledger', () => {
  it('offers the bill against the sale row', () => {
    renderLedger([sale]);

    expect(within(rowFor('INV-2026-000077')).getByRole('button', { name: /whatsapp/i }))
      .toBeInTheDocument();
  });

  it('addresses the document the row points at', async () => {
    const user = userEvent.setup();
    const { onCreateShareLink } = renderLedger([sale]);

    await user.click(within(rowFor('INV-2026-000077')).getByRole('button', { name: /whatsapp/i }));

    await waitFor(() => expect(onCreateShareLink).toHaveBeenCalledWith('Invoice', 77, null));
  });
});

describe('sharing a payment acknowledgement from the ledger', () => {
  it('offers a receipt against the payment row', () => {
    renderLedger([payment]);

    expect(within(rowFor('RCP-2026-000012')).getByRole('button', { name: /whatsapp/i }))
      .toBeInTheDocument();
  });

  it('asks for the receipt, not the invoice', async () => {
    const user = userEvent.setup();
    const { onCreateShareLink } = renderLedger([payment]);

    await user.click(within(rowFor('RCP-2026-000012')).getByRole('button', { name: /whatsapp/i }));

    await waitFor(() => expect(onCreateShareLink).toHaveBeenCalledWith('PaymentReceipt', 12, null));
  });

  it('uses the number already on the customer, not a typed one', () => {
    renderLedger([payment]);

    // They are on file. A number typed here could silently redirect a known customer's receipt.
    expect(within(rowFor('RCP-2026-000012')).queryByLabelText(/mobile number/i))
      .not.toBeInTheDocument();
  });
});

describe('ledger rows that are not documents', () => {
  it('offers nothing to share against an opening balance', () => {
    renderLedger([openingBalance]);

    // Brought forward from the paper register — there is no document behind it to send.
    const row = screen.getByText(/brought forward from the register/i).closest('tr')!;

    expect(within(row).queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
  });
});

describe('a customer with no number on file', () => {
  it('disables sending and points at the record, offering no typed number', () => {
    renderLedger([payment], { customer: { ...customer, mobileNumber: null } as Customer });

    const row = rowFor('RCP-2026-000012');

    expect(within(row).getByRole('button', { name: /whatsapp/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /print/i })).toBeEnabled();
    expect(within(row).queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
  });
});

describe('a ledger without sharing wired up', () => {
  it('renders exactly as before', () => {
    render(
      <CustomerLedger
        customer={customer}
        summary={summary}
        entries={[sale]}
        onReceivePayment={vi.fn()}
      />,
    );

    // Sharing is optional so the register stays testable on its own, as every existing ledger
    // test renders it.
    expect(screen.getByText('INV-2026-000077')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
  });
});
