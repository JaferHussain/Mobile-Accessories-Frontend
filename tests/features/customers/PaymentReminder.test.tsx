import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReminderButtons } from '@/features/customers/ReminderButtons';
import { CustomerLedger } from '@/features/customers/CustomerLedger';
import type { Customer, CustomerSummary, PaymentReminder } from '@/features/customers/customerApi';
import { ApiError } from '@/types/api';

/**
 * Reminding a customer of what they owe, from their register.
 *
 * <p>The server works out the amount and the due date — one month after the oldest purchase still
 * unpaid — and prepares both messages. The screen only opens the one the shopkeeper chose, and
 * says when the debt is due so they know what they are sending before they send it.</p>
 */

const reminder: PaymentReminder = {
  whatsAppUrl: 'https://wa.me/923001234567?text=remind',
  smsUrl: 'sms:+923001234567?body=remind',
  outstanding: 1000,
  unpaidSince: '2026-09-01',
  dueOn: '2026-11-01',
  monthsOverdue: 1,
};

/** The two apps sit behind the one Send reminder button. */
function openReminder() {
  fireEvent.click(screen.getByRole('button', { name: /send reminder/i }));
}

function renderButtons(
  overrides: Partial<Parameters<typeof ReminderButtons>[0]> = {},
  { open = true }: { open?: boolean } = {},
) {
  const onCreateReminder = vi.fn().mockResolvedValue(reminder);
  const openUrl = vi.fn();

  render(
    <ReminderButtons
      customerId={5}
      customerMobile="03001234567"
      onCreateReminder={onCreateReminder}
      openUrl={openUrl}
      {...overrides}
    />,
  );

  if (open) {
    openReminder();
  }

  return { onCreateReminder, openUrl };
}

describe('ReminderButtons', () => {
  it('keeps both apps behind one Send reminder button, and asks which to use', () => {
    renderButtons({}, { open: false });

    expect(screen.queryByRole('button', { name: /remind on whatsapp/i })).not.toBeInTheDocument();

    openReminder();

    expect(screen.getByText('Please select an option to send the reminder.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remind on whatsapp/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /remind by sms/i })).toBeEnabled();
  });

  it('closes once the reminder is on its way', async () => {
    const { openUrl } = renderButtons();

    await userEvent.click(screen.getByRole('button', { name: /remind by sms/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /remind by sms/i })).not.toBeInTheDocument();
  });

  it('opens WhatsApp with the reminder the server prepared', async () => {
    const { onCreateReminder, openUrl } = renderButtons();

    await userEvent.click(screen.getByRole('button', { name: /remind on whatsapp/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(reminder.whatsAppUrl));
    expect(onCreateReminder).toHaveBeenCalledWith(5);
  });

  it('opens SMS with the reminder the server prepared', async () => {
    const { openUrl } = renderButtons();

    await userEvent.click(screen.getByRole('button', { name: /remind by sms/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(reminder.smsUrl));
  });

  it('says when the debt is due and how late it is, once sent', async () => {
    renderButtons();

    await userEvent.click(screen.getByRole('button', { name: /remind on whatsapp/i }));

    expect(await screen.findByText(/due 01 nov 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/1 month overdue/i)).toBeInTheDocument();
  });

  it('cannot remind a customer with no number, and says why', () => {
    renderButtons({ customerMobile: null });

    expect(screen.getByRole('button', { name: /remind on whatsapp/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remind by sms/i })).toBeDisabled();
    expect(screen.getByText(/add a mobile number/i)).toBeInTheDocument();
  });

  it('shows the server’s reason when a reminder is refused', async () => {
    renderButtons({
      onCreateReminder: vi
        .fn()
        .mockRejectedValue(new ApiError('BUSINESS_RULE_VIOLATION', 'Asif owes nothing.', 422)),
    });

    await userEvent.click(screen.getByRole('button', { name: /remind on whatsapp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Asif owes nothing.');
  });
});

describe('CustomerLedger reminders', () => {
  const customer = {
    id: 5,
    name: 'Asif',
    mobileNumber: '03001234567',
    outstandingBalance: 1000,
    isActive: true,
    saleType: 'Retail',
  } as Customer;

  const summary = (totalOutstanding: number): CustomerSummary => ({
    totalPurchased: 1000,
    totalPaid: 1000 - totalOutstanding,
    totalOutstanding,
    invoiceCount: 1,
  });

  it('offers a reminder to a customer who owes money', () => {
    render(
      <CustomerLedger
        customer={customer}
        summary={summary(1000)}
        entries={[]}
        onReceivePayment={vi.fn()}
        onCreateReminder={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /send reminder/i })).toBeInTheDocument();
  });

  it('offers no reminder to a customer who owes nothing', () => {
    render(
      <CustomerLedger
        customer={customer}
        summary={summary(0)}
        entries={[]}
        onReceivePayment={vi.fn()}
        onCreateReminder={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /remind/i })).not.toBeInTheDocument();
  });
});
