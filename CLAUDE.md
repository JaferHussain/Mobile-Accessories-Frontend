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

## Traps

| Trap | What happens | Guard |
|---|---|---|
| Posting `FormData` through the API client | The client forces `Content-Type: application/json`; the upload loses its boundary and the server answers 415 | The request interceptor deletes that header when the body is `FormData` |
| An error from a Blob request | A failed PDF reports a generic "unexpected error" while the server's reason sits unread inside the Blob | The response interceptor reads the error body back out of the Blob |
| Adding a route without a rail icon | Icons live in `index.css` keyed on `href`; a new module ships looking unfinished | `AppShell.test.tsx` fails naming any link with no `::before` rule |
| "Tidying away" one-item rail groups | **Sell** holds only New sale; for Staff, **Inventory** holds only Products — both deliberate | Three `AppShell` tests pin the groups |
| Rendering a full-size product image in a list | Invisible locally; stalls the Products grid over the shop's connection | `ProductPicture` loads the thumbnail unless passed `size="full"` (only `ProductDetail`) |
| Re-adding the "local brand" UI | Removed at the owner's request; a brand is just a name | Three tests pin its absence — ask before touching |
| Putting a price or quantity on the product form | Two places to price an item; they disagree the first time the wrong one is used | Prices are set by a purchase only |
