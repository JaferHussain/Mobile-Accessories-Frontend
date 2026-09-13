import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButtons, type ShareLink } from '@/features/documents/ShareButtons';
import { ApiError } from '@/types/api';

/** T160 — download and share, including the disabled state with a stated reason (FR-044). */

const link: ShareLink = {
  shareUrl: 'https://shop.example/api/public/documents/abc123',
  whatsAppUrl: 'https://wa.me/923001234567?text=Your%20receipt',
  expiresAt: '2026-10-09T00:00:00Z',
};

function setup(overrides: Partial<Parameters<typeof ShareButtons>[0]> = {}) {
  const onDownload = vi.fn().mockResolvedValue(undefined);
  const onCreateShareLink = vi.fn().mockResolvedValue(link);
  const openUrl = vi.fn();

  render(
    <ShareButtons
      documentType="Invoice"
      referenceId={10}
      customerMobile="03001234567"
      onDownload={onDownload}
      onCreateShareLink={onCreateShareLink}
      openUrl={openUrl}
      {...overrides}
    />,
  );

  return { onDownload, onCreateShareLink, openUrl };
}

describe('ShareButtons download', () => {
  it('offers a PDF download', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => expect(onDownload).toHaveBeenCalledWith('Invoice', 10));
  });

  it('reports a failure to produce the PDF', async () => {
    const user = userEvent.setup();
    setup({
      onDownload: vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', "Invoice '10' was not found.", 404)),
    });

    await user.click(screen.getByRole('button', { name: /download pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found/i);
  });
});

describe('ShareButtons WhatsApp', () => {
  it('opens WhatsApp addressed to the customer', async () => {
    const user = userEvent.setup();
    const { onCreateShareLink, openUrl } = setup();

    await user.click(screen.getByRole('button', { name: /send on whatsapp/i }));

    await waitFor(() => expect(onCreateShareLink).toHaveBeenCalledWith('Invoice', 10));
    expect(openUrl).toHaveBeenCalledWith(link.whatsAppUrl);
  });

  it('is disabled when the customer has no mobile number', () => {
    setup({ customerMobile: null });

    const button = screen.getByRole('button', { name: /send on whatsapp/i });

    // spec US7 scenario 2: unavailable, with the reason shown.
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'No mobile number on file for this customer');
    expect(screen.getByText(/add a mobile number/i)).toBeInTheDocument();
  });

  it('is disabled for a blank mobile number', () => {
    setup({ customerMobile: '   ' });

    expect(screen.getByRole('button', { name: /send on whatsapp/i })).toBeDisabled();
  });

  it('says so when the stored number cannot be used', async () => {
    const user = userEvent.setup();
    const { openUrl } = setup({
      // The number is present but the server could not normalise it.
      onCreateShareLink: vi.fn().mockResolvedValue({ ...link, whatsAppUrl: null }),
    });

    await user.click(screen.getByRole('button', { name: /send on whatsapp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no usable mobile number/i);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('reports a failure to create the link', async () => {
    const user = userEvent.setup();
    setup({
      onCreateShareLink: vi
        .fn()
        .mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Something went wrong.', 500)),
    });

    await user.click(screen.getByRole('button', { name: /send on whatsapp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('works for a payment receipt too', async () => {
    const user = userEvent.setup();
    const { onCreateShareLink } = setup({ documentType: 'PaymentReceipt', referenceId: 45 });

    await user.click(screen.getByRole('button', { name: /send on whatsapp/i }));

    await waitFor(() => expect(onCreateShareLink).toHaveBeenCalledWith('PaymentReceipt', 45));
  });

  it('does not disable the download when there is no mobile number', () => {
    setup({ customerMobile: null });

    // A walk-in customer still gets a printed receipt.
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeEnabled();
  });
});
