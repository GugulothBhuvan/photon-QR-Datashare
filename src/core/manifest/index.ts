/**
 * manifest/ — Manifest management (PRO-002)
 *
 * Implements docs/PROTOCOL_SPEC.md §10 and docs/API_SPEC.md §6: manifest
 * creation, parsing, validation and lookup.
 *
 * Does not serialize packets, manage sessions, touch transport, reconstruct
 * files or persist anything.
 */

export {
  createManifestManager,
  ManifestRejection,
  mergeManifestResults,
  packetsFor,
  type CreateManifestInput,
  type ManifestExpectations,
  type ManifestManager,
  type ManifestValidationResult,
  type ParseResult,
  type PerFileOptions,
} from './manifestManager';
