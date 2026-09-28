import { useState } from 'react';
import { ApiError } from '@/types/api';
import { SendMenu } from '@/features/documents/SendMenu';
import type { PaymentReminder } from './customerApi';

export interface ReminderButtonsProps {
  customerId: number;

  /** The customer's number as stored. Absent means there is nowhere to send a reminder. */
  customerMobile?: string | null;

  onCreateReminder: (customerId: number) => Promise<PaymentReminder>;

  /** Injected so tests do not navigate the jsdom window. */
  openUrl?: (url: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-11-01" → "01 Nov 2026", the way the message itself words it. Read from the parts rather
 * than through `Date`, which would place a calendar date at UTC midnight and could show the day
 * before.
 */
function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');

  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

function lateness(monthsOverdue: number): string {
  if (monthsOverdue <= 0) {
    return '';
  }

  return monthsOverdue === 1 ? ' — 1 month overdue' : ` — ${monthsOverdue} months overdue`;
}

/**
 * Reminding a customer of what they owe.
 *
 * <p>Like a receipt, both routes are deep links: the shopkeeper's own WhatsApp or SMS app opens
 * with the message ready, and they tap Send. The server decides the amount and the due date —
 * one month after the oldest purchase still unpaid — so the screen never works out a date the
 * message would then contradict.</p>
 */
export function ReminderButtons({
  customerId,
  customerMobile,
  onCreateReminder,
  openUrl = (url) => window.open(url, '_blank', 'noopener'),
}: ReminderButtonsProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<PaymentReminder | null>(null);
  const [isChoosing, setIsChoosing] = useState(false);

  const canSend = (customerMobile?.trim() ?? '').length > 0;

  async function send(channel: 'whatsapp' | 'sms') {
    setError(null);
    setIsWorking(true);

    try {
      const reminder = await onCreateReminder(customerId);
      const url = channel === 'whatsapp' ? reminder.whatsAppUrl : reminder.smsUrl;

      if (!url) {
        setError('That mobile number could not be used. Check it and try again.');
        return;
      }

      setSent(reminder);
      openUrl(url);
      setIsChoosing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not prepare the reminder. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="reminder-buttons">
      <SendMenu
        label="Send reminder"
        kind="remind"
        prompt="Please select an option to send the reminder."
        isOpen={isChoosing}
        onOpenChange={setIsChoosing}
        disabled={isWorking}
      >
        <div className="send-menu__options">
          <button
            type="button"
            className="send-menu__whatsapp"
            onClick={() => void send('whatsapp')}
            disabled={isWorking || !canSend}
            title={canSend ? undefined : 'No mobile number to send to'}
          >
            Remind on WhatsApp
          </button>

          <button
            type="button"
            className="send-menu__sms"
            onClick={() => void send('sms')}
            disabled={isWorking || !canSend}
            title={canSend ? undefined : 'No mobile number to send to'}
          >
            Remind by SMS
          </button>
        </div>

        {!canSend && (
          <span className="share-buttons__hint">
            Add a mobile number to this customer to send a reminder.
          </span>
        )}
      </SendMenu>

      {sent && (
        <small className="reminder-buttons__note" data-testid="reminder-due">
          Due {formatDay(sent.dueOn)}
          {lateness(sent.monthsOverdue)}
        </small>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
