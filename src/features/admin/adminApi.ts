import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult, UserRole } from '@/types/api';
import type { AuditEntry } from './AuditLogViewer';
import type { BackupFile } from './BackupPanel';

/** The work a member of staff does. The owner has none. */
export type StaffJob = 'Counter' | 'FieldSales';

export const STAFF_JOBS: ReadonlyArray<{ value: StaffJob; label: string }> = [
  { value: 'Counter', label: 'Counter (shopkeeper)' },
  { value: 'FieldSales', label: 'Field sales (salesman)' },
];

export interface AppUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  job?: StaffJob | null;
}

export const adminApi = {
  backups(): Promise<BackupFile[]> {
    return unwrap(api.get<ApiEnvelope<BackupFile[]>>('/admin/backups'));
  },

  createBackup(): Promise<BackupFile> {
    return unwrap(api.post<ApiEnvelope<BackupFile>>('/admin/backups'));
  },

  restore(backupFileName: string): Promise<void> {
    return unwrap(
      api.post<ApiEnvelope<unknown>>('/admin/backups/restore', { backupFileName, confirm: true }),
    ).then(() => undefined);
  },

  audit(entityType?: string): Promise<PagedResult<AuditEntry>> {
    return unwrap(
      api.get<ApiEnvelope<PagedResult<AuditEntry>>>('/admin/audit', {
        params: { entityType: entityType || undefined, pageSize: 100 },
      }),
    );
  },

  users(): Promise<AppUser[]> {
    return unwrap(api.get<ApiEnvelope<AppUser[]>>('/admin/users'));
  },

  createUser(
    username: string,
    fullName: string,
    password: string,
    role: UserRole,
    job: StaffJob | null = null,
  ): Promise<AppUser> {
    return unwrap(
      api.post<ApiEnvelope<AppUser>>('/admin/users', {
        username,
        fullName,
        password,
        role,
        // The owner has no job; staff always have one.
        job: role === 'Staff' ? job : null,
      }),
    );
  },

  /** Moves a member of staff to other work — e.g. the shopkeeper starts selling in the market. */
  setJob(id: number, job: StaffJob): Promise<AppUser> {
    return unwrap(api.put<ApiEnvelope<AppUser>>(`/admin/users/${id}/job`, { job }));
  },
};
