# 07_SECURITY.md

# Security Specification

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 03_ARCHITECTURE.md
- 04_PROTOCOL_SPEC.md
- 05_PACKET_SPEC.md
- 06_QR_SPEC.md

---

# 1. Purpose

This document defines the security model of the photon Protocol (OSP).

It specifies how confidentiality, integrity, authenticity, and privacy are implemented throughout the system.

Protocol behavior is defined in `PROTOCOL_SPEC.md`.

Binary layouts are defined in `PACKET_SPEC.md`.

This document defines only security-related requirements.

---

# 2. Security Goals

The security architecture aims to provide:

- Confidentiality
- Integrity
- Session isolation
- Replay protection
- Secure temporary storage
- Forward compatibility

---

# 3. Threat Model

The following threats are considered.

### Passive Observer

Attempts to read QR frames.

Mitigation:

- Optional encryption.

---

### Active Attacker

Attempts to inject modified packets.

Mitigation:

- Integrity verification.
- Session validation.

---

### Replay Attack

Attempts to retransmit old packets.

Mitigation:

- Session IDs.
- Packet indices.

---

### Corrupted Transmission

Optical transmission errors.

Mitigation:

- CRC.
- SHA-256 verification.
- Recovery protocol.

---

# 4. Security Architecture

```text
Sender

↓

Compression

↓

Encryption

↓

Packetization

↓

QR Transport

↓

Receiver

↓

Packet Reconstruction

↓

Decryption

↓

Integrity Verification
```

---

# 5. Encryption

Encryption is optional.

When enabled:

- Entire file payload SHALL be encrypted before packetization.
- Header metadata SHALL remain readable unless explicitly protected.

Supported algorithms are implementation-defined.

Recommended default:

- AES-256-GCM

---

# 6. Integrity

Integrity verification SHALL occur at two levels.

### Packet Integrity

- CRC32

### File Integrity

- SHA-256

Transfer success SHALL depend on successful file integrity verification.

---

# 7. Session Isolation

Every transfer SHALL have an independent security context.

Security information SHALL NOT be shared across Sessions.

Session termination SHALL destroy temporary security state.

---

# 8. Key Management

The application SHALL isolate key management from protocol execution.

Responsibilities include:

- Key generation
- Key storage
- Key destruction

Keys SHALL never be embedded in protocol packets.

---

# 9. Secure Storage

Sensitive information SHOULD be stored securely.

Examples include:

- Encryption keys
- Session secrets
- Temporary decrypted files

Temporary data SHOULD be deleted immediately after use.

---

# 10. Privacy

photon is designed to operate entirely offline.

The application SHALL NOT require:

- Internet access
- Cloud services
- User accounts
- Remote authentication

No user files SHALL be transmitted outside participating devices.

---

# 11. Security Validation

Security validation SHALL include:

- Session validation
- Packet integrity
- File integrity
- Encryption context validation
- Version compatibility

Validation failures SHALL terminate the affected transfer.

---

# 12. Security Logging

Logs SHOULD contain:

- Session identifiers
- Error codes
- Timing information

Logs SHALL NOT contain:

- File contents
- Encryption keys
- Plaintext payloads
- Personal information

---

# 13. Failure Handling

Security failures include:

- Invalid integrity hash
- Failed decryption
- Invalid Session
- Unsupported encryption algorithm

Affected transfers SHALL be rejected.

Other active Sessions SHALL remain unaffected.

---

# 14. Best Practices

Implementations SHOULD:

- Use authenticated encryption.
- Minimize decrypted data lifetime.
- Validate before processing.
- Isolate security components.
- Erase temporary secrets promptly.

---

# 15. Future Extensions

Future versions MAY introduce:

- Public-key encryption
- Password-protected transfers
- Device authentication
- Digital signatures
- Post-quantum cryptography

These extensions SHALL remain backward compatible where practical.

---

# Appendix A — Security Summary

| Feature              | Status      |
| -------------------- | ----------- |
| Offline Operation    | Required    |
| CRC Validation       | Required    |
| SHA-256 Verification | Required    |
| Encryption           | Optional    |
| Session Isolation    | Required    |
| Replay Protection    | Required    |
| Secure Storage       | Recommended |

This document defines the security architecture for photon Version 1.x.
