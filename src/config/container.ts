/**
 * Dependency injection container (ARC-001).
 *
 * Implements planning/DEPENDENCIES.md §8: dependencies are injected, and
 * modules do not construct their own collaborators.
 *
 * Deliberately small. There are no decorators and no reflection: resolution is
 * explicit, which keeps startup deterministic (docs/API_SPEC.md §2) and works
 * unchanged under Hermes. A token is a typed key, so a mis-wired graph is a
 * compile error rather than a runtime surprise.
 */
import { AppError, ErrorCode } from '@utils/errors';

/**
 * A typed key for a dependency.
 *
 * The type parameter exists only to carry `T` through resolution; it has no
 * runtime representation, which is why the symbol description is the identity.
 */
export interface Token<T> {
  readonly key: symbol;
  readonly name: string;
  /** Phantom type. Never read at runtime. */
  readonly __type?: T;
}

/** Creates a token. Two tokens with the same name are still distinct. */
export function createToken<T>(name: string): Token<T> {
  return { key: Symbol(name), name };
}

/** Builds a dependency, resolving whatever else it needs from the container. */
export type Factory<T> = (container: Container) => T;

export type Lifetime = 'singleton' | 'transient';

export interface RegistrationOptions {
  /**
   * `singleton` (default) constructs once and caches.
   * `transient` constructs on every resolve.
   */
  readonly lifetime?: Lifetime;
}

export interface Container {
  /** Registers a factory for a token, replacing any previous registration. */
  register<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): Container;

  /** Registers an already-constructed value as a singleton. */
  registerValue<T>(token: Token<T>, value: T): Container;

  /** Resolves a dependency, constructing it if necessary. */
  resolve<T>(token: Token<T>): T;

  /** Whether a token is registered on this container or a parent. */
  has(token: Token<never>): boolean;

  /**
   * Creates a child container that inherits every registration.
   *
   * Overrides in the child do not affect the parent, which is what lets a test
   * swap one adapter without rebuilding the graph.
   */
  createScope(): Container;

  /** Discards cached singletons. Registrations are kept. */
  reset(): void;
}

interface Registration<T> {
  readonly factory: Factory<T>;
  readonly lifetime: Lifetime;
}

/**
 * Creates a container.
 *
 * @param parent Optional parent whose registrations are inherited.
 */
export function createContainer(parent?: Container): Container {
  const registrations = new Map<symbol, Registration<unknown>>();
  const singletons = new Map<symbol, unknown>();

  /** Tokens currently being constructed, used to detect cycles. */
  const resolving: string[] = [];

  const container: Container = {
    register(token, factory, options = {}) {
      registrations.set(token.key, {
        factory: factory as Factory<unknown>,
        lifetime: options.lifetime ?? 'singleton',
      });
      // A new registration invalidates anything already built from the old one.
      singletons.delete(token.key);
      return container;
    },

    registerValue(token, value) {
      registrations.set(token.key, { factory: () => value, lifetime: 'singleton' });
      singletons.set(token.key, value);
      return container;
    },

    resolve<T>(token: Token<T>): T {
      if (singletons.has(token.key)) {
        return singletons.get(token.key) as T;
      }

      const registration = registrations.get(token.key);

      if (registration === undefined) {
        if (parent !== undefined && parent.has(token as Token<never>)) {
          return parent.resolve(token);
        }
        throw new AppError(
          ErrorCode.DEPENDENCY_NOT_REGISTERED,
          `No registration for dependency "${token.name}".`,
          { details: { token: token.name } },
        );
      }

      if (resolving.includes(token.name)) {
        throw new AppError(
          ErrorCode.DEPENDENCY_CYCLE,
          `Dependency cycle: ${[...resolving, token.name].join(' -> ')}.`,
          { details: { chain: [...resolving, token.name] } },
        );
      }

      resolving.push(token.name);
      try {
        const value = registration.factory(container) as T;
        if (registration.lifetime === 'singleton') {
          singletons.set(token.key, value);
        }
        return value;
      } finally {
        resolving.pop();
      }
    },

    has(token) {
      return registrations.has(token.key) || (parent?.has(token) ?? false);
    },

    createScope() {
      return createContainer(container);
    },

    reset() {
      singletons.clear();
    },
  };

  return container;
}
