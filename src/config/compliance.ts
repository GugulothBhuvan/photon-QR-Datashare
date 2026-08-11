/**
 * Compliance declaration (REL-001) — PROTOCOL_SPEC §29.14.
 *
 * §29.14 says an implementation claiming compliance SHOULD declare its protocol
 * version, compliance level, supported optional features and supported
 * algorithms, and that the declaration SHOULD be available through
 * documentation **or implementation metadata**. This is the metadata; the prose
 * is `docs/COMPLIANCE.md`, and both are generated from the same facts so they
 * cannot drift apart.
 *
 * **This build does not claim compliance.** §29.3 Level 1 requires Version
 * Negotiation, §29.4 lists it among the mandatory requirements, and §29.13 marks
 * it Required. It is not implemented, and cannot be: SI-008 records that §23.3
 * requires a `MAJOR.MINOR` version while PACKET_SPEC §5 gives the header field
 * one byte, with no document defining how the two components pack into it.
 *
 * Declaring Level 1 anyway would be the single most misleading thing this
 * codebase could do — §29.6 makes Level 1 a promise of interoperability with
 * every other Level 1 implementation, and this build cannot negotiate the
 * version that promise depends on.
 */

/** How a §29.13 checklist requirement stands in this build. */
export const RequirementStatus = {
  /** Implemented and covered by tests. */
  Implemented: 'IMPLEMENTED',
  /** Implemented, but only verifiable on a device. */
  DeviceValidationRequired: 'DEVICE_VALIDATION_REQUIRED',
  /** Not implemented because a specification defect blocks it. */
  Blocked: 'BLOCKED',
  /** Not implemented, and optional. */
  NotImplemented: 'NOT_IMPLEMENTED',
} as const;

export type RequirementStatus = (typeof RequirementStatus)[keyof typeof RequirementStatus];

export interface RequirementDeclaration {
  readonly requirement: string;
  readonly status: RequirementStatus;
  /** Why, when the status is anything but implemented. */
  readonly note?: string;
}

/** The §29.13 checklist, answered. */
export const COMPLIANCE_CHECKLIST: readonly RequirementDeclaration[] = Object.freeze([
  Object.freeze({ requirement: 'Session Management', status: RequirementStatus.Implemented }),
  Object.freeze({
    requirement: 'Handshake',
    status: RequirementStatus.DeviceValidationRequired,
    note: 'The session walks Waiting → Handshake → Active, but no two-device handshake has been exercised: that needs a camera adapter and two devices.',
  }),
  Object.freeze({ requirement: 'Manifest Processing', status: RequirementStatus.Implemented }),
  Object.freeze({ requirement: 'Packet Validation', status: RequirementStatus.Implemented }),
  Object.freeze({ requirement: 'Packet Ordering', status: RequirementStatus.Implemented }),
  Object.freeze({ requirement: 'File Reconstruction', status: RequirementStatus.Implemented }),
  Object.freeze({ requirement: 'Integrity Verification', status: RequirementStatus.Implemented }),
  Object.freeze({ requirement: 'Error Handling', status: RequirementStatus.Implemented }),
  Object.freeze({
    requirement: 'Version Negotiation',
    status: RequirementStatus.Blocked,
    note: 'SI-008: §23.3 requires MAJOR.MINOR; PACKET_SPEC §5 gives the header field one byte, and no document defines the encoding.',
  }),
  Object.freeze({ requirement: 'Deterministic Behavior', status: RequirementStatus.Implemented }),
]);

/** Optional features §29.5 lists, and whether this build has them. */
export const OPTIONAL_FEATURES: readonly RequirementDeclaration[] = Object.freeze([
  Object.freeze({ requirement: 'Resume', status: RequirementStatus.Implemented }),
  Object.freeze({
    requirement: 'Recovery',
    status: RequirementStatus.Implemented,
    note: 'Natural repetition (§15.6 Strategy 1). Forward error correction is not implemented.',
  }),
  Object.freeze({
    requirement: 'Adaptive Transport',
    status: RequirementStatus.NotImplemented,
    note: 'Monitoring is implemented; the loop cannot close without a back-channel (SI-010).',
  }),
  Object.freeze({
    requirement: 'Compression',
    status: RequirementStatus.NotImplemented,
    note: '§18 is unread and no compression exists.',
  }),
  Object.freeze({
    requirement: 'Encryption',
    status: RequirementStatus.NotImplemented,
    note: 'Optional per §19.1. Key exchange is undefined (SI-012).',
  }),
]);

/** The §29.14 declaration. */
export interface ComplianceDeclaration {
  readonly protocolVersion: string;
  /**
   * The compliance level claimed.
   *
   * `null` when none is claimed. See the note on this module: a mandatory
   * §29.13 requirement is unmet, so no level may be claimed.
   */
  readonly complianceLevel: number | null;
  readonly complianceNote: string;
  readonly compressionAlgorithms: readonly string[];
  readonly encryptionAlgorithms: readonly string[];
  readonly integrityAlgorithms: readonly string[];
  readonly checklist: readonly RequirementDeclaration[];
  readonly optionalFeatures: readonly RequirementDeclaration[];
}

export const COMPLIANCE_DECLARATION: ComplianceDeclaration = Object.freeze({
  protocolVersion: 'OSP/1.0',
  complianceLevel: null,
  complianceNote:
    'No compliance level is claimed. §29.3 Level 1 requires Version Negotiation, which SI-008 blocks. Every other §29.13 requirement is implemented.',
  // `NONE` is the absence of the feature, not an algorithm, so it is not listed.
  compressionAlgorithms: Object.freeze([]),
  encryptionAlgorithms: Object.freeze([]),
  integrityAlgorithms: Object.freeze(['SHA-256']),
  checklist: COMPLIANCE_CHECKLIST,
  optionalFeatures: OPTIONAL_FEATURES,
});
