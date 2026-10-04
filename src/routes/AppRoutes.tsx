import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { LoginForm } from '@/features/auth/LoginForm';
import { PosPage } from '@/features/pos/PosPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { BrandsPage, CategoriesPage } from '@/features/taxonomy/TaxonomyPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { PurchaseReturnsPage, SaleReturnsPage } from '@/features/returns/ReturnsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { SupplierLedgerPage } from '@/features/suppliers/SupplierLedgerPage';
import { ProofMissingPage } from '@/features/proofs/ProofMissingPage';
import { ShopAccountsPage } from '@/features/shopAccounts/ShopAccountsPage';
import { TeamPage } from '@/features/team/TeamPage';
import { TeamMemberPage } from '@/features/team/TeamMemberPage';
import { CommissionPage } from '@/features/commission/CommissionPage';
import { SalesmanCashPage } from '@/features/salesmanCash/SalesmanCashPage';
import { MyDayPage } from '@/features/myDay/MyDayPage';
import { SalesmanStockPage } from '@/features/salesmanStock/SalesmanStockPage';
import { UdhaarCustomersPage } from '@/features/udhaar/UdhaarCustomersPage';
import { RecoveryPage } from '@/features/recovery/RecoveryPage';
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
        <Route path="/sale-returns" element={<SaleReturnsPage />} />
        {/* Admin-only: it spans supplier payments and expenses, which are the owner's alone. */}
        <Route path="/proofs-missing" element={<AdminOnly><ProofMissingPage /></AdminOnly>} />
        {/* The owner's view of the team; staff never see one another's figures. */}
        <Route path="/team" element={<AdminOnly><TeamPage /></AdminOnly>} />
        <Route path="/team/:userId" element={<AdminOnly><TeamMemberPage /></AdminOnly>} />
        {/* A field salesman's commission: what he earned, what waits on udhaar, what he is owed. */}
        <Route path="/commissions/:userId" element={<AdminOnly><CommissionPage /></AdminOnly>} />
        {/* The cash a field salesman carries from the market, and "Received from salesman". */}
        <Route path="/salesman-cash/:userId" element={<AdminOnly><SalesmanCashPage /></AdminOnly>} />
        {/* The stock he carries out of the shop: issue it, take it back, every unit on the record. */}
        <Route path="/salesman-stock/:userId" element={<AdminOnly><SalesmanStockPage /></AdminOnly>} />
        {/* Who the shop gives credit to — registered with phone and ID card. Owner only. */}
        <Route path="/udhaar-customers" element={<AdminOnly><UdhaarCustomersPage /></AdminOnly>} />
        {/* Everyone who owes, most overdue first. Open to all: collecting is everyone's job. */}
        <Route path="/recovery" element={<RecoveryPage />} />
        {/* The owner's own bank and wallet accounts. */}
        <Route path="/shop-accounts" element={<AdminOnly><ShopAccountsPage /></AdminOnly>} />
        {/* Admin-only: it shows purchase cost and what the shop owes. */}
        <Route path="/supplier-ledger" element={<AdminOnly><SupplierLedgerPage /></AdminOnly>} />
        <Route
          path="/purchase-returns"
          element={<AdminOnly><PurchaseReturnsPage /></AdminOnly>}
        />
        {/* The old combined screen. Kept as a redirect so a bookmark still lands somewhere. */}
        <Route path="/returns" element={<Navigate to="/sale-returns" replace />} />
        {/* Anyone's own day — always the signed-in person's figures, never another's. */}
        <Route path="/my-day" element={<MyDayPage />} />
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
