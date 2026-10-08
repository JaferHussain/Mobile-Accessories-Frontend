import { useState } from 'react';
import { ApiError } from '@/types/api';
import type { DocumentType, ShareLink } from './documentApi';
import { SendMenu } from './SendMenu';

export type { DocumentType } from './documentApi';

export interface ShareButtonsProps {
  documentType: DocumentType;
  referenceId: number;

  /** The customer's number as stored. Absent or unusable means it cannot be sent as-is. */
  customerMobile?: string | null;

  /**
   * Whether this document belongs to a customer at all.
   *
   * A walk-in has no record, so there is nothing to fix and nothing to read a number from — the
   * shopkeeper types one for this send. A known customer with a missing number is different: the
   * fix belongs on their record, so we say so instead of taking a number that goes nowhere.
   */
  hasCustomer?: boolean;

  onFetchDocument: (documentType: DocumentType, referenceId: number) => Promise<Blob>;
  onCreateShareLink: (
    documentType: DocumentType,
    referenceId: number,
    mobileNumber?: string | null,
  ) => Promise<ShareLink>;

  /** Injected so tests do not navigate the jsdom window. */
  openUrl?: (url: string) => void;
  printUrl?: (url: string) => void;
}

/** Hands the browser a file to save, from bytes already in memory. */
function defaultDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/** Opens the document in a new window and asks it to print. */
function defaultPrint(url: string) {
  const opened = window.open(url, '_blank', 'noopener');

  opened?.addEventListener('load', () => opened.print());
}

/**
 * Handing a customer their bill.
 *
 * <p><b>Print uses the same bytes the customer receives.</b> Not a print-styled view of the same
 * data — that is a second rendering, and two renderings drift. The failure worth preventing is a
 * printed bill that disagrees with the sent one, discovered when a customer holds both.</p>
 *
 * <p><b>Both send routes are deep links.</b> `wa.me` and `sms:` prepare a message in an app the
 * counter device already has; the shopkeeper taps Send. Nothing is dispatched by the shop, so
 * there is no messaging account and no per-message cost.</p>
 */
export function ShareButtons({
  documentType,
  referenceId,
  customerMobile,
  hasCustomer = true,
  onFetchDocument,
  onCreateShareLink,
  openUrl = (url) => window.open(url, '_blank', 'noopener'),
  printUrl = defaultPrint,
}: ShareButtonsProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedNumber, setTypedNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isChoosing, setIsChoosing] = useState(false);

  const documentName = documentType === 'Invoice' ? 'invoice' : 'receipt';

  const storedNumber = customerMobile?.trim() ?? '';
  const hasStoredNumber = storedNumber.length > 0;

  // A walk-in types a number; a known customer's missing number is fixed on their record.
  const asksForNumber = !hasStoredNumber && !hasCustomer;
  const canSend = hasStoredNumber || (asksForNumber && typedNumber.trim().length > 0);

  function report(caught: unknown, fallback: string) {
    setError(caught instanceof ApiError ? caught.message : fallback);
  }

  async function withDocument(use: (blob: Blob) => void) {
    setError(null);
    setIsWorking(true);

    try {
      use(await onFetchDocument(documentType, referenceId));
    } catch (caught) {
      // The sale is already saved; a document that could not be produced says nothing about it.
      report(caught, 'Could not produce the document. The sale is saved — try again.');
    } finally {
      setIsWorking(false);
    }
  }

  const handleDownload = () =>
    withDocument((blob) =>
      defaultDownload(blob, `${documentType === 'Invoice' ? 'invoice' : 'receipt'}-${referenceId}.pdf`),
    );

  const handlePrint = () =>
    withDocument((blob) => printUrl(URL.createObjectURL(blob)));

  async function send(channel: 'whatsapp' | 'sms') {
    setError(null);
    setIsWorking(true);

    try {
      const link = await onCreateShareLink(
        documentType,
        referenceId,
        asksForNumber ? typedNumber.trim() : null,
      );

      setExpiresAt(link.expiresAtUtc);

      const url = channel === 'whatsapp' ? link.whatsAppUrl : link.smsUrl;

      if (!url) {
        // The server could not make the number dialable. Better to say so than to open a
        // messaging app addressed to nobody.
        setError('That mobile number could not be used. Check it and try again.');
        return;
      }

      openUrl(url);
      setIsChoosing(false);
    } catch (caught) {
      // The panel stays open, so the shopkeeper can try again or pick the other app.
      report(caught, 'Could not create the share link. Please try again.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="share-buttons">
      <button
        type="button"
        className="share-buttons__print"
        onClick={() => void handlePrint()}
        disabled={isWorking}
      >
        Print
      </button>

      <button
        type="button"
        className="share-buttons__download"
        onClick={() => void handleDownload()}
        disabled={isWorking}
      >
        Download PDF
      </button>

      <SendMenu
        label="Share"
        kind="share"
        prompt={`Please select an option to send the ${documentName}.`}
        isOpen={isChoosing}
        onOpenChange={setIsChoosing}
        disabled={isWorking}
      >
        {asksForNumber && (
          <div className="field share-buttons__number">
            <label htmlFor={`shareMobile-${referenceId}`}>Mobile number</label>
            <input
              id={`shareMobile-${referenceId}`}
              inputMode="tel"
              placeholder="03001234567"
              value={typedNumber}
              onChange={(event) => setTypedNumber(event.target.value)}
            />
            <small className="field__hint">Used for this message only — no customer is created.</small>
          </div>
        )}

        <div className="send-menu__options">
          <button
            type="button"
            className="send-menu__whatsapp"
            onClick={() => void send('whatsapp')}
            disabled={isWorking || !canSend}
            title={canSend ? undefined : 'No mobile number to send to'}
          >
            Send on WhatsApp
          </button>

          <button
            type="button"
            className="send-menu__sms"
            onClick={() => void send('sms')}
            disabled={isWorking || !canSend}
            title={canSend ? undefined : 'No mobile number to send to'}
          >
            Send by SMS
          </button>
        </div>

        {/* Only a customer ON FILE can have their record fixed; a walk-in never will. */}
        {!hasStoredNumber && hasCustomer && (
          <span className="share-buttons__hint">
            Add a mobile number to this customer to send the {documentName}.
          </span>
        )}
      </SendMenu>

      {expiresAt && (
        <small className="share-buttons__expiry" data-testid="share-expiry">
          Link works until {new Date(expiresAt).toLocaleDateString('en-PK')}.
        </small>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
