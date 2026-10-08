import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import type { ShopAccount } from '@/features/shopAccounts/shopAccountApi';
import { ApiError } from '@/types/api';

/** T141 — expense entry. These figures feed net profit, so the date matters (FR-030). */

const categories = [
  { id: 1, name: 'Rent' },
  { id: 2, name: 'Electricity' },
];

const accounts: ShopAccount[] = [
  { id: 10, name: 'HBL Current', accountType: 'Bank', accountNumber: '8989', accountTitle: null, isActive: true },
  { id: 11, name: 'JazzCash Shop', accountType: 'JazzCash', accountNumber: '0300 7194095', accountTitle: null, isActive: true },
  { id: 12, name: 'Old JazzCash', accountType: 'JazzCash', accountNumber: null, accountTitle: null, isActive: false },
];

function renderForm(onSubmit = vi.fn().mockResolvedValue('saved')) {
  render(<ExpenseForm categories={categories} accounts={accounts} onSubmit={onSubmit} />);
  return onSubmit;
}

/**
 * Answers the one question of how it was paid.
 *
 * The form refuses to save without it, so every test that reaches a submit has to answer it —
 * which is the point of the field, not an inconvenience of testing it.
 */
async function choosePaidBy(method = 'Cash') {
  await userEvent.selectOptions(screen.getByLabelText(/paid by/i), method);
}

describe('ExpenseForm', () => {
  it('lists the categories', () => {
    renderForm();

    const options = Array.from(
      screen.getByLabelText('Category').querySelectorAll('option'),
    ).map((option) => option.textContent);

    expect(options).toEqual(['Rent', 'Electricity']);
  });

  it('defaults the date to today in the shop, not in UTC', () => {
    // 1 a.m. on 1 October in the shop — still 30 September in UTC. An expense paid now belongs
    // to the 1st.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T20:00:00Z'));

    try {
      renderForm();
      expect(screen.getByLabelText('Date')).toHaveValue('2026-10-01');
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires an amount above zero', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a negative amount', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-500' } });
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a date', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByText('A date is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a cash expense with no account, reference or proof', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.selectOptions(screen.getByLabelText('Category'), '2');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-09' } });
    await user.type(screen.getByLabelText('Note'), 'September bill');
    await choosePaidBy('Cash');
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        categoryId: 2,
        amount: 12000,
        expenseDate: '2026-09-09',
        paymentMethod: 'Cash',
        shopAccountId: null,
        transactionId: null,
        note: 'September bill',
        proofFile: null,
      }),
    );
  });

  it('sends null rather than an empty note', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    await choosePaidBy();
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ note: null })),
    );
  });

  it('confirms and clears the amount after saving', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    await choosePaidBy();
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved.');
    // Ready for the next entry without re-typing the category or date.
    expect(screen.getByLabelText('Amount')).toHaveValue(0);
  });

  it('shows the server message when saving fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError('NOT_FOUND', "Expense category '9' was not found.", 404));

    renderForm(onSubmit);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    await choosePaidBy();
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found/i);
  });
});

/**
 * One question: how was it paid?
 *
 * <p>It replaced "Paid from: Till / Bank" followed by a second "Paid by". Cash means the till;
 * anything else means the bank — the server works that out, so the drawer count is unchanged.</p>
 */
describe('ExpenseForm — how it was paid', () => {
  it('asks once, offering cash and every transfer, never credit', () => {
    renderForm();

    const options = Array.from(screen.getByLabelText(/paid by/i).querySelectorAll('option'))
      .map((option) => option.textContent);

    expect(options).toEqual(['Choose…', 'Cash (from the till)', 'Bank transfer', 'JazzCash', 'EasyPaisa', 'Raast']);
    expect(screen.queryByLabelText(/paid from/i)).not.toBeInTheDocument();
  });

  it('starts unanswered rather than guessing at the till', () => {
    renderForm();

    // Defaulting to cash would quietly put every transfer into the drawer calculation.
    expect(screen.getByLabelText(/paid by/i)).toHaveValue('');
  });

  it('refuses to save until it is answered', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '300' } });
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByText(/say how this was paid/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks nothing more for cash — it came from the till', async () => {
    renderForm();

    await choosePaidBy('Cash');

    expect(screen.queryByLabelText(/from account/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/transaction id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/proof/i)).not.toBeInTheDocument();
  });

  it('offers only the accounts that could have carried the payment', async () => {
    renderForm();

    await choosePaidBy('JazzCash');

    const offered = Array.from(screen.getByLabelText(/from account/i).querySelectorAll('option'))
      .map((option) => option.textContent);

    // A JazzCash payment did not leave HBL; a hidden account takes no new payments.
    expect(offered).toEqual(['Not recorded', 'JazzCash Shop · 0300 7194095']);
  });

  it('sends the account, the reference and the screenshot for a transfer', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    const screenshot = new File(['png'], 'transfer.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25000' } });
    await choosePaidBy('BankTransfer');
    await user.selectOptions(screen.getByLabelText(/from account/i), '10');
    await user.type(screen.getByLabelText(/transaction id/i), 'FT26273');
    await user.upload(screen.getByLabelText(/proof/i), screenshot);
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'BankTransfer',
          shopAccountId: 10,
          transactionId: 'FT26273',
          proofFile: screenshot,
        }),
      ),
    );
  });

  it('says so when the expense saved but its proof did not', async () => {
    const user = userEvent.setup();
    renderForm(vi.fn().mockResolvedValue('proof-failed'));

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    await choosePaidBy('EasyPaisa');
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    // Never "failed": the expense exists. The proof can be attached from the list.
    expect(await screen.findByRole('status')).toHaveTextContent(/expense saved.*proof could not be attached/i);
  });
});
