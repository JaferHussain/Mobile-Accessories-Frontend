import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AuthProvider } from '@/features/auth/AuthContext';
import { tokenStore } from '@/api/tokenStore';
import type { AuthUser } from '@/types/api';

/**
 * T148 — role-aware navigation.
 *
 * This is a usability layer only. Hiding a link stops a salesman wandering into a screen they
 * cannot use; it is NOT what protects cost and profit. That is enforced server-side on every
 * endpoint, and the backend suite proves it.
 */

const admin: AuthUser = { id: 1, username: 'admin', fullName: 'Shop Owner', role: 'Admin' };
const staff: AuthUser = { id: 2, username: 'salesman', fullName: 'Bilal', role: 'Staff' };
const fieldSalesman: AuthUser = { id: 3, username: 'ali', fullName: 'Ali', role: 'Staff', job: 'FieldSales' };

const ADMIN_ONLY_LINKS = [
  'Purchases', 'Suppliers', 'Supplier ledger', 'Purchase return', 'Categories', 'Brands', 'Expenses', 'Reports',
  'Dashboard', 'Admin', 'Proof missing', 'Shop accounts', 'Team',
];
// Invoices is shared, not Admin-only: handing a customer their own receipt is counter work, and
// the list carries no cost or profit. The server agrees — the endpoint is open to any signed-in
// user, so hiding the link would be a pretence rather than a control.
// Rail order, not alphabetical. "New sale" rather than "Sell": the group is already called Sell,
// and a Sell inside Sell reads as a mistake.
//
// Products comes LAST for a salesman: the catalogue sits under Inventory, the final group they
// can see. It used to sit second, under Sell.
//
// Sale return sits under Sell beside the counter, at the owner's request: taking goods back is
// the other half of selling them. Purchase return went to Purchasing, so a salesman never sees it.
const SHARED_LINKS = ['New sale', 'Sale return', 'Invoices', 'Customers', 'Products'];

/**
 * Opens every collapsed group.
 *
 * <p>The rail nests the occasional screens, so a collapsed group's links are genuinely absent
 * from the DOM — not merely hidden. Every assertion about which links a role can reach has to
 * expand first, or it would be testing what happens to be open rather than what exists.</p>
 */
function expandAllGroups() {
  screen
    .getAllByRole('button', { expanded: false })
    .forEach((toggle) => fireEvent.click(toggle));
}

function renderShell(user: AuthUser) {
  const result = render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/pos" element={<p>POS</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  expandAllGroups();

  return result;
}

describe('AppShell navigation', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  it('shows the shop name', () => {
    renderShell(admin);

    expect(screen.getByText(/Moiz Mobile/)).toBeInTheDocument();
    expect(screen.getByText('Danwran Lodhran')).toBeInTheDocument();
  });

  it('shows the signed-in user and their role', () => {
    renderShell(staff);

    expect(screen.getByText('Bilal (Staff)')).toBeInTheDocument();
  });

  it.each(ADMIN_ONLY_LINKS)('hides the %s link from staff', (label) => {
    renderShell(staff);

    expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
  });

  it.each(ADMIN_ONLY_LINKS)('shows the %s link to an admin', (label) => {
    renderShell(admin);

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it.each(SHARED_LINKS)('shows the %s link to staff', (label) => {
    renderShell(staff);

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('gives staff only the links they can use', () => {
    renderShell(staff);

    const labels = screen
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(labels).toEqual(SHARED_LINKS);
  });

  it('offers a way to sign out', () => {
    renderShell(admin);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders the routed screen inside the shell', () => {
    renderShell(admin);

    expect(screen.getByText('POS')).toBeInTheDocument();
  });
});

/**
 * Every rail item carries an icon.
 *
 * <p>Icons live in CSS rather than markup — adding an element inside each link would change its
 * text content, which the tests above read. The cost of that is a rule keyed on `href` in a file
 * nobody edits when they add a route, so a new module ships looking unfinished beside the rest.
 * That happened twice (Invoices, Day close) before this test existed.</p>
 */
describe('AppShell icons', () => {
  it('gives the salesman in the market his own day first, and nobody else', () => {
    renderShell(fieldSalesman);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['My day', ...SHARED_LINKS]);
  });

  it('gives My day an icon too', () => {
    renderShell(fieldSalesman);
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain(`.shell__nav a[href='/my-day']::before`);
    expect(screen.getByRole('link', { name: 'My day' })).toHaveAttribute('href', '/my-day');
  });

  it('gives every navigation link an icon', () => {
    renderShell(admin);

    // Resolved from the project root: under jsdom, import.meta.url is an http: URL, which
    // readFileSync will not take.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    const missing = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href) => href && !css.includes(`.shell__nav a[href='${href}']::before`));

    expect(missing).toEqual([]);
  });
});

/**
 * Grouping the rail.
 *
 * <p>Fourteen flat entries made it a list to be read rather than scanned. The trade is one click
 * on the occasional screens; the two a salesman lives in stay at the top level, because nesting
 * those would put a click between the counter and the next customer dozens of times a day.</p>
 */
describe('AppShell grouping', () => {
  beforeEach(() => {
    tokenStore.clear();
    window.localStorage.clear();
  });

  /** Renders without the auto-expand the other tests use. */
  function renderCollapsed(user: AuthUser, at = '/pos') {
    render(
      <AuthProvider initialUser={user}>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/pos" element={<p>POS</p>} />
              <Route path="/reports" element={<p>Reports</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('groups every screen under a heading', () => {
    renderCollapsed(admin);

    ['Sell', 'Customers & bills', 'Inventory', 'Purchasing', 'Money', 'Settings'].forEach((group) => {
      expect(screen.getByRole('button', { name: group })).toBeInTheDocument();
    });
  });

  it('keeps the catalogue together under Inventory', () => {
    renderCollapsed(admin);

    // The list of goods and the two labels every product must carry. Expanded first on purpose —
    // Inventory is not open by default, so these links are genuinely absent until it is opened.
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));

    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brands' })).toBeInTheDocument();

    // Buying is its own heading: these describe what the shop HOLDS, not what it ordered.
    expect(screen.queryByRole('link', { name: 'Purchases' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('keeps selling and taking back together under Sell', () => {
    renderCollapsed(admin);

    // The counter first, then its other half. Sell is open by default, so both are one click from
    // anywhere; the catalogue and the supplier side stay out of it.
    expect(screen.getByRole('link', { name: 'New sale' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sale return' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Products' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Purchase return' })).not.toBeInTheDocument();
  });

  it('puts purchase returns under Purchasing, with the goods they go back against', () => {
    renderCollapsed(admin);

    fireEvent.click(screen.getByRole('button', { name: 'Purchasing' }));

    expect(screen.getByRole('link', { name: 'Purchases' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suppliers' })).toBeInTheDocument();
    // The account behind "You owe": every purchase, return and payment with its running balance.
    expect(screen.getByRole('link', { name: 'Supplier ledger' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Purchase return' })).toBeInTheDocument();
  });

  it('no longer offers one combined Returns screen', () => {
    renderShell(admin);

    expect(screen.queryByRole('link', { name: 'Returns' })).not.toBeInTheDocument();
  });

  it('leaves the Sell group open without being asked', () => {
    renderCollapsed(admin, '/reports');

    // Where the day is spent. A click before every sale is the one cost grouping must not add,
    // so this group opens even when the shopkeeper is somewhere else entirely.
    expect(screen.getByRole('button', { name: 'Sell' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'New sale' })).toBeInTheDocument();
  });

  it('starts the occasional groups shut', () => {
    renderCollapsed(admin, '/pos');

    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('opens the group holding the screen you are on', () => {
    renderCollapsed(admin, '/reports');

    // The rail should always show where you are without being asked.
    expect(screen.getByRole('button', { name: 'Money' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
  });

  it('opens and shuts a group on click', async () => {
    renderCollapsed(admin, '/pos');

    const purchasing = screen.getByRole('button', { name: 'Purchasing' });

    fireEvent.click(purchasing);
    expect(screen.getByRole('link', { name: 'Suppliers' })).toBeInTheDocument();

    fireEvent.click(purchasing);
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
  });

  it('shows a salesman no heading for work that is not theirs', () => {
    renderCollapsed(staff);

    // A group whose every item is hidden does not render at all — an empty "Purchasing" would
    // advertise screens they cannot open. Purchasing is Admin-only again now that the catalogue
    // has moved out of it into Inventory.
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customers & bills' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Purchasing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Money' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows a salesman Products under Inventory, and nothing else there', () => {
    renderCollapsed(staff);

    // Inventory renders for Staff because Products lives there — the one catalogue screen they
    // open, to add an item to a cart. Categories and Brands stay hidden, so the heading holds a
    // single link. That is deliberate, not a group waiting to be tidied away.
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));

    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Categories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument();
  });
});
