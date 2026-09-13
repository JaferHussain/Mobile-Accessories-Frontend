import { api, unwrap } from '@/api/client';
import type { ApiEnvelope, PagedResult, UserRole } from '@/types/api';
import type { AuditEntry } from './AuditLogViewer';
import type { BackupFile } from './BackupPanel';

export interface AppUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
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
  ): Promise<AppUser> {
    return unwrap(
      api.post<ApiEnvelope<AppUser>>('/admin/users', { username, fullName, password, role }),
    );
  },
};
