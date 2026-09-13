import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackupPanel, type BackupFile } from '@/features/admin/BackupPanel';
import { AuditLogViewer, type AuditEntry } from '@/features/admin/AuditLogViewer';
import { ApiError } from '@/types/api';

/** T171 — the Admin-only backup and audit screens. */

const backups: BackupFile[] = [
  {
    fileName: 'moizpos-2026-09-09-020000.sql',
    sizeBytes: 2_411_724,
    createdAtUtc: '2026-09-08T21:00:00Z',
  },
  {
    fileName: 'moizpos-2026-09-08-020000.sql',
    sizeBytes: 2_310_112,
    createdAtUtc: '2026-09-07T21:00:00Z',
  },
];

function renderBackups(
  onCreate = vi.fn().mockResolvedValue(undefined),
  onRestore = vi.fn().mockResolvedValue(undefined),
  files: BackupFile[] = backups,
) {
  render(<BackupPanel backups={files} onCreate={onCreate} onRestore={onRestore} />);
  return { onCreate, onRestore };
}

describe('BackupPanel', () => {
  it('lists the available backups with size and date', () => {
    renderBackups();

    expect(screen.getByText('moizpos-2026-09-09-020000.sql')).toBeInTheDocument();
    expect(screen.getByText('2.3 MB')).toBeInTheDocument();
  });

  it('says so when there are no backups', () => {
    renderBackups(vi.fn(), vi.fn(), []);

    expect(screen.getByText('No backups yet.')).toBeInTheDocument();
  });

  it('explains that a backup is only as fresh as when it was taken', () => {
    renderBackups();

    // The owner should understand the 24-hour window without reading the docs.
    expect(screen.getByText(/anything sold afterwards is not in it/i)).toBeInTheDocument();
  });

  it('takes a backup on demand', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderBackups();

    await user.click(screen.getByRole('button', { name: /backup now/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(await screen.findByRole('status')).toHaveTextContent('Backup taken.');
  });

  it('reports a failed backup', async () => {
    const user = userEvent.setup();
    renderBackups(
      vi.fn().mockRejectedValue(new ApiError('BUSINESS_RULE_VIOLATION', "Could not run 'mysqldump'.", 422)),
    );

    await user.click(screen.getByRole('button', { name: /backup now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/mysqldump/i);
  });
});

describe('BackupPanel restore', () => {
  it('warns plainly before restoring', async () => {
    const user = userEvent.setup();
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/replaces every record/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
  });

  it('requires the file name to be typed back', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderBackups();

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);

    const confirm = await screen.findByRole('button', { name: /restore and overwrite/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/type the file name/i), 'wrong-name.sql');
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText(/type the file name/i));
    await user.type(screen.getByLabelText(/type the file name/i), backups[0]!.fileName);
    expect(confirm).toBeEnabled();

    expect(onRestore).not.toHaveBeenCalled();
  });

  it('restores once confirmed', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderBackups();

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    await user.type(await screen.findByLabelText(/type the file name/i), backups[0]!.fileName);
    await user.click(screen.getByRole('button', { name: /restore and overwrite/i }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(backups[0]!.fileName));
    expect(await screen.findByRole('status')).toHaveTextContent(/restored from/i);
  });

  it('can be cancelled', async () => {
    const user = userEvent.setup();
    const { onRestore } = renderBackups();

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('reports a refused restore', async () => {
    const user = userEvent.setup();
    renderBackups(
      vi.fn(),
      vi.fn().mockRejectedValue(
        new ApiError('BUSINESS_RULE_VIOLATION', 'That file does not look like a MySQL backup.', 422),
      ),
    );

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    await user.type(await screen.findByLabelText(/type the file name/i), backups[0]!.fileName);
    await user.click(screen.getByRole('button', { name: /restore and overwrite/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a mysql backup/i);
  });
});

const auditEntries: AuditEntry[] = [
  {
    id: 1,
    entityType: 'Product',
    entityId: 7,
    fieldName: 'quantity_on_hand',
    oldValue: '10',
    newValue: '8',
    action: 'Sale',
    userName: 'Bilal',
    occurredAtUtc: '2026-09-09T08:30:00Z',
  },
  {
    id: 2,
    entityType: 'Customer',
    entityId: 3,
    fieldName: 'outstanding_balance',
    oldValue: '2000.00',
    newValue: '500.00',
    action: 'Payment',
    userName: 'Shop Owner',
    occurredAtUtc: '2026-09-09T09:15:00Z',
  },
];

describe('AuditLogViewer', () => {
  it('shows who changed what, from what, to what', () => {
    render(
      <AuditLogViewer
        entries={auditEntries}
        entityTypeFilter=""
        onEntityTypeFilterChange={vi.fn()}
      />,
    );

    const row = screen.getByText('Bilal').closest('tr')!;

    expect(row).toHaveTextContent('Sale');
    expect(screen.getByTestId('old-1')).toHaveTextContent('10');
    expect(screen.getByTestId('new-1')).toHaveTextContent('8');
  });

  it('names fields the way the owner would say them', () => {
    render(
      <AuditLogViewer entries={auditEntries} entityTypeFilter="" onEntityTypeFilterChange={vi.fn()} />,
    );

    expect(screen.getByText('Stock')).toBeInTheDocument();
    expect(screen.getByText('Customer balance')).toBeInTheDocument();
    expect(screen.queryByText('quantity_on_hand')).not.toBeInTheDocument();
  });

  it('shows a dash where a value was absent', () => {
    render(
      <AuditLogViewer
        entries={[{ ...auditEntries[0]!, oldValue: null }]}
        entityTypeFilter=""
        onEntityTypeFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('old-1')).toHaveTextContent('—');
  });

  it('can be filtered by what was changed', async () => {
    const onEntityTypeFilterChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AuditLogViewer
        entries={auditEntries}
        entityTypeFilter=""
        onEntityTypeFilterChange={onEntityTypeFilterChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Show'), 'Customer');

    expect(onEntityTypeFilterChange).toHaveBeenCalledWith('Customer');
  });

  it('says so when nothing matches', () => {
    render(
      <AuditLogViewer entries={[]} entityTypeFilter="Supplier" onEntityTypeFilterChange={vi.fn()} />,
    );

    expect(screen.getByText(/no changes recorded/i)).toBeInTheDocument();
  });
});
