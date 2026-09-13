import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

// Ordered by where each screen sits in the shop's working day, not alphabetically:
// the owner's overview first, then the counter work that happens on every sale, then
// restocking, then the back-office screens that are opened at most once a day.
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', adminOnly: true },
  { to: '/pos', label: 'Sell' },
  { to: '/products', label: 'Products' },
  { to: '/customers', label: 'Customers' },
  { to: '/purchases', label: 'Purchases', adminOnly: true },
  { to: '/suppliers', label: 'Suppliers', adminOnly: true },
  // Set up once and edited rarely, so they sit with Suppliers rather than above the daily
  // counter screens — even though a product depends on them.
  { to: '/categories', label: 'Categories', adminOnly: true },
  { to: '/brands', label: 'Brands', adminOnly: true },
  { to: '/expenses', label: 'Expenses', adminOnly: true },
  { to: '/reports', label: 'Reports', adminOnly: true },
  { to: '/admin', label: 'Admin', adminOnly: true },
];

/**
 * Navigation shell.
 *
 * Hiding admin links is a convenience, not a control — a Staff user who typed the URL would
 * still be refused by the server (FR-040).
 */
export function AppShell() {
  const { user, isAdmin, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

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
        {visibleItems.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
