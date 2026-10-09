import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { formatPkr } from '@/lib/money';
import { useAuth } from '@/features/auth/AuthContext';
import { commissionApi } from '@/features/commission/commissionApi';
import { salesmanCashApi } from '@/features/salesmanCash/salesmanCashApi';
import { salesmanStockApi } from '@/features/salesmanStock/salesmanStockApi';
import { formatTime } from '@/features/team/TeamPage';
import { KIND_LABELS, detailsFor } from '@/features/team/TeamMemberPage';
import { recoveryApi } from '@/features/recovery/recoveryApi';
import { myDayApi } from './myDayApi';
import { shopMonthStart, shopToday } from '@/lib/shopDay';

type Period = 'today' | 'month';

/**
 * The salesman's own screen, made for his phone: what he sold, the cash he is carrying, and the
 * commission he has earned.
 *
 * <p>Always his own figures — the server answers for the signed-in person and takes no user id.
 * Cash and commission belong to the market salesman only. The counter shopkeeper sees his sales,
 * what he took back and the discounts he gave, and who owes the shop so he can chase them. No
 * cost and no profit reaches this screen. Every figure is the server's; nothing is worked out
 * here.</p>
 */
export function MyDayPage() {
  const { user } = useAuth();
  const inField = user?.job === 'FieldSales';
  const [period, setPeriod] = useState<Period>('today');

  const today = shopToday();
  const from = period === 'month' ? shopMonthStart() : today;

  const day = useQuery({
    queryKey: ['my-day', from, today],
    queryFn: () => myDayApi.mine(from, today),
  });

  // All-time, not the period: cash is what he holds now, commission what he is owed now.
  const cash = useQuery({ queryKey: ['my-cash'], queryFn: () => salesmanCashApi.mine(), enabled: inField });
  const commission = useQuery({ queryKey: ['my-commission'], queryFn: () => commissionApi.mine(), enabled: inField });
  const stock = useQuery({ queryKey: ['my-stock'], queryFn: () => salesmanStockApi.mine(), enabled: inField });

  // The counter chases money: who owes, most overdue first. The salesman has his own round.
  const owing = useQuery({ queryKey: ['recovery'], queryFn: () => recoveryApi.report(), enabled: !inField });

  const card = day.data?.card;

  return (
    <section className="my-day">
      <header className="page-header">
        <h2>My day{user ? ` — ${user.fullName}` : ''}</h2>
      </header>

      <div className="view-toggle" role="group" aria-label="Period">
        <button type="button" aria-pressed={period === 'today'} onClick={() => setPeriod('today')}>
          Today
        </button>
        <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>
          This month
        </button>
      </div>

      <div className="team-grid">
        <QueryState isLoading={day.isPending} error={day.error}>
          {card && (
            <section className="team-card" aria-labelledby="my-sales-heading">
              <header>
                <h3 id="my-sales-heading">My sales</h3>
                <span className="team-card__job">{period === 'today' ? 'Today' : 'This month'}</span>
              </header>
              <dl>
                <dt>Sales</dt>
                <dd data-testid="my-sales">{formatPkr(card.totalSales)}</dd>

                <dt>Bills</dt>
                <dd data-testid="my-bills">{card.invoiceCount}</dd>

                <dt>Received at sale</dt>
                <dd>{formatPkr(card.receivedAtSale)}</dd>

                <dt>Udhaar given</dt>
                <dd data-testid="my-udhaar-given">{formatPkr(card.creditGiven)}</dd>

                <dt>Udhaar collected</dt>
                <dd data-testid="my-udhaar-collected">{formatPkr(card.udhaarCollected)}</dd>

                <dt>Discounts given</dt>
                <dd data-testid="my-discounts">{formatPkr(card.discountGiven)}</dd>

                <dt>Returns</dt>
                <dd>
                  {card.returnCount} · {formatPkr(card.returnValue)}
                </dd>
              </dl>
            </section>
          )}
        </QueryState>

        {inField && (
          <section className="team-card" aria-labelledby="my-cash-heading">
            <header>
              <h3 id="my-cash-heading">My cash</h3>
              <span className="team-card__job">To hand over</span>
            </header>
            <QueryState isLoading={cash.isPending} error={cash.error}>
              {cash.data && (
                <dl>
                  <dt>With me now</dt>
                  <dd data-testid="my-cash-in-hand" className="my-day__big">
                    {formatPkr(cash.data.inHand)}
                  </dd>

                  <dt>Collected</dt>
                  <dd>{formatPkr(cash.data.collected)}</dd>

                  <dt>Refunded</dt>
                  <dd>{formatPkr(cash.data.refunded)}</dd>

                  <dt>Handed over</dt>
                  <dd data-testid="my-handed-over">{formatPkr(cash.data.handedOver)}</dd>
                </dl>
              )}
            </QueryState>
          </section>
        )}

        {inField && (
          <section className="team-card" aria-labelledby="my-commission-heading">
            <header>
              <h3 id="my-commission-heading">My commission</h3>
              <span className="team-card__job">Half above the shop price</span>
            </header>
            <QueryState isLoading={commission.isPending} error={commission.error}>
              {commission.data && (
                <dl>
                  <dt>Owed to me</dt>
                  <dd data-testid="my-owed" className="my-day__big">
                    {formatPkr(commission.data.owed)}
                  </dd>

                  <dt>Earned</dt>
                  <dd data-testid="my-earned">{formatPkr(commission.data.earned)}</dd>

                  <dt>Waiting for udhaar</dt>
                  <dd data-testid="my-pending">{formatPkr(commission.data.pending)}</dd>

                  <dt>Paid to me</dt>
                  <dd>{formatPkr(commission.data.paidOut)}</dd>
                </dl>
              )}
            </QueryState>
          </section>
        )}
      </div>

      {inField && (
        <section className="my-day__stock" aria-labelledby="my-stock-heading">
          <h3 id="my-stock-heading">My stock</h3>
          <QueryState isLoading={stock.isPending} error={stock.error}>
            {stock.data && stock.data.items.length === 0 && (
              <p className="empty-state">You are carrying nothing. The owner issues stock to you before you go out.</p>
            )}
            {stock.data && stock.data.items.length > 0 && (
              <table className="data-table">
                <caption className="visually-hidden">Stock I am carrying</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">With me</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.data.items.map((item) => (
                    <tr key={item.productId}>
                      <td>{item.productName}</td>
                      <td className="numeric">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </QueryState>
        </section>
      )}

      {!inField && (
        <section className="my-day__chase" aria-labelledby="my-chase-heading">
          <h3 id="my-chase-heading">Customers to chase</h3>
          <QueryState
            isLoading={owing.isPending}
            error={owing.error}
            isEmpty={owing.data?.accounts.length === 0}
            emptyMessage="Nobody owes the shop anything."
          >
            <ul className="lens-timeline" data-testid="my-chase">
              {owing.data?.accounts.slice(0, 5).map((account) => (
                <li key={account.customerId}>
                  <span>
                    {account.name}
                    {account.monthsOverdue > 0 && (
                      <small> · {account.monthsOverdue} month{account.monthsOverdue === 1 ? '' : 's'} overdue</small>
                    )}
                  </span>
                  <span />
                  <span className="numeric">{formatPkr(account.outstanding)}</span>
                </li>
              ))}
            </ul>
            <Link to="/recovery">Open Recovery →</Link>
          </QueryState>
        </section>
      )}

      <h3 id="what-i-did">What I did</h3>

      {day.data && day.data.activity.length === 0 && (
        <p className="empty-state">Nothing recorded yet{period === 'today' ? ' today' : ' this month'}.</p>
      )}

      {day.data && day.data.activity.length > 0 && (
        <ol className="timeline" aria-labelledby="what-i-did">
          {day.data.activity.map((row) => (
            <li key={`${row.kind}-${row.referenceId}`} className={`timeline__item timeline__item--${row.kind}`}>
              <time dateTime={row.entryDateUtc}>{formatTime(row.entryDateUtc)}</time>
              <strong>{KIND_LABELS[row.kind]}</strong>
              {row.reference && <span>{row.reference}</span>}
              {row.amount !== null && <span className="numeric">{formatPkr(row.amount)}</span>}
              {detailsFor(row) && <small>{detailsFor(row)}</small>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
