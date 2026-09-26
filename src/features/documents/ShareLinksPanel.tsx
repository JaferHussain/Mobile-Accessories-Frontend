import { useState } from 'react';
import { ApiError } from '@/types/api';
import type { DocumentType, ShareLinkSummary } from './documentApi';

export interface ShareLinksPanelProps {
  documentType: DocumentType;
  referenceId: number;
  onList: (documentType: DocumentType, referenceId: number) => Promise<ShareLinkSummary[]>;
  onRevoke: (shareLinkId: number) => Promise<ShareLinkSummary>;
}

/**
 * What the owner sees when a bill went somewhere it should not have.
 *
 * <p><b>Seeing comes before withdrawing.</b> Revoking a link you cannot see is not an action
 * anyone can take, which is why this exists at all — the revoke endpoint alone would be
 * unusable.</p>
 *
 * <p><b>The link itself is never shown.</b> Only its hash is stored, and putting a live URL on
 * screen would turn whoever is standing behind the owner into a link holder. Revocation is by
 * id.</p>
 *
 * <p>Closed until asked: this is a rarely-needed answer, and fetching it for every row of a list
 * would be a request per row for something nobody looked at.</p>
 */
export function ShareLinksPanel({
  documentType,
  referenceId,
  onList,
  onRevoke,
}: ShareLinksPanelProps) {
  const [links, setLinks] = useState<ShareLinkSummary[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setIsWorking(true);

    try {
      setLinks(await onList(documentType, referenceId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read the shared links.');
    } finally {
      setIsWorking(false);
    }
  }

  async function toggle() {
    const next = !isOpen;
    setIsOpen(next);

    if (next && links === null) {
      await load();
    }
  }

  async function revoke(shareLinkId: number) {
    setError(null);
    setIsWorking(true);

    try {
      const updated = await onRevoke(shareLinkId);

      // Replace in place rather than re-reading the list: the server's answer is the record of
      // what happened, including the revocation time it decided.
      setLinks((current) =>
        (current ?? []).map((link) => (link.id === shareLinkId ? updated : link)),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not revoke that link.');
    } finally {
      setIsWorking(false);
    }
  }

  const asDate = (iso: string) => new Date(iso).toLocaleDateString('en-PK');

  return (
    <div className="share-links">
      <button type="button" className="link-button" onClick={() => void toggle()}>
        {isOpen ? 'Hide shared links' : 'Shared links'}
      </button>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {isOpen && (
        <>
          {isWorking && links === null && <p className="field__hint">Reading…</p>}

          {links?.length === 0 && (
            <p className="field__hint">This document has never been shared.</p>
          )}

          <ul className="share-links__list">
            {links?.map((link) => (
              <li key={link.id} data-testid={`share-link-${link.id}`}>
                <span>
                  Shared by {link.createdByUserName} on {asDate(link.createdAtUtc)}
                </span>

                <span className="share-links__meta">
                  {link.revokedAtUtc
                    ? `Revoked ${asDate(link.revokedAtUtc)}`
                    : `Works until ${asDate(link.expiresAtUtc)}`}
                  {' · '}
                  {/* The question a worried owner actually asks. */}
                  {link.lastAccessedAtUtc
                    ? `Opened ${asDate(link.lastAccessedAtUtc)}`
                    : 'Never opened'}
                </span>

                {link.isUsable && (
                  <button type="button" disabled={isWorking} onClick={() => void revoke(link.id)}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
