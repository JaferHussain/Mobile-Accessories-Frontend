import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BackupPanel } from './BackupPanel';
import { AuditLogViewer } from './AuditLogViewer';
import { adminApi, STAFF_JOBS, type StaffJob } from './adminApi';
import { QueryState } from '@/components/QueryState';
import { ApiError, type UserRole } from '@/types/api';

function UsersPanel() {
  const queryClient = useQueryClient();

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [job, setJob] = useState<StaffJob>('Counter');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => adminApi.users() });

  const create = useMutation({
    mutationFn: () => adminApi.createUser(username.trim(), fullName.trim(), password, role, role === 'Staff' ? job : null),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setMessage(`Created ${user.username} as ${user.role}.`);
      setUsername('');
      setFullName('');
      setPassword('');
      setError(null);
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not create the user.'),
  });

  const changeJob = useMutation({
    mutationFn: ({ id, newJob }: { id: number; newJob: StaffJob }) => adminApi.setJob(id, newJob),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not change the job.'),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!username.trim() || !fullName.trim() || password.length < 8) {
      setError('Username, full name and a password of at least 8 characters are required.');
      return;
    }

    create.mutate();
  }

  return (
    <section className="admin-section">
      <h2>People</h2>

      <p className="admin-note">
        A Staff account can sell and take payments, but never sees cost prices, profit or reports.
        Its job says which work: the counter (shopkeeper) or field sales (salesman in the market).
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

      <form className="inline-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="newUsername">Username</label>
          <input
            id="newUsername"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="newFullName">Full name</label>
          <input
            id="newFullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="newPassword">Password</label>
          <input
            id="newPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="newRole">Role</label>
          <select
            id="newRole"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="Staff">Staff</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        {/* The owner is the owner; only staff have a job. */}
        {role === 'Staff' && (
          <div className="field">
            <label htmlFor="newJob">Job</label>
            <select id="newJob" value={job} onChange={(event) => setJob(event.target.value as StaffJob)}>
              {STAFF_JOBS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" disabled={create.isPending}>
          Add
        </button>
      </form>

      <QueryState isLoading={users.isPending} error={users.error}>
        <table className="data-table">
          <caption className="visually-hidden">People with a login</caption>
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Job</th>
              <th scope="col">Active</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.fullName}</td>
                <td>{user.role}</td>
                <td>
                  {user.role === 'Staff' ? (
                    <select
                      aria-label={`Job for ${user.fullName}`}
                      value={user.job ?? 'Counter'}
                      onChange={(event) => changeJob.mutate({ id: user.id, newJob: event.target.value as StaffJob })}
                    >
                      {STAFF_JOBS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    'Owner'
                  )}
                </td>
                <td>{user.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const backups = useQuery({ queryKey: ['backups'], queryFn: () => adminApi.backups() });

  const audit = useQuery({
    queryKey: ['audit', entityTypeFilter],
    queryFn: () => adminApi.audit(entityTypeFilter),
  });

  const createBackup = useMutation({
    mutationFn: () => adminApi.createBackup(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  const restore = useMutation({
    mutationFn: (fileName: string) => adminApi.restore(fileName),
    onSuccess: () => {
      // Everything on screen came from a database that has just been replaced.
      queryClient.clear();
    },
  });

  return (
    <>
      <UsersPanel />

      <section className="admin-section">
        <QueryState isLoading={backups.isPending} error={backups.error}>
          <BackupPanel
            backups={backups.data ?? []}
            onCreate={async () => {
              await createBackup.mutateAsync();
            }}
            onRestore={async (fileName) => {
              await restore.mutateAsync(fileName);
            }}
          />
        </QueryState>
      </section>

      <section className="admin-section">
        <QueryState isLoading={audit.isPending} error={audit.error}>
          <AuditLogViewer
            entries={audit.data?.items ?? []}
            entityTypeFilter={entityTypeFilter}
            onEntityTypeFilterChange={setEntityTypeFilter}
          />
        </QueryState>
      </section>
    </>
  );
}
