import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
  /** Only the salesman in the market — his own sales, cash and commission. */
  fieldSalesOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];

  /**
   * Opens on arrival regardless of which screen you are on.
   *
   * For the group a salesman works out of all day. A collapsed group costs a click every time,
   * and for the counter that is dozens of interruptions a day.
   */
  openByDefault?: boolean;
}

/** The owner's overview. Everything else belongs to a group. */
const TOP_LEVEL: NavItem[] = [
  // The salesman's own screen, first in his rail: he opens it on his phone between shops.
  { to: '/my-day', label: 'My day', fieldSalesOnly: true },
  { to: '/dashboard', label: 'Dashboard', adminOnly: true },
  // Beside the Dashboard: the shop's figures, then the people behind them.
  { to: '/team', label: 'Team', adminOnly: true },
];

/**
 * Everything else, grouped by the question being asked rather than by how the software is built.
 *
 * Fourteen flat entries made the rail a list to be read rather than scanned. Grouping trades one
 * click on the occasional screens for a menu where the daily ones are obvious.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    // Just the counter now. The catalogue moved to Purchasing at the owner's request — a product,
    // its category and its brand are all things you set up when goods come IN.
    //
    // Open by default — this is where the day is spent, and a click before every sale is the one
    // cost grouping must not introduce.
    label: 'Sell',
    openByDefault: true,
    items: [
      { to: '/pos', label: 'New sale' },
      // Its other half, at the owner's request: goods come back over the same counter they left
      // by. Open to Staff — a salesman takes sale returns.
      { to: '/sale-returns', label: 'Sale return' },
    ],
  },
  {
    // What happened at the counter: a bill to reproduce, who owes what, something coming back.
    label: 'Customers & bills',
    items: [
      { to: '/invoices', label: 'Invoices' },
      { to: '/customers', label: 'Customers' },
      // Everyone who owes, most overdue first — open to staff, who take payments too.
      { to: '/recovery', label: 'Recovery' },
      // The only people sold to on full udhaar — registered with phone and ID card by the owner.
      { to: '/udhaar-customers', label: 'Udhaar customers', adminOnly: true },
    ],
  },
  {
    // What the shop stocks, and how it is described. Products is the list itself; a category and
    // a brand are the two labels every product must carry.
    //
    // Its own heading rather than a corner of Purchasing: the catalogue is maintained whether or
    // not anything is being bought today, and Products is the one screen here a salesman opens —
    // "Inventory" says why it is there in a way "Purchasing" did not.
    label: 'Inventory',
    items: [
      { to: '/products', label: 'Products' },
      // Set up once and edited rarely, but they describe every product filed under them.
      { to: '/categories', label: 'Categories', adminOnly: true },
      { to: '/brands', label: 'Brands', adminOnly: true },
    ],
  },
  {
    // Restocking: what came in, and who it came from. Both reveal cost, so both are Admin-only —
    // which means this heading does not render at all for a salesman.
    label: 'Purchasing',
    items: [
      { to: '/purchases', label: 'Purchases', adminOnly: true },
      { to: '/suppliers', label: 'Suppliers', adminOnly: true },
      // The history behind "You owe": every purchase, return and payment with a running balance.
      { to: '/supplier-ledger', label: 'Supplier ledger', adminOnly: true },
      // Goods going back to whoever supplied them. Admin-only: it shows purchase cost and the
      // supplier's payable balance, and the server refuses Staff regardless.
      { to: '/purchase-returns', label: 'Purchase return', adminOnly: true },
    ],
  },
  {
    // The owner's reading: what went out, what was made, and whether the drawer agrees.
    label: 'Money',
    items: [
      { to: '/expenses', label: 'Expenses', adminOnly: true },
      { to: '/reports', label: 'Reports', adminOnly: true },
      { to: '/day-close', label: 'Day close', adminOnly: true },
      // Every non-cash transaction still waiting for its screenshot — the owner's daily chase.
      { to: '/proofs-missing', label: 'Proof missing', adminOnly: true },
    ],
  },
  {
    // The system itself: users, backups, the things that are not the shop's trade.
    label: 'Settings',
    items: [
      // The shop's own bank and wallet accounts, set up once so payments pick from a list.
      { to: '/shop-accounts', label: 'Shop accounts', adminOnly: true },
      { to: '/admin', label: 'Admin', adminOnly: true },
    ],
  },
];

/**
 * Navigation shell.
 *
 * <p>Hiding admin links is a convenience, not a control — a Staff user who typed the URL would
 * still be refused by the server (FR-040). A group whose every item is hidden does not render at
 * all, so a salesman sees no empty headings for work that is not theirs.</p>
 */
export function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const { pathname } = useLocation();

  const inField = user?.job === 'FieldSales';
  const visible = (items: NavItem[]) =>
    items.filter((item) => (!item.adminOnly || isAdmin) && (!item.fieldSalesOnly || inField));

  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: visible(group.items) }))
    .filter((group) => group.items.length > 0);

  // The group holding the current screen starts open; the rest start closed. Opening on arrival
  // means the rail always shows where you are, without remembering anything across a reload.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAV_GROUPS.map((group) => [
        group.label,
        group.openByDefault === true || group.items.some((item) => pathname.startsWith(item.to)),
      ]),
    ),
  );

  const toggle = (label: string) =>
    setOpen((current) => ({ ...current, [label]: !current[label] }));

  // A group opened near the bottom of the rail (Settings, usually) would unfold below the fold.
  // Bring the whole group into view once it has rendered — `nearest` leaves it alone when it
  // already fits, so opening a group at the top never jolts the rail.
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [justOpened, setJustOpened] = useState<string | null>(null);

  useEffect(() => {
    if (justOpened) {
      groupRefs.current[justOpened]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      setJustOpened(null);
    }
  }, [justOpened]);

  return (
    <div className="shell">
      <header className="shell__header">
        <div>
          <strong>Moiz Mobile &amp; Corporation</strong>
          <span className="shell__location">Danwran Lodhran</span>
        </div>

        <div className="shell__user">
          <span>
            {user?.fullName} ({user?.role})
          </span>
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="shell__nav" aria-label="Main">
        {visible(TOP_LEVEL).map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}

        {groups.map((group) => (
          <div
            key={group.label}
            className="shell__group"
            ref={(element) => {
              groupRefs.current[group.label] = element;
            }}
          >
            <button
              type="button"
              className="shell__group-toggle"
              aria-expanded={open[group.label] ?? false}
              onClick={() => {
                if (!open[group.label]) {
                  setJustOpened(group.label);
                }
                toggle(group.label);
              }}
            >
              {group.label}
            </button>

            {open[group.label] && (
              <div className="shell__group-items">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
