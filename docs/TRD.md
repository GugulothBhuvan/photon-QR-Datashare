# TRD.md

# photon

## Technical Requirements Document (TRD)

**Version:** 1.0

**Status:** Draft

**Related Documents**

- PRD.md
- ARCHITECTURE.md
- PROTOCOL_SPEC.md
- PACKET_SPEC.md

---

# 1. Purpose

This document defines the technical architecture, engineering constraints, module responsibilities, interfaces, and implementation requirements for photon.

This document SHALL be treated as the primary engineering specification for implementation.

---

# 2. Technical Goals

The system SHALL

- operate completely offline
- reconstruct files bit-for-bit
- be transport independent
- support future protocol upgrades
- minimize memory usage
- minimize battery usage
- support interruption recovery

---

# 3. Technology Stack

## Framework

- Expo SDK
- React Native
- TypeScript
- Expo Router

---

## State

- Zustand

---

## Camera

- expo-camera (MVP)

Future

- Vision Camera

---

## QR

Generation

- qrcode

Decoding

- @zxing/library

---

## Storage

- expo-file-system
- expo-document-picker
- expo-media-library

---

## Crypto

- expo-crypto
- crypto-js

---

## Compression

- fflate

---

## Testing

- Jest
- React Native Testing Library

---

# 4. System Architecture

```
Presentation

↓

Application Layer

↓

Sender / Receiver

↓

Transport Layer

↓

OSP Protocol

↓

QR Layer

↓

Compression

↓

Encryption

↓

File System
```

Each layer SHALL be replaceable.

---

# 5. Repository Structure

```
app/

components/

features/

hooks/

store/

services/

types/

utils/

docs/
```

Every feature SHALL be isolated.

---

# 6. Architecture Principles

## Single Responsibility

Every module SHALL perform exactly one responsibility.

---

## Stateless Processing

Packet processing SHALL be stateless whenever possible.

---

## Dependency Direction

```
UI

↓

Application

↓

Protocol

↓

Utilities
```

Upper layers SHALL never be referenced by lower layers.

---

# 7. Module Breakdown

---

## Sender Module

Responsible for

- loading files
- packet generation
- QR generation
- streaming
- transfer scheduling

Output

Packet Stream

---

## Receiver Module

Responsible for

- camera
- QR decoding
- packet validation
- reconstruction

Output

Recovered File

---

## Protocol Module

Responsible for

- packet definitions
- manifest
- session IDs

---

## Crypto Module

Responsible for

- AES
- SHA256
- CRC32

---

## Compression Module

Responsible for

- compression
- decompression

---

## QR Module

Responsible for

- encoding
- decoding

---

## Storage Module

Responsible for

- reading
- writing
- history

---

# 8. Sender Pipeline

```
Pick File

↓

Read Binary

↓

Compression

↓

Encryption

↓

Chunk

↓

Packet

↓

QR

↓

Display

↓

Repeat
```

---

# 9. Receiver Pipeline

```
Camera

↓

Decode QR

↓

Validate CRC

↓

Store Packet

↓

Check Missing

↓

Merge

↓

SHA Verify

↓

Decrypt

↓

Decompress

↓

Save
```

---

# 10. File Processing

The application SHALL treat every file as binary.

No module SHALL inspect internal file contents.

Supported

- PNG
- JPEG
- PDF
- MP4
- ZIP
- DOCX

are all processed identically.

---

# 11. Manifest

Every transfer SHALL begin with one manifest packet.

Fields

- Session ID
- Filename
- MIME
- File Size
- Packet Count
- SHA256
- Compression
- Encryption

---

# 12. Packet Structure

```
Header

Payload
```

Header

```
Magic Number

Protocol Version

Session ID

File ID

Packet Number

Total Packets

Payload Size

CRC32

Flags
```

Payload

```
Binary Data
```

---

# 13. Packet Constraints

Maximum payload SHALL be configurable.

Default

1024 bytes.

---

# 14. Session

A session SHALL contain

- session UUID
- transfer metadata
- packet map
- state

Session IDs SHALL be unique.

---

# 15. QR Generation

Each packet SHALL generate exactly one QR.

QR generation SHALL occur in memory.

QR images SHALL NOT be stored.

---

# 16. QR Display

The display engine SHALL

- render
- replace
- discard

one QR at a time.

---

# 17. QR Timing

Modes

Reliable

Balanced

Fast

Turbo

Frame duration SHALL be configurable.

---

# 18. Camera Pipeline

```
Camera

↓

Capture

↓

Crop

↓

Decode

↓

Validate

↓

Store
```

---

# 19. Packet Storage

Receiver SHALL store packets

```
Map<PacketIndex, Uint8Array>
```

Duplicate packets SHALL overwrite nothing.

---

# 20. File Reconstruction

After receiving all packets

```
Sort

↓

Merge

↓

Verify

↓

Save
```

---

# 21. Compression Strategy

Auto mode SHALL determine

```
PNG

Compress

JPEG

Skip

ZIP

Skip

PDF

Benchmark

MP4

Skip
```

---

# 22. Encryption

Supported

None

AES128

AES256

Encryption SHALL occur before chunking.

---

# 23. Integrity

Each packet SHALL contain

CRC32

Entire transfer SHALL contain

SHA256

---

# 24. Resume

Sender SHALL continuously loop packets.

Receiver SHALL continue collecting.

No restart SHALL be required.

---

# 25. Adaptive Transport

Adaptive mode SHALL monitor

- scan success
- blur
- decode latency
- duplicate rate

Adaptive mode MAY

- reduce FPS
- enlarge QR
- increase redundancy

---

# 26. Sender State Machine

```
Idle

↓

Preparing

↓

Pairing

↓

Streaming

↓

Paused

↓

Completed

↓

Cancelled
```

---

# 27. Receiver State Machine

```
Idle

↓

Scanning

↓

Receiving

↓

Verifying

↓

Completed

↓

Failed
```

---

# 28. Storage

Temporary

```
Memory
```

Permanent

```
Downloads

Pictures

Documents
```

based on MIME.

---

# 29. History

Each transfer SHALL record

- filename
- size
- duration
- average speed
- packet loss
- timestamp
- success

---

# 30. Settings

General

Transfer

Camera

QR

Security

Developer

---

# 31. Developer Mode

Options

Packet Size

QR Version

Frame Duration

Brightness

FPS

Compression

Error Correction

Hash Algorithm

Debug Overlay

Logs

---

# 32. Logging

Every major module SHALL log

- lifecycle
- errors
- warnings

Production logging SHALL remain local.

---

# 33. Error Handling

Packet CRC failure

Discard

Camera lost

Pause

Manifest mismatch

Abort

Hash mismatch

Retry

---

# 34. Performance Targets

Memory

<150MB

CPU

<35%

Battery

<15%

Transfer Success

> 99%

---

# 35. Security Requirements

No server communication.

No cloud storage.

No mandatory accounts.

Session IDs SHALL expire.

---

# 36. Testing Strategy

Unit

- chunker
- crypto
- QR
- parser

Integration

- sender
- receiver

System

- complete transfer

---

# 37. Acceptance Tests

The implementation SHALL pass

- image transfer
- PDF transfer
- MP4 transfer
- ZIP transfer
- interruption recovery
- duplicate packets
- corrupted packet rejection
- hash verification
- resume transfer

---

# 38. Future Compatibility

Transport SHALL be abstracted.

Future transports

- Color QR
- Optical Grid
- HCCB
- LED Communication

shall not require protocol changes.

---

# 39. Non-Functional Constraints

The implementation SHALL

- avoid blocking the UI thread
- stream packets instead of pre-generating all QR codes
- keep packet processing deterministic
- avoid unnecessary disk I/O
- support graceful cancellation at any stage
- remain platform-agnostic where possible

---

# 40. Engineering Invariants

The following invariants MUST always hold:

1. Every transfer begins with exactly one manifest.
2. Every packet belongs to exactly one session.
3. Packet indices are unique within a file.
4. Packets are immutable after creation.
5. CRC validation occurs before storage.
6. SHA-256 verification occurs before marking a transfer successful.
7. The original filename and extension are preserved.
8. File reconstruction only starts after all required packets (or sufficient recovery packets) are available.
9. The UI never directly accesses protocol internals; all interaction goes through service interfaces.
10. The protocol remains independent of the optical transport implementation.

---

# 41. Definition of Done

The technical implementation is considered complete when:

- All mandatory modules defined in this document are implemented.
- All acceptance tests pass.
- File reconstruction is byte-identical for supported file types.
- The application meets the defined performance targets.
- The architecture remains modular and transport-independent.
- The implementation conforms to the repository structure and engineering invariants defined in this document.
