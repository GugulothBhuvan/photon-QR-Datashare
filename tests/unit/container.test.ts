/**
 * Dependency injection container (ARC-001) — planning/DEPENDENCIES.md §8.
 */
import { AppError, ErrorCode } from '@core/errors';
import { createContainer, createToken } from '@config/container';

interface Greeter {
  greet(): string;
}

const GreeterToken = createToken<Greeter>('Greeter');
const NameToken = createToken<string>('Name');

describe('createContainer', () => {
  it('resolves a registered factory', () => {
    const container = createContainer();
    container.register(GreeterToken, () => ({ greet: () => 'hello' }));

    expect(container.resolve(GreeterToken).greet()).toBe('hello');
  });

  it('injects the container so factories can resolve their own dependencies', () => {
    const container = createContainer();
    container.registerValue(NameToken, 'photon');
    container.register(GreeterToken, (c) => ({ greet: () => `hello ${c.resolve(NameToken)}` }));

    expect(container.resolve(GreeterToken).greet()).toBe('hello photon');
  });

  it('constructs a singleton once', () => {
    const container = createContainer();
    const factory = jest.fn(() => ({ greet: () => 'hi' }));
    container.register(GreeterToken, factory);

    const first = container.resolve(GreeterToken);
    const second = container.resolve(GreeterToken);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('constructs a transient on every resolve', () => {
    const container = createContainer();
    container.register(GreeterToken, () => ({ greet: () => 'hi' }), { lifetime: 'transient' });

    expect(container.resolve(GreeterToken)).not.toBe(container.resolve(GreeterToken));
  });

  it('is lazy — nothing is constructed until resolved', () => {
    const container = createContainer();
    const factory = jest.fn(() => ({ greet: () => 'hi' }));

    container.register(GreeterToken, factory);
    expect(factory).not.toHaveBeenCalled();

    container.resolve(GreeterToken);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('throws a standardized error for an unregistered token', () => {
    const container = createContainer();

    try {
      container.resolve(GreeterToken);
      throw new Error('expected resolve to throw');
    } catch (error: unknown) {
      expect(AppError.is(error)).toBe(true);
      expect((error as AppError).code).toBe(ErrorCode.DEPENDENCY_NOT_REGISTERED);
      expect((error as AppError).message).toContain('Greeter');
    }
  });

  it('detects a dependency cycle instead of overflowing the stack', () => {
    const container = createContainer();
    const a = createToken<{ value: string }>('A');
    const b = createToken<{ value: string }>('B');

    container.register(a, (c) => ({ value: c.resolve(b).value }));
    container.register(b, (c) => ({ value: c.resolve(a).value }));

    try {
      container.resolve(a);
      throw new Error('expected resolve to throw');
    } catch (error: unknown) {
      expect((error as AppError).code).toBe(ErrorCode.DEPENDENCY_CYCLE);
      expect((error as AppError).message).toContain('A -> B -> A');
    }
  });

  it('replaces a registration and discards what was built from the old one', () => {
    const container = createContainer();
    container.register(GreeterToken, () => ({ greet: () => 'first' }));
    expect(container.resolve(GreeterToken).greet()).toBe('first');

    container.register(GreeterToken, () => ({ greet: () => 'second' }));
    expect(container.resolve(GreeterToken).greet()).toBe('second');
  });

  it('reports registrations through has(), including inherited ones', () => {
    const parent = createContainer();
    parent.registerValue(NameToken, 'photon');
    const child = parent.createScope();

    expect(child.has(NameToken as never)).toBe(true);
    expect(child.has(GreeterToken as never)).toBe(false);
  });

  describe('scopes', () => {
    it('inherits parent registrations', () => {
      const parent = createContainer();
      parent.registerValue(NameToken, 'photon');

      expect(parent.createScope().resolve(NameToken)).toBe('photon');
    });

    it('lets a child override without affecting the parent', () => {
      const parent = createContainer();
      parent.registerValue(NameToken, 'production');

      const scope = parent.createScope();
      scope.registerValue(NameToken, 'test-double');

      expect(scope.resolve(NameToken)).toBe('test-double');
      expect(parent.resolve(NameToken)).toBe('production');
    });
  });

  it('reset discards cached singletons but keeps registrations', () => {
    const container = createContainer();
    const factory = jest.fn(() => ({ greet: () => 'hi' }));
    container.register(GreeterToken, factory);

    container.resolve(GreeterToken);
    container.reset();
    container.resolve(GreeterToken);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('treats two tokens with the same name as distinct', () => {
    const container = createContainer();
    const first = createToken<string>('Duplicate');
    const second = createToken<string>('Duplicate');

    container.registerValue(first, 'one');
    expect(container.has(second as never)).toBe(false);
  });
});
