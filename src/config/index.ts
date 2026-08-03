/**
 * config/ — Composition root
 *
 * Owns: Runtime configuration (ARC-005) and the dependency-injection container
 * and wiring (ARC-001).
 *
 * May depend on:
 *   - Any layer, for wiring only
 *
 * Must NOT:
 *   - Be imported by the core protocol
 *   - Be imported in order to *do* work — modules receive dependencies, they
 *     do not reach into the container
 *
 * See ARCHITECTURE_GRAPH.md §3 for why this module's imports point upward.
 * Configuration members: docs/ARCHITECTURE.md §6.12.
 */

export {
  assertValidConfig,
  defaultAppConfig,
  PerformanceMode,
  QRSpeedPreference,
  Theme,
  withConfig,
  type AppConfig,
  type StoragePreferences,
} from './appConfig';

export { createAppContainer, type CompositionOptions } from './composition';

export {
  createContainer,
  createToken,
  type Container,
  type Factory,
  type Lifetime,
  type RegistrationOptions,
  type Token,
} from './container';

export { Tokens } from './tokens';
