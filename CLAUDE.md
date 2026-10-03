# Working in this repository

The counter app for **Moiz Mobile & Corporation, Danwran Lodhran** — React 18, TypeScript, Vite.
Two users: the owner (Admin) and a salesman (Staff).

**The authority for the whole system is the backend repository's `CLAUDE.md`** (cloned beside this
one as `../backend`), along with its `specs/` and `docs/`. The server owns every business rule —
prices, totals, credit authority, due dates, what a message says. This file holds what matters
when changing the screens, and the traps that were hit here.

## Commands

```bash
npm install
npm run dev                             # http://localhost:5173, /api proxied to :5080
npm run test && npx tsc --noEmit        # both must pass before anything is merged
cd ../backend && dotnet test            # and so must the backend
```

## Never re-derive what the server decides

- **The server recomputes all totals** and discards the client's. The screen may show a running
  total, but a figure the server returns always wins.
- **Return amounts come from the server** (`ReturnableSaleLine`: `refundPerUnit`, `maxRefund`…).
  Never work out a refund in TypeScript — two derivations of one rule drift, and the screen would
  promise money the server does not pay.
- **Due dates and reminder wording come from the server** (`GET /api/customers/{id}/reminder`).
  The screen only formats `dueOn` for display, reading the `yyyy-mm-dd` parts rather than through
  `Date`, which would place it at UTC midnight and could show the day before.
- **Staff never receive cost, profit or `wholesalePrice`.** Don't add a field to a Staff screen
  expecting it to arrive.

## The counter

- **The cart lives above the router** (`CartProvider`), so walking to Products and back keeps the
  sale. `useCart()` falls back to local state with no provider — deliberate, so `PosScreen` stays
  testable on its own. Do not make the provider mandatory.
- **Persistence is `sessionStorage` with a same-trading-day expiry**, never `localStorage`.
- **A restored cart is re-priced before it can be sold** (`needsReprice`). The server takes the
  unit price from the client, so a stale price would sell at the old figure.
- **Adding from the Products list re-reads the price** with the sale's `saleType`. If it cannot be
  read, the item is not added.
- **One product is one cart line** — the merge rule is `withItem` in the cart store.
- **A typed search offers candidates; it never adds one.** A scanned barcode still adds directly.
  `ProductLookup` is a discriminated union so the two cannot be collapsed back together. The
  button says **Search**, not Add.
- **A one-letter search is refused by the server (400).** `PosPage` treats `VALIDATION_FAILED`
  from search as "no product found"; `ProductsPage` shows a hint and does not send it.
- **Checkout** (`CheckoutModal`): Walk-in / Existing / New customer. Udhaar and part payment
  require a customer. `amountPaid` is derived, never typed twice. Account number and transaction
  ID appear only for a transfer method. Keep **Raast** in `PAYMENT_METHODS`. `handleConfirm`
  re-throws so a refused sale keeps the modal open with the cart intact.
- **Saving clears the cart but keeps the receipt**, until **New sale** is pressed.

## Handing a customer their bill

- **Share** (`ShareButtons`) and **Send reminder** (`ReminderButtons`) both use `SendMenu`: one
  button, then "Please select an option…" with WhatsApp and SMS. Both routes are deep links the
  server prepares — nothing is sent by the shop.
- **Style buttons by class, never by position.** Share sits in its own wrapper, so a rule like
  `.share-buttons button:last-of-type` lands on Download PDF. A test reads `index.css` and fails
  if one returns.
- **PDFs use `fetchBlob`, never `unwrap`** — they have no envelope. The PDF routes are
  `/invoices/{id}/pdf` and `/customer-payments/{id}/pdf`, flat under `/api`. The backend's
  `ClientDocumentRouteTests` holds these exact strings.
- **A walk-in types a number for one send**; a typed number never overrides a stored one.

## Transaction proofs

- **One control everywhere:** `ProofAttachment` (Attach proof / View proof / Replace), on the
  customer ledger, supplier ledger, Invoices dialog, sale return history, expenses list and the
  **Proof missing** page (Money, Admin only). Shown only when `needsProof(method)` — the four
  transfer methods; never Cash, Credit or Partial.
- **A Proof column appears only when some row needs it**, so a cash-only register looks as it did.
- **Refunded by** (sale return) and **Paid by** (bank expense) start unanswered, like Paid from:
  a default would put transfer money into the day-close drawer count.
- **View opens a blob, never a URL to the file** — proofs are only reachable through the signed-in
  `/api/proofs/{kind}/{id}` route.

## Shop accounts and expenses

- **`accountsFor(accounts, method)`** keeps impossible accounts out of every "From account"
  dropdown (a JazzCash payment is offered JazzCash accounts only; hidden ones never). The server
  checks regardless — this is only so the list never offers a wrong choice.
- **The expense form asks one question, "Paid by"**, starting unanswered. The transfer details
  (account, transaction ID, proof) appear only for a non-cash answer. The page saves the expense,
  then attaches the proof; `ExpenseSaveOutcome` tells the form whether the proof made it.
- **View proof opens a popup on the same page** (`ProofAttachment`), never a new tab — the image is
  loaded only when asked for.

## The team

- **Team** (beside Dashboard, Admin only): a card per person and the watch list for the chosen
  days; each card opens that person's activity timeline (`/team/:userId`). Every figure is the
  server's.
- **People** (Admin): a member of staff has a **job** — Counter (shopkeeper) or Field sales
  (salesman). The owner has none. Changing a job is a dropdown in the list.
- **Test timing:** `tests/setup.ts` sets `asyncUtilTimeout: 4000` and `vite.config.ts` sets
  `testTimeout: 15_000`. Typing-heavy tests pass in well under a second alone but failed at random
  under full-suite load with the 1 s / 5 s defaults. More time changes no assertion.

## Commission

- **Commission** (`/commissions/:userId`, Admin): earned / waiting for udhaar / paid / owed, each
  product line with the owner's price and the price it fetched, payouts, and Pay commission (the
  amount starts at what is owed; how it was paid starts unanswered). Reached from a field
  salesman's Team card. Every figure is the server's — never recompute commission in TypeScript.

## The salesman in the market

- **Checkout** takes `udhaarCustomersOnly` (PosPage passes it for `user.job === 'FieldSales'`):
  Udhaar and Part payment are offered only once one of the owner's **udhaar customers** is chosen
  under Existing customer, which the pick list marks. Choosing another customer closes it again and
  drops a Credit/Partial choice back to Cash. The server refuses anything else regardless.
- **Udhaar customer** tick-box (`UdhaarCustomerToggle`) on a customer's page, owner only; the list
  says "udhaar customer" beside the type. The update endpoint replaces contact details too, so
  `setCreditAllowed` sends them back as they stand.
- **Cash with him** (`/salesman-cash/:userId`, Admin): collected / refunded / handed over / with him
  now, every movement, and **Received from salesman** — amount starts at what he holds, "Received
  as" starts unanswered (cash joins the drawer, a transfer does not). Reached from his Team card.
- **Day close** shows "Cash received from salesmen" as money into the drawer.
- **Stock with him** (`/salesman-stock/:userId`, Admin, from the Team card's **Stock →**): what he
  carries, a "Brought back" quantity per line with **Take back into the shop**, **Issue stock** (find
  a product, Add, set how many, note), and every movement. My day shows **My stock**. Issued goods
  are still the shop's — the server refuses the counter selling them and the salesman selling what
  he was not issued; the screens only word the refusal.
- **My day** (`/my-day`, first in the rail for `job === 'FieldSales'` only — `fieldSalesOnly` on the
  nav item): My sales for Today / This month, and for the field salesman My cash and My commission
  (all-time — what he holds and is owed now), then what he did. Phone-first: one column under
  640px. Built on `/my-day`, `/salesman-cash/me` and `/commissions/me`; the latter two are never
  requested for the counter shopkeeper. The counter's rail is unchanged, and `/` still lands on the
  counter for everyone.

## Stock figures — each person reads what they can sell from

`StockCount` (components) words the server's figures, and `sellableQuantity` picks the number that
decides "Add to cart": the salesman sees **"3 with you"**, the counter **"6 in shop · +4 with
salesman"**, the owner's catalogue (`owned`) **"10 owned · 6 in shop · 4 with salesman"**. Used on
the New sale cards, the Products table, grid and detail. Purchases, reports and the dashboard keep
the owned total on purpose — a purchase re-costs every owned unit, and reports count what the shop
owns.

## Traps

| Trap | What happens | Guard |
|---|---|---|
| Posting `FormData` through the API client | The client forces `Content-Type: application/json`; the upload loses its boundary and the server answers 415 | The request interceptor deletes that header when the body is `FormData` |
| An error from a Blob request | A failed PDF reports a generic "unexpected error" while the server's reason sits unread inside the Blob | The response interceptor reads the error body back out of the Blob |
| Adding a route without a rail icon | Icons live in `index.css` keyed on `href`; a new module ships looking unfinished | `AppShell.test.tsx` fails naming any link with no `::before` rule |
| "Tidying" the rail groups | **Sell** = New sale + Sale return; **Purchasing** = Purchases, Suppliers, Supplier ledger, Purchase return (Admin-only). The owner split the old Returns screen so each return sits with the trade it reverses. For Staff, **Inventory** holds only Products — deliberate | `AppShell` tests pin the groups; `/returns` redirects to `/sale-returns` |
| Rendering a full-size product image in a list | Invisible locally; stalls the Products grid over the shop's connection | `ProductPicture` loads the thumbnail unless passed `size="full"` (only `ProductDetail`) |
| Re-adding the "local brand" UI | Removed at the owner's request; a brand is just a name | Three tests pin its absence — ask before touching |
| A date from `toISOString().slice(0, 10)` or the device's local date | The UTC date is still yesterday until 5 a.m. in the shop; mixing it with a local date made the Reports range run BACKWARDS on the 1st of every month (from the 1st to the 30th) and show nothing, and dated early-morning expenses a day early | `shopToday()` / `shopMonthStart()` in `lib/shopDay.ts` — Asia/Karachi, one clock. `shopDay.test.ts` pins the 1 a.m. case |
| Putting a price or quantity on the product form | Two places to price an item; they disagree the first time the wrong one is used | Prices are set by a purchase only |
