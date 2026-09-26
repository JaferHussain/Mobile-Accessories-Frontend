import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLinksPanel } from '@/features/documents/ShareLinksPanel';
import type { ShareLinkSummary } from '@/features/documents/documentApi';

/**
 * What the owner sees when a bill went somewhere it should not have.
 *
 * <p>Revoking what you cannot see is not an action anyone can take, so seeing comes first. The
 * link itself is never shown — only the hash is stored, and putting a live link on screen would
 * turn whoever is standing behind the owner into a link holder.</p>
 */

const live: ShareLinkSummary = {
  id: 88,
  createdAtUtc: '2026-09-23T10:15:00Z',
  createdByUserName: 'Shop Owner',
  expiresAtUtc: '2026-10-23T10:15:00Z',
  revokedAtUtc: null,
  lastAccessedAtUtc: '2026-09-23T10:41:00Z',
  accessCount: 1,
  isUsable: true,
};

const neverOpened: ShareLinkSummary = {
  ...live,
  id: 89,
  lastAccessedAtUtc: null,
  accessCount: 0,
};

const revoked: ShareLinkSummary = {
  ...live,
  id: 90,
  revokedAtUtc: '2026-09-23T11:02:00Z',
  isUsable: false,
};

function setup(links: ShareLinkSummary[]) {
  const onList = vi.fn().mockResolvedValue(links);
  const onRevoke = vi.fn().mockResolvedValue({ ...links[0]!, revokedAtUtc: '2026-09-23T12:00:00Z', isUsable: false });

  render(
    <ShareLinksPanel
      documentType="Invoice"
      referenceId={77}
      onList={onList}
      onRevoke={onRevoke}
    />,
  );

  return { onList, onRevoke };
}

const open = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /shared links/i }));

beforeEach(() => vi.clearAllMocks());

describe('ShareLinksPanel', () => {
  it('reads nothing until the owner asks', () => {
    const { onList } = setup([live]);

    // This is a rarely-needed answer; fetching it for every row of a list would be waste.
    expect(onList).not.toHaveBeenCalled();
  });

  it('lists what is outstanding, and when it expires', async () => {
    const user = userEvent.setup();
    setup([live]);

    await open(user);

    expect(await screen.findByTestId('share-link-88')).toHaveTextContent(/2026/);
    expect(screen.getByTestId('share-link-88')).toHaveTextContent(/shop owner/i);
  });

  it('says whether a link has ever been opened', async () => {
    const user = userEvent.setup();
    setup([live, neverOpened]);

    await open(user);

    expect(await screen.findByTestId('share-link-88')).toHaveTextContent(/opened/i);
    expect(screen.getByTestId('share-link-89')).toHaveTextContent(/never opened/i);
  });

  it('never shows the link itself', async () => {
    const user = userEvent.setup();
    setup([live]);

    await open(user);

    const panel = await screen.findByTestId('share-link-88');

    expect(panel.textContent).not.toMatch(/https?:\/\//);
  });

  it('withdraws a live link', async () => {
    const user = userEvent.setup();
    const { onRevoke } = setup([live]);

    await open(user);
    await user.click(await screen.findByRole('button', { name: /revoke/i }));

    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith(88));
  });

  it('offers nothing to revoke on a link already withdrawn', async () => {
    const user = userEvent.setup();
    setup([revoked]);

    await open(user);

    expect(await screen.findByTestId('share-link-90')).toHaveTextContent(/revoked/i);
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
  });

  it('says so when a document was never shared', async () => {
    const user = userEvent.setup();
    setup([]);

    await open(user);

    expect(await screen.findByText(/never been shared/i)).toBeInTheDocument();
  });
});
