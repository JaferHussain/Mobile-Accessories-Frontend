import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButtons } from '@/features/documents/ShareButtons';
import { ApiError } from '@/types/api';

/**
 * Handing a customer their bill.
 *
 * <p>Four ways out: on paper, as a file, or through either messaging app on the counter device.
 * Both send routes are deep links — nothing is dispatched by the shop, the shopkeeper taps Send —
 * so neither costs anything per message.</p>
 */

const link = {
  shareUrl: 'https://shop/api/public/documents/tok',
  whatsAppUrl: 'https://wa.me/923001234567?text=bill',
  smsUrl: 'sms:+923001234567?body=bill',
  expiresAtUtc: '2026-10-23T12:00:00Z',
};

/** Opens the choice of app behind the one Share button. */
function openShare() {
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
}

/** Renders the buttons with the Share choice already open, as every send begins. */
function setup(
  overrides: Partial<Parameters<typeof ShareButtons>[0]> = {},
  { open = true }: { open?: boolean } = {},
) {
  const onFetchDocument = vi.fn().mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  const onCreateShareLink = vi.fn().mockResolvedValue(link);
  const openUrl = vi.fn();
  const printUrl = vi.fn();

  render(
    <ShareButtons
      documentType="Invoice"
      referenceId={77}
      customerMobile="03001234567"
      onFetchDocument={onFetchDocument}
      onCreateShareLink={onCreateShareLink}
      openUrl={openUrl}
      printUrl={printUrl}
      {...overrides}
    />,
  );

  if (open) {
    openShare();
  }

  return { onFetchDocument, onCreateShareLink, openUrl, printUrl };
}

describe('the share row styling', () => {
  it('styles its buttons by name, never by position', () => {
    // Share sits inside its own wrapper, so `.share-buttons button:last-of-type` — the rule that
    // once painted the WhatsApp button — now lands on Download PDF and dresses it as a chat app.
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).not.toMatch(/\.share-buttons button:(first-child|last-of-type|nth-)/);
    expect(css).toMatch(/\.share-buttons__print::before\s*\{\s*content:\s*'🖨 '/);
  });
});

describe('the Share button', () => {
  it('keeps both apps behind one Share button until it is pressed', () => {
    setup({}, { open: false });

    expect(screen.getByRole('button', { name: /^share$/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sms/i })).not.toBeInTheDocument();
  });

  it('asks which app to send the invoice with', () => {
    setup();

    expect(screen.getByText('Please select an option to send the invoice.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send on whatsapp/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /send by sms/i })).toBeEnabled();
  });

  it('calls a payment acknowledgement a receipt', () => {
    setup({ documentType: 'PaymentReceipt', referenceId: 12 });

    expect(screen.getByText('Please select an option to send the receipt.')).toBeInTheDocument();
  });

  it('closes on Escape, and on pressing Share again', () => {
    setup();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();

    openShare();
    openShare();
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
  });

  it('closes once the message is on its way', async () => {
    const user = userEvent.setup();
    const { openUrl } = setup();

    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
  });
});

describe('ShareButtons', () => {
  it('offers every way of handing over a bill', () => {
    setup();

    expect(screen.getByRole('button', { name: /print/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /sms/i })).toBeEnabled();
  });

  it('downloads the document as a file', async () => {
    const user = userEvent.setup();
    const { onFetchDocument } = setup();

    await user.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(onFetchDocument).toHaveBeenCalledWith('Invoice', 77));
  });

  it('prints the same bytes the customer receives, not a separate view', async () => {
    const user = userEvent.setup();
    const { onFetchDocument, printUrl } = setup();

    await user.click(screen.getByRole('button', { name: /print/i }));

    // A second rendering path is a second document, and the two drift — the failure being a
    // printed bill that disagrees with the sent one.
    await waitFor(() => expect(onFetchDocument).toHaveBeenCalledWith('Invoice', 77));
    await waitFor(() => expect(printUrl).toHaveBeenCalled());
  });

  it('opens WhatsApp addressed to the customer', async () => {
    const user = userEvent.setup();
    const { openUrl } = setup();

    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(link.whatsAppUrl));
  });

  it('opens the SMS app with the same message prepared', async () => {
    const user = userEvent.setup();
    const { openUrl } = setup();

    await user.click(screen.getByRole('button', { name: /sms/i }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(link.smsUrl));
  });

  it('tells the shopkeeper how long the link lasts', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    // Read from the server's answer, never hardcoded — the lifetime is a setting, and a
    // hardcoded "30 days" would diverge the moment it changed.
    expect(await screen.findByTestId('share-expiry')).toHaveTextContent(/2026/);
  });
});

describe('ShareButtons when a customer has no number', () => {
  const noNumber = { customerMobile: null, hasCustomer: true };

  it('disables sending and says where to fix it', () => {
    setup(noNumber);

    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sms/i })).toBeDisabled();
    expect(screen.getByText(/add a mobile number to this customer/i)).toBeInTheDocument();
  });

  it('still prints and downloads — the paper routes are unaffected', () => {
    setup(noNumber);

    expect(screen.getByRole('button', { name: /print/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
  });

  it('offers no number field, because the fix belongs on the customer record', () => {
    setup(noNumber);

    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
  });
});

describe('ShareButtons for a walk-in', () => {
  // No customer at all — most counter sales. There is no record to read a number from and
  // never will be, so the number is typed for this one send.
  const walkIn = { customerMobile: null, hasCustomer: false };

  it('asks for a number instead of refusing to send', () => {
    setup(walkIn);

    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
    expect(screen.queryByText(/add a mobile number to this customer/i)).not.toBeInTheDocument();
  });

  it('cannot send until a number is typed', () => {
    setup(walkIn);

    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeDisabled();
  });

  it('sends to the typed number', async () => {
    const user = userEvent.setup();
    const { onCreateShareLink, openUrl } = setup(walkIn);

    await user.type(screen.getByLabelText(/mobile number/i), '03009876543');
    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    await waitFor(() =>
      expect(onCreateShareLink).toHaveBeenCalledWith('Invoice', 77, '03009876543'),
    );
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(link.whatsAppUrl));
  });

  it('says so when the server could not make sense of the number', async () => {
    const user = userEvent.setup();
    setup({
      ...walkIn,
      onCreateShareLink: vi.fn().mockResolvedValue({ ...link, whatsAppUrl: null, smsUrl: null }),
    });

    await user.type(screen.getByLabelText(/mobile number/i), '12345');
    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/number/i);
  });
});

describe('ShareButtons when something goes wrong', () => {
  it('reports a failed download without pretending the sale failed', async () => {
    const user = userEvent.setup();
    setup({
      onFetchDocument: vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', 'No such invoice.', 404)),
    });

    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no such invoice/i);
  });

  it('reports a failed share link the same way', async () => {
    const user = userEvent.setup();
    setup({ onCreateShareLink: vi.fn().mockRejectedValue(new Error('offline')) });

    await user.click(screen.getByRole('button', { name: /whatsapp/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
