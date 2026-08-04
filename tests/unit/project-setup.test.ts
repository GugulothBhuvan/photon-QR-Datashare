/**
 * Phase 0 exit-criteria guard.
 *
 * These tests assert that the project skeleton itself is wired correctly: path
 * aliases resolve, and every architectural layer declared in
 * planning/DEPENDENCIES.md exists as a module. They contain no business logic
 * and should keep passing unchanged as later phases fill the layers in.
 */
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED_LAYERS = [
  'core',
  'qr',
  'camera',
  'storage',
  'repositories',
  'services',
  'controllers',
  'workers',
  'hooks',
  'state',
  'components',
  'screens',
  'navigation',
  'constants',
  'config',
  'utils',
  'events',
  'telemetry',
  'types',
] as const;

describe('project skeleton', () => {
  it('resolves the root path alias', () => {
    expect(require.resolve('@/constants')).toMatch(/src[\\/]constants[\\/]index\.ts$/);
  });

  it('resolves layer path aliases', () => {
    expect(require.resolve('@core/index')).toMatch(/src[\\/]core[\\/]index\.ts$/);
    expect(require.resolve('@utils/index')).toMatch(/src[\\/]utils[\\/]index\.ts$/);
    expect(require.resolve('@domain/index')).toMatch(/src[\\/]types[\\/]index\.ts$/);
  });

  it.each(REQUIRED_LAYERS)('exposes the %s layer as a module', (layer) => {
    const barrel = path.join(PROJECT_ROOT, 'src', layer, 'index.ts');
    expect(fs.existsSync(barrel)).toBe(true);
  });

  it('keeps the twelve specification documents intact', () => {
    // Named rather than counted, so adding a document such as
    // IMPLEMENTATION_NOTES.md does not fail the build, but losing a
    // specification does.
    const docs = fs.readdirSync(path.join(PROJECT_ROOT, 'docs'));

    expect(docs).toEqual(
      expect.arrayContaining([
        'PRD.md',
        'TRD.md',
        'ARCHITECTURE.md',
        'PROTOCOL_SPEC.md',
        'PACKET_SPEC.md',
        'QR_SPEC.md',
        'SECURITY.md',
        'STATE_MACHINES.md',
        'UI_SPEC.md',
        'API_SPEC.md',
        'TEST_SPEC.md',
        'ROADMAP.md',
      ]),
    );
  });
});
