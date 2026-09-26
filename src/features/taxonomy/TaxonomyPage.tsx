import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/types/api';
import {
  brandApi,
  categoryApi,
  type TaxonomyItem,
  type TaxonomyUpsert,
} from './taxonomyApi';

interface TaxonomyPageProps {
  /** Which module this page is. Also the query key and the API resource. */
  resource: 'categories' | 'brands';
  /** "Category" / "Brand" — used in headings and messages. */
  singular: string;
  plural: string;
}

/**
 * The Categories and Brands screens.
 *
 * Both modules are a list of named rows the catalogue points at, so they share one component
 * rather than two near-identical copies. What differs is only the wording and the endpoint.
 */
export function TaxonomyPage({ resource, singular, plural }: TaxonomyPageProps) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const client = resource === 'categories' ? categoryApi : brandApi;

  const [search, setSearch] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<TaxonomyItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [formError, setFormError] = useState<string | null>(null);


  const { data, isPending, error } = useQuery({
    queryKey: [resource, search, showRetired],
    queryFn: () =>
      client.search({
        search: search || undefined,
        includeInactive: showRetired,
        pageSize: 200,
      }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: [resource] });
    // A rename here changes what every product displays, so that list is stale too.
    await queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const save = useMutation({
    mutationFn: (item: TaxonomyUpsert) =>
      editing ? client.update(editing.id, item) : client.create(item),
    onSuccess: async () => {
      await refresh();
      resetForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(
        mutationError instanceof ApiError
          ? mutationError.message
          : `Could not save the ${singular.toLowerCase()}. Please try again.`,
      );
    },
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      isActive ? client.reactivate(id) : client.deactivate(id),
    onSuccess: refresh,
  });

  function resetForm() {
    setEditing(null);
    setName('');
    setDescription('');
    setFormError(null);
  }

  function startEditing(item: TaxonomyItem) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? '');
    setFormError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError(`${singular} name is required.`);
      return;
    }

    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      // Sent for brands only. A brand is Imported unless the owner ticks this (FR-087a).
    });
  }

  return (
    <section>
      <header className="page-header">
        <h2>{plural}</h2>
      </header>

      {isAdmin && (
        <form className="panel panel--taxonomy" onSubmit={handleSubmit} noValidate>
          <h3>{editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}</h3>

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="field">
            <label htmlFor="taxonomyName">Name</label>
            <input
              id="taxonomyName"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="taxonomyDescription">Description</label>
            <input
              id="taxonomyDescription"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="form-actions">
            <button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : `Save ${singular.toLowerCase()}`}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} disabled={save.isPending}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="taxonomySearch">Search</label>
          <input
            id="taxonomySearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {isAdmin && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(event) => setShowRetired(event.target.checked)}
            />
            Show retired
          </label>
        )}
      </div>

      <QueryState
        isLoading={isPending}
        error={error}
        isEmpty={data?.items.length === 0}
        emptyMessage={`No ${plural.toLowerCase()} yet.`}
      >
        <table className="data-table">
          <caption className="visually-hidden">{plural}</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col">Products</th>
              {isAdmin && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className={item.isActive ? undefined : 'row--retired'}>
                <td>
                  {item.name}
                  {!item.isActive && <span className="badge badge--muted">Retired</span>}
                </td>
                <td>{item.description ?? '—'}</td>
                <td className="numeric">{item.productCount}</td>
                {isAdmin && (
                  <td>
                    <button type="button" onClick={() => startEditing(item)}>
                      Edit
                    </button>
                    {item.isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Retiring is safe even when in use — the products keep their label
                          // and keep working; it just stops being offered for new stock.
                          const warning =
                            item.productCount > 0
                              ? `"${item.name}" is used by ${item.productCount} product(s). ` +
                                'They keep it — it just stops being offered for new products. Retire it?'
                              : `Retire "${item.name}"?`;

                          if (window.confirm(warning)) {
                            setActive.mutate({ id: item.id, isActive: false });
                          }
                        }}
                      >
                        Retire
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActive.mutate({ id: item.id, isActive: true })}
                      >
                        Restore
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
    </section>
  );
}

export function CategoriesPage() {
  return <TaxonomyPage resource="categories" singular="Category" plural="Categories" />;
}

export function BrandsPage() {
  return <TaxonomyPage resource="brands" singular="Brand" plural="Brands" />;
}
