/**
 * Persistent storage (Stage 3.2).
 *
 * Settings were in-memory and reset on every launch. These cover the three
 * pieces that changed: the file-backed key-value store, the value repository
 * over it, and the config codec they carry.
 *
 * The device binding (`deviceStorage.ts`) is not covered here — it needs a
 * native runtime, and it holds no policy. Everything it does is exercised
 * through the injected `TextFile` below.
 */
import { defaultAppConfig, parseConfig, serializeConfig } from '@config/appConfig';
import { createSettingsRepository } from '@config/appComposition';
import { QRSpeedPreference, Theme } from '@domain/settings';
import { createValueRepository } from '@repositories/valueRepository';
import {
  createFileKeyValueStore,
  parseStore,
  serializeStore,
  STORE_FORMAT_VERSION,
  type TextFile,
} from '@storage/fileKeyValueStore';

/** A filesystem in a variable, so the policy can be tested with no device. */
function fakeFile(initial?: string) {
  const state = { contents: initial, writes: 0 };

  const file: TextFile = {
    read: () => state.contents,
    write: (text) => {
      state.contents = text;
      state.writes += 1;
    },
  };

  return { file, state };
}

describe('file-backed key-value store', () => {
  it('survives a restart', () => {
    const { file, state } = fakeFile();

    createFileKeyValueStore({ file }).set('greeting', 'hello');

    // A second store over the same file is what a relaunch looks like.
    expect(createFileKeyValueStore({ file }).get('greeting')).toBe('hello');
    expect(state.contents).toBeDefined();
  });

  it('starts empty when nothing has been written', () => {
    const { file } = fakeFile();

    expect(createFileKeyValueStore({ file }).keys()).toEqual([]);
  });

  it('does not rewrite the file when a value is unchanged', () => {
    // A settings screen re-emits its whole state on every edit, so writing
    // through unconditionally would rewrite the file once per preference.
    const { file, state } = fakeFile();
    const store = createFileKeyValueStore({ file });

    store.set('theme', 'DARK');
    const afterFirst = state.writes;
    store.set('theme', 'DARK');

    expect(state.writes).toBe(afterFirst);
  });

  it('deletes and clears through to the file', () => {
    const { file } = fakeFile();
    const store = createFileKeyValueStore({ file });

    store.set('a', '1');
    store.set('b', '2');
    store.delete('a');

    expect(createFileKeyValueStore({ file }).keys()).toEqual(['b']);

    store.clear();
    expect(createFileKeyValueStore({ file }).keys()).toEqual([]);
  });

  it('starts empty and reports a corrupt file rather than refusing to launch', () => {
    // A truncated write must not stop the application starting, and must not
    // pass unnoticed either.
    const { file } = fakeFile('{"version":1,"entr');
    const onCorrupt = jest.fn();

    const store = createFileKeyValueStore({ file, onCorrupt });

    expect(store.keys()).toEqual([]);
    expect(onCorrupt).toHaveBeenCalledTimes(1);
  });

  it('refuses a record written by a different format version', () => {
    // Discarding is right; silently reading a shape this build did not write
    // is not.
    const raw = JSON.stringify({ version: STORE_FORMAT_VERSION + 1, entries: { a: '1' } });

    expect(parseStore(raw)).toBeUndefined();
  });

  it('refuses a record whose values are not strings', () => {
    const raw = JSON.stringify({ version: STORE_FORMAT_VERSION, entries: { a: 7 } });

    expect(parseStore(raw)).toBeUndefined();
  });

  it('round-trips through its own serializer', () => {
    const entries = new Map([
      ['a', '1'],
      ['b', '2'],
    ]);

    expect(parseStore(serializeStore(entries))).toEqual(entries);
  });
});

describe('config codec', () => {
  it('round-trips a config', () => {
    expect(parseConfig(serializeConfig(defaultAppConfig))).toEqual(defaultAppConfig);
  });

  it('fills in a preference a stored record predates', () => {
    // Adding a setting must not invalidate everyone's stored preferences.
    const partial = JSON.stringify({ theme: Theme.Dark });

    expect(parseConfig(partial)).toEqual({
      ...defaultAppConfig,
      theme: Theme.Dark,
    });
  });

  it('rejects a value this build no longer defines', () => {
    // An update can leave behind a theme that has been removed.
    expect(parseConfig(JSON.stringify({ ...defaultAppConfig, theme: 'SEPIA' }))).toBeUndefined();
  });

  it('rejects text that is not a config at all', () => {
    expect(parseConfig('not json')).toBeUndefined();
    expect(parseConfig('null')).toBeUndefined();
  });
});

describe('settings repository', () => {
  it('persists a preference across a relaunch', async () => {
    const { file } = fakeFile();

    const first = createSettingsRepository(createFileKeyValueStore({ file }));
    await first.set({ ...defaultAppConfig, qrSpeed: QRSpeedPreference.Slow });

    const second = createSettingsRepository(createFileKeyValueStore({ file }));

    expect((await second.get()).qrSpeed).toBe(QRSpeedPreference.Slow);
  });

  it('returns defaults when nothing is stored', async () => {
    const { file } = fakeFile();

    expect(await createSettingsRepository(createFileKeyValueStore({ file })).get()).toEqual(
      defaultAppConfig,
    );
  });

  it('falls back to defaults and reports a record it cannot read', async () => {
    // Losing preferences is acceptable; failing to launch is not.
    const store = createFileKeyValueStore({ file: fakeFile().file });
    const onUnreadable = jest.fn();

    const repository = createValueRepository({
      store,
      key: 'settings',
      codec: { encode: serializeConfig, decode: parseConfig },
      defaultValue: defaultAppConfig,
      onUnreadable,
    });

    store.set('settings', '{"theme":"SEPIA"}');

    expect(await repository.get()).toEqual(defaultAppConfig);
    expect(onUnreadable).toHaveBeenCalledTimes(1);
  });

  it('clears back to the default', async () => {
    const { file } = fakeFile();
    const repository = createSettingsRepository(createFileKeyValueStore({ file }));

    await repository.set({ ...defaultAppConfig, theme: Theme.Dark });
    await repository.clear();

    expect(await repository.get()).toEqual(defaultAppConfig);
  });
});
