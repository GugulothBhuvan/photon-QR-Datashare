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

  it('keeps the documentation set intact', () => {
    const docs = fs.readdirSync(path.join(PROJECT_ROOT, 'docs'));
    expect(docs.filter((entry) => entry.endsWith('.md'))).toHaveLength(12);
  });
});
