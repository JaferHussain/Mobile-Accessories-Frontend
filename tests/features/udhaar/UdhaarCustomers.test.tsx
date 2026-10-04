import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UdhaarCustomersPage } from '@/features/udhaar/UdhaarCustomersPage';
import { UdhaarStatusPanel } from '@/features/udhaar/UdhaarStatusPanel';
import { udhaarApi, type UdhaarCustomer } from '@/features/udhaar/udhaarApi';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { customerApi, type Customer } from '@/features/customers/customerApi';

vi.mock('@/features/udhaar/udhaarApi', () => ({
  udhaarApi: {
    list: vi.fn(),
    status: vi.fn(),
    register: vi.fn(),
    registerExisting: vi.fn(),
    remove: vi.fn(),
    idCard: vi.fn(),
  },
}));
vi.mock('@/features/customers/customerApi', () => ({ customerApi: { search: vi.fn() } }));

/**
 * Udhaar customers — registered by the owner with name, phone and both sides of the ID card. The
 * only customers who may be sold to on full udhaar. Every rule is the server's; these screens ask
 * for what is missing before anything is sent, and word what comes back.
 */

const rehman: UdhaarCustomer = {
  id: 7,
  name: 'Rehman Mobiles',
  mobileNumber: '03001234567',
  outstandingBalance: 4200,
  isUdhaarCustomer: true,
  hasIdCardFront: true,
  hasIdCardBack: true,
  idCardMissing: false,
};

const oldMarked: UdhaarCustomer = {
  ...rehman,
  id: 8,
  name: 'City Phones',
  hasIdCardFront: false,
  hasIdCardBack: false,
  idCardMissing: true,
};

const photo = (name: string) => new File(['jpeg'], name, { type: 'image/jpeg' });

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(udhaarApi.list).mockResolvedValue([rehman, oldMarked]);
  // jsdom has no object URLs; a preview needs one.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('the udhaar customers page', () => {
  it('lists them with what they owe, and flags anyone without an ID card', async () => {
    wrap(<UdhaarCustomersPage />);

    const missingRow = (await screen.findByText('City Phones')).closest('tr')!;
    expect(within(missingRow).getByText(/id card missing/i)).toBeInTheDocument();
    expect(within(screen.getByText('Rehman Mobiles').closest('tr')!).getByText(/on file/i)).toBeInTheDocument();
    expect(screen.getByTestId('missing-count')).toHaveTextContent('1 without an ID card');
  });

  it('registers a new udhaar customer with name, phone and both sides of the card', async () => {
    const user = userEvent.setup();
    vi.mocked(udhaarApi.register).mockResolvedValue({ ...rehman, id: 9, name: 'Asif Traders' });
    wrap(<UdhaarCustomersPage />);

    await user.click(await screen.findByRole('button', { name: /register udhaar customer/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Asif Traders');
    await user.type(screen.getByLabelText(/phone number/i), '03211234567');
    const front = photo('front.jpg');
    const back = photo('back.jpg');
    await user.upload(screen.getByLabelText(/id card — front/i), front);
    await user.upload(screen.getByLabelText(/id card — back/i), back);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() =>
      expect(udhaarApi.register).toHaveBeenCalledWith({
        name: 'Asif Traders',
        mobileNumber: '03211234567',
        idCardFront: front,
        idCardBack: back,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/asif traders is registered/i);
  });

  it('will not send a registration missing a side of the ID card', async () => {
    const user = userEvent.setup();
    wrap(<UdhaarCustomersPage />);

    await user.click(await screen.findByRole('button', { name: /register udhaar customer/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Asif Traders');
    await user.type(screen.getByLabelText(/phone number/i), '03211234567');
    await user.upload(screen.getByLabelText(/id card — front/i), photo('front.jpg'));
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/both sides/i);
    expect(udhaarApi.register).not.toHaveBeenCalled();
  });

  it('completes the ID card of someone marked before cards were asked for', async () => {
    const user = userEvent.setup();
    vi.mocked(udhaarApi.registerExisting).mockResolvedValue({ ...oldMarked, idCardMissing: false });
    wrap(<UdhaarCustomersPage />);

    const row = (await screen.findByText('City Phones')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /complete id card/i }));
    const front = photo('front.jpg');
    const back = photo('back.jpg');
    await user.upload(screen.getByLabelText(/id card — front/i), front);
    await user.upload(screen.getByLabelText(/id card — back/i), back);
    await user.click(screen.getByRole('button', { name: /save udhaar customer/i }));

    await waitFor(() =>
      expect(udhaarApi.registerExisting).toHaveBeenCalledWith(8, {
        mobileNumber: '03001234567',
        idCardFront: front,
        idCardBack: back,
      }),
    );
  });

  it('shows both sides of the ID card on the same page, fetched only when asked', async () => {
    const user = userEvent.setup();
    vi.mocked(udhaarApi.idCard).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    wrap(<UdhaarCustomersPage />);

    const row = (await screen.findByText('Rehman Mobiles')).closest('tr')!;
    expect(udhaarApi.idCard).not.toHaveBeenCalled();

    await user.click(within(row).getByRole('button', { name: /view id card/i }));

    const viewer = await screen.findByRole('dialog', { name: /rehman mobiles — id card/i });
    expect(await within(viewer).findByAltText(/id card front/i)).toBeInTheDocument();
    expect(within(viewer).getByAltText(/id card back/i)).toBeInTheDocument();
    expect(udhaarApi.idCard).toHaveBeenCalledWith(7, 'front');
    expect(udhaarApi.idCard).toHaveBeenCalledWith(7, 'back');
  });
});

describe('a customer’s udhaar standing, on their ledger', () => {
  it('offers to make an ordinary customer an udhaar customer — asking for the ID card', async () => {
    const user = userEvent.setup();
    vi.mocked(udhaarApi.status).mockResolvedValue({
      ...rehman,
      isUdhaarCustomer: false,
      hasIdCardFront: false,
      hasIdCardBack: false,
    });
    vi.mocked(udhaarApi.registerExisting).mockResolvedValue(rehman);

    wrap(<UdhaarStatusPanel customerId={7} />);

    await user.click(await screen.findByRole('button', { name: /make udhaar customer/i }));
    const front = photo('front.jpg');
    const back = photo('back.jpg');
    await user.upload(screen.getByLabelText(/id card — front/i), front);
    await user.upload(screen.getByLabelText(/id card — back/i), back);
    await user.click(screen.getByRole('button', { name: /save udhaar customer/i }));

    await waitFor(() =>
      expect(udhaarApi.registerExisting).toHaveBeenCalledWith(7, {
        mobileNumber: '03001234567',
        idCardFront: front,
        idCardBack: back,
      }),
    );
  });

  it('marks an udhaar customer plainly, and can take the mark away', async () => {
    const user = userEvent.setup();
    vi.mocked(udhaarApi.status).mockResolvedValue(rehman);
    vi.mocked(udhaarApi.remove).mockResolvedValue({ ...rehman, isUdhaarCustomer: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    wrap(<UdhaarStatusPanel customerId={7} />);

    expect(await screen.findByText(/^udhaar customer$/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove from udhaar/i }));

    await waitFor(() => expect(udhaarApi.remove).toHaveBeenCalledWith(7));
  });

  it('prompts to complete the ID card of someone marked without one', async () => {
    vi.mocked(udhaarApi.status).mockResolvedValue(oldMarked);

    wrap(<UdhaarStatusPanel customerId={8} />);

    expect(await screen.findByText(/id card missing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete id card/i })).toBeInTheDocument();
  });
});

describe('the customer list', () => {
  it('says which customers are udhaar customers', async () => {
    const plain: Customer = {
      id: 1,
      name: 'Walk-in Asif',
      mobileNumber: '03211234567',
      outstandingBalance: 600,
      isActive: true,
      saleType: 'Retail',
      creditAllowed: false,
    };
    vi.mocked(customerApi.search).mockResolvedValue({
      items: [{ ...plain, id: 7, name: 'Rehman Mobiles', creditAllowed: true }, plain],
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 1,
    });

    wrap(<CustomersPage />);

    const marked = (await screen.findByText('Rehman Mobiles')).closest('tr')!;
    expect(within(marked).getByText(/udhaar customer/i)).toBeInTheDocument();
    expect(within(screen.getByText('Walk-in Asif').closest('tr')!).queryByText(/udhaar customer/i)).not.toBeInTheDocument();
  });
});
