import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dayCloseApi, type DayClosing } from './dayCloseApi';
import { QueryState } from '@/components/QueryState';
import { formatPkr, roundMoney } from '@/lib/money';
import { ApiError } from '@/types/api';

/**
 * Counting the drawer at the end of a trading day.
 *
 * <p><b>Only two figures are the shopkeeper's to type</b> — what they counted, and the float they
 * started with. Every other line is computed by the server from what was recorded, because a
 * figure you can type over is a figure you can fudge, and this screen exists precisely to be hard
 * to argue with.</p>
 *
 * <p>The difference is stated in words as well as rupees. "Rs 200.00" alone leaves the reader
 * working out which way it went, and a short and a surplus mean very different things.</p>
 */

/** Today, as the shop reckons it — the day a closing names. */
function shopToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

function Line({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="numeric" data-testid={testId}>
        {formatPkr(value)}
      </dd>
    </>
  );
}

export function DayClosePage() {
  const queryClient = useQueryClient();

  const [date, setDate] = useState(shopToday);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const day = useQuery({
    queryKey: ['day-closing', date, openingFloat],
    queryFn: () => dayCloseApi.preview(date, openingFloat),
  });

  const history = useQuery({
    queryKey: ['day-closings'],
    queryFn: () => dayCloseApi.recent(),
  });

  const close = useMutation({
    mutationFn: () =>
      dayCloseApi.close({
        closingDate: date,
        openingFloat,
        countedCash: roundMoney(Number(counted) || 0),
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      setError(null);
      setCounted('');
      setNote('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['day-closing'] }),
        queryClient.invalidateQueries({ queryKey: ['day-closings'] }),
      ]);
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not close the day.'),
  });

  const closing: DayClosing | undefined = day.data;
  const isClosed = closing?.isClosed ?? false;

  // While the day is open the difference follows what is being counted, so the shopkeeper sees it
  // move as they work through the notes. Once closed it is whatever was recorded.
  const countedValue = isClosed ? (closing?.countedCash ?? 0) : roundMoney(Number(counted) || 0);
  const difference = isClosed
    ? (closing?.difference ?? 0)
    : roundMoney(countedValue - (closing?.expectedCash ?? 0));

  const hasCounted = isClosed || counted.trim().length > 0;

  return (
    <section>
      <header className="page-header">
        <h2>Day close</h2>
      </header>

      <div className="filters">
        <div className="field">
          <label htmlFor="closingDate">Day</label>
          <input
            id="closingDate"
            type="date"
            value={date}
            max={shopToday()}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="openingFloat">Opening float</label>
          <input
            id="openingFloat"
            type="number"
            min="0"
            step="0.01"
            disabled={isClosed}
            value={String(openingFloat)}
            onChange={(event) => setOpeningFloat(Number(event.target.value))}
          />
        </div>
      </div>

      <QueryState isLoading={day.isPending} error={day.error}>
        {closing && (
          <>
            <dl className="day-close">
              <Line label="Opening float" value={closing.openingFloat} testId="opening-float" />
              <Line label="Cash sales" value={closing.cashSales} testId="cash-sales" />
              <Line label="Cash received against udhaar" value={closing.cashRecovery} testId="cash-recovery" />
              <Line label="Cash refunded on returns" value={-closing.cashRefunds} testId="cash-refunds" />
              <Line label="Cash paid out (expenses)" value={-closing.cashPaidOut} testId="cash-paid-out" />
              <Line
                label="Paid to suppliers in cash"
                value={-closing.cashToSuppliers}
                testId="cash-to-suppliers"
              />

              <dt className="day-close__total">Expected in drawer</dt>
              <dd className="numeric day-close__total" data-testid="expected-cash">
                {formatPkr(closing.expectedCash)}
              </dd>
            </dl>

            {isClosed ? (
              <dl className="day-close">
                <Line label="Counted in drawer" value={closing.countedCash} testId="counted-cash" />
              </dl>
            ) : (
              <div className="field">
                <label htmlFor="countedCash">Counted in drawer</label>
                <input
                  id="countedCash"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                />
              </div>
            )}

            {hasCounted && (
              <p
                className={`day-close__difference${difference === 0 ? '' : ' day-close__difference--off'}`}
                data-testid="difference"
              >
                {difference === 0
                  ? 'The drawer balances.'
                  : difference < 0
                    ? `Short by ${formatPkr(Math.abs(difference))}.`
                    : `Over by ${formatPkr(difference)} — usually a sale that went unrecorded.`}
              </p>
            )}

            {isClosed ? (
              <p className="day-close__closed">
                Closed by {closing.closedByUserName}
                {closing.closedAtUtc &&
                  ` on ${new Date(closing.closedAtUtc).toLocaleString('en-PK')}`}
                .
                {closing.note && <span className="day-close__note"> “{closing.note}”</span>}
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="closingNote">Note</label>
                  <input
                    id="closingNote"
                    value={note}
                    placeholder="e.g. Rs 300 to the delivery boy, not entered"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  {/* A difference is shown, never accused. This is where it gets explained. */}
                  <small className="field__hint">
                    Explain a difference here — it is kept with the closing.
                  </small>
                </div>

                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    disabled={!hasCounted || close.isPending}
                    onClick={() => close.mutate()}
                  >
                    {close.isPending ? 'Closing…' : 'Close the day'}
                  </button>
                  {!hasCounted && (
                    <small className="field__hint">Count the drawer first.</small>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </QueryState>

      <h3>Recent closings</h3>

      <QueryState
        isLoading={history.isPending}
        error={history.error}
        isEmpty={history.data?.length === 0}
        emptyMessage="No days closed yet."
      >
        <table className="data-table" data-testid="closing-history">
          <caption className="visually-hidden">Recent day closings</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Expected</th>
              <th scope="col">Counted</th>
              <th scope="col">Difference</th>
              <th scope="col">Closed by</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {history.data?.map((row) => (
              <tr key={row.closingDate}>
                <td>{row.closingDate}</td>
                <td className="numeric">{formatPkr(row.expectedCash)}</td>
                <td className="numeric">{formatPkr(row.countedCash)}</td>
                {/* One short is an accident; three in a week is a pattern, and the pattern is
                    the whole reason this list exists. */}
                <td className={`numeric${row.difference === 0 ? '' : ' day-close__difference--off'}`}>
                  {row.difference === 0 ? '—' : formatPkr(row.difference)}
                </td>
                <td>{row.closedByUserName}</td>
                <td>{row.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}
