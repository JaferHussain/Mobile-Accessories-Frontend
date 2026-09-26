import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { LoginForm } from '@/features/auth/LoginForm';
import { PosPage } from '@/features/pos/PosPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { BrandsPage, CategoriesPage } from '@/features/taxonomy/TaxonomyPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { ReturnsPage } from '@/features/returns/ReturnsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { DayClosePage } from '@/features/dayclose/DayClosePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '@/features/auth/AuthContext';

/**
 * Keeps an already-signed-in user off the login screen — reaching it by bookmark, Back button
 * or a stale tab would otherwise show a sign-in form to someone already signed in.
 */
function LoginRoute() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Navigate to="/" replace /> : <LoginForm />;
}

function Forbidden() {
  return (
    <section>
      <h2>Not allowed</h2>
      <p>Your account does not have access to this screen. Ask the owner if you need it.</p>
    </section>
  );
}

/** Wraps an element so only an Admin can reach it. The server enforces this too (FR-040). */
function AdminOnly({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute adminOnly>{children}</ProtectedRoute>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* The counter is where a salesman starts, so it is the default screen. */}
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        {/* Not Admin-only: handing a customer their own receipt is counter work, and the list
            carries no cost or profit. */}
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/forbidden" element={<Forbidden />} />

        <Route path="/categories" element={<AdminOnly><CategoriesPage /></AdminOnly>} />
        <Route path="/brands" element={<AdminOnly><BrandsPage /></AdminOnly>} />
        <Route path="/purchases" element={<AdminOnly><PurchasesPage /></AdminOnly>} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/suppliers" element={<AdminOnly><SuppliersPage /></AdminOnly>} />
        <Route path="/expenses" element={<AdminOnly><ExpensesPage /></AdminOnly>} />
        <Route path="/reports" element={<AdminOnly><ReportsPage /></AdminOnly>} />
        {/* The control OVER the salesman's handling of cash — so never theirs to perform. */}
        <Route path="/day-close" element={<AdminOnly><DayClosePage /></AdminOnly>} />
        <Route path="/dashboard" element={<AdminOnly><DashboardPage /></AdminOnly>} />
        <Route path="/admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
