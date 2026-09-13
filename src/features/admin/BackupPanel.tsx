import { useState } from 'react';
import { ApiError } from '@/types/api';

export interface BackupFile {
  fileName: string;
  sizeBytes: number;
  createdAtUtc: string;
}

export interface BackupPanelProps {
  backups: BackupFile[];
  onCreate: () => Promise<void>;
  onRestore: (fileName: string) => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });
}

/**
 * Backup and restore, Admin only (FR-046).
 *
 * Restore replaces every record in the shop's database, so it asks for the file name to be typed
 * back before it will proceed. A misclick here would destroy the shop's books.
 */
export function BackupPanel({ backups, onCreate, onRestore }: BackupPanelProps) {
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const confirmationMatches = pendingRestore?.fileName === confirmation.trim();

  async function handleCreate() {
    setError(null);
    setMessage(null);
    setIsWorking(true);

    try {
      await onCreate();
      setMessage('Backup taken.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not take a backup.');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRestore() {
    if (!pendingRestore || !confirmationMatches) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsWorking(true);

    try {
      await onRestore(pendingRestore.fileName);
      setMessage(`Restored from ${pendingRestore.fileName}.`);
      setPendingRestore(null);
      setConfirmation('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not restore that backup.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="backup-panel">
      <header className="backup-panel__header">
        <h2>Backups</h2>
        <button type="button" onClick={() => void handleCreate()} disabled={isWorking}>
          {isWorking ? 'Working…' : 'Backup now'}
        </button>
      </header>

      <p className="backup-panel__note">
        A backup is taken automatically once a day. It captures everything committed up to that
        moment — anything sold afterwards is not in it.
      </p>

      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {backups.length === 0 ? (
        <p className="backup-panel__empty">No backups yet.</p>
      ) : (
        <table className="backup-panel__table">
          <caption className="visually-hidden">Available backups</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Taken</th>
              <th scope="col">Size</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.fileName}>
                <td>{backup.fileName}</td>
                <td>{formatDate(backup.createdAtUtc)}</td>
                <td>{formatSize(backup.sizeBytes)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingRestore(backup);
                      setConfirmation('');
                      setError(null);
                      setMessage(null);
                    }}
                    disabled={isWorking}
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingRestore && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <div className="modal__panel">
            <h3 id="restore-title">Restore from backup</h3>

            <p className="backup-panel__warning">
              This replaces <strong>every record</strong> in the shop&apos;s database with the
              contents of {pendingRestore.fileName}. Anything sold since that backup was taken
              will be lost. This cannot be undone.
            </p>

            <div className="field">
              <label htmlFor="restoreConfirmation">
                Type the file name to confirm
              </label>
              <input
                id="restoreConfirmation"
                autoFocus
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={!confirmationMatches || isWorking}
              >
                Restore and overwrite
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingRestore(null);
                  setConfirmation('');
                }}
                disabled={isWorking}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
