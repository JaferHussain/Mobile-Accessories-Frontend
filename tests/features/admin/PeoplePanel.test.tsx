import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPage } from '@/features/admin/AdminPage';
import { adminApi, type AppUser } from '@/features/admin/adminApi';

vi.mock('@/features/admin/adminApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/admin/adminApi')>()),
  adminApi: {
    backups: vi.fn(),
    createBackup: vi.fn(),
    restore: vi.fn(),
    audit: vi.fn(),
    users: vi.fn(),
    createUser: vi.fn(),
    setJob: vi.fn(),
  },
}));

/**
 * People: one owner, and staff who each do a job — the shopkeeper at the counter, the salesman in
 * the market. Both keep the Staff role and its protections; the job only says which work.
 */

const owner: AppUser = { id: 1, username: 'moiz', fullName: 'Moiz', role: 'Admin', isActive: true, job: null };
const shopkeeper: AppUser = { id: 2, username: 'bilal', fullName: 'Bilal', role: 'Staff', isActive: true, job: 'Counter' };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.backups).mockResolvedValue([]);
  vi.mocked(adminApi.audit).mockResolvedValue({ items: [], page: 1, pageSize: 100, totalItems: 0, totalPages: 1 });
  vi.mocked(adminApi.users).mockResolvedValue([owner, shopkeeper]);
  vi.mocked(adminApi.createUser).mockResolvedValue({ ...shopkeeper, id: 3, username: 'ali', job: 'FieldSales' });
  vi.mocked(adminApi.setJob).mockResolvedValue({ ...shopkeeper, job: 'FieldSales' });
});

describe('People', () => {
  it('shows each person’s job, and none for the owner', async () => {
    renderPage();

    const bilal = (await screen.findByText('Bilal')).closest('tr')!;
    expect(within(bilal).getByLabelText(/job for bilal/i)).toHaveValue('Counter');

    const moiz = screen.getByText('Moiz').closest('tr')!;
    expect(within(moiz).queryByLabelText(/job for/i)).not.toBeInTheDocument();
  });

  it('adds a salesman with his job', async () => {
    renderPage();
    await screen.findByText('Bilal');

    await userEvent.type(screen.getByLabelText('Username'), 'ali');
    await userEvent.type(screen.getByLabelText('Full name'), 'Ali');
    await userEvent.type(screen.getByLabelText('Password'), 'Salesman@123');
    await userEvent.selectOptions(screen.getByLabelText(/^job$/i), 'FieldSales');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(adminApi.createUser).toHaveBeenCalledWith('ali', 'Ali', 'Salesman@123', 'Staff', 'FieldSales'),
    );
  });

  it('asks no job for an owner account', async () => {
    renderPage();
    await screen.findByText('Bilal');

    await userEvent.selectOptions(screen.getByLabelText(/^role$/i), 'Admin');

    expect(screen.queryByLabelText(/^job$/i)).not.toBeInTheDocument();
  });

  it('moves a member of staff to another job', async () => {
    renderPage();

    const bilal = (await screen.findByText('Bilal')).closest('tr')!;
    await userEvent.selectOptions(within(bilal).getByLabelText(/job for bilal/i), 'FieldSales');

    await waitFor(() => expect(adminApi.setJob).toHaveBeenCalledWith(2, 'FieldSales'));
  });
});
