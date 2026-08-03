# 10_API_SPEC.md

# Internal API Specification

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 03_ARCHITECTURE.md
- 04_PROTOCOL_SPEC.md
- 05_PACKET_SPEC.md

---

# 1. Purpose

This document defines the public interfaces exposed by the internal components of the photon application.

The objective is to establish stable contracts between architectural modules while hiding implementation details.

This document specifies:

- Public APIs
- Method signatures
- Events
- Return values
- Error contracts

Implementation details SHALL remain outside the scope of this document.

---

# 2. Design Principles

Internal APIs SHALL satisfy the following principles:

- Stable interfaces.
- Explicit inputs.
- Explicit outputs.
- Immutable data transfer.
- Deterministic behavior.
- Platform independence.

---

# 3. Module Overview

The system exposes the following major modules.

```text
Application

├── SessionManager
├── TransferManager
├── ManifestManager
├── PacketManager
├── EncryptionManager
├── CompressionManager
├── IntegrityManager
├── QREngine
├── CameraEngine
├── StorageRepository
└── EventBus
```

Only documented public APIs SHALL be used by external modules.

---

# 4. SessionManager API

## Public Methods

### createSession()

Purpose

Creates a new Session.

Returns

Session

---

### getSession()

Returns

Current Session

---

### closeSession()

Returns

void

---

### isSessionActive()

Returns

boolean

---

# 5. TransferManager API

### startTransfer()

Input

- Session

Returns

Transfer

---

### pauseTransfer()

Returns

void

---

### resumeTransfer()

Returns

void

---

### cancelTransfer()

Returns

void

---

### getProgress()

Returns

TransferProgress

---

# 6. ManifestManager API

### createManifest()

Input

Files

Returns

Manifest

---

### validateManifest()

Returns

ValidationResult

---

### parseManifest()

Returns

Manifest

---

# 7. PacketManager API

### packetize()

Input

Binary Stream

Returns

Packet[]

---

### validatePacket()

Returns

ValidationResult

---

### serialize()

Returns

ByteArray

---

### deserialize()

Returns

Packet

---

# 8. QREngine API

### encode()

Input

Packet

Returns

QRCodeFrame

---

### decode()

Input

Camera Frame

Returns

Packet

---

### benchmark()

Returns

TransportProfile

---

# 9. CameraEngine API

### start()

Returns

void

---

### stop()

Returns

void

---

### captureFrame()

Returns

Frame

---

# 10. StorageRepository API

### saveFile()

Returns

FileReference

---

### loadFile()

Returns

BinaryStream

---

### saveSession()

Returns

void

---

### deleteTemporaryData()

Returns

void

---

# 11. EventBus

Supported Events

- SessionCreated
- TransferStarted
- TransferPaused
- PacketGenerated
- PacketValidated
- TransferCompleted
- TransferFailed

Events SHALL remain immutable.

---

# 12. Error Model

Every API SHALL return standardized errors.

Examples:

| Code              | Meaning                  |
| ----------------- | ------------------------ |
| SESSION_NOT_FOUND | Invalid Session          |
| INVALID_PACKET    | Packet Validation Failed |
| STORAGE_ERROR     | Storage Failure          |
| CAMERA_ERROR      | Camera Failure           |
| TRANSFER_FAILED   | Transfer Aborted         |

Platform-specific exceptions SHALL NOT cross API boundaries.

---

# 13. Data Contracts

Shared objects include:

- Session
- Manifest
- Packet
- Transfer
- Progress
- QRFrame

These objects SHALL remain immutable unless otherwise specified.

---

# 14. Versioning

Internal APIs SHALL be versioned independently from the application.

Breaking changes SHALL require a major API version increment.

Deprecated methods SHOULD remain available for one major version where practical.

---

# 15. API Invariants

Every public API SHALL satisfy the following invariants:

1. Public interfaces SHALL remain stable.
2. Method inputs SHALL be explicitly defined.
3. Return values SHALL be deterministic.
4. Errors SHALL use standardized error codes.
5. Shared objects SHALL remain immutable.
6. Platform-specific details SHALL remain hidden.
7. APIs SHALL remain independently testable.
8. Backward compatibility SHALL be preserved where practical.
9. Modules SHALL communicate only through documented interfaces.
10. Public APIs SHALL remain independent of UI implementation.

This document defines the internal module contracts for photon Version 1.x.
