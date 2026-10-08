import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CustomerLedger } from '@/features/customers/CustomerLedger';
import type { Customer, CustomerSummary, LedgerEntry } from '@/features/customers/customerApi';

/**
 * Proofs on the customer's register: every sale or recovery paid by transfer can carry its
 * screenshot right where the owner reads the account. Cash never asks for one.
 */

const customer = {
  id: 1,
  name: 'Asif',
  mobileNumber: '03001234567',
  outstandingBalance: 500,
  isActive: true,
  saleType: 'Retail',
} as Customer;

const summary: CustomerSummary = { totalPurchased: 3000, totalPaid: 2500, totalOutstanding: 500, invoiceCount: 1 };

const cashSale: LedgerEntry = {
  id: 1,
  entryDateUtc: '2026-09-01T08:00:00Z',
  entryType: 'Invoice',
  referenceId: 70,
  referenceNumber: 'INV-2026-000070',
  billAmount: 3000,
  paidAmount: 1000,
  balanceAfter: 2000,
  paymentMethod: 'Cash',
  hasProof: false,
};

const jazzCashRecovery: LedgerEntry = {
  id: 2,
  entryDateUtc: '2026-09-05T09:30:00Z',
  entryType: 'Payment',
  referenceId: 12,
  referenceNumber: 'RCP-2026-000012',
  billAmount: 0,
  paidAmount: 1500,
  balanceAfter: 500,
  paymentMethod: 'JazzCash',
  hasProof: false,
};

function renderLedger(entries: LedgerEntry[]) {
  render(<CustomerLedger customer={customer} summary={summary} entries={entries} onReceivePayment={vi.fn()} />);
}

const rowFor = (reference: string) => screen.getByText(reference).closest('tr')!;

describe('proofs on the customer ledger', () => {
  it('offers a proof on a recovery paid by transfer, and none on a cash sale', () => {
    renderLedger([cashSale, jazzCashRecovery]);

    expect(within(rowFor('RCP-2026-000012')).getByLabelText(/attach proof/i)).toBeInTheDocument();
    expect(within(rowFor('INV-2026-000070')).queryByLabelText(/attach proof/i)).not.toBeInTheDocument();
  });

  it('offers to open a proof that is already attached', () => {
    renderLedger([{ ...jazzCashRecovery, hasProof: true }]);

    expect(within(rowFor('RCP-2026-000012')).getByRole('button', { name: /view proof/i })).toBeInTheDocument();
  });

  it('adds no Proof column to a register paid all in cash', () => {
    renderLedger([cashSale]);

    expect(screen.queryByRole('columnheader', { name: 'Proof' })).not.toBeInTheDocument();
  });
});
