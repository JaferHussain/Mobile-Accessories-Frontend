import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { ApiError } from '@/types/api';

/** T141 — expense entry. These figures feed net profit, so the date matters (FR-030). */

const categories = [
  { id: 1, name: 'Rent' },
  { id: 2, name: 'Electricity' },
];

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<ExpenseForm categories={categories} onSubmit={onSubmit} />);
  return onSubmit;
}

describe('ExpenseForm', () => {
  it('lists the categories', () => {
    renderForm();

    const options = Array.from(
      screen.getByLabelText('Category').querySelectorAll('option'),
    ).map((option) => option.textContent);

    expect(options).toEqual(['Rent', 'Electricity']);
  });

  it('defaults the date to today', () => {
    renderForm();

    expect(screen.getByLabelText('Date')).toHaveValue(new Date().toISOString().slice(0, 10));
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

  it('submits the expense', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.selectOptions(screen.getByLabelText('Category'), '2');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-09' } });
    await user.type(screen.getByLabelText('Note'), 'September bill');
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        categoryId: 2,
        amount: 12000,
        expenseDate: '2026-09-09',
        note: 'September bill',
      }),
    );
  });

  it('sends null rather than an empty note', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ note: null })),
    );
  });

  it('confirms and clears the amount after saving', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
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
    await user.click(screen.getByRole('button', { name: /save expense/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found/i);
  });
});
