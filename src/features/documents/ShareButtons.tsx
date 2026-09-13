import { useState } from 'react';
import { ApiError } from '@/types/api';

export type DocumentType = 'Invoice' | 'PaymentReceipt';

export interface ShareLink {
  shareUrl: string;
  whatsAppUrl: string | null;
  expiresAt: string;
}

export interface ShareButtonsProps {
  documentType: DocumentType;
  referenceId: number;
  /** The customer's number as stored. Absent or unusable disables the WhatsApp button. */
  customerMobile?: string | null;
  onDownload: (documentType: DocumentType, referenceId: number) => Promise<void>;
  onCreateShareLink: (documentType: DocumentType, referenceId: number) => Promise<ShareLink>;
  /** Injected so tests do not navigate the jsdom window. */
  openUrl?: (url: string) => void;
}

/**
 * Download and share actions for a receipt (FR-042, FR-044).
 *
 * <b>WhatsApp receives a link, not a file.</b> The wa.me scheme cannot carry an attachment, so
 * the message contains a URL to the receipt and the shopkeeper taps Send. When the customer has
 * no usable mobile number the button is disabled and says why, rather than opening WhatsApp
 * addressed to nobody.
 */
export function ShareButtons({
  documentType,
  referenceId,
  customerMobile,
  onDownload,
  onCreateShareLink,
  openUrl = (url) => window.open(url, '_blank', 'noopener'),
}: ShareButtonsProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMobile = Boolean(customerMobile && customerMobile.trim().length > 0);

  async function handleDownload() {
    setError(null);
    setIsWorking(true);

    try {
      await onDownload(documentType, referenceId);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not produce the receipt.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleWhatsApp() {
    setError(null);
    setIsWorking(true);

    try {
      const link = await onCreateShareLink(documentType, referenceId);

      if (!link.whatsAppUrl) {
        // The server could not make sense of the stored number.
        setError('This customer has no usable mobile number on file.');
        return;
      }

      openUrl(link.whatsAppUrl);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not create the share link.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="share-buttons">
      <button type="button" onClick={() => void handleDownload()} disabled={isWorking}>
        Download PDF
      </button>

      <button
        type="button"
        onClick={() => void handleWhatsApp()}
        disabled={isWorking || !hasMobile}
        title={hasMobile ? undefined : 'No mobile number on file for this customer'}
      >
        Send on WhatsApp
      </button>

      {!hasMobile && (
        <span className="share-buttons__hint">
          Add a mobile number to this customer to send the receipt.
        </span>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
