import { formatPkr } from '@/lib/money';
import { PAYMENT_METHODS } from '@/features/pos/posApi';
import type { MyPayments } from './myDayApi';

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;
}

/**
 * Cash and online, side by side, then each online method on its own — so a salesman sees at a
 * glance which money is in his pocket and which went straight into an account.
 */
export function MyPaymentsCard({ payments, periodLabel }: { payments: MyPayments; periodLabel: string }) {
  return (
    <section className="my-payments" aria-labelledby="my-payments-heading">
      <h3 id="my-payments-heading">How I was paid · {periodLabel}</h3>

      <div className="my-payments__split">
        <div className="my-payments__box my-payments__box--cash">
          <span>Cash</span>
          <strong data-testid="my-cash-received">{formatPkr(payments.cashReceived)}</strong>
          <small>
            {payments.cashBills} {payments.cashBills === 1 ? 'bill' : 'bills'} · in hand
          </small>
        </div>
        <div className="my-payments__box my-payments__box--online">
          <span>Online</span>
          <strong data-testid="my-online-received">{formatPkr(payments.onlineReceived)}</strong>
          <small>
            {payments.onlineBills} {payments.onlineBills === 1 ? 'bill' : 'bills'} · straight to an account
          </small>
        </div>
      </div>

      {payments.online.length > 0 && (
        <ul className="my-payments__methods" data-testid="my-online-methods">
          {payments.online.map((row) => (
            <li key={row.method}>
              <span>
                {methodLabel(row.method)} <small>· {row.bills} {row.bills === 1 ? 'bill' : 'bills'}</small>
              </span>
              <b>{formatPkr(row.received)}</b>
            </li>
          ))}
        </ul>
      )}

      <small className="field__hint">What came in at the sale. Full udhaar is not a payment and is not counted here.</small>
    </section>
  );
}
