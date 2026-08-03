/**
 * Repository contracts (ARC-003).
 *
 * docs/ARCHITECTURE.md §6.8: repositories persist application data and
 * encapsulate storage implementation details. Invariant §6.14.6 makes them the
 * owner of persistent application data.
 *
 * Phase 1 defines the shape only. Concrete repositories (preferences, history,
 * session) arrive in Phase 2 with the domain models they persist — an entity
 * type has to exist before a repository can promise to return one.
 */

/**
 * Read/write access to a collection of entities keyed by id.
 *
 * Returns domain objects, never storage primitives: no JSON, no keys, no URIs
 * (see src/repositories/README.md).
 */
export interface Repository<TId, TEntity> {
  /** The entity, or `undefined` when absent. Absence is not an error. */
  get(id: TId): Promise<TEntity | undefined>;

  /** Every stored entity. Ordering is implementation defined unless specified. */
  getAll(): Promise<readonly TEntity[]>;

  /** Inserts or replaces. Entities are immutable, so this always writes whole. */
  save(entity: TEntity): Promise<void>;

  /** Removes an entity. Removing an absent entity is a no-op, not an error. */
  delete(id: TId): Promise<void>;

  /** Removes everything this repository owns. */
  clear(): Promise<void>;
}

/**
 * Access to a single stored value, such as user preferences.
 *
 * Distinct from `Repository` because there is no id and no collection; using
 * a collection interface for a singleton invites meaningless calls.
 */
export interface ValueRepository<TValue> {
  /** The stored value, or the default when nothing has been written. */
  get(): Promise<TValue>;

  /** Replaces the stored value. */
  set(value: TValue): Promise<void>;

  /** Restores the default. */
  clear(): Promise<void>;
}
