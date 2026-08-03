PROTOCOL_SPEC.md

1. Introduction
2. Design Principles
3. Terminology
4. RFC2119 Requirement Keywords
5. Protocol Overview
6. Layered Architecture
7. Protocol Lifecycle
8. Session Management
9. Handshake Protocol
10. Manifest Protocol
11. Packet Protocol
12. Transfer Protocol
13. Packet Ordering
14. Resume Protocol
15. Recovery Protocol
16. Multi-file Protocol
17. Adaptive Transport
18. Compression Rules
19. Encryption Rules
20. Integrity Verification
21. Error Handling
22. Timing Rules
23. Version Negotiation
24. Compatibility Rules
25. Security Considerations
26. Protocol State Machines
27. Sequence Diagrams
28. Examples
29. Compliance Requirements
30. Future Extensions

# 1. Introduction

## 1.1 Purpose

The **photon Protocol (OSP)** is an application-layer protocol that defines a standardized method for transferring digital files between two computing devices using optical communication. OSP is designed to enable secure, reliable, and fully offline file transfer by transmitting structured binary packets through an optical transport medium, such as animated QR codes displayed on a screen and captured by a camera.

The protocol specifies the complete communication lifecycle, including session establishment, metadata exchange, packet transmission, integrity verification, error recovery, and transfer completion. It is intentionally independent of any specific programming language, operating system, hardware platform, or optical encoding technology.

The objective of OSP is to ensure that any compliant sender and receiver implementation can exchange files with deterministic behavior and reconstruct the original file without modification or loss.

---

## 1.2 Scope

This specification defines the normative behavior of **photon Protocol Version 1.0 (OSP/1.0)**.

The protocol governs:

- Session establishment and lifecycle.
- Transfer initialization.
- Manifest exchange.
- Packet transmission and ordering.
- Packet validation.
- Transfer completion.
- Resume and recovery procedures.
- File integrity verification.
- Protocol version negotiation.
- Error handling behavior.
- Compliance requirements.

This specification does **not** define:

- User interface behavior.
- Application architecture.
- Camera implementation.
- QR rendering algorithms.
- File system APIs.
- Operating-system-specific functionality.
- Performance optimizations specific to a platform.

Those concerns are covered by companion technical documents.

---

## 1.3 Goals

The primary goals of OSP are:

### Offline Operation

OSP SHALL operate without requiring:

- Internet connectivity.
- Local area networks.
- Bluetooth.
- NFC.
- Cellular connectivity.
- Cloud infrastructure.
- External authentication services.

Communication occurs directly between participating devices using an optical transport mechanism.

---

### Lossless File Transfer

OSP SHALL preserve the complete binary representation of the transmitted file.

A compliant receiver MUST reconstruct a byte-for-byte identical copy of the original file before the transfer is considered successful.

---

### Transport Independence

OSP defines communication semantics only.

The protocol SHALL remain independent of the physical transport mechanism.

Although Version 1.0 uses QR-based optical transport, future versions MAY operate over alternative optical encoding systems without modifying protocol semantics.

---

### Cross-Platform Compatibility

OSP SHALL be implementable on any computing platform capable of:

- Reading binary files.
- Displaying optical frames.
- Capturing optical frames.
- Performing packet verification.

No platform-specific assumptions are made by the protocol.

---

### Reliability

OSP prioritizes successful reconstruction over maximum throughput.

The protocol includes mechanisms for:

- Duplicate detection.
- Packet validation.
- Integrity verification.
- Transfer recovery.
- Session validation.
- Resume after interruption.

---

### Extensibility

OSP SHALL support future protocol evolution through explicit protocol versioning, reserved fields, and capability negotiation.

Future protocol revisions SHOULD extend existing behavior without breaking compatibility wherever practical.

---

## 1.4 Non-Goals

The following capabilities are outside the scope of OSP Version 1.0:

- Real-time video streaming.
- Real-time voice communication.
- Remote networking.
- Internet-based communication.
- Device synchronization.
- Background synchronization.
- Distributed storage.
- File editing or collaboration.
- Continuous folder synchronization.

OSP is a discrete file transfer protocol and is not intended to replace networking protocols or cloud synchronization services.

---

## 1.5 Protocol Model

OSP follows a layered communication model in which protocol semantics remain independent of the transport implementation.

```
Application
        │
        ▼
photon Protocol (OSP)
        │
        ▼
Optical Transport
(QR / Color QR / Future)
        │
        ▼
Display
        │
        ▼
Camera
```

The protocol defines how information is organized and exchanged, while the transport layer defines how packets are physically represented and transmitted.

This separation allows transport implementations to evolve without affecting protocol compatibility.

---

## 1.6 Design Philosophy

OSP is built around the following engineering principles:

### Offline First

No protocol operation depends on network infrastructure.

### Binary Native

Files are transferred as raw binary data without interpretation.

### Deterministic

Given identical protocol packets, all compliant implementations SHALL produce identical output.

### Reliable

Integrity and successful reconstruction take precedence over transfer speed.

### Privacy by Design

Protocol operation does not require user accounts, cloud services, or persistent identifiers.

### Transport Agnostic

Protocol behavior remains independent of the underlying optical transport.

### Versioned

Every protocol exchange explicitly identifies the protocol version to support long-term interoperability.

---

## 1.7 Intended Audience

This specification is intended for:

- Protocol implementers.
- Mobile application developers.
- Desktop application developers.
- Embedded systems developers.
- Security auditors.
- Interoperability testing tools.
- Automated development agents.
- Future maintainers of the photon ecosystem.

Readers are expected to be familiar with binary data processing, communication protocols, checksum algorithms, and finite state machines.

---

## 1.8 Companion Specifications

This document defines protocol behavior only.

It SHALL be read together with the following specifications:

- **PRD.md** — Product requirements.
- **TRD.md** — Technical architecture.
- **ARCHITECTURE.md** — System architecture.
- **PACKET_SPEC.md** — Binary packet definitions.
- **QR_SPEC.md** — Optical QR transport.
- **SECURITY.md** — Cryptography and threat model.
- **STATE_MACHINES.md** — Sender and receiver state machines.
- **API_SPEC.md** — Internal interfaces.
- **TEST_SPEC.md** — Compliance and validation tests.

Together, these documents define the complete photon implementation while maintaining a clear separation between product requirements, engineering architecture, protocol behavior, transport implementation, and security.

# 2. Design Principles

The photon Protocol (OSP) is designed around a set of core engineering principles that define the long-term direction of the protocol. Every compliant implementation SHOULD follow these principles when implementing, extending, or optimizing the protocol.

These principles take precedence when protocol behavior is ambiguous or when future protocol versions introduce new capabilities.

---

## 2.1 Offline First

OSP is fundamentally an offline communication protocol.

No protocol operation SHALL require:

- Internet connectivity
- Cloud infrastructure
- Bluetooth
- Wi-Fi
- Cellular networks
- External authentication servers
- Third-party services

All protocol communication occurs directly between participating devices through an optical transport layer.

A compliant implementation MUST remain fully functional in environments with no network connectivity.

---

## 2.2 Transport Independence

OSP defines communication semantics, not transport mechanisms.

The protocol SHALL remain independent of how packets are physically transmitted.

Version 1.0 uses QR-based optical transmission as the default transport implementation, but future transports MAY include:

- Colored QR Codes
- High Capacity Color Barcode (HCCB)
- Optical Grid Encoding
- LED Matrix Communication
- Projected Optical Displays
- Future optical encoding technologies

Replacing the transport layer SHALL NOT require modifications to the protocol layer.

---

## 2.3 Binary-Native Communication

OSP transfers files as raw binary data.

The protocol SHALL NOT interpret or modify application-level file formats.

Examples include, but are not limited to:

- PNG
- JPEG
- PDF
- MP4
- MP3
- ZIP
- DOCX
- APK

All files SHALL be processed as opaque binary byte streams.

This ensures:

- Exact reconstruction
- Format independence
- Simplified implementation
- Maximum compatibility

---

## 2.4 Deterministic Behavior

Given the same sequence of valid packets, every compliant implementation SHALL produce identical output.

Protocol behavior MUST NOT depend on:

- Operating system
- Programming language
- Hardware manufacturer
- Device model
- User interface implementation

Deterministic behavior is required to ensure interoperability across independent implementations.

---

## 2.5 Reliability Before Throughput

OSP prioritizes successful reconstruction over maximum transfer speed.

Implementations SHOULD:

- Validate every received packet.
- Detect corruption before storage.
- Verify complete transfers before completion.
- Recover from temporary interruptions.
- Prevent incomplete file reconstruction.

Higher transfer speeds SHALL NOT compromise protocol correctness.

---

## 2.6 Modular Architecture

The protocol SHALL be organized into independent logical layers.

Each layer SHALL have a clearly defined responsibility.

Typical layers include:

- Session Management
- Manifest Exchange
- Packet Processing
- Transport
- Integrity Verification

Each layer SHOULD be replaceable without requiring changes to unrelated layers.

---

## 2.7 Stateless Packet Processing

Individual packets SHOULD be independently verifiable.

Packet validation SHALL NOT require knowledge of previously received packets except where explicitly defined by the protocol.

Independent packet validation enables:

- Duplicate detection
- Parallel processing
- Resume functionality
- Error isolation

---

## 2.8 Forward Compatibility

Future protocol versions SHOULD extend OSP rather than redefine it.

To support protocol evolution:

- Reserved packet fields SHALL remain unused in OSP/1.0.
- Unknown optional fields SHALL be safely ignored unless explicitly marked as mandatory.
- New protocol capabilities SHALL be negotiated during session establishment.

Implementations SHOULD avoid assumptions about reserved values.

---

## 2.9 Backward Compatibility

Where practical, newer protocol versions SHOULD communicate with older implementations.

If compatibility cannot be achieved, implementations SHALL fail gracefully with a clear protocol version mismatch rather than attempting undefined behavior.

---

## 2.10 Security by Design

Security is an integral protocol characteristic rather than an optional extension.

The protocol SHALL support:

- Integrity verification
- Session isolation
- Optional encryption
- Tamper detection

Sensitive information SHOULD only be transmitted when required for successful reconstruction.

---

## 2.11 Privacy by Default

OSP minimizes information exposure.

The protocol SHALL NOT require:

- User accounts
- Persistent device identities
- Cloud synchronization
- Telemetry
- External analytics

Session identifiers SHALL exist only for the duration of the transfer unless explicitly retained by the application.

---

## 2.12 Extensibility

OSP is designed as a long-lived protocol.

Future versions MAY introduce:

- New packet types
- Improved error recovery
- Additional transport mechanisms
- New cryptographic algorithms
- Higher-capacity optical encoding
- Performance optimizations

These extensions SHOULD preserve existing protocol semantics wherever practical.

---

## 2.13 Separation of Concerns

OSP separates communication logic from implementation details.

The protocol specification defines:

- What information is exchanged.
- When information is exchanged.
- How information is validated.

The protocol does not define:

- User interface behavior.
- Camera APIs.
- Rendering techniques.
- Storage implementation.
- Programming language constructs.

These concerns belong to implementation-specific documentation.

---

## 2.14 Predictable Failure

Protocol failures SHALL be explicit and recoverable whenever possible.

Implementations SHALL detect and report conditions such as:

- Invalid session identifiers.
- Corrupted packets.
- Integrity verification failures.
- Unsupported protocol versions.
- Manifest inconsistencies.

Undefined behavior SHALL be avoided.

---

## 2.15 Compliance

A compliant implementation SHALL preserve the design principles described in this section.

Future protocol revisions MAY introduce additional capabilities, provided they do not violate the following foundational principles:

1. Offline First
2. Transport Independence
3. Binary-Native Communication
4. Deterministic Behavior
5. Reliability Before Throughput
6. Modular Architecture
7. Stateless Packet Processing
8. Forward Compatibility
9. Security by Design
10. Privacy by Default
11. Extensibility
12. Separation of Concerns

These principles form the architectural foundation of the photon Protocol and SHALL guide all future protocol evolution.

# 3. Terminology

This section defines the normative terminology used throughout the photon Protocol (OSP). Unless otherwise stated, every occurrence of the following terms in this specification SHALL use the definitions provided here.

---

# 3.1 Protocol

**photon Protocol (OSP)**

The application-layer communication protocol responsible for transferring digital files between two participating devices using an optical transport mechanism.

OSP defines:

- Session lifecycle
- Metadata exchange
- Packet transmission
- Integrity verification
- Recovery behavior

OSP does **not** define the physical transport implementation.

---

# 3.2 Transport

A transport is the physical mechanism used to deliver protocol packets from one device to another.

Examples include:

- Standard QR Codes
- Colored QR Codes
- Optical Grid Encoding
- LED Matrix Encoding
- Future optical transport mechanisms

Transport implementations MUST preserve packet ordering and packet contents but MAY differ in encoding efficiency and throughput.

---

# 3.3 Session

A session represents one logical transfer between a sender and one or more receivers.

A session begins after successful handshake and ends when:

- the transfer completes,
- the transfer is cancelled,
- or the session expires.

Every session is uniquely identified by a **Session ID**.

---

# 3.4 Session ID

A globally unique identifier assigned to every transfer session.

The Session ID is used to:

- distinguish concurrent transfers,
- prevent packet mixing,
- associate packets with the correct transfer,
- support resume functionality.

A Session ID SHALL remain constant throughout the lifetime of a transfer.

---

# 3.5 Sender

The device responsible for initiating a transfer.

The sender SHALL:

- read files,
- create packets,
- generate manifests,
- encode packets,
- transmit packets.

There SHALL be exactly one sender within a session.

---

# 3.6 Receiver

The device responsible for receiving packets and reconstructing files.

The receiver SHALL:

- discover sessions,
- decode packets,
- validate packets,
- reconstruct files,
- verify integrity.

A session MAY support one or more receivers.

---

# 3.7 Manifest

A special protocol message transmitted before all file packets.

The manifest contains metadata required to reconstruct the transfer.

Typical metadata includes:

- filename
- file size
- MIME type
- total packets
- hash
- compression method
- encryption method

Every transfer SHALL begin with exactly one manifest.

---

# 3.8 File

A file is any sequence of binary bytes supplied by the operating system.

OSP treats every file identically regardless of its format.

Examples include:

- Images
- Videos
- Audio
- Documents
- Archives
- Executables

The protocol SHALL NOT inspect file contents.

---

# 3.9 Binary Stream

The complete ordered sequence of bytes representing a file.

All packet payloads are derived from the binary stream.

The reconstructed binary stream SHALL be identical to the original.

---

# 3.10 Packet

A packet is the smallest transferable protocol unit.

Each packet consists of:

- Header
- Payload

Packets SHALL be independently identifiable.

Packets SHALL belong to exactly one session.

---

# 3.11 Header

The structured metadata located at the beginning of every packet.

The header identifies:

- protocol version
- packet number
- session
- flags
- payload size
- integrity information

The exact binary layout is defined in **PACKET_SPEC.md**.

---

# 3.12 Payload

The payload contains a portion of the original binary stream.

Payload contents SHALL remain unchanged throughout transmission.

---

# 3.13 Packet Index

The zero-based position of a packet within a file transfer.

Example:

```text
Packet 0
Packet 1
Packet 2
...
Packet N
```

Packet indices SHALL be unique within a file.

---

# 3.14 Packet Sequence

The ordered collection of packets representing one file.

The receiver reconstructs the original binary stream by ordering packets according to their packet indices.

---

# 3.15 Chunk

A contiguous segment of binary data extracted from the original file before packet construction.

One chunk becomes the payload of one packet.

---

# 3.16 Frame

A single visual representation of one packet produced by the transport layer.

For QR transport:

One packet

↓

One QR Code

↓

One displayed frame

Future transport mechanisms MAY encode packets differently.

---

# 3.17 Frame Duration

The amount of time a transport frame remains visible before the next frame is displayed.

Frame duration determines effective transmission speed.

---

# 3.18 Transfer

A transfer is the complete process of moving one or more files from a sender to one or more receivers.

A transfer includes:

- handshake
- manifest
- packet transmission
- integrity verification
- completion

---

# 3.19 Multi-file Transfer

A transfer containing more than one file.

Each file SHALL have:

- independent metadata
- independent packet sequence
- independent integrity verification

All files share the same session.

---

# 3.20 Resume

The ability to continue an interrupted transfer without restarting from the beginning.

Resume behavior SHALL preserve previously validated packets.

---

# 3.21 Recovery

The process of reconstructing missing or corrupted packet information.

Recovery mechanisms MAY include:

- repeated packet transmission,
- redundant packets,
- forward error correction,
- parity packets.

---

# 3.22 Integrity Verification

The process of determining whether received data exactly matches transmitted data.

Integrity verification occurs at two levels:

- Packet integrity
- File integrity

---

# 3.23 Packet Integrity

Verification that an individual packet has not been corrupted during transmission.

Packet integrity SHALL occur before packet storage.

---

# 3.24 File Integrity

Verification that the reconstructed binary stream exactly matches the original file.

File integrity SHALL occur before the transfer is considered complete.

---

# 3.25 Duplicate Packet

A packet whose packet index has already been successfully received and validated.

Duplicate packets SHALL be ignored unless explicitly required for recovery.

---

# 3.26 Missing Packet

A packet expected by the receiver but not yet received.

Transfers SHALL NOT be finalized while required packets remain missing.

---

# 3.27 Corrupted Packet

A packet that fails integrity verification.

Corrupted packets SHALL be discarded.

They SHALL NOT participate in file reconstruction.

---

# 3.28 Capability

A protocol feature supported by an implementation.

Examples include:

- Compression
- Encryption
- Recovery
- Adaptive Transport
- Future protocol extensions

Capabilities are exchanged during session establishment.

---

# 3.29 Protocol Version

A numeric identifier representing the supported version of OSP.

Every session SHALL negotiate a protocol version before packet transmission begins.

---

# 3.30 Compliant Implementation

A software implementation that satisfies all mandatory requirements defined by this specification.

A compliant implementation SHALL:

- implement mandatory protocol behavior,
- preserve protocol semantics,
- correctly reconstruct files,
- pass all compliance tests defined in **TEST_SPEC.md**.

Only compliant implementations may claim compatibility with photon Protocol Version 1.0.

# 4. RFC 2119 Requirement Keywords

## 4.1 Purpose

This specification uses standardized requirement keywords to distinguish between mandatory protocol behavior, recommended behavior, and optional implementation features.

These keywords define the implementation obligations of any software claiming compliance with the **photon Protocol (OSP)**.

Unless otherwise stated, every occurrence of the keywords defined in this section SHALL carry the meanings specified below.

---

# 4.2 Normative Language

The following requirement keywords are interpreted according to the conventions established by RFC 2119 and RFC 8174.

---

## MUST

"MUST" indicates an absolute requirement of the protocol.

A compliant implementation has no discretion to ignore or modify this requirement.

Failure to satisfy a **MUST** requirement results in protocol non-compliance.

### Example

- Every transfer **MUST** begin with exactly one Manifest Packet.
- Every received packet **MUST** be validated before storage.
- Every completed transfer **MUST** pass file integrity verification.

---

## MUST NOT

"MUST NOT" indicates an absolute prohibition.

Behavior identified using this keyword is forbidden by the protocol.

Violating a **MUST NOT** requirement results in protocol non-compliance.

### Example

- A receiver **MUST NOT** reconstruct a file before all required packets have been received.
- An implementation **MUST NOT** modify packet payload contents during transmission.
- A sender **MUST NOT** transmit packets before successful session establishment.

---

## REQUIRED

"REQUIRED" is equivalent to **MUST**.

It is used when emphasizing mandatory protocol behavior.

---

## SHALL

"SHALL" indicates mandatory behavior expected from every compliant implementation.

Within this specification, **SHALL** and **MUST** are functionally equivalent.

The use of **SHALL** generally describes protocol behavior, while **MUST** is typically used for implementation obligations.

### Example

- Session identifiers **SHALL** remain constant throughout the transfer.
- Packet ordering **SHALL** follow ascending packet indices.

---

## SHALL NOT

"SHALL NOT" indicates prohibited protocol behavior.

It is equivalent to **MUST NOT**.

---

## SHOULD

"SHOULD" indicates a strong recommendation.

Implementations are expected to follow the recommendation unless a documented technical reason exists not to.

Ignoring a **SHOULD** requirement does not necessarily make an implementation non-compliant, but the consequences should be understood.

### Example

- Implementations **SHOULD** enable adaptive transport by default.
- Packet processing **SHOULD** remain stateless whenever practical.

---

## SHOULD NOT

"SHOULD NOT" indicates behavior that is discouraged.

Implementations may deviate from this recommendation only with a clear technical justification.

---

## MAY

"MAY" indicates optional behavior.

Implementations are free to support or omit optional features without affecting protocol compliance unless those features are explicitly negotiated during session establishment.

### Example

- An implementation **MAY** support multiple simultaneous receivers.
- A sender **MAY** support additional compression algorithms.

---

## OPTIONAL

"OPTIONAL" identifies features that are outside the mandatory protocol requirements.

Optional features SHALL NOT change the behavior of mandatory protocol functionality.

Examples include:

- Developer diagnostics
- Benchmark mode
- Additional compression algorithms
- Experimental transport mechanisms

---

# 4.3 Requirement Classification

Protocol requirements are classified into three categories.

---

## Mandatory Requirements

Mandatory requirements define the minimum behavior necessary for protocol interoperability.

These requirements use:

- MUST
- MUST NOT
- SHALL
- SHALL NOT
- REQUIRED

Failure to implement mandatory requirements results in a non-compliant implementation.

---

## Recommended Requirements

Recommended requirements improve reliability, performance, or interoperability.

These requirements use:

- SHOULD
- SHOULD NOT

Implementations remain compliant if they intentionally deviate from these recommendations.

---

## Optional Requirements

Optional requirements provide additional capabilities beyond the protocol baseline.

These requirements use:

- MAY
- OPTIONAL

Support for optional features SHALL be negotiated where applicable.

---

# 4.4 Requirement Identifiers

Every normative requirement in this specification SHALL be uniquely identifiable.

Requirement identifiers follow the format:

```text
OSP-<Section>-<Requirement Number>
```

Examples:

```text
OSP-SESSION-001

OSP-PACKET-014

OSP-HANDSHAKE-003

OSP-VERIFY-009
```

Requirement identifiers enable:

- traceability,
- testing,
- implementation verification,
- protocol audits,
- automated validation.

---

# 4.5 Compliance Interpretation

A software implementation is considered **OSP/1.0 compliant** only if it satisfies all mandatory requirements defined in this specification.

Compliance requires:

- Correct protocol behavior.
- Correct packet handling.
- Correct session handling.
- Successful interoperability with another compliant implementation.
- Successful completion of protocol conformance tests.

Support for optional features SHALL NOT be required for compliance.

---

# 4.6 Conflict Resolution

If multiple statements appear to conflict, they SHALL be interpreted using the following order of precedence:

1. MUST / MUST NOT
2. SHALL / SHALL NOT
3. REQUIRED
4. SHOULD / SHOULD NOT
5. MAY / OPTIONAL

Mandatory requirements always take precedence over recommendations or optional behavior.

---

# 4.7 Implementation Guidance

The keywords defined in this section are intended solely for specifying protocol behavior.

They SHALL NOT be interpreted as:

- user interface requirements,
- implementation preferences,
- coding style recommendations,
- performance optimizations.

Such guidance is provided in companion documents including:

- TRD.md
- ARCHITECTURE.md
- API_SPEC.md
- TEST_SPEC.md

---

# 4.8 Usage Throughout This Specification

All subsequent sections of this document SHALL use the requirement keywords defined here consistently.

Readers SHOULD interpret every occurrence of these keywords according to the meanings established in this section.

Any future revision of the photon Protocol SHALL preserve these semantic definitions to ensure consistent interpretation across protocol versions.

# 5. Protocol Overview

## 5.1 Overview

The **photon Protocol (OSP)** is an application-layer protocol for transferring one or more files between participating devices using an optical communication channel.

OSP operates by transforming a file into a sequence of structured protocol packets. These packets are transmitted through an underlying optical transport (such as QR codes), received by another device, validated, reordered if necessary, and reconstructed into the original binary file.

The protocol is independent of:

- Programming language
- Operating system
- Hardware platform
- Optical encoding method
- User interface implementation

This ensures that any compliant implementation can communicate with any other compliant implementation regardless of its underlying technology stack.

---

# 5.2 High-Level Communication Model

Every transfer follows the same logical communication model.

```text
                 Sender                              Receiver
──────────────────────────────────────────────────────────────────

Create Session
       │
       │──────────────────────────────────────────────▶
       │
Transmit Manifest
       │──────────────────────────────────────────────▶
       │
Transmit Data Packets
       │══════════════════════════════════════════════▶
       │
Transmit Recovery Packets (Optional)
       │══════════════════════════════════════════════▶
       │
Receiver Verifies Integrity
       │
Transfer Complete
```

The receiver is responsible for reconstructing the original file after all required packets have been successfully received.

---

# 5.3 Layered Protocol Model

OSP follows a layered architecture that separates communication semantics from transport implementation.

```text
Application Layer
│
├── User selects files
├── User starts transfer
└── User receives reconstructed file
│
▼
photon Protocol (OSP)
│
├── Session Management
├── Manifest Exchange
├── Packet Processing
├── Verification
└── Recovery
│
▼
Transport Layer
│
├── QR Codes
├── Color QR (Future)
├── Optical Grid (Future)
└── Other Optical Encodings
│
▼
Physical Layer
│
├── Device Display
└── Device Camera
```

Each layer has a single responsibility.

Changes within one layer SHOULD NOT require modifications to unrelated layers.

---

# 5.4 Transfer Workflow

A standard transfer consists of the following phases.

### Phase 1 — Session Initialization

The sender creates a new transfer session.

Responsibilities:

- Generate Session ID.
- Initialize protocol state.
- Determine protocol version.
- Load transfer configuration.

Output:

An active session ready for handshake.

---

### Phase 2 — Handshake

The receiver discovers the sender and joins the session.

Responsibilities:

- Exchange protocol version.
- Exchange capabilities.
- Verify compatibility.
- Confirm session parameters.

Output:

A synchronized sender and receiver.

---

### Phase 3 — Manifest Exchange

The sender transmits transfer metadata.

The manifest contains information required for reconstruction, including:

- Filename
- MIME type
- File size
- Packet count
- Compression method
- Encryption method
- File integrity hash

Output:

Receiver understands the structure of the incoming transfer.

---

### Phase 4 — Packet Transmission

The sender converts the file into binary packets.

Each packet is transmitted independently.

The sender continuously streams packets until completion or cancellation.

---

### Phase 5 — Packet Collection

The receiver performs the following operations for every received packet:

1. Decode transport frame.
2. Validate packet integrity.
3. Verify Session ID.
4. Check packet duplication.
5. Store valid packet.
6. Update transfer progress.

---

### Phase 6 — Reconstruction

After all required packets have been collected:

- Packets are ordered.
- Binary payloads are merged.
- Original file is reconstructed.

---

### Phase 7 — Verification

The reconstructed file undergoes integrity verification.

Verification includes:

- Packet-level validation
- Whole-file hash verification

Only after successful verification is the transfer considered complete.

---

# 5.5 Protocol Data Flow

The protocol transforms files through a deterministic processing pipeline.

```text
Original File

↓

Binary Stream

↓

Packet Generation

↓

Transport Encoding

↓

Optical Transmission

↓

Transport Decoding

↓

Packet Validation

↓

Packet Collection

↓

File Reconstruction

↓

Integrity Verification

↓

Recovered File
```

No protocol stage modifies the semantic contents of the original file.

---

# 5.6 Packet Flow

Each protocol packet follows the same lifecycle.

```text
Create Packet

↓

Assign Header

↓

Attach Payload

↓

Calculate Integrity

↓

Encode Transport

↓

Transmit

↓

Receive

↓

Decode

↓

Validate

↓

Store

↓

Reconstruct
```

Packets are immutable after creation.

---

# 5.7 Protocol Responsibilities

The protocol is responsible for:

- Session lifecycle
- Metadata exchange
- Packet sequencing
- Duplicate detection
- Integrity verification
- Transfer completion
- Resume support
- Error reporting

The protocol is **not** responsible for:

- Camera APIs
- QR rendering
- Display brightness
- File picker implementation
- User interface behavior
- Local storage implementation

These responsibilities belong to implementation-specific components.

---

# 5.8 Design Characteristics

OSP exhibits the following characteristics.

### Offline

Transfers require no network connectivity.

---

### Binary Native

All files are treated as opaque binary streams.

---

### Reliable

Every packet is validated before participating in reconstruction.

---

### Deterministic

Identical inputs always produce identical outputs.

---

### Versioned

Every session explicitly identifies the protocol version.

---

### Extensible

Future capabilities may be introduced without redefining the protocol.

---

# 5.9 Transport Independence

The protocol communicates using **protocol packets**, not QR codes.

QR codes are merely one possible transport representation.

The protocol therefore defines communication in terms of:

- Sessions
- Manifests
- Packets
- Transfers

rather than:

- QR images
- Camera frames
- Display refreshes

This abstraction allows future optical transport mechanisms to replace QR encoding while maintaining full protocol compatibility.

---

# 5.10 Protocol Guarantees

A compliant OSP implementation SHALL guarantee the following:

1. Every transfer belongs to exactly one session.
2. Every session begins with one manifest.
3. Every packet belongs to exactly one file.
4. Every packet is independently verifiable.
5. Duplicate packets do not affect reconstruction.
6. Corrupted packets are never accepted.
7. Files are reconstructed in deterministic packet order.
8. Successful transfers produce a byte-identical copy of the original file.
9. Transfer completion is reported only after successful integrity verification.
10. Protocol behavior remains independent of the transport implementation.

These guarantees form the operational contract of the photon Protocol and apply to every compliant implementation.

# 6. Layered Architecture

## 6.1 Purpose

The photon Protocol (OSP) adopts a layered architecture to separate protocol semantics from implementation details.

Each layer has a single, well-defined responsibility and communicates only with adjacent layers through clearly defined interfaces.

This architecture provides:

- Separation of concerns
- Replaceable transport implementations
- Platform independence
- Simplified testing
- Future extensibility
- Easier interoperability

No layer SHALL directly depend on the internal implementation of a non-adjacent layer.

---

# 6.2 Architectural Principles

The layered architecture is governed by the following principles.

### Single Responsibility

Each layer SHALL perform one logical responsibility.

---

### Encapsulation

Implementation details of a layer SHALL NOT be exposed outside that layer.

---

### Deterministic Interfaces

Communication between layers SHALL occur through deterministic inputs and outputs.

---

### Replaceability

Any layer MAY be replaced provided its public interface remains unchanged.

---

### Dependency Direction

Dependencies SHALL flow downward only.

Higher layers MAY invoke lower layers.

Lower layers MUST NOT invoke higher layers.

---

# 6.3 Layer Overview

The protocol consists of six logical layers.

```text
┌──────────────────────────────────────────┐
│            Application Layer             │
├──────────────────────────────────────────┤
│        photon Protocol Layer          │
├──────────────────────────────────────────┤
│        Transport Abstraction Layer       │
├──────────────────────────────────────────┤
│      Optical Transport Implementation    │
├──────────────────────────────────────────┤
│         Device Hardware Layer            │
├──────────────────────────────────────────┤
│      Operating System Services Layer     │
└──────────────────────────────────────────┘
```

Each layer is described below.

---

# 6.4 Layer 1 — Application Layer

## Purpose

Provides the user-facing functionality of photon.

This layer is responsible for:

- User interaction
- File selection
- Progress display
- History
- Settings
- Error presentation
- Notifications

This layer SHALL NOT contain protocol logic.

---

## Inputs

- User actions
- Protocol events

---

## Outputs

- Transfer requests
- User configuration
- Display updates

---

## Responsibilities

- File picker
- Receive screen
- Progress UI
- Transfer history
- Settings
- Developer tools

---

# 6.5 Layer 2 — photon Protocol Layer

## Purpose

Implements the communication protocol.

This is the core of OSP.

Responsibilities include:

- Session management
- Manifest generation
- Packet sequencing
- Resume
- Recovery
- Integrity verification

This layer SHALL remain independent of QR encoding.

---

## Inputs

- Binary file stream
- Receiver packets

---

## Outputs

- Protocol packets
- Transfer events

---

## Internal Components

- Session Manager
- Manifest Manager
- Packet Manager
- Verification Engine
- Recovery Engine

---

# 6.6 Layer 3 — Transport Abstraction Layer

## Purpose

Provides a generic interface between the protocol and physical transport.

The protocol SHALL communicate only with this abstraction.

The abstraction converts protocol packets into transport frames and vice versa.

---

## Responsibilities

- Packet serialization
- Frame generation
- Frame decoding
- Transport capabilities
- Timing control

---

## Supported Transports

Current

- QR

Future

- Color QR
- Optical Grid
- HCCB
- Other optical encodings

The protocol SHALL remain unchanged when transports change.

---

# 6.7 Layer 4 — Optical Transport Layer

## Purpose

Implements the chosen optical communication technology.

Examples include:

- QR generation
- QR decoding
- Frame scheduling
- Camera frame processing

This layer SHALL NOT contain protocol logic.

---

## Responsibilities

Sender

- Generate optical frame
- Display frame
- Maintain frame timing

Receiver

- Capture camera frame
- Detect optical code
- Decode transport frame

---

## Inputs

Protocol packet

---

## Outputs

Decoded protocol packet

---

# 6.8 Layer 5 — Device Hardware Layer

## Purpose

Represents the physical hardware used by the transport.

Examples

Sender

- Display
- GPU

Receiver

- Camera
- Image Sensor

Hardware characteristics influence performance but SHALL NOT alter protocol semantics.

---

# 6.9 Layer 6 — Operating System Layer

## Purpose

Provides platform services required by the application.

Examples include:

- File system
- Camera access
- Storage permissions
- Brightness control
- Memory allocation

OSP SHALL remain independent of operating-system-specific APIs.

---

# 6.10 Dependency Rules

The following dependency graph SHALL be respected.

```text
Application

↓

Protocol

↓

Transport Abstraction

↓

Transport

↓

Hardware

↓

Operating System
```

Reverse dependencies are prohibited.

Example

The QR decoder SHALL NOT invoke protocol state directly.

Instead,

```text
Decode Frame

↓

Produce Packet

↓

Pass Packet Upward

↓

Protocol Processes Packet
```

---

# 6.11 Data Flow

The complete transmission pipeline is illustrated below.

```text
User Selects File

↓

Application Layer

↓

Protocol Layer

↓

Transport Abstraction

↓

QR Transport

↓

Display

══════════════════════════════

Camera

↓

QR Transport

↓

Transport Abstraction

↓

Protocol Layer

↓

Application Layer

↓

Recovered File
```

Each layer transforms data without violating the responsibilities of neighboring layers.

---

# 6.12 Layer Responsibilities

| Layer                 | Primary Responsibility                     |
| --------------------- | ------------------------------------------ |
| Application           | User interaction and presentation          |
| Protocol              | Communication rules and session management |
| Transport Abstraction | Generic transport interface                |
| Optical Transport     | QR generation and decoding                 |
| Hardware              | Display and camera operations              |
| Operating System      | Platform services                          |

---

# 6.13 Layer Isolation

To preserve modularity:

- The Application Layer MUST NOT manipulate packets directly.
- The Protocol Layer MUST NOT generate QR codes directly.
- The Transport Layer MUST NOT inspect file contents.
- The Hardware Layer MUST NOT perform protocol validation.
- The Operating System Layer MUST remain unaware of protocol semantics.

Violations of these boundaries are considered architectural defects.

---

# 6.14 Layer Replaceability

Each layer SHALL be replaceable provided its external interface remains unchanged.

Examples:

### Transport Upgrade

```text
QR

↓

Color QR
```

No protocol changes required.

---

### Camera Upgrade

```text
expo-camera

↓

Vision Camera
```

No protocol changes required.

---

### Platform Upgrade

```text
Expo

↓

Native Android
```

No protocol changes required.

---

### Desktop Receiver

```text
Phone Camera

↓

USB Webcam
```

No protocol changes required.

---

# 6.15 Layer Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. The Protocol Layer never depends on QR-specific behavior.
2. The Transport Layer never modifies protocol semantics.
3. Every packet crosses layers without altering payload contents.
4. File reconstruction occurs only within the Protocol Layer.
5. Hardware failures SHALL be reported upward as transport errors.
6. User interface components SHALL interact only with the Application Layer.
7. Protocol state SHALL remain isolated from presentation logic.
8. Every layer SHALL expose a stable public interface to adjacent layers only.

These invariants ensure that the photon Protocol remains modular, maintainable, and transport-independent across future versions and implementations.

# 7. Protocol Lifecycle

## 7.1 Purpose

The Protocol Lifecycle defines the complete sequence of operations performed during an photon Protocol (OSP) transfer.

Every compliant implementation SHALL follow the lifecycle defined in this section.

The lifecycle begins when a sender initiates a transfer and ends when the receiver either successfully reconstructs the transferred files or the transfer terminates due to cancellation, expiration, or unrecoverable failure.

---

# 7.2 Lifecycle Overview

An OSP transfer consists of nine sequential phases.

```text
┌───────────────┐
│     Idle      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Session Setup │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Handshake   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Manifest Sync │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Data Transfer │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Packet Verify │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Reconstruction│
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ File Verify   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Complete    │
└───────────────┘
```

A transfer SHALL NOT skip any mandatory phase.

---

# 7.3 Phase 1 — Idle

The Idle phase represents the state before any transfer exists.

No protocol session is active.

## Sender

- No active session.
- No manifest.
- No packets.

## Receiver

- Waiting for incoming sessions.
- Camera MAY be inactive.
- No protocol state exists.

The Idle phase SHALL transition only to Session Setup.

---

# 7.4 Phase 2 — Session Setup

The sender prepares a new transfer.

During this phase the sender SHALL:

- Generate a unique Session ID.
- Load selected files.
- Determine protocol version.
- Determine transfer settings.
- Initialize protocol state.
- Create internal transfer context.

The receiver remains unaware of the session.

Output:

A valid session ready for handshake.

---

# 7.5 Phase 3 — Handshake

The Handshake phase establishes communication between sender and receiver.

Responsibilities include:

- Session discovery.
- Protocol version negotiation.
- Capability negotiation.
- Receiver validation.
- Transfer initialization.

The handshake SHALL complete successfully before any protocol metadata or file packets are transmitted.

Successful output:

- Shared Session ID.
- Agreed protocol version.
- Agreed capabilities.

---

# 7.6 Phase 4 — Manifest Synchronization

After successful handshake, the sender SHALL transmit the Manifest.

The Manifest provides metadata required for reconstruction.

Typical metadata includes:

- Filename.
- MIME type.
- File size.
- Compression method.
- Encryption method.
- Packet count.
- File hash.

The receiver SHALL validate the Manifest before accepting any data packets.

If Manifest validation fails, the transfer SHALL terminate.

---

# 7.7 Phase 5 — Data Transfer

The sender converts the binary file stream into protocol packets.

Packets are transmitted continuously through the transport layer.

For each packet the sender SHALL:

1. Create packet.
2. Attach header.
3. Attach payload.
4. Compute integrity fields.
5. Encode transport frame.
6. Display frame.

The receiver SHALL:

1. Capture frame.
2. Decode transport.
3. Parse packet.
4. Validate integrity.
5. Detect duplicates.
6. Store valid packets.

Packet transmission continues until all required packets have been received or the transfer is terminated.

---

# 7.8 Phase 6 — Packet Verification

Every received packet SHALL undergo validation before storage.

Verification SHALL include:

- Header validation.
- Session validation.
- Protocol version validation.
- Payload length validation.
- CRC verification.
- Packet index validation.

Packets failing validation SHALL be discarded.

Corrupted packets SHALL NOT participate in reconstruction.

---

# 7.9 Phase 7 — Reconstruction

The receiver enters reconstruction only after sufficient valid packets have been collected.

During reconstruction:

- Packets are ordered.
- Payloads are merged.
- Original binary stream is recreated.

Reconstruction SHALL preserve the exact packet order defined by packet indices.

No packet contents may be modified.

---

# 7.10 Phase 8 — File Verification

After reconstruction, the receiver SHALL verify file integrity.

Verification SHALL compare:

Computed File Hash

↓

Expected File Hash

Only a successful verification marks the transfer as complete.

If verification fails:

- Reconstruction SHALL be discarded.
- Transfer SHALL enter the Failure state.
- Resume or recovery MAY be attempted.

---

# 7.11 Phase 9 — Completion

The Completion phase indicates successful protocol termination.

Requirements:

- All files reconstructed.
- Integrity verified.
- Session finalized.
- Temporary resources released.

Completion SHALL occur exactly once per transfer.

---

# 7.12 Failure Paths

A transfer MAY terminate before completion.

Common failure conditions include:

- Handshake failure.
- Unsupported protocol version.
- Invalid Manifest.
- Session timeout.
- Unrecoverable packet loss.
- Integrity verification failure.
- User cancellation.

Failures SHALL terminate the current session.

No partially reconstructed file SHALL be reported as successful.

---

# 7.13 Resume Path

Interrupted transfers MAY enter the Resume lifecycle.

```text
Transfer

↓

Interrupted

↓

Resume

↓

Continue Packet Collection

↓

Verification

↓

Completion
```

Resume SHALL preserve previously validated packets.

A resumed transfer SHALL continue using the original Session ID.

---

# 7.14 Lifecycle Constraints

Every compliant implementation SHALL satisfy the following constraints:

1. Every transfer begins in the Idle state.
2. Every transfer creates exactly one Session.
3. Every Session performs exactly one Handshake.
4. Every successful Handshake is followed by exactly one Manifest.
5. Data packets SHALL NOT precede the Manifest.
6. Reconstruction SHALL NOT begin before packet validation.
7. Completion SHALL NOT occur before file verification.
8. Failed transfers SHALL terminate the active session.
9. Resume SHALL preserve previously validated protocol state.
10. Session resources SHALL be released after completion or failure.

---

# 7.15 Lifecycle Summary

The photon Protocol lifecycle guarantees a deterministic communication process.

Every compliant implementation SHALL execute the following logical sequence:

```text
Idle

↓

Session Setup

↓

Handshake

↓

Manifest

↓

Packet Transfer

↓

Packet Validation

↓

Reconstruction

↓

File Verification

↓

Complete
```

This lifecycle forms the canonical execution model for all OSP implementations and SHALL remain consistent across protocol versions unless explicitly revised by a future specification.

# 8. Session Management

## 8.1 Purpose

A **Session** represents a single logical communication context between one sender and one or more receivers.

The Session provides the protocol with a unique identity under which all protocol messages, metadata, and packets are exchanged.

Every transfer SHALL occur within exactly one active Session.

No protocol message SHALL exist outside a Session.

---

# 8.2 Session Objectives

Session Management provides the following guarantees:

- Unique identification of every transfer.
- Isolation between simultaneous transfers.
- Resume capability.
- Packet ownership.
- Capability negotiation.
- Session timeout handling.
- Protocol version consistency.

---

# 8.3 Session Lifecycle

A Session progresses through the following lifecycle.

```text
Created

↓

Waiting

↓

Handshake

↓

Active

↓

Paused

↓

Resuming

↓

Completed

↓

Expired
```

The Session SHALL occupy exactly one lifecycle state at any time.

---

# 8.4 Session Creation

A Session is created by the Sender when the user initiates a new transfer.

Upon creation, the Sender SHALL:

- Generate a unique Session ID.
- Initialize protocol state.
- Initialize packet counters.
- Create transfer metadata.
- Load selected files.
- Determine protocol version.
- Determine enabled capabilities.

No packets SHALL be transmitted before Session creation is complete.

---

# 8.5 Session Identifier

Every Session SHALL possess a globally unique Session ID.

The Session ID SHALL uniquely identify the transfer for its entire lifetime.

The Session ID SHALL remain immutable after creation.

The Session ID SHALL be included in:

- Manifest Packet
- Data Packets
- Recovery Packets
- Future protocol extensions

Session IDs prevent packets from multiple transfers from being incorrectly merged.

---

# 8.6 Session Ownership

Every Session SHALL contain exactly one Sender.

A Session MAY contain one or more Receivers.

The Sender exclusively controls:

- Session creation.
- Manifest generation.
- Packet transmission.
- Session termination.

Receivers SHALL NOT modify Session metadata.

---

# 8.7 Session Context

A Session maintains protocol-wide information required throughout the transfer.

The Session Context SHALL include:

- Session ID
- Protocol Version
- Transfer State
- File List
- Manifest
- Active Capabilities
- Encryption Configuration
- Compression Configuration
- Packet Statistics
- Timing Information

The Session Context SHALL remain internally consistent for the lifetime of the Session.

---

# 8.8 Session States

## Created

The Session has been initialized.

No communication has begun.

---

## Waiting

The Sender is waiting for one or more Receivers to join.

The Receiver has not yet completed the handshake.

---

## Handshake

Both devices are negotiating protocol parameters.

Manifest transmission SHALL NOT begin during this state.

---

## Active

The Session is actively transmitting protocol packets.

The Session SHALL remain Active until:

- transfer completes,
- user pauses,
- timeout occurs,
- cancellation occurs.

---

## Paused

Packet transmission is temporarily suspended.

Previously validated packets SHALL remain valid.

No Session information SHALL be discarded.

---

## Resuming

The Session is restoring communication after interruption.

Only missing packets SHALL require further transmission.

---

## Completed

The transfer has completed successfully.

All files have passed integrity verification.

The Session SHALL become read-only.

---

## Expired

The Session has exceeded its allowed lifetime.

Expired Sessions SHALL reject all incoming packets.

---

# 8.9 Session Timeout

A Session SHALL terminate automatically after exceeding the configured timeout.

Timeout values MAY be implementation-specific.

Timeout countdown SHOULD begin when:

- no packets are exchanged,
- no recovery occurs,
- no protocol activity is detected.

Timeout SHALL invalidate the Session.

---

# 8.10 Session Expiration

Expired Sessions SHALL:

- Reject incoming packets.
- Reject resume requests.
- Release temporary resources.
- Remove active protocol state.

Historical transfer information MAY remain available to the application.

---

# 8.11 Session Isolation

Sessions SHALL be completely isolated.

Packets belonging to one Session SHALL NEVER be accepted into another Session.

Isolation SHALL be enforced using the Session ID.

Example:

```
Session A

Packet 41

↓

Receiver

↓

Session B

Reject
```

Cross-session packet mixing SHALL be considered a protocol violation.

---

# 8.12 Multiple Concurrent Sessions

An implementation MAY support multiple active Sessions simultaneously.

Each Session SHALL maintain independent:

- Session ID
- Packet map
- Manifest
- Statistics
- Recovery state

Protocol behavior of one Session SHALL NOT affect another.

---

# 8.13 Session Recovery

If communication is interrupted, the Session MAY enter Recovery mode.

Recovery SHALL preserve:

- validated packets,
- packet ordering,
- transfer metadata,
- integrity state.

The Session ID SHALL remain unchanged throughout recovery.

---

# 8.14 Session Termination

A Session SHALL terminate under one of the following conditions:

- Successful completion.
- User cancellation.
- Session timeout.
- Unrecoverable protocol error.
- Manifest validation failure.
- Integrity verification failure.
- Explicit termination by the Sender.

After termination:

- Temporary packet storage SHALL be released.
- Active protocol resources SHALL be released.
- The Session SHALL become inactive.

---

# 8.15 Session Persistence

A Session MAY persist locally for diagnostic or history purposes after termination.

Persistent Session information SHALL NOT be reused for future transfers.

Every new transfer SHALL create a new Session.

---

# 8.16 Session Security

The Session establishes the security boundary of the protocol.

Security properties associated with a Session include:

- Encryption configuration.
- Integrity verification configuration.
- Capability negotiation.
- Protocol version.

Security settings SHALL remain immutable after successful Handshake unless explicitly defined by a future protocol revision.

---

# 8.17 Session Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every transfer SHALL belong to exactly one Session.
2. Every Session SHALL have exactly one immutable Session ID.
3. Every packet SHALL reference exactly one Session.
4. Sessions SHALL remain isolated from one another.
5. Session state SHALL be internally consistent throughout the transfer.
6. Expired Sessions SHALL reject further protocol messages.
7. Session recovery SHALL preserve previously validated state.
8. A completed Session SHALL NOT return to the Active state.
9. A terminated Session SHALL NOT be reused.
10. Every new transfer SHALL create a new Session.

These invariants define the fundamental rules governing Session behavior within the photon Protocol.

# 9. Handshake Protocol

## 9.1 Purpose

The Handshake Protocol establishes a shared communication context between the Sender and Receiver before any file transfer begins.

The handshake ensures that both participants:

- Agree on the protocol version.
- Join the same Session.
- Exchange transfer capabilities.
- Validate transfer metadata.
- Initialize protocol state.

A successful handshake is a mandatory prerequisite for every photon transfer.

No Manifest or Data Packet SHALL be transmitted before the handshake completes successfully.

---

# 9.2 Objectives

The Handshake Protocol SHALL achieve the following objectives:

- Discover participating devices.
- Establish a shared Session.
- Negotiate protocol compatibility.
- Exchange supported capabilities.
- Initialize transfer parameters.
- Prevent cross-session communication.
- Prepare both devices for packet transmission.

---

# 9.3 Handshake Participants

Exactly two logical participants exist during a handshake.

## Sender

Responsible for:

- Creating the Session.
- Advertising transfer information.
- Initiating the handshake.
- Waiting for receiver synchronization.

---

## Receiver

Responsible for:

- Discovering available sessions.
- Validating protocol information.
- Joining the Session.
- Preparing packet collection.

---

# 9.4 Handshake Lifecycle

The handshake consists of five sequential stages.

```text id="0yhjyr"
Session Created

↓

Handshake Advertisement

↓

Session Discovery

↓

Capability Negotiation

↓

Handshake Complete
```

Each stage SHALL complete successfully before the next stage begins.

---

# 9.5 Stage 1 — Session Creation

The Sender creates a new Session.

The Sender SHALL generate:

- Session ID
- Transfer ID (if supported)
- Protocol Version
- Session Timestamp
- Initial Configuration

The Sender SHALL enter the **Waiting** state after Session creation.

---

# 9.6 Stage 2 — Handshake Advertisement

The Sender advertises the existence of the Session.

The advertisement SHALL contain sufficient information for the Receiver to determine whether it can participate.

The advertisement SHOULD include:

- Session ID
- Protocol Version
- Transfer Name
- Sender Capabilities
- Timestamp

The advertisement SHALL NOT contain file data.

---

# 9.7 Stage 3 — Session Discovery

The Receiver scans the Sender's handshake advertisement.

The Receiver SHALL:

1. Decode the advertisement.
2. Validate the protocol version.
3. Validate advertisement integrity.
4. Verify the Session ID.
5. Create a local Session Context.

If validation fails, the Receiver SHALL reject the handshake.

---

# 9.8 Stage 4 — Capability Negotiation

The Sender and Receiver determine the protocol features that will be used for the transfer.

Capabilities MAY include:

- Supported OSP version
- Compression support
- Encryption support
- Recovery support
- Adaptive Transport support
- Maximum Packet Size
- Maximum QR Version
- Preferred Frame Duration

Negotiation SHALL select a mutually supported configuration.

Unsupported optional capabilities SHALL be disabled.

Mandatory incompatibilities SHALL terminate the handshake.

---

# 9.9 Stage 5 — Handshake Completion

The handshake is considered complete when:

- Both devices share the same Session ID.
- Both devices agree on the protocol version.
- Capability negotiation succeeds.
- Session Context has been initialized.

After completion:

- Sender enters **Active** state.
- Receiver enters **Receiving** state.

Manifest transmission MAY begin immediately.

---

# 9.10 Handshake Sequence

The logical message flow is shown below.

```text id="apqk0t"
Sender                          Receiver
────────────────────────────────────────────

Create Session
      │
      │ Advertisement
      ├────────────────────────────▶
      │
      │                      Validate Session
      │
      │                      Validate Version
      │
      │◀────────────────────────────
      │   Capability Agreement
      │
Handshake Complete
      │
Manifest Transmission
```

This sequence is transport-independent.

The actual transport mechanism is defined separately.

---

# 9.11 Handshake Advertisement

The handshake advertisement SHALL contain metadata only.

Typical fields include:

- Protocol Version
- Session ID
- Sender Identifier (ephemeral)
- Transfer Name
- Timestamp
- Capability Bitmap

The advertisement SHALL NOT contain:

- File payload
- Packet payload
- Encrypted file data

---

# 9.12 Capability Negotiation Rules

Capability negotiation follows these rules:

1. Mandatory protocol capabilities MUST match.
2. Optional capabilities MAY differ.
3. Unknown optional capabilities SHALL be ignored.
4. Unknown mandatory capabilities SHALL terminate the handshake.
5. Negotiated values SHALL remain fixed for the duration of the Session.

---

# 9.13 Handshake Timeout

The Sender SHALL NOT wait indefinitely.

If no Receiver joins within the configured timeout:

- The Session SHALL expire.
- Temporary resources SHALL be released.
- The Sender SHALL return to the Idle state.

The timeout duration is implementation-specific.

---

# 9.14 Handshake Failure

The handshake SHALL fail if any of the following conditions occur:

- Unsupported protocol version.
- Invalid Session ID.
- Corrupted advertisement.
- Capability negotiation failure.
- Timeout.
- User cancellation.
- Internal protocol error.

Upon failure:

- The Session SHALL NOT become Active.
- Manifest transmission SHALL NOT begin.
- Temporary resources SHALL be released.

---

# 9.15 Security Requirements

The Handshake SHALL ensure:

- Session isolation.
- Version validation.
- Capability integrity.
- Replay resistance through unique Session IDs.
- No exposure of file contents before handshake completion.

Future protocol versions MAY extend the handshake with authenticated key exchange for encrypted sessions.

---

# 9.16 Handshake Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every Session SHALL perform exactly one successful handshake before data transmission.
2. Manifest transmission SHALL NOT begin before handshake completion.
3. Every Receiver SHALL validate the advertised protocol version.
4. Every Receiver SHALL validate the Session ID.
5. Capability negotiation SHALL complete before the Session becomes Active.
6. Handshake metadata SHALL remain immutable after successful negotiation.
7. Handshake failure SHALL terminate the Session.
8. A completed handshake SHALL uniquely identify one active Session.
9. File payload SHALL NEVER be transmitted during the handshake.
10. The handshake SHALL remain independent of the underlying optical transport.

These invariants define the canonical handshake behavior for all compliant OSP implementations.

# 10. Manifest Protocol

## 10.1 Purpose

The Manifest Protocol defines how transfer metadata is communicated between the Sender and Receiver.

The Manifest is the first protocol message transmitted after a successful Handshake and before any Data Packet.

Its purpose is to provide the Receiver with sufficient information to prepare for packet collection, validation, reconstruction, and integrity verification.

A Manifest SHALL NOT contain file payload data.

---

# 10.2 Objectives

The Manifest Protocol SHALL:

- Describe the transfer.
- Identify every file in the transfer.
- Define packet expectations.
- Define integrity requirements.
- Define compression settings.
- Define encryption settings.
- Enable deterministic reconstruction.

---

# 10.3 Manifest Lifecycle

The Manifest follows the lifecycle below.

```text
Create

↓

Serialize

↓

Transmit

↓

Receive

↓

Validate

↓

Store

↓

Ready for Data Packets
```

The Manifest SHALL be processed successfully before Data Packet processing begins.

---

# 10.4 Manifest Transmission

Every Session SHALL transmit exactly one Manifest.

The Manifest SHALL immediately follow a successful Handshake.

No Data Packet SHALL precede the Manifest.

The Sender SHALL continue transmitting the Manifest until the Receiver successfully validates it or the Session terminates.

---

# 10.5 Manifest Contents

The Manifest SHALL contain the metadata required to reconstruct the transfer.

The Manifest SHALL include:

## Session Information

- Session ID
- Transfer ID (if supported)
- Protocol Version
- Creation Timestamp

---

## Transfer Information

- Number of Files
- Total Transfer Size
- Total Packet Count
- Transfer Name (optional)

---

## File Information

For every file:

- File ID
- Filename
- Extension
- MIME Type
- Original Size
- Packet Count
- Hash
- Compression Method
- Encryption Method

---

## Protocol Configuration

- Packet Size
- Recovery Method
- Integrity Algorithm
- Transport Capabilities

---

# 10.6 File Manifest Entry

Every transferred file SHALL have one Manifest Entry.

Each entry describes exactly one file.

Example structure:

```text
File Entry

↓

File ID

↓

Filename

↓

Extension

↓

Size

↓

Packet Count

↓

Hash

↓

Compression

↓

Encryption
```

Each File ID SHALL be unique within the Session.

---

# 10.7 Manifest Validation

Upon receiving the Manifest, the Receiver SHALL perform the following validation steps:

1. Validate Session ID.
2. Validate Protocol Version.
3. Validate Manifest Integrity.
4. Validate File Count.
5. Validate Packet Count.
6. Validate File Metadata.
7. Validate Supported Algorithms.

Only a valid Manifest SHALL be accepted.

---

# 10.8 Manifest Integrity

The Manifest SHALL contain its own integrity protection.

Integrity verification SHALL occur before the Manifest is accepted.

If Manifest integrity verification fails:

- The Manifest SHALL be discarded.
- The Receiver SHALL continue waiting for a valid Manifest.
- Data Packets SHALL NOT be processed.

---

# 10.9 Manifest Immutability

Once accepted, the Manifest SHALL become immutable.

Neither Sender nor Receiver SHALL modify:

- filenames,
- packet counts,
- hashes,
- encryption configuration,
- compression configuration.

Any modification requires a new Session.

---

# 10.10 Manifest Ordering

The Manifest SHALL always precede all Data Packets.

The following ordering is mandatory:

```text
Handshake

↓

Manifest

↓

Data Packets

↓

Recovery Packets (Optional)

↓

Transfer Complete
```

Any packet received before the Manifest SHALL be rejected.

---

# 10.11 Multi-file Manifest

A Manifest MAY describe multiple files.

Each file SHALL have:

- Independent File ID.
- Independent Packet Count.
- Independent Hash.
- Independent Metadata.

All files SHALL share:

- Session ID.
- Protocol Version.
- Transport Configuration.

---

# 10.12 Unknown Fields

Future protocol versions MAY introduce additional Manifest fields.

Implementations SHALL follow these rules:

- Unknown optional fields SHALL be ignored.
- Unknown mandatory fields SHALL terminate Manifest validation.
- Reserved fields SHALL remain unchanged.

---

# 10.13 Manifest Failure

The Receiver SHALL reject the Manifest if:

- Session ID is invalid.
- Protocol Version is unsupported.
- Required fields are missing.
- Integrity verification fails.
- Packet counts are inconsistent.
- File metadata is invalid.

Upon rejection:

- No protocol state SHALL be initialized.
- No Data Packet SHALL be accepted.
- The Receiver SHALL remain in the Waiting state until a valid Manifest is received or the Session expires.

---

# 10.14 Manifest Persistence

After successful validation, the Receiver SHALL retain the Manifest for the duration of the Session.

The Manifest SHALL be used as the authoritative reference for:

- Packet validation.
- Reconstruction.
- Integrity verification.
- Resume operations.
- Recovery procedures.

The Manifest SHALL NOT be regenerated during an active Session.

---

# 10.15 Manifest Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every Session SHALL transmit exactly one Manifest.
2. The Manifest SHALL be transmitted before any Data Packet.
3. Every file SHALL have exactly one Manifest Entry.
4. Every Manifest Entry SHALL reference exactly one File ID.
5. Every File ID SHALL be unique within the Session.
6. Every Manifest SHALL successfully pass integrity verification before acceptance.
7. The Manifest SHALL remain immutable after validation.
8. Data Packet processing SHALL NOT begin until Manifest validation succeeds.
9. Manifest metadata SHALL be the authoritative source for transfer reconstruction.
10. Every completed transfer SHALL correspond to exactly one validated Manifest.

These invariants ensure deterministic reconstruction and consistent interpretation of transfer metadata across all compliant OSP implementations.

# 11. Packet Protocol

## 11.1 Purpose

The Packet Protocol defines the logical structure, lifecycle, and behavior of protocol packets within the photon Protocol (OSP).

A packet is the smallest transferable unit of information within OSP.

Packets are responsible for transporting binary payload data from the Sender to the Receiver while maintaining ordering, integrity, and session isolation.

The exact binary representation of packets is defined separately in **PACKET_SPEC.md**.

---

# 11.2 Objectives

The Packet Protocol SHALL:

- Divide binary streams into transferable units.
- Preserve packet ordering.
- Maintain session isolation.
- Detect corrupted packets.
- Detect duplicate packets.
- Support interrupted transfers.
- Enable deterministic file reconstruction.

---

# 11.3 Packet Model

Each packet consists of two logical components.

```text id="ydzmpk"
Packet

├── Header

└── Payload
```

The Header contains protocol metadata.

The Payload contains binary file data.

---

# 11.4 Packet Types

OSP defines the following logical packet types.

## Manifest Packet

Contains transfer metadata.

Exactly one Manifest Packet SHALL exist per Session.

---

## Data Packet

Contains a portion of a file's binary stream.

Data Packets represent the majority of protocol traffic.

---

## Recovery Packet

Optional.

Used to assist recovery of missing packets.

Recovery Packet behavior is defined in the Recovery Protocol.

---

## Future Packet Types

Future protocol versions MAY define additional packet types.

Unknown optional packet types SHALL be ignored.

Unknown mandatory packet types SHALL terminate the Session.

---

# 11.5 Packet Ownership

Every packet SHALL belong to:

- Exactly one Session.
- Exactly one Transfer.
- Exactly one File.
- Exactly one Packet Index.

Packets SHALL NOT be shared across Sessions.

---

# 11.6 Packet Lifecycle

Every packet follows the same lifecycle.

```text id="jqs4dg"
Create

↓

Serialize

↓

Encode

↓

Transmit

↓

Receive

↓

Decode

↓

Validate

↓

Store

↓

Consume
```

A packet SHALL become immutable immediately after creation.

---

# 11.7 Packet Header

Every packet SHALL contain a Header.

The Header identifies:

- Protocol Version
- Session ID
- File ID
- Packet Type
- Packet Index
- Payload Length
- Flags
- Integrity Information

The binary representation is defined in **PACKET_SPEC.md**.

---

# 11.8 Packet Payload

The Payload contains binary data extracted directly from the original file.

The protocol SHALL NOT inspect or interpret payload contents.

Payload data SHALL remain unchanged throughout transmission.

---

# 11.9 Packet Size

Packet payload size SHALL be negotiated during Session establishment.

All Data Packets within a Session SHOULD use the negotiated payload size, except the final packet of a file, which MAY contain fewer bytes.

Implementations MAY choose smaller payloads for transport optimization.

---

# 11.10 Packet Ordering

Packets SHALL be identified by a zero-based Packet Index.

Example:

```text id="5pbhcm"
Packet 0

Packet 1

Packet 2

...

Packet N
```

The Receiver SHALL reconstruct files using Packet Index ordering.

Arrival order SHALL NOT determine reconstruction order.

---

# 11.11 Packet Transmission

The Sender SHALL transmit packets sequentially according to Packet Index.

Implementations MAY repeat previously transmitted packets to improve reliability.

The Sender MAY continuously loop packets until the transfer completes or terminates.

---

# 11.12 Packet Reception

For every received packet, the Receiver SHALL:

1. Decode the transport frame.
2. Parse the packet.
3. Validate the Header.
4. Validate Session ID.
5. Validate Packet Integrity.
6. Validate Payload Length.
7. Detect duplicates.
8. Store valid packets.

Only successfully validated packets SHALL participate in reconstruction.

---

# 11.13 Duplicate Packets

Duplicate packets are expected in OSP due to continuous packet streaming.

A packet is considered a duplicate when:

- Session ID matches.
- File ID matches.
- Packet Index matches.
- Integrity verification succeeds.

Duplicate packets SHALL be ignored after the first valid copy has been stored.

Duplicate packets SHALL NOT overwrite previously validated packets.

---

# 11.14 Missing Packets

A packet is considered missing when:

- The Manifest indicates it should exist.
- It has not yet been successfully validated.

Missing packets SHALL prevent reconstruction of the associated file unless recovered through an approved recovery mechanism.

---

# 11.15 Corrupted Packets

A corrupted packet is one that fails validation.

Examples include:

- Invalid Header.
- Invalid Payload Length.
- Invalid Session ID.
- Integrity verification failure.
- Unsupported Packet Type.

Corrupted packets SHALL be discarded immediately.

They SHALL NOT be stored.

They SHALL NOT participate in reconstruction.

---

# 11.16 Packet Immutability

After creation, a packet SHALL become immutable.

No implementation SHALL modify:

- Header fields.
- Payload bytes.
- Integrity fields.
- Packet Index.

Packet modification after creation is considered a protocol violation.

---

# 11.17 Packet Independence

Every packet SHALL be independently verifiable.

Validation of one packet SHALL NOT require access to any previous packet except where explicitly defined by the protocol.

This property enables:

- Resume.
- Parallel decoding.
- Duplicate filtering.
- Future recovery mechanisms.

---

# 11.18 Packet Consumption

A validated packet SHALL be consumed only once during reconstruction.

Packet payloads SHALL be merged according to Packet Index.

Packets SHALL NOT be reordered based on arrival time.

---

# 11.19 Packet Expiration

Packets belonging to expired Sessions SHALL be discarded.

Packets SHALL also be discarded when:

- Session terminates.
- Transfer completes.
- User cancels the transfer.

Implementations SHOULD release packet memory immediately after it is no longer required.

---

# 11.20 Packet Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every packet SHALL belong to exactly one Session.
2. Every packet SHALL belong to exactly one File.
3. Every packet SHALL have exactly one Packet Index.
4. Every packet SHALL contain one Header and one Payload.
5. Packets SHALL become immutable after creation.
6. Packet ordering SHALL be determined by Packet Index only.
7. Duplicate packets SHALL NOT modify stored data.
8. Corrupted packets SHALL NOT be stored.
9. Packet payloads SHALL remain byte-identical throughout transmission.
10. Every validated packet SHALL be independently identifiable and verifiable.

These invariants define the fundamental behavior of protocol packets and SHALL be preserved by all compliant OSP implementations.

# 12. Transfer Protocol

## 12.1 Purpose

The Transfer Protocol defines how protocol packets are exchanged between the Sender and Receiver after successful Session establishment and Manifest validation.

It specifies the rules governing packet transmission, reception, progress tracking, completion, interruption, and termination.

The Transfer Protocol is independent of the underlying transport implementation and operates solely on protocol packets.

---

# 12.2 Objectives

The Transfer Protocol SHALL:

- Deliver all required packets.
- Preserve packet ordering semantics.
- Support reliable reconstruction.
- Detect incomplete transfers.
- Support interruption and resume.
- Maintain deterministic protocol behavior.
- Prevent data corruption.

---

# 12.3 Transfer Lifecycle

A transfer progresses through the following phases.

```text id="yls8pc"
Waiting

↓

Manifest Received

↓

Packet Transfer

↓

Packet Collection

↓

Verification

↓

Completed
```

A transfer MAY enter:

- Paused
- Resuming
- Cancelled
- Failed

at any point where permitted by this specification.

---

# 12.4 Transfer Initialization

A transfer SHALL begin only after:

1. Successful Session creation.
2. Successful Handshake.
3. Successful Manifest validation.

Until these prerequisites are satisfied:

- Data Packets SHALL NOT be transmitted.
- Data Packets SHALL NOT be accepted.

---

# 12.5 Sender Responsibilities

During an active transfer, the Sender SHALL:

- Read binary data.
- Generate protocol packets.
- Assign packet indices.
- Compute packet integrity fields.
- Serialize packets.
- Submit packets to the Transport Layer.
- Monitor transfer state.

The Sender SHALL remain the authoritative source of all packets for the duration of the Session.

---

# 12.6 Receiver Responsibilities

During an active transfer, the Receiver SHALL:

- Receive transport frames.
- Decode protocol packets.
- Validate every packet.
- Detect duplicates.
- Track missing packets.
- Store validated packets.
- Update transfer progress.
- Trigger reconstruction when all required packets are available.

---

# 12.7 Packet Streaming

OSP uses a streaming transmission model.

The Sender SHALL continuously transmit packets in ascending Packet Index order.

After transmitting the final packet, the Sender MAY:

- Restart transmission from Packet 0.
- Continue transmitting missing or recovery packets.
- Terminate the Session after successful completion.

The transmission strategy is implementation-specific but SHALL preserve protocol correctness.

---

# 12.8 Continuous Looping

Continuous looping improves reliability in optical communication.

Example:

```text id="2l2x5g"
0

1

2

3

4

5

↓

Repeat

0

1

2

3

4

5
```

Repeated transmission allows Receivers to recover packets missed due to:

- Motion blur.
- Camera autofocus.
- Temporary obstruction.
- Frame drops.
- Environmental lighting.

Looping SHALL NOT alter Packet Indices.

---

# 12.9 Transfer Progress

Both Sender and Receiver SHALL maintain transfer progress independently.

Progress SHOULD be measured using validated packets rather than transmitted frames.

Typical progress metrics include:

- Packets transmitted.
- Packets received.
- Packets validated.
- Packets remaining.
- Transfer percentage.
- Estimated completion time.

Progress reporting SHALL NOT affect protocol behavior.

---

# 12.10 Packet Collection

The Receiver SHALL maintain a packet collection for every file.

For each validated packet:

1. Verify Session ID.
2. Verify File ID.
3. Verify Packet Index.
4. Detect duplication.
5. Store payload.
6. Update packet map.

Packet collection SHALL continue until all required packets have been received.

---

# 12.11 Transfer Completion

A transfer SHALL be considered complete only when:

- All required packets have been collected.
- Reconstruction succeeds.
- File integrity verification succeeds.

Completion SHALL occur exactly once per transfer.

No additional packets SHALL modify a completed transfer.

---

# 12.12 Transfer Cancellation

Either participant MAY cancel the transfer.

Cancellation SHALL immediately terminate packet transmission.

Upon cancellation:

- Active Session SHALL terminate.
- Temporary packet storage SHALL be released.
- Incomplete reconstruction SHALL be discarded unless resume is supported.

A cancelled transfer SHALL NOT be reported as successful.

---

# 12.13 Transfer Failure

A transfer SHALL enter the Failed state when recovery is not possible.

Examples include:

- Manifest inconsistency.
- Unsupported protocol version.
- Session expiration.
- Irrecoverable packet loss.
- Integrity verification failure.
- Internal protocol error.

The implementation SHALL report the reason for failure.

---

# 12.14 Transfer Timeout

If no valid protocol activity occurs within the configured timeout period, the transfer SHALL terminate.

Protocol activity includes:

- Packet transmission.
- Packet reception.
- Recovery operations.
- Resume operations.

Timeout values are implementation-specific.

---

# 12.15 Multiple Files

A single transfer MAY contain multiple files.

For multi-file transfers:

- Every file SHALL have a unique File ID.
- Every file SHALL maintain an independent packet sequence.
- Every file SHALL maintain independent integrity verification.

The Session SHALL remain common to all files.

---

# 12.16 Ordering Guarantees

The protocol guarantees logical ordering, not arrival ordering.

Packets MAY arrive:

```text id="4l6hqp"
7

3

8

1

2

5
```

The Receiver SHALL reconstruct files using Packet Index ordering only.

Arrival order SHALL be ignored.

---

# 12.17 Recovery During Transfer

If packet loss occurs, the transfer MAY continue while recovery mechanisms operate.

Recovery SHALL NOT invalidate previously verified packets.

Recovered packets SHALL undergo the same validation process as original packets.

---

# 12.18 Resource Management

Implementations SHOULD minimize resource usage throughout the transfer.

Recommendations include:

- Stream packets instead of buffering entire files.
- Release temporary memory promptly.
- Avoid unnecessary disk writes.
- Avoid generating all transport frames in advance.

These recommendations improve scalability for large transfers.

---

# 12.19 Transfer Termination

A transfer SHALL terminate under one of the following conditions:

- Successful completion.
- User cancellation.
- Session expiration.
- Unrecoverable protocol error.

Upon termination:

- Protocol resources SHALL be released.
- Packet caches SHALL be cleared unless resume is enabled.
- Session SHALL transition to a terminal state.

---

# 12.20 Transfer Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. A transfer SHALL begin only after successful Session establishment and Manifest validation.
2. Data Packets SHALL NOT precede the Manifest.
3. Every validated packet SHALL belong to exactly one active transfer.
4. Packet transmission SHALL preserve Packet Indices.
5. Packet arrival order SHALL NOT affect reconstruction.
6. Duplicate packets SHALL NOT corrupt transfer state.
7. Transfer progress SHALL be based on validated packets.
8. A transfer SHALL complete only after successful reconstruction and integrity verification.
9. A completed transfer SHALL NOT accept additional Data Packets.
10. Every transfer SHALL terminate in exactly one terminal state: **Completed**, **Cancelled**, or **Failed**.

These invariants define the canonical behavior of data transfer within the photon Protocol and SHALL be preserved by all compliant implementations.

# 13. Packet Ordering

## 13.1 Purpose

The Packet Ordering Protocol defines how Data Packets are logically ordered, tracked, and reconstructed during a transfer.

Since optical communication does not guarantee that packets will be received in the same order they are transmitted, OSP separates **transmission order** from **reconstruction order**.

Every compliant implementation SHALL reconstruct files using Packet Indices rather than packet arrival order.

---

# 13.2 Objectives

The Packet Ordering Protocol SHALL:

- Preserve deterministic reconstruction.
- Support out-of-order packet reception.
- Detect missing packets.
- Detect duplicate packets.
- Support interruption and resume.
- Enable efficient recovery.

---

# 13.3 Ordering Model

Each file is divided into an ordered sequence of packets.

```text id="3pqrrv"
File

↓

Packet 0

Packet 1

Packet 2

Packet 3

...

Packet N
```

Packet Indices SHALL begin at **0**.

The final packet SHALL have index **N** where:

```text id="szh53q"
N = TotalPackets - 1
```

---

# 13.4 Packet Index

Every Data Packet SHALL contain a Packet Index.

The Packet Index uniquely identifies the logical position of the packet within its associated file.

Properties:

- Zero-based.
- Monotonically increasing.
- Unique within a File.
- Immutable.

Packet Indices SHALL NOT be reused within a Session.

---

# 13.5 Logical Order vs Arrival Order

Packets MAY arrive in any order.

Example:

```text id="zovdlk"
Arrival

7

2

0

6

1

5

4

3
```

Logical reconstruction SHALL always produce:

```text id="pmwkix"
0

1

2

3

4

5

6

7
```

Arrival order SHALL NEVER determine reconstruction order.

---

# 13.6 Sender Ordering

The Sender SHALL assign Packet Indices sequentially.

Example:

```text id="lh5epw"
Packet 0

↓

Packet 1

↓

Packet 2

↓

Packet 3
```

The Sender SHALL NOT:

- Skip indices.
- Reassign indices.
- Modify indices after packet creation.

---

# 13.7 Receiver Ordering

The Receiver SHALL maintain a Packet Map for each file.

Conceptually:

```text id="eqknuj"
Packet Map

0 → Received

1 → Missing

2 → Received

3 → Received

4 → Missing
```

The Packet Map SHALL represent the authoritative reconstruction state.

---

# 13.8 Packet Storage

Validated packets SHALL be stored according to their Packet Index.

Conceptually:

```text id="4ujm6h"
PacketBuffer[PacketIndex]
```

Example:

```text id="pcl7fe"
PacketBuffer[0]

PacketBuffer[1]

PacketBuffer[2]
```

Packet storage SHALL NOT depend on arrival order.

---

# 13.9 Duplicate Detection

A packet is considered a duplicate if:

- Session ID matches.
- File ID matches.
- Packet Index matches.
- Integrity verification succeeds.
- The Packet Index has already been stored.

Duplicates SHALL be ignored.

Duplicates SHALL NOT:

- overwrite validated packets,
- modify progress,
- restart reconstruction.

---

# 13.10 Missing Packets

A packet is considered missing when:

- It is expected according to the Manifest.
- It has not been successfully validated.

Example:

```text id="olxzmg"
Expected

0

1

2

3

4

5

Received

0

1

3

5
```

Missing:

```text id="0ab2vc"
2

4
```

Missing packets SHALL prevent reconstruction unless recovered through an approved recovery mechanism.

---

# 13.11 Packet Completion

A file SHALL be eligible for reconstruction only when:

```text id="t6ohni"
Received Packets

=

Expected Packets
```

or

Recovery Protocol determines sufficient information exists to reconstruct the missing data.

---

# 13.12 Reconstruction Order

Reconstruction SHALL occur strictly in ascending Packet Index order.

Example:

```text id="8q5k7d"
Packet 0

↓

Packet 1

↓

Packet 2

↓

Packet 3
```

No implementation SHALL reconstruct files using:

- arrival timestamp,
- decode order,
- transport frame order,
- storage order.

Only Packet Index SHALL determine reconstruction order.

---

# 13.13 Multi-file Ordering

Each file SHALL maintain an independent Packet Index sequence.

Example:

```text id="1jl2qq"
File A

0

1

2

3

File B

0

1

2

3
```

Packet Indices are unique **within a File**, not globally across the Session.

Packet ordering for one file SHALL NOT affect another file.

---

# 13.14 Ordering During Resume

When resuming a transfer:

Previously validated Packet Indices SHALL remain valid.

Only missing Packet Indices SHALL continue to be collected.

Previously reconstructed ordering SHALL NOT change.

---

# 13.15 Ordering During Recovery

Recovery mechanisms SHALL preserve Packet Indices.

Recovered packets SHALL occupy the same logical Packet Index as the missing original packet.

Recovery SHALL NOT alter:

- Packet numbering.
- Reconstruction order.
- File layout.

---

# 13.16 Packet Map

Every Receiver SHALL maintain a Packet Map.

The Packet Map SHALL record:

- Received
- Missing
- Corrupted
- Recovered
- Duplicate

for every Packet Index.

Example:

```text id="w72g5i"
0 ✓

1 ✓

2 Missing

3 ✓

4 Duplicate

5 Recovered
```

The Packet Map SHALL be updated only after successful packet validation.

---

# 13.17 Ordering Errors

The Receiver SHALL reject packets that exhibit invalid ordering properties, including:

- Negative Packet Index.
- Packet Index greater than Manifest Packet Count.
- Duplicate Packet Index with inconsistent payload.
- Packet belonging to an unknown File ID.
- Packet belonging to an expired Session.

Rejected packets SHALL NOT modify the Packet Map.

---

# 13.18 Ordering Guarantees

OSP guarantees:

- Deterministic reconstruction.
- Stable packet numbering.
- Independent file ordering.
- Resume-safe ordering.
- Recovery-safe ordering.

OSP does **not** guarantee:

- Arrival order.
- Decode order.
- Display order.
- Camera capture order.

---

# 13.19 Ordering Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every Data Packet SHALL contain exactly one Packet Index.
2. Packet Indices SHALL begin at zero.
3. Packet Indices SHALL be unique within a File.
4. Packet Indices SHALL remain immutable after packet creation.
5. Reconstruction SHALL use Packet Index ordering only.
6. Arrival order SHALL NOT affect reconstruction.
7. Duplicate packets SHALL NOT overwrite validated packets.
8. Missing packets SHALL be tracked by the Packet Map.
9. Every file SHALL maintain an independent Packet Index sequence.
10. Packet ordering SHALL remain deterministic across all compliant implementations.

These invariants ensure that every OSP implementation reconstructs files identically regardless of transmission timing, transport characteristics, or packet arrival order.

# 14. Resume Protocol

## 14.1 Purpose

The Resume Protocol defines how an interrupted transfer continues without restarting from the beginning.

Rather than retransmitting the entire file, OSP resumes by preserving previously validated packets and continuing the transfer from the remaining missing packets.

Resume functionality is designed to tolerate temporary interruptions caused by:

- Camera movement
- Lighting changes
- Device rotation
- Temporary application interruption
- User pause
- Short transport disruptions

The Resume Protocol SHALL preserve transfer correctness and SHALL NOT compromise file integrity.

---

# 14.2 Objectives

The Resume Protocol SHALL:

- Preserve validated packets.
- Avoid retransmitting already validated data where possible.
- Restore protocol state after interruption.
- Maintain Session consistency.
- Support deterministic reconstruction.
- Minimize recovery time.

---

# 14.3 Resume Lifecycle

A resumable transfer follows the lifecycle below.

```text id="l7m1pk"
Active

↓

Interrupted

↓

Paused

↓

Resume Requested

↓

Session Validation

↓

Continue Transfer

↓

Verification

↓

Completed
```

Resume SHALL continue the existing transfer.

It SHALL NOT create a new transfer.

---

# 14.4 Resume Eligibility

A transfer MAY be resumed only if:

- The Session remains valid.
- The Manifest has already been validated.
- Previously validated packets are still available.
- The protocol version remains compatible.

Resume SHALL NOT be permitted after:

- Session expiration.
- User-initiated transfer reset.
- Manifest inconsistency.
- Unrecoverable protocol failure.

---

# 14.5 Resume State Preservation

Before entering the Paused state, the Receiver SHALL preserve:

- Session ID
- File IDs
- Packet Map
- Validated packets
- Manifest
- Transfer configuration
- Integrity configuration

This information SHALL remain unchanged throughout the resume process.

---

# 14.6 Pause Behavior

While paused:

- Packet collection SHALL stop.
- Reconstruction SHALL NOT begin.
- Packet buffers SHALL remain intact.
- Session metadata SHALL remain valid.

The Sender MAY continue transmitting packets according to the implementation strategy.

The Receiver MAY ignore incoming packets while paused.

---

# 14.7 Resume Request

A Resume Request transitions the transfer from **Paused** to **Resuming**.

Before resuming, the Receiver SHALL verify:

1. Session ID.
2. Protocol Version.
3. Manifest consistency.
4. Packet Map integrity.

If validation succeeds:

The transfer SHALL continue.

Otherwise:

The Session SHALL terminate.

---

# 14.8 Packet Continuation

After resuming, packet collection SHALL continue normally.

Previously validated packets SHALL NOT require retransmission unless their integrity cannot be guaranteed.

The Receiver SHALL continue collecting only missing or invalid packets.

Example:

```text id="x2gzpi"
Expected

0

1

2

3

4

5

Stored

0 ✓

1 ✓

2 ✓

3 Missing

4 ✓

5 Missing
```

After resume, only Packets **3** and **5** remain required.

---

# 14.9 Sender Behavior During Resume

The Sender SHALL continue transmitting packets according to the active transfer strategy.

The Sender MAY:

- Continue packet looping.
- Prioritize missing packets (future extension).
- Continue recovery packet transmission.

The Sender SHALL NOT create new Packet Indices during resume.

---

# 14.10 Receiver Behavior During Resume

The Receiver SHALL:

- Preserve previously validated packets.
- Continue duplicate detection.
- Continue packet validation.
- Continue Packet Map updates.

Duplicate packets received after resume SHALL be ignored.

---

# 14.11 Resume and Reconstruction

Reconstruction SHALL NOT restart after resume.

Instead:

- Existing validated packets SHALL remain available.
- Newly validated packets SHALL be added.
- Reconstruction SHALL begin only when all required packets have been collected.

Previously reconstructed partial data SHALL NOT be trusted unless explicitly supported by the implementation.

---

# 14.12 Resume Timeout

A paused transfer SHALL remain resumable only for the configured Session lifetime.

If the Session expires before resume:

- Resume SHALL fail.
- Packet buffers SHALL be discarded.
- The transfer SHALL terminate.

Timeout duration is implementation-specific.

---

# 14.13 Resume Failure

Resume SHALL fail under the following conditions:

- Session expired.
- Manifest mismatch.
- Protocol version mismatch.
- Packet Map corruption.
- User cancellation.
- Internal protocol error.

Upon failure:

- Active Session SHALL terminate.
- Temporary packet storage SHALL be released.
- The transfer SHALL enter the **Failed** state.

---

# 14.14 Resume and Multi-file Transfers

For multi-file transfers:

Resume SHALL preserve the Packet Map independently for every file.

Example:

```text id="5f5ggr"
File A

Completed

File B

Missing 12 Packets

File C

Missing 2 Packets
```

Only incomplete files SHALL continue receiving packets.

Completed files SHALL NOT be reconstructed again.

---

# 14.15 Resume Security

Resume SHALL inherit all security parameters established during the original Handshake.

These parameters include:

- Session ID
- Encryption configuration
- Integrity algorithm
- Compression configuration
- Protocol Version

Security parameters SHALL NOT change during resume.

---

# 14.16 Resume Guarantees

The Resume Protocol guarantees:

- Previously validated packets remain valid.
- Duplicate packets do not corrupt state.
- Packet ordering remains unchanged.
- Reconstruction remains deterministic.
- Session identity remains constant.

Resume does **not** guarantee:

- Preservation after Session expiration.
- Recovery from Manifest corruption.
- Recovery after incompatible protocol upgrades.

---

# 14.17 Resume Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Resume SHALL continue an existing Session rather than creating a new one.
2. Previously validated packets SHALL remain valid throughout the resume process.
3. Session ID SHALL remain unchanged after resume.
4. Packet Indices SHALL remain unchanged after resume.
5. Duplicate packets SHALL NOT overwrite validated packets.
6. Reconstruction SHALL begin only after all required packets have been collected.
7. Security and protocol configuration SHALL remain unchanged throughout the resumed transfer.
8. Resume SHALL fail if Session validation fails.
9. Resume SHALL preserve deterministic reconstruction.
10. A resumed transfer SHALL produce the same reconstructed file as an uninterrupted transfer.

These invariants ensure that interrupted transfers can safely continue without compromising correctness, integrity, or interoperability.

# 15. Recovery Protocol

## 15.1 Purpose

The Recovery Protocol defines how an photon implementation detects, tracks, and recovers from packet loss or corruption during an active transfer.

Unlike the Resume Protocol, which continues an interrupted Session, the Recovery Protocol operates while the Session remains active.

Its objective is to maximize successful reconstruction despite imperfections in optical communication.

---

# 15.2 Objectives

The Recovery Protocol SHALL:

- Detect missing packets.
- Detect corrupted packets.
- Recover missing data.
- Minimize retransmission.
- Preserve deterministic reconstruction.
- Maintain protocol correctness.

---

# 15.3 Recovery Model

Recovery operates independently of packet transmission.

```text id="6ixg4y"
Packet Stream

↓

Validation

↓

Missing Packet Detection

↓

Recovery

↓

Packet Validation

↓

Packet Map Update

↓

Reconstruction
```

Recovery SHALL never modify previously validated packets.

---

# 15.4 Recoverable Conditions

Recovery MAY be performed for:

- Missing packets.
- Corrupted packets.
- Dropped optical frames.
- Camera frame loss.
- Temporary lighting interruptions.

Recovery SHALL NOT be used for:

- Manifest corruption.
- Session mismatch.
- Protocol version mismatch.
- Invalid encryption parameters.

---

# 15.5 Missing Packet Detection

The Receiver SHALL compare the Packet Map against the Manifest.

Example:

```text id="m7kkhn"
Expected

0

1

2

3

4

5

Received

0

1

3

5
```

Detected Missing Packets

```text id="zslh6n"
2

4
```

Only validated packets SHALL be considered received.

---

# 15.6 Recovery Strategies

OSP supports multiple recovery strategies.

### Strategy 1 — Natural Packet Repetition (Default)

The Sender continuously loops packet transmission.

Eventually, the Receiver observes every packet.

Advantages:

- Simple.
- No additional protocol complexity.
- Works on every implementation.

---

### Strategy 2 — Forward Error Correction (Future)

Recovery Packets contain parity information.

Missing packets are mathematically reconstructed.

This feature is OPTIONAL in OSP/1.0.

---

### Strategy 3 — Selective Recovery (Future)

The Sender prioritizes transmission of missing packets.

Requires a future feedback mechanism.

Not part of OSP/1.0.

---

# 15.7 Recovery Packet

Recovery Packets MAY exist.

Recovery Packets SHALL:

- Belong to one Session.
- Reference one File.
- Contain recovery information.
- Never replace original Data Packets.

Recovery Packet binary layout is defined in **PACKET_SPEC.md**.

---

# 15.8 Recovery Validation

Recovered packets SHALL undergo exactly the same validation process as normal packets.

Validation includes:

- Session ID.
- File ID.
- Packet Index.
- CRC verification.
- Payload validation.

Recovered packets SHALL NOT bypass protocol validation.

---

# 15.9 Recovery Completion

Recovery completes when:

- Every required packet exists.
- Every recovered packet passes validation.

Recovery SHALL terminate immediately after successful reconstruction.

---

# 15.10 Recovery Failure

Recovery SHALL fail if:

- Required packets cannot be recovered.
- Recovery Packet validation fails.
- Session expires.
- User cancels transfer.

Upon failure:

The transfer SHALL enter the Failed state.

---

# 15.11 Recovery and Duplicate Packets

Recovered packets SHALL participate in duplicate detection.

If both:

Original Packet

and

Recovered Packet

exist,

the first successfully validated packet SHALL be retained.

The duplicate SHALL be discarded.

---

# 15.12 Recovery and Resume

Resume and Recovery are independent.

Resume restores protocol state.

Recovery restores missing packet data.

Both MAY operate during the same transfer.

---

# 15.13 Recovery Guarantees

The Recovery Protocol guarantees:

- No validated packet is modified.
- Packet ordering remains unchanged.
- Recovery does not affect Session identity.
- File integrity verification remains mandatory.

Recovery does **not** guarantee successful reconstruction if insufficient information is available.

---

# 15.14 Recovery Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Recovery SHALL preserve Packet Indices.
2. Recovery SHALL NOT modify validated packets.
3. Every recovered packet SHALL undergo normal validation.
4. Recovery SHALL preserve deterministic reconstruction.
5. Recovery SHALL terminate immediately after successful reconstruction.
6. Recovery SHALL NOT bypass integrity verification.
7. Recovery SHALL remain independent of the transport implementation.
8. Recovery SHALL NOT modify Session metadata.
9. Recovery SHALL operate only within an active Session.
10. Recovery SHALL never produce a reconstructed file that fails integrity verification.

These invariants define the canonical behavior of packet recovery within the photon Protocol.

# 16. Multi-file Protocol

## 16.1 Purpose

The Multi-file Protocol defines how the photon Protocol (OSP) transfers multiple files within a single Session.

Instead of treating each file as an independent transfer, OSP groups related files into one logical transfer while preserving the identity, ordering, and integrity of every individual file.

This minimizes handshake overhead, improves transfer efficiency, and provides a better user experience for batch sharing.

---

# 16.2 Objectives

The Multi-file Protocol SHALL:

- Support one or more files in a single Session.
- Preserve each file independently.
- Maintain deterministic reconstruction.
- Allow independent integrity verification.
- Support resume and recovery on a per-file basis.
- Preserve the original directory selection order.

---

# 16.3 Multi-file Transfer Model

A Session MAY contain one or more files.

```text id="sghvdt"
Session

├── File A
│     ├── Packet 0
│     ├── Packet 1
│     └── Packet N
│
├── File B
│     ├── Packet 0
│     ├── Packet 1
│     └── Packet N
│
└── File C
      ├── Packet 0
      ├── Packet 1
      └── Packet N
```

Each file SHALL be reconstructed independently.

---

# 16.4 File Identity

Every file SHALL possess a unique **File ID** within the Session.

The File ID SHALL uniquely identify:

- File metadata.
- Packet sequence.
- Integrity verification.
- Reconstruction state.

File IDs SHALL remain immutable throughout the transfer.

---

# 16.5 Manifest Structure

The Manifest SHALL contain one Manifest Entry for every file.

Each Manifest Entry SHALL include:

- File ID
- Filename
- Extension
- MIME Type
- Original File Size
- Packet Count
- Integrity Hash
- Compression Method
- Encryption Method

The Manifest SHALL define the complete list of files before Data Packet transmission begins.

---

# 16.6 Packet Association

Every Data Packet SHALL reference exactly one File ID.

Example:

```text id="qptxyv"
Packet

↓

Session ID

↓

File ID

↓

Packet Index

↓

Payload
```

Packets SHALL NOT belong to multiple files.

---

# 16.7 Packet Ordering

Each file SHALL maintain its own Packet Index sequence.

Example:

```text id="b5cb2v"
File A

0

1

2

3

File B

0

1

2

3
```

Packet Index values are unique only within the corresponding File.

---

# 16.8 Transmission Strategy

The Sender MAY choose any deterministic transmission strategy.

Examples include:

### Sequential

```text id="b8gdws"
File A

↓

File B

↓

File C
```

---

### Round Robin

```text id="vblcfh"
A0

B0

C0

A1

B1

C1
```

---

### Windowed (Future)

```text id="vdb7z8"
Window 1

↓

Window 2

↓

Window 3
```

The chosen strategy SHALL NOT affect reconstruction correctness.

---

# 16.9 Receiver Behavior

The Receiver SHALL maintain independent state for every file.

Each file SHALL have:

- Packet Map
- Reconstruction Buffer
- Integrity Status
- Recovery State
- Completion Status

Progress for one file SHALL NOT affect another.

---

# 16.10 Reconstruction

Files SHALL be reconstructed independently.

A file MAY begin reconstruction immediately after:

- All required packets have been received.
- Integrity prerequisites have been satisfied.

The Receiver SHALL NOT wait for unrelated files to complete.

---

# 16.11 Integrity Verification

Each file SHALL undergo independent integrity verification.

Example:

```text id="wljr9n"
File A

SHA-256 ✓

File B

SHA-256 ✓

File C

SHA-256 ✓
```

Failure of one file SHALL NOT invalidate successfully reconstructed files.

---

# 16.12 Resume

Resume SHALL preserve packet state independently for every file.

Example:

```text id="cq1zh5"
File A

Completed

File B

Missing 8 Packets

File C

Missing 2 Packets
```

After resume:

- File A SHALL remain complete.
- File B SHALL continue collecting missing packets.
- File C SHALL continue collecting missing packets.

---

# 16.13 Recovery

Recovery SHALL operate independently for every file.

Recovery of one file SHALL NOT modify:

- Packet Maps of other files.
- Integrity state of other files.
- Reconstruction state of other files.

---

# 16.14 File Completion

A file is considered complete when:

- All required packets have been collected.
- Reconstruction succeeds.
- Integrity verification succeeds.

Completed files SHALL become read-only.

---

# 16.15 Transfer Completion

A multi-file transfer SHALL be considered complete only when **every file** has successfully completed.

Example:

```text id="d8bj8h"
File A ✓

File B ✓

File C ✓

↓

Transfer Complete
```

If any required file remains incomplete, the Session SHALL remain active unless terminated.

---

# 16.16 File Ordering

The Manifest SHALL preserve the Sender's selected file order.

Implementations SHOULD present files to the user in this order.

Protocol correctness SHALL NOT depend on presentation order.

---

# 16.17 Duplicate Detection

Duplicate detection SHALL occur independently for every file.

The following tuple SHALL uniquely identify a Data Packet:

```text id="r0odkv"
(Session ID,

File ID,

Packet Index)
```

Duplicate detection SHALL use all three values.

---

# 16.18 Failure Handling

Failure of one file SHALL NOT corrupt other files.

If one file fails reconstruction:

- Successfully reconstructed files MAY still be saved.
- Failed files SHALL report their failure independently.
- Overall transfer status SHALL indicate partial completion if supported by the implementation.

The protocol itself remains deterministic regardless of UI behavior.

---

# 16.19 Multi-file Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every file SHALL have exactly one unique File ID.
2. Every Data Packet SHALL reference exactly one File ID.
3. Every file SHALL maintain an independent Packet Index sequence.
4. Every file SHALL maintain an independent Packet Map.
5. Reconstruction SHALL occur independently for each file.
6. Integrity verification SHALL occur independently for each file.
7. Resume SHALL preserve per-file state.
8. Recovery SHALL operate independently for each file.
9. Completion of one file SHALL NOT modify another file.
10. A Session SHALL be considered complete only after every required file has reached a terminal state.

These invariants ensure deterministic handling of batch transfers while preserving complete isolation between files within the same Session.

# 17. Adaptive Transport

## 17.1 Purpose

The Adaptive Transport Protocol defines how an photon implementation dynamically adjusts transport parameters during an active Session to maximize transfer reliability and efficiency.

Adaptive Transport operates entirely within the Transport Layer.

It SHALL NOT modify:

- Protocol semantics.
- Packet contents.
- Packet ordering.
- Session behavior.
- File reconstruction.

Only the method by which packets are physically transmitted MAY change.

---

# 17.2 Objectives

Adaptive Transport SHALL:

- Improve transfer reliability.
- Optimize throughput.
- Reduce packet loss.
- Adapt to varying device capabilities.
- Respond to changing environmental conditions.
- Preserve protocol correctness.

---

# 17.3 Adaptive Parameters

An implementation MAY adapt one or more of the following parameters.

### Frame Duration

Time each transport frame remains visible.

---

### Frame Rate

Number of transport frames displayed per second.

---

### QR Version

QR symbol version used for encoding.

---

### QR Physical Size

Displayed dimensions of the optical code.

---

### Screen Brightness

Display brightness during transmission.

---

### Error Correction Level

Transport-specific error correction level.

---

### Packet Payload Size

Payload size MAY be reduced for difficult environments.

---

### Redundancy

Additional packet repetition or recovery packets.

---

## 17.4 Non-Adaptive Parameters

The following SHALL remain constant throughout an active Session:

- Session ID
- Protocol Version
- Packet Indices
- File IDs
- Manifest
- Packet Payload Contents
- File Hash
- Encryption Configuration

Adaptive Transport SHALL NOT modify protocol data.

---

# 17.5 Monitoring

Implementations MAY continuously monitor transport quality.

Example metrics include:

- Decode Success Rate
- Packet Loss Rate
- Average Decode Time
- Camera Focus Stability
- Motion Blur
- Ambient Brightness
- Frame Drop Rate

Monitoring SHALL NOT alter protocol behavior.

---

# 17.6 Transport Quality Levels

Implementations MAY classify transport quality into predefined levels.

```text id="r0s0ha"
Excellent

↓

Good

↓

Moderate

↓

Poor

↓

Critical
```

The classification algorithm is implementation-specific.

---

# 17.7 Adaptation Rules

When transport quality decreases, implementations MAY:

- Increase QR size.
- Reduce frame rate.
- Increase frame duration.
- Increase redundancy.
- Increase QR error correction.
- Reduce payload size.

When transport quality improves, implementations MAY gradually reverse these adjustments.

Abrupt parameter oscillation SHOULD be avoided.

---

# 17.8 Adaptation Strategy

Adaptive changes SHOULD be incremental.

Example:

```text id="t40mkg"
20 FPS

↓

18 FPS

↓

15 FPS

↓

12 FPS

↓

10 FPS
```

rather than

```text id="4cpjlwm"
20 FPS

↓

5 FPS
```

Implementations SHOULD minimize sudden changes to maintain stable decoding.

---

# 17.9 Sender Responsibilities

The Sender SHALL:

- Monitor transport performance.
- Apply adaptive transport decisions.
- Continue transmitting valid protocol packets.
- Preserve packet ordering.

Adaptive decisions SHALL NOT invalidate previously generated packets.

---

# 17.10 Receiver Responsibilities

The Receiver MAY:

- Monitor decode performance.
- Adjust camera processing parameters.
- Improve frame acquisition.
- Continue normal packet validation.

The Receiver SHALL NOT modify protocol packets.

---

# 17.11 Benchmark Mode

Implementations MAY perform an optional benchmark immediately after Handshake.

Benchmarking MAY estimate:

- Maximum stable frame rate.
- Preferred QR version.
- Recommended payload size.
- Device decoding capability.

Benchmark results MAY be used to initialize Adaptive Transport parameters.

Benchmark behavior SHALL remain implementation-specific.

---

# 17.12 Adaptive Recovery

Adaptive Transport MAY increase redundancy when packet loss exceeds acceptable thresholds.

Possible actions include:

- Repeat packets more frequently.
- Increase Recovery Packet frequency.
- Extend frame duration.

Adaptive recovery SHALL remain transparent to the protocol.

---

# 17.13 User Configuration

Implementations MAY expose predefined transport modes.

Examples:

```text id="d8dve8"
Reliable

Balanced

Fast

Turbo

Automatic
```

Automatic mode SHOULD enable Adaptive Transport.

Manual modes MAY disable automatic adjustments.

---

# 17.14 Transport Events

Adaptive Transport MAY generate events such as:

- Frame Rate Changed
- QR Size Changed
- Brightness Changed
- Redundancy Increased
- Quality Improved
- Quality Degraded

These events are informational and SHALL NOT alter protocol semantics.

---

# 17.15 Adaptive Constraints

Adaptive Transport SHALL NOT:

- Change Session ID.
- Reorder packets.
- Modify payload bytes.
- Modify Packet Indices.
- Modify Manifest contents.
- Change integrity algorithms during an active Session.
- Restart the Session automatically.

Any required protocol-level changes SHALL require a new Session.

---

# 17.16 Failure Handling

If Adaptive Transport cannot maintain reliable communication, the implementation MAY:

- Reduce throughput.
- Increase redundancy.
- Continue packet looping.
- Pause the transfer.
- Terminate the Session if recovery is no longer possible.

Termination SHALL follow the normal Session termination rules.

---

# 17.17 Transport Independence

Adaptive Transport is independent of the underlying transport technology.

Future transport implementations MAY adapt additional parameters specific to their encoding method.

Protocol behavior SHALL remain unchanged.

---

# 17.18 Adaptive Transport Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Adaptive Transport SHALL NOT modify protocol semantics.
2. Packet contents SHALL remain byte-identical throughout adaptation.
3. Packet ordering SHALL remain unchanged.
4. Session identity SHALL remain unchanged.
5. Adaptation SHALL affect only transport characteristics.
6. Previously validated packets SHALL remain valid.
7. Adaptive decisions SHALL NOT require a new Manifest.
8. Adaptive changes SHALL preserve deterministic reconstruction.
9. Transport optimization SHALL remain optional unless explicitly negotiated.
10. Every compliant implementation SHALL remain interoperable regardless of whether Adaptive Transport is enabled.

These invariants ensure that Adaptive Transport improves reliability and performance without affecting interoperability or protocol correctness.

# 18. Compression Rules

## 18.1 Purpose

The Compression Rules define how file data MAY be compressed before packetization to reduce transmission time while preserving lossless reconstruction.

Compression is an optional optimization layer that operates on the original binary file before encryption and packet generation.

Compression SHALL NOT alter protocol semantics.

Regardless of whether compression is enabled, every successfully reconstructed file SHALL be byte-for-byte identical to the original file.

---

# 18.2 Objectives

The Compression Rules SHALL:

- Reduce total transfer size where beneficial.
- Preserve exact file contents.
- Support deterministic decompression.
- Avoid unnecessary computation.
- Remain independent of the transport layer.
- Allow future compression algorithms.

---

# 18.3 Compression Pipeline

Compression occurs before encryption and packetization.

The processing pipeline SHALL follow the sequence below.

```text id="g1q3mx"
Original File

↓

Compression (Optional)

↓

Encryption (Optional)

↓

Packet Generation

↓

Transport Encoding
```

On the Receiver:

```text id="s4lz7t"
Transport Decoding

↓

Packet Reconstruction

↓

Decryption (Optional)

↓

Decompression (Optional)

↓

Recovered File
```

The order of operations SHALL NOT be changed.

---

# 18.4 Compression Modes

Implementations SHOULD support the following modes.

### Off

Compression is disabled.

The original binary stream is packetized directly.

---

### Auto (Recommended)

The implementation determines whether compression is beneficial.

If compression does not reduce the file size by a meaningful amount, it SHOULD be skipped.

---

### Always

Compression is always attempted using the negotiated compression algorithm.

---

### Maximum

The implementation prioritizes compression ratio over processing speed.

This mode MAY increase CPU usage and transfer preparation time.

---

# 18.5 Compression Algorithms

OSP does not mandate a specific compression algorithm.

However, all communicating devices MUST support at least one common algorithm.

Examples include:

- DEFLATE
- GZIP
- Brotli
- Zstandard (Future)

The negotiated algorithm SHALL be recorded in the Manifest.

---

# 18.6 Lossless Compression

Only **lossless compression** is permitted.

Lossy transformations SHALL NOT be performed by the protocol.

Examples of prohibited behavior include:

- Image quality reduction.
- Video transcoding.
- Audio re-encoding.
- Metadata removal.

Applications MAY provide separate user-facing optimization features, but those occur outside the protocol.

---

# 18.7 Automatic Compression Decisions

When operating in Auto mode, implementations SHOULD consider:

- File size.
- File type.
- Estimated compression ratio.
- Estimated CPU cost.
- Estimated transfer time reduction.

Compression SHOULD be skipped if the expected benefit is negligible.

---

# 18.8 Compression Recommendations

The following table provides recommended default behavior.

| File Type | Recommended Action |
| --------- | ------------------ |
| TXT       | Compress           |
| JSON      | Compress           |
| CSV       | Compress           |
| XML       | Compress           |
| PDF       | Benchmark (Auto)   |
| PNG       | Usually Skip       |
| JPEG      | Skip               |
| MP3       | Skip               |
| MP4       | Skip               |
| ZIP       | Skip               |
| RAR       | Skip               |
| APK       | Benchmark (Auto)   |

These are recommendations only.

The protocol remains file-format agnostic.

---

# 18.9 Compression Metadata

If compression is enabled, the Manifest SHALL record:

- Compression Enabled
- Compression Algorithm
- Original File Size
- Compressed File Size

This metadata SHALL remain immutable throughout the Session.

---

# 18.10 Compression Integrity

Integrity verification SHALL always apply to the **original file** after decompression.

Implementations MAY additionally verify the compressed stream during processing.

Successful decompression alone SHALL NOT indicate successful transfer.

The reconstructed file MUST still pass whole-file integrity verification.

---

# 18.11 Compression Failure

Compression SHALL fail if:

- The negotiated algorithm is unsupported.
- Compression produces invalid output.
- Compression metadata is inconsistent.

If compression fails before transmission:

- The transfer SHALL NOT begin.

If decompression fails after reception:

- Reconstruction SHALL fail.
- Integrity verification SHALL NOT proceed.
- The transfer SHALL enter the Failed state.

---

# 18.12 Compression Negotiation

Compression capabilities SHALL be negotiated during the Handshake.

Negotiation SHALL determine:

- Whether compression is enabled.
- Which algorithm will be used.

Once negotiated, the compression configuration SHALL remain fixed for the duration of the Session.

---

# 18.13 Compression and Encryption

When both compression and encryption are enabled, the processing order SHALL be:

```text id="v3igv8"
Compress

↓

Encrypt
```

The reverse order SHALL NOT be used because encrypted data exhibits little or no compressibility.

---

# 18.14 Compression and Resume

Resume SHALL preserve the negotiated compression configuration.

Compression SHALL NOT be re-negotiated during an active Session.

---

# 18.15 Future Compression Algorithms

Future protocol versions MAY introduce additional compression algorithms.

Implementations SHALL:

- Ignore unknown optional algorithms.
- Reject unknown mandatory algorithms.
- Preserve backward compatibility whenever practical.

---

# 18.16 Compression Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Compression SHALL occur before encryption.
2. Compression SHALL occur before packet generation.
3. Only lossless compression SHALL be used.
4. Compression configuration SHALL be negotiated before transfer begins.
5. Compression settings SHALL remain immutable during an active Session.
6. The reconstructed file SHALL be byte-for-byte identical to the original file.
7. Whole-file integrity verification SHALL occur after decompression.
8. Unsupported mandatory compression algorithms SHALL terminate the transfer.
9. Compression SHALL remain independent of the transport implementation.
10. Disabling compression SHALL NOT alter protocol correctness.

These invariants ensure that compression improves transfer efficiency without compromising interoperability, determinism, or file integrity.

# 19. Encryption Rules

## 19.1 Purpose

The Encryption Rules define how payload confidentiality is achieved within the photon Protocol (OSP).

Encryption is an optional protocol feature that protects transferred file contents from unauthorized access while preserving interoperability and deterministic reconstruction.

Encryption SHALL operate independently of the transport mechanism and SHALL NOT modify protocol semantics.

Only the file payload SHALL be encrypted.

Protocol metadata required for communication SHALL remain readable unless explicitly protected by a future protocol revision.

---

# 19.2 Objectives

The Encryption Rules SHALL:

- Protect file confidentiality.
- Preserve deterministic reconstruction.
- Support multiple encryption algorithms.
- Prevent unauthorized file access.
- Maintain protocol interoperability.
- Allow future cryptographic upgrades.

---

# 19.3 Encryption Pipeline

Encryption SHALL occur after compression and before packet generation.

```text
Original File

↓

Compression (Optional)

↓

Encryption (Optional)

↓

Packet Generation

↓

Transport Encoding
```

Receiver Pipeline:

```text
Transport Decoding

↓

Packet Reconstruction

↓

Decryption

↓

Decompression

↓

Integrity Verification

↓

Recovered File
```

The processing order SHALL NOT be modified.

---

# 19.4 Encryption Modes

Implementations SHOULD support the following modes.

### Disabled

Payload is transmitted without encryption.

---

### Optional

The Sender MAY enable encryption.

The Receiver MUST support the negotiated encryption algorithm.

---

### Required

The transfer SHALL NOT begin unless both participants support the negotiated encryption configuration.

---

# 19.5 Encryption Scope

The following SHALL be encrypted:

- File payload.
- Binary file contents.

The following SHALL remain unencrypted in OSP/1.0:

- Session ID.
- Protocol Version.
- Packet Type.
- Packet Index.
- File ID.
- Manifest structure.

Keeping protocol metadata visible enables packet routing, validation, and reconstruction without decrypting every packet.

---

# 19.6 Encryption Algorithms

OSP does not mandate a single encryption algorithm.

However, all compliant implementations SHALL support at least one common algorithm.

Examples include:

- AES-256-GCM
- ChaCha20-Poly1305
- Future authenticated encryption algorithms

The negotiated algorithm SHALL be recorded in the Manifest.

---

# 19.7 Key Management

The Encryption Rules define how encryption is used but do not prescribe a specific key exchange mechanism.

The Session SHALL establish a shared encryption context before Data Packet transmission begins.

Key generation, exchange, and storage are specified in **SECURITY.md**.

The encryption key SHALL remain constant throughout the Session.

---

# 19.8 Encryption Metadata

The Manifest SHALL record:

- Encryption Enabled
- Encryption Algorithm
- Encryption Version
- Key Identifier (if applicable)

The Manifest SHALL NOT contain the encryption key.

---

# 19.9 Packet Encryption

Packet payloads SHALL be encrypted before packetization.

The Header SHALL remain readable for protocol processing.

Packet payload encryption SHALL NOT modify:

- Packet Index.
- Session ID.
- File ID.
- Protocol Version.

---

# 19.10 Authentication

Encryption algorithms SHOULD provide authenticated encryption.

Implementations SHOULD detect:

- Payload modification.
- Incorrect decryption keys.
- Tampered ciphertext.

Packets failing authentication SHALL be rejected.

---

# 19.11 Decryption

The Receiver SHALL decrypt payloads only after:

- Successful packet validation.
- Successful packet collection.
- Successful reconstruction of the encrypted binary stream.

If decryption fails:

- Reconstruction SHALL fail.
- Integrity verification SHALL NOT proceed.
- The transfer SHALL enter the Failed state.

---

# 19.12 Encryption Negotiation

Encryption capabilities SHALL be negotiated during the Handshake.

Negotiation SHALL determine:

- Whether encryption is enabled.
- Which encryption algorithm will be used.
- Encryption version.

Once negotiated, encryption parameters SHALL remain unchanged throughout the Session.

---

# 19.13 Resume

Resume SHALL preserve:

- Encryption algorithm.
- Encryption mode.
- Encryption context.

Encryption SHALL NOT be renegotiated during Resume.

---

# 19.14 Encryption Failure

The transfer SHALL fail if:

- Encryption negotiation fails.
- The Receiver does not support the required algorithm.
- Payload authentication fails.
- Decryption fails.
- Encryption metadata is inconsistent.

Failed encrypted transfers SHALL NOT produce reconstructed files.

---

# 19.15 Future Cryptographic Algorithms

Future versions of OSP MAY introduce new encryption algorithms.

Implementations SHALL:

- Ignore unknown optional algorithms.
- Reject unknown mandatory algorithms.
- Preserve backward compatibility whenever practical.

---

# 19.16 Encryption Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Encryption SHALL occur after compression.
2. Encryption SHALL occur before packet generation.
3. Only payload data SHALL be encrypted in OSP/1.0.
4. Protocol metadata required for routing and validation SHALL remain unencrypted.
5. Encryption parameters SHALL be negotiated before transfer begins.
6. Encryption settings SHALL remain immutable throughout the Session.
7. Packets failing authentication or decryption SHALL be rejected.
8. Encryption SHALL remain independent of the transport implementation.
9. The reconstructed file SHALL be decrypted before integrity verification.
10. Enabling or disabling encryption SHALL NOT alter protocol semantics.

These invariants ensure that encryption provides confidentiality while preserving interoperability, deterministic reconstruction, and protocol correctness.

# 20. Integrity Verification

## 20.1 Purpose

The Integrity Verification Protocol defines how the photon Protocol (OSP) verifies that the reconstructed file is identical to the original file transmitted by the Sender.

Integrity Verification is the final mandatory stage of every successful transfer.

A transfer SHALL NOT be considered complete until integrity verification succeeds.

---

# 20.2 Objectives

The Integrity Verification Protocol SHALL:

- Detect corrupted transfers.
- Verify byte-for-byte file reconstruction.
- Prevent incomplete file delivery.
- Detect tampering.
- Validate recovered transfers.
- Preserve deterministic behavior.

---

# 20.3 Verification Levels

Integrity verification operates at two independent levels.

### Packet Integrity

Ensures that an individual packet has not been corrupted.

---

### File Integrity

Ensures that the reconstructed file exactly matches the original file.

Successful packet verification alone SHALL NOT imply successful file verification.

---

# 20.4 Verification Pipeline

Integrity verification SHALL follow the sequence below.

```text id="q5mdpn"
Receive Packet

↓

Validate Packet

↓

Store Packet

↓

Reconstruct File

↓

Compute File Hash

↓

Compare Expected Hash

↓

Transfer Complete
```

---

# 20.5 Packet Integrity

Every received packet SHALL undergo packet-level validation before storage.

Packet validation MAY include:

- Header validation.
- Payload length validation.
- CRC verification.
- Authentication tag verification (if encrypted).
- Session validation.
- File ID validation.
- Packet Index validation.

Packets failing validation SHALL be discarded.

---

# 20.6 File Integrity

After reconstruction, the Receiver SHALL compute the integrity value of the reconstructed file.

The computed value SHALL be compared against the expected value recorded in the Manifest.

If both values match:

The reconstructed file SHALL be accepted.

Otherwise:

The reconstructed file SHALL be rejected.

---

# 20.7 Integrity Algorithm

The integrity algorithm SHALL be negotiated before packet transmission.

Every compliant implementation SHALL support at least one common cryptographic hash algorithm.

Examples include:

- SHA-256
- SHA-512 (Future)

The selected algorithm SHALL be recorded in the Manifest.

---

# 20.8 Integrity Metadata

The Manifest SHALL contain:

- Integrity Algorithm
- Expected File Hash

These values SHALL remain immutable throughout the Session.

---

# 20.9 Verification Timing

Packet integrity SHALL occur immediately after packet decoding.

File integrity SHALL occur only after:

- All required packets have been collected.
- Reconstruction has completed.
- Decryption (if enabled) has completed.
- Decompression (if enabled) has completed.

Integrity verification SHALL occur before the reconstructed file is presented as successfully received.

---

# 20.10 Verification Failure

Integrity verification SHALL fail if:

- The computed file hash differs from the expected hash.
- Decryption fails.
- Decompression fails.
- Required packets are missing.
- Reconstruction fails.

Upon failure:

- The transfer SHALL enter the Failed state.
- The reconstructed file SHALL NOT be reported as successfully received.
- Recovery or Resume MAY be attempted if supported.

---

# 20.11 Verification Success

Integrity verification succeeds only if:

- Packet validation succeeds.
- Reconstruction succeeds.
- File hash matches the expected hash.

Successful verification SHALL transition the transfer to the **Completed** state.

---

# 20.12 Multi-file Verification

For multi-file transfers:

Each file SHALL undergo independent integrity verification.

Example:

```text id="6r8qsn"
File A

SHA-256 ✓

↓

File B

SHA-256 ✓

↓

File C

SHA-256 ✓
```

Failure of one file SHALL NOT invalidate successfully verified files.

---

# 20.13 Resume and Recovery

Resume SHALL preserve previously validated packets.

Recovery SHALL preserve previously verified packet integrity.

Regardless of Resume or Recovery, every reconstructed file SHALL undergo complete file integrity verification before completion.

---

# 20.14 Integrity Failure Handling

If verification fails:

- The reconstructed file SHALL be considered invalid.
- The implementation SHALL NOT silently repair or modify the file.
- The Session MAY continue if recovery is possible.
- Otherwise, the transfer SHALL terminate.

Implementations SHOULD clearly report the reason for failure.

---

# 20.15 Transport Independence

Integrity Verification SHALL remain independent of:

- QR Version.
- Frame Rate.
- Screen Brightness.
- Camera Hardware.
- Transport Encoding.

Only reconstructed binary data participates in file integrity verification.

---

# 20.16 Security Considerations

Integrity verification protects against:

- Packet corruption.
- Transmission errors.
- Accidental modification.
- Incomplete reconstruction.

Integrity verification alone does **not** provide confidentiality.

Confidentiality is provided by the Encryption Rules defined in Section 19.

---

# 20.17 Integrity Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every packet SHALL be validated before storage.
2. Every reconstructed file SHALL undergo whole-file integrity verification.
3. File integrity SHALL be verified after decryption and decompression, if enabled.
4. A transfer SHALL NOT enter the Completed state unless integrity verification succeeds.
5. The expected integrity value SHALL originate from the validated Manifest.
6. Integrity verification SHALL be deterministic across all compliant implementations.
7. Integrity verification SHALL remain independent of the transport implementation.
8. Integrity failure SHALL prevent successful transfer completion.
9. Every file in a multi-file transfer SHALL be verified independently.
10. Successful integrity verification SHALL guarantee that the reconstructed file is byte-for-byte identical to the original file transmitted by the Sender.

These invariants establish integrity verification as the final authority for determining transfer correctness within the photon Protocol.

# 21. Error Handling

## 21.1 Purpose

The Error Handling Protocol defines how photon Protocol (OSP) detects, classifies, reports, and responds to protocol errors.

The objective of this section is to ensure that every compliant implementation behaves predictably when abnormal conditions occur.

Errors SHALL NOT result in undefined protocol behavior.

Every detected error SHALL result in a deterministic protocol action.

---

# 21.2 Objectives

The Error Handling Protocol SHALL:

- Detect protocol violations.
- Prevent corrupted transfers.
- Protect protocol state.
- Maintain deterministic behavior.
- Preserve validated data whenever possible.
- Provide recoverable failure paths.
- Prevent undefined behavior.

---

# 21.3 Error Categories

Errors are classified into five categories.

## Session Errors

Examples:

- Invalid Session ID
- Expired Session
- Session Timeout
- Unknown Session
- Duplicate Session

---

## Manifest Errors

Examples:

- Invalid Manifest
- Missing Required Field
- Unsupported Manifest Version
- Manifest Integrity Failure

---

## Packet Errors

Examples:

- Corrupted Packet
- Invalid Packet Index
- Duplicate Packet
- Invalid Payload Length
- Invalid Header
- Unknown Packet Type

---

## Transfer Errors

Examples:

- Missing Packets
- Reconstruction Failure
- Resume Failure
- Recovery Failure

---

## Security Errors

Examples:

- Encryption Failure
- Authentication Failure
- Integrity Verification Failure
- Unsupported Encryption Algorithm

---

# 21.4 Error Severity

Every error SHALL be classified according to its severity.

### Informational

No protocol action required.

Example:

- Duplicate Packet

---

### Recoverable

The transfer MAY continue.

Examples:

- Temporary packet loss.
- Missing packet.
- Camera frame drop.

---

### Critical

The current operation fails.

Recovery MAY still be possible.

Examples:

- Manifest validation failure.
- Decryption failure.

---

### Fatal

The Session SHALL terminate.

Examples:

- Invalid Session ID.
- Unsupported Protocol Version.
- Protocol state corruption.

---

# 21.5 Error Detection

Errors MAY be detected during:

- Handshake
- Manifest Validation
- Packet Validation
- Reconstruction
- Decryption
- Decompression
- Integrity Verification

Detection SHALL occur as early as possible.

---

# 21.6 Error Reporting

Every detected error SHALL produce an internal protocol event.

The event SHOULD include:

- Error Code
- Error Category
- Error Severity
- Session ID
- File ID (if applicable)
- Packet Index (if applicable)
- Timestamp

Protocol events SHALL remain implementation-independent.

---

# 21.7 Error Recovery

Recoverable errors MAY invoke:

- Packet repetition.
- Resume.
- Recovery Protocol.
- Session retry.

Recovery SHALL preserve previously validated protocol state.

---

# 21.8 Error Escalation

If a recoverable error cannot be resolved, it SHALL escalate.

Example:

```text id="ktm7e6"
Packet Missing

↓

Recovery Attempt

↓

Recovery Failed

↓

Transfer Failure
```

Escalation SHALL follow deterministic protocol rules.

---

# 21.9 Session Errors

Upon detecting a Session Error:

The implementation SHALL:

- Reject invalid packets.
- Preserve unrelated Sessions.
- Prevent cross-session contamination.

Fatal Session Errors SHALL terminate the affected Session only.

---

# 21.10 Manifest Errors

If the Manifest fails validation:

- Data Packets SHALL NOT be accepted.
- Reconstruction SHALL NOT begin.
- The Session SHALL remain inactive or terminate according to severity.

The Receiver SHALL never infer missing Manifest data.

---

# 21.11 Packet Errors

Packet Errors SHALL be handled individually.

Examples:

### Corrupted Packet

Action:

Discard.

---

### Duplicate Packet

Action:

Ignore.

---

### Invalid Packet Index

Action:

Reject.

---

### Unknown Packet Type

Action:

Ignore if optional.

Terminate if mandatory.

---

# 21.12 Transfer Errors

Examples:

Missing packets.

Action:

Continue waiting or initiate Recovery.

---

Reconstruction failure.

Action:

Abort reconstruction.

---

Resume failure.

Action:

Terminate Resume attempt.

---

Integrity failure.

Action:

Reject reconstructed file.

---

# 21.13 Security Errors

Security Errors SHALL take precedence over transfer optimization.

Examples:

Authentication failure.

↓

Reject packet.

Encryption failure.

↓

Terminate transfer.

Manifest tampering.

↓

Reject Manifest.

---

# 21.14 Resource Errors

Implementations MAY encounter resource limitations.

Examples:

- Memory exhaustion.
- Storage unavailable.
- Camera unavailable.
- Display unavailable.

Resource errors are implementation-specific.

The protocol SHALL terminate gracefully without corrupting transfer state.

---

# 21.15 Unknown Errors

Unknown errors SHALL be treated conservatively.

Implementations SHOULD:

- Preserve validated data.
- Reject unknown protocol state.
- Terminate only when correctness cannot be guaranteed.

Undefined behavior SHALL be avoided.

---

# 21.16 Error Codes

Every protocol error SHOULD have a unique identifier.

Recommended format:

```text id="dpkq2v"
OSP-ERR-0001
```

Example:

```text id="mdlhgl"
OSP-ERR-1001

Invalid Session ID

OSP-ERR-2004

Manifest Integrity Failure

OSP-ERR-3007

Duplicate Packet
```

Complete error code definitions are specified in **API_SPEC.md**.

---

# 21.17 Error Logging

Implementations MAY maintain diagnostic logs.

Logs SHOULD include:

- Timestamp.
- Session ID.
- Error Code.
- Error Severity.
- Recovery Action.

Logging SHALL NOT modify protocol behavior.

---

# 21.18 Error Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every detected protocol error SHALL result in a deterministic protocol action.
2. Undefined behavior SHALL NOT occur.
3. Previously validated packets SHALL remain valid unless explicitly invalidated by the protocol.
4. Recoverable errors SHALL NOT terminate the Session unnecessarily.
5. Fatal errors SHALL terminate only the affected Session.
6. Invalid packets SHALL NOT participate in reconstruction.
7. Security errors SHALL take precedence over performance optimizations.
8. Unknown mandatory protocol elements SHALL result in protocol failure.
9. Error handling SHALL remain independent of the transport implementation.
10. Every protocol error SHALL be classifiable by category and severity.

These invariants ensure predictable, interoperable, and robust protocol behavior under both expected and unexpected failure conditions.

# 22. Timing Rules

## 22.1 Purpose

The Timing Rules define the temporal behavior of the photon Protocol (OSP).

These rules specify timing-related constraints for Session establishment, Handshake, Manifest transmission, packet transmission, timeouts, Resume, Recovery, and transfer completion.

The objective is to ensure predictable and interoperable behavior across all compliant implementations regardless of hardware performance or transport implementation.

---

# 22.2 Objectives

The Timing Rules SHALL:

- Define protocol timing constraints.
- Prevent indefinite waiting.
- Support deterministic timeout behavior.
- Enable adaptive transport.
- Maintain interoperability across devices.
- Allow implementation-specific performance optimization.

---

# 22.3 Timing Model

OSP is an **event-driven protocol**.

Protocol state transitions are triggered by events rather than fixed clock intervals.

Examples of protocol events include:

- Session Created
- Handshake Completed
- Manifest Validated
- Packet Received
- Resume Requested
- Transfer Completed

Timing values SHALL determine only when protocol actions expire, not when they occur.

---

# 22.4 Time Units

All protocol timing values SHALL be expressed in milliseconds (ms).

Implementations MAY internally use higher precision.

Timing precision SHALL NOT affect protocol correctness.

---

# 22.5 Session Timeout

Every Session SHALL define a timeout period.

If no protocol activity occurs before the timeout expires:

- The Session SHALL expire.
- Temporary protocol state SHALL be released.
- Resume SHALL no longer be permitted.

The timeout duration is implementation-specific.

---

# 22.6 Handshake Timeout

The Sender SHALL NOT wait indefinitely for a Receiver.

If the Handshake does not complete within the configured timeout:

- The Handshake SHALL fail.
- The Session SHALL terminate or return to Idle.
- No Manifest SHALL be transmitted.

---

# 22.7 Manifest Timeout

The Receiver SHALL receive and validate a Manifest before Data Packet processing begins.

If a valid Manifest is not received before the configured timeout:

- Data Packets SHALL be rejected.
- The Receiver SHALL continue waiting until timeout expires.
- The Session MAY terminate.

---

# 22.8 Packet Timing

The Sender SHALL transmit packets according to the active transport configuration.

The protocol does not mandate:

- Frame Rate
- Frame Duration
- Display Refresh Rate

These parameters belong to the Transport Layer.

OSP only requires that Packet Indices remain logically ordered.

---

# 22.9 Packet Expiration

Individual packets SHALL NOT expire while their parent Session remains active.

Packets SHALL become invalid when:

- The Session expires.
- The transfer terminates.
- The Session is cancelled.

---

# 22.10 Resume Timeout

Resume SHALL be permitted only while the Session remains valid.

If the Session expires:

- Resume SHALL fail.
- Packet state SHALL be discarded.
- A new Session SHALL be required.

---

# 22.11 Recovery Timing

Recovery MAY occur concurrently with packet transmission.

Recovery SHALL terminate when:

- All required packets have been collected.
- The Session expires.
- The transfer is cancelled.

Recovery timing SHALL remain implementation-specific.

---

# 22.12 Adaptive Timing

Adaptive Transport MAY modify:

- Frame Duration.
- Frame Rate.
- Packet Repetition Frequency.

Adaptive timing SHALL NOT modify:

- Session timeout.
- Manifest timeout.
- Handshake timeout.

These protocol timers remain independent of transport optimization.

---

# 22.13 Transfer Duration

OSP does not impose a maximum transfer duration.

Transfer duration depends on:

- File size.
- Transport performance.
- Device capability.
- Environmental conditions.

Protocol correctness SHALL NOT depend on total transfer time.

---

# 22.14 Clock Independence

The protocol SHALL NOT require synchronized clocks between participating devices.

Implementations SHALL rely on:

- Local timers.
- Session events.
- Protocol state.

Absolute timestamps SHALL NOT influence protocol correctness.

---

# 22.15 Timing Failures

Timing-related failures include:

- Session timeout.
- Handshake timeout.
- Manifest timeout.
- Resume timeout.
- Recovery timeout.

Each timeout SHALL result in deterministic protocol behavior as defined in this specification.

---

# 22.16 Performance Considerations

Implementations SHOULD minimize unnecessary waiting.

Recommendations include:

- Validate packets immediately after decoding.
- Release expired Sessions promptly.
- Avoid blocking protocol processing.
- Process packets asynchronously where practical.

These recommendations improve performance without altering protocol semantics.

---

# 22.17 Timing Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Protocol behavior SHALL be event-driven.
2. Sessions SHALL terminate after timeout expiration.
3. Handshake SHALL complete before Manifest transmission.
4. Manifest validation SHALL complete before Data Packet processing.
5. Resume SHALL be permitted only while the Session remains active.
6. Packet timing SHALL remain independent of protocol semantics.
7. Adaptive Transport SHALL NOT modify protocol timeout rules.
8. Protocol correctness SHALL NOT depend on synchronized clocks.
9. Timeouts SHALL result in deterministic protocol behavior.
10. Timing behavior SHALL remain independent of the underlying transport implementation.

These invariants ensure predictable timing behavior while allowing implementations to optimize performance according to device capabilities and environmental conditions.

# 23. Version Negotiation

## 23.1 Purpose

The Version Negotiation Protocol defines how participating devices determine a mutually supported version of the photon Protocol (OSP) before data transmission begins.

Version negotiation ensures that both Sender and Receiver interpret protocol messages using the same protocol semantics.

No Manifest or Data Packet SHALL be transmitted until version negotiation has completed successfully.

---

# 23.2 Objectives

The Version Negotiation Protocol SHALL:

- Ensure protocol interoperability.
- Prevent incompatible communication.
- Support future protocol evolution.
- Enable backward compatibility where possible.
- Prevent undefined behavior.

---

# 23.3 Protocol Version Format

Every protocol version SHALL consist of:

```text
MAJOR.MINOR
```

Example versions:

```text
1.0
1.1
2.0
```

Version numbering follows these rules:

- **MAJOR** increments indicate breaking protocol changes.
- **MINOR** increments indicate backward-compatible enhancements.

---

# 23.4 Supported Versions

Every implementation SHALL declare:

- Minimum supported protocol version.
- Maximum supported protocol version.

Example:

```text
Minimum Version : 1.0

Maximum Version : 1.2
```

This information SHALL be exchanged during the Handshake.

---

# 23.5 Negotiation Process

The Sender SHALL advertise its supported protocol version(s).

The Receiver SHALL compare the advertised versions against its own supported versions.

If a common version exists:

- The highest mutually supported version SHALL be selected.

Otherwise:

- Version negotiation SHALL fail.

---

# 23.6 Negotiation Sequence

```text
Sender                        Receiver
────────────────────────────────────────

Supported Versions
1.0 - 1.2
        │
        ├────────────────────────────▶
        │
        │                     Compare
        │
        │◀────────────────────────────
        │     Selected Version 1.1
        │
Version Locked
```

After negotiation, the selected version SHALL remain constant for the lifetime of the Session.

---

# 23.7 Version Lock

Once negotiation completes:

- Protocol Version SHALL become immutable.
- All protocol messages SHALL use the negotiated version.
- Renegotiation SHALL NOT occur during an active Session.

Changing the protocol version SHALL require a new Session.

---

# 23.8 Version Mismatch

Version negotiation SHALL fail if:

- No common protocol version exists.
- The advertised version is malformed.
- The version is unsupported.
- Mandatory protocol features are incompatible.

Upon failure:

- The Session SHALL terminate.
- No Manifest SHALL be transmitted.
- No Data Packet SHALL be accepted.

---

# 23.9 Minor Version Compatibility

Implementations SHOULD support communication between compatible Minor versions.

Example:

```text
Sender

1.2

Receiver

1.1

↓

Negotiated Version

1.1
```

Minor version negotiation SHALL preserve protocol correctness.

---

# 23.10 Major Version Compatibility

Different Major versions are considered incompatible unless explicitly specified.

Example:

```text
Sender

2.0

Receiver

1.4

↓

Negotiation Failed
```

Cross-major compatibility SHALL NOT be assumed.

---

# 23.11 Capability Interaction

Version negotiation SHALL occur before capability negotiation.

Capabilities SHALL be interpreted according to the negotiated protocol version.

Unknown capabilities SHALL NOT influence version selection.

---

# 23.12 Future Versions

Future protocol versions MAY:

- Introduce new packet types.
- Introduce new transport capabilities.
- Introduce new compression algorithms.
- Introduce new encryption algorithms.
- Introduce additional Manifest fields.

Backward-compatible additions SHOULD use Minor version increments.

Breaking changes SHALL require a Major version increment.

---

# 23.13 Error Handling

Version negotiation SHALL fail if:

- Version parsing fails.
- Required protocol behavior differs.
- Negotiation cannot determine a common version.

The implementation SHALL report the reason for failure.

---

# 23.14 Security Considerations

The negotiated protocol version SHALL be protected from modification during the Session.

Implementations SHALL reject packets claiming a protocol version different from the negotiated version.

This prevents protocol confusion and downgrade attacks.

---

# 23.15 Version Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every Session SHALL negotiate exactly one protocol version.
2. Version negotiation SHALL occur before Manifest transmission.
3. The negotiated version SHALL remain immutable throughout the Session.
4. All protocol messages SHALL conform to the negotiated version.
5. If no common version exists, the Session SHALL terminate.
6. Minor versions SHOULD remain backward compatible where practical.
7. Major version changes SHALL indicate breaking protocol changes.
8. Capabilities SHALL be interpreted according to the negotiated version.
9. Packets using an unexpected protocol version SHALL be rejected.
10. Version negotiation SHALL remain independent of the underlying transport implementation.

These invariants ensure consistent interpretation of protocol behavior and enable the photon Protocol to evolve while maintaining interoperability between compliant implementations.

# 24. Compatibility Rules

## 24.1 Purpose

The Compatibility Rules define how implementations of the photon Protocol (OSP) maintain interoperability across different protocol versions, feature sets, and implementation capabilities.

The objective is to allow the protocol to evolve while minimizing unnecessary incompatibilities.

Compatibility SHALL preserve protocol correctness and deterministic behavior.

---

# 24.2 Objectives

The Compatibility Rules SHALL:

- Support protocol evolution.
- Preserve interoperability.
- Prevent undefined behavior.
- Allow optional feature expansion.
- Enable graceful degradation.
- Protect protocol correctness.

---

# 24.3 Compatibility Principles

OSP follows the following compatibility principles.

### Stable Core

Core protocol semantics SHALL remain stable within a Major version.

---

### Explicit Negotiation

Capabilities SHALL never be assumed.

Every optional feature SHALL be explicitly negotiated.

---

### Safe Failure

When compatibility cannot be achieved, the Session SHALL terminate gracefully.

Undefined behavior SHALL NOT occur.

---

### Forward Extensibility

Future protocol versions SHOULD extend existing structures rather than replace them.

---

# 24.4 Backward Compatibility

Newer implementations SHOULD support communication with older implementations when practical.

Backward compatibility is achieved by:

- Selecting the highest mutually supported protocol version.
- Ignoring unknown optional fields.
- Disabling unsupported optional features.

Backward compatibility SHALL NOT compromise protocol correctness.

---

# 24.5 Forward Compatibility

Older implementations MAY receive protocol elements introduced by newer versions.

Older implementations SHALL:

- Ignore unknown optional fields.
- Reject unknown mandatory fields.
- Preserve known protocol behavior.

Forward compatibility SHALL NOT require protocol reinterpretation.

---

# 24.6 Optional Features

Optional protocol features SHALL be enabled only after successful capability negotiation.

Examples include:

- Compression
- Encryption
- Adaptive Transport
- Recovery Packets

Unsupported optional features SHALL be disabled.

---

# 24.7 Mandatory Features

Mandatory protocol features SHALL be implemented by every compliant implementation.

Examples include:

- Session Management
- Manifest Processing
- Packet Validation
- File Integrity Verification

Missing mandatory functionality SHALL prevent successful communication.

---

# 24.8 Reserved Fields

Protocol structures MAY contain reserved fields.

Reserved fields SHALL:

- Be transmitted unchanged.
- Be ignored unless defined by the negotiated protocol version.
- Remain available for future extensions.

Reserved fields SHALL NOT be repurposed by implementations.

---

# 24.9 Unknown Fields

When receiving unknown fields:

### Optional Field

Action:

Ignore.

---

### Mandatory Field

Action:

Terminate the Session.

Implementations SHALL NOT guess the meaning of unknown mandatory fields.

---

# 24.10 Unknown Packet Types

Unknown packet types SHALL be handled as follows:

Optional Packet Type

↓

Ignore.

Mandatory Packet Type

↓

Reject and terminate the Session.

Packet classification SHALL be determined by the negotiated protocol version.

---

# 24.11 Unknown Algorithms

Unknown algorithms include:

- Compression algorithms.
- Encryption algorithms.
- Integrity algorithms.

Rules:

- Unknown optional algorithms SHALL be ignored.
- Unknown mandatory algorithms SHALL terminate negotiation before transfer begins.

---

# 24.12 Future Manifest Extensions

Future protocol versions MAY introduce additional Manifest fields.

OSP/1.x implementations SHALL:

- Preserve required Manifest fields.
- Ignore unknown optional Manifest fields.
- Reject unknown mandatory Manifest fields.

This allows Manifest evolution without breaking older implementations.

---

# 24.13 Future Packet Extensions

Future protocol versions MAY define:

- New packet types.
- Additional packet flags.
- Additional packet metadata.

Existing packet semantics SHALL remain unchanged whenever practical.

---

# 24.14 Transport Compatibility

The protocol SHALL remain independent of transport implementation.

Future transport technologies SHALL NOT modify:

- Session semantics.
- Packet ordering.
- Integrity verification.
- Reconstruction behavior.

Only transport encoding MAY differ.

---

# 24.15 Compatibility Failure

Compatibility SHALL fail if:

- No common protocol version exists.
- Required capabilities are unavailable.
- Mandatory protocol elements are unsupported.
- Required algorithms are unavailable.

Upon failure:

- The Session SHALL terminate.
- No Manifest SHALL be accepted.
- No Data Packets SHALL be processed.

---

# 24.16 Compatibility Matrix

Example compatibility outcomes:

| Sender                        | Receiver                        | Result                               |
| ----------------------------- | ------------------------------- | ------------------------------------ |
| OSP 1.0                       | OSP 1.0                         | Compatible                           |
| OSP 1.2                       | OSP 1.1                         | Compatible (Negotiate 1.1)           |
| OSP 2.0                       | OSP 1.2                         | Incompatible                         |
| OSP 1.0 + Encryption          | OSP 1.0 (No Encryption Support) | Compatible if Encryption is Optional |
| OSP 1.0 + Required Encryption | OSP 1.0 (No Encryption Support) | Incompatible                         |

---

# 24.17 Compatibility Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Compatibility SHALL be determined before Manifest transmission.
2. Every Session SHALL use exactly one negotiated protocol version.
3. Unknown optional protocol elements SHALL be ignored.
4. Unknown mandatory protocol elements SHALL terminate the Session.
5. Reserved fields SHALL remain unused until officially defined.
6. Optional features SHALL require explicit negotiation.
7. Mandatory protocol behavior SHALL remain unchanged within a Major version.
8. Transport implementations SHALL NOT affect protocol compatibility.
9. Compatibility decisions SHALL be deterministic across all compliant implementations.
10. When compatibility cannot be achieved, the Session SHALL fail gracefully rather than exhibiting undefined behavior.

These invariants ensure that the photon Protocol can evolve over time while maintaining reliable interoperability between compliant implementations.

# 25. Security Considerations

## 25.1 Purpose

This section describes the security properties, assumptions, and threat model of the photon Protocol (OSP).

The objective is to identify protocol-level security risks and define the expected behavior of compliant implementations.

Cryptographic implementation details are defined separately in **SECURITY.md**.

---

# 25.2 Security Objectives

OSP is designed to provide the following security properties:

- Data Integrity
- Optional Data Confidentiality
- Session Isolation
- Protocol Consistency
- Replay Resistance
- Deterministic Validation
- Secure Failure

OSP is **not** intended to provide:

- User Authentication
- Device Authentication
- Network Security
- Digital Signatures
- Identity Management

These capabilities MAY be introduced by future protocol extensions.

---

# 25.3 Threat Model

OSP assumes the following environment:

- Communication occurs over an optical channel.
- Attackers may observe transmitted optical frames.
- Attackers may record optical transmissions.
- Attackers may attempt to inject invalid packets.
- Attackers may present malformed protocol messages.

OSP assumes that:

- Sender and Receiver are trusted by the user.
- The operating system is trusted.
- Local device storage is trusted.

Compromise of the operating system is outside the scope of this specification.

---

# 25.4 Security Properties

Every compliant implementation SHALL preserve:

### Integrity

Modified packets SHALL be detected.

---

### Confidentiality

When encryption is enabled, file contents SHALL remain confidential.

---

### Authenticity

Authenticated encryption SHOULD ensure that encrypted payloads originate from the expected Session.

---

### Isolation

Packets from different Sessions SHALL remain isolated.

---

### Determinism

Security mechanisms SHALL NOT introduce ambiguous protocol behavior.

---

# 25.5 Session Isolation

Every packet SHALL reference exactly one Session ID.

Implementations SHALL reject packets that:

- Reference unknown Sessions.
- Reference expired Sessions.
- Reference completed Sessions.

Session isolation prevents accidental or malicious packet mixing.

---

# 25.6 Replay Protection

Attackers MAY attempt to replay previously captured packets.

Implementations SHALL mitigate replay by validating:

- Session ID
- Packet Index
- Packet authenticity
- Session lifetime

Packets belonging to expired or completed Sessions SHALL be rejected.

---

# 25.7 Packet Injection

Attackers MAY attempt to inject fabricated packets.

Injected packets SHALL be rejected if:

- Session ID is invalid.
- Packet authentication fails.
- Integrity verification fails.
- Packet structure is invalid.

Injected packets SHALL NOT participate in reconstruction.

---

# 25.8 Manifest Protection

The Manifest defines the structure of the transfer.

A modified Manifest could cause incorrect reconstruction.

Implementations SHALL validate Manifest integrity before accepting it.

An invalid Manifest SHALL terminate the transfer.

---

# 25.9 Downgrade Protection

Attackers MAY attempt to force communication using an older protocol version or weaker optional algorithms.

Implementations SHALL:

- Perform Version Negotiation before data transmission.
- Reject unsupported mandatory versions.
- Reject unsupported mandatory algorithms.

Negotiated protocol parameters SHALL remain immutable for the duration of the Session.

---

# 25.10 Confidentiality

When encryption is enabled:

- Payload contents SHALL be encrypted.
- Metadata required for protocol processing MAY remain unencrypted.
- Encryption SHALL use authenticated encryption algorithms as defined in **SECURITY.md**.

When encryption is disabled:

File contents SHALL be considered publicly observable.

---

# 25.11 Integrity Protection

Integrity verification SHALL occur at two levels:

### Packet Integrity

Detects transmission corruption.

---

### File Integrity

Verifies the reconstructed file matches the original.

Successful packet validation alone SHALL NOT indicate successful transfer.

---

# 25.12 Resource Exhaustion

Implementations SHOULD protect against resource exhaustion attacks.

Examples include:

- Extremely large packet counts.
- Excessive Manifest sizes.
- Invalid packet repetition.
- Memory exhaustion.

Implementations MAY reject transfers exceeding implementation-defined limits.

---

# 25.13 Malformed Messages

Malformed protocol messages SHALL NOT result in undefined behavior.

Malformed messages SHALL be:

- Rejected.
- Logged (optional).
- Prevented from affecting protocol state.

---

# 25.14 Secure Failure

When protocol correctness cannot be guaranteed, implementations SHALL fail securely.

Secure failure means:

- Reject invalid data.
- Preserve validated state where possible.
- Prevent partial corruption.
- Avoid undefined behavior.

Successful transfer SHALL never be reported after security validation failure.

---

# 25.15 Privacy Considerations

OSP minimizes metadata exposure.

However, unencrypted transfers may reveal:

- Filename.
- File size.
- Transfer timing.
- Packet count.

Applications MAY offer additional privacy features in future versions.

---

# 25.16 Future Security Extensions

Future protocol versions MAY introduce:

- End-to-end authenticated key exchange.
- Sender authentication.
- Receiver authentication.
- Digital signatures.
- Metadata encryption.
- Certificate-based trust.
- Hardware-backed key storage.

Such extensions SHOULD preserve compatibility with existing protocol semantics whenever practical.

---

# 25.17 Security Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every packet SHALL belong to exactly one valid Session.
2. Invalid or malformed protocol messages SHALL be rejected.
3. Replayed packets from expired or completed Sessions SHALL NOT affect protocol state.
4. Manifest integrity SHALL be verified before Data Packet processing.
5. Negotiated protocol and security parameters SHALL remain immutable throughout the Session.
6. Integrity verification SHALL be mandatory for every completed transfer.
7. Encryption, when enabled, SHALL protect payload confidentiality without altering protocol semantics.
8. Security failures SHALL prevent successful transfer completion.
9. Implementations SHALL fail securely rather than exhibiting undefined behavior.
10. Security behavior SHALL remain independent of the underlying transport implementation.

These invariants define the minimum security guarantees required for every compliant implementation of the photon Protocol.

# 26. Protocol State Machines

## 26.1 Purpose

This section defines the Finite State Machines (FSMs) governing the behavior of the photon Protocol (OSP).

The state machines specify the valid states, transitions, and terminal conditions for protocol entities.

Every compliant implementation SHALL follow the state transitions defined in this section.

No implementation SHALL transition between states not explicitly defined by this specification.

---

# 26.2 Objectives

The Protocol State Machines SHALL:

- Ensure deterministic protocol behavior.
- Prevent invalid state transitions.
- Simplify interoperability.
- Enable protocol verification.
- Support automated testing.
- Eliminate undefined behavior.

---

# 26.3 State Machine Overview

OSP consists of the following logical state machines:

| State Machine | Purpose                        |
| ------------- | ------------------------------ |
| Session FSM   | Controls Session lifecycle     |
| Sender FSM    | Controls Sender behavior       |
| Receiver FSM  | Controls Receiver behavior     |
| Transfer FSM  | Controls transfer lifecycle    |
| Resume FSM    | Controls interrupted transfers |
| Recovery FSM  | Controls packet recovery       |

Each state machine operates independently while interacting through protocol events.

---

# 26.4 Session FSM

The Session FSM controls the lifecycle of a Session.

```text id="h6j3tp"
Idle

↓

Created

↓

Waiting

↓

Handshake

↓

Active

↓

Paused

↓

Completed

↓

Expired
```

Allowed transitions:

- Idle → Created
- Created → Waiting
- Waiting → Handshake
- Handshake → Active
- Active → Paused
- Active → Completed
- Active → Expired
- Paused → Active
- Paused → Expired

Terminal states:

- Completed
- Expired

---

# 26.5 Sender FSM

The Sender FSM defines the Sender's behavior.

```text id="ddchib"
Idle

↓

Preparing

↓

Handshake

↓

Manifest

↓

Sending

↓

Waiting

↓

Completed
```

Sender responsibilities vary by state:

| State     | Responsibility                   |
| --------- | -------------------------------- |
| Preparing | Load files and create Session    |
| Handshake | Negotiate protocol               |
| Manifest  | Transmit Manifest                |
| Sending   | Transmit packets                 |
| Waiting   | Await completion or cancellation |
| Completed | Release resources                |

---

# 26.6 Receiver FSM

The Receiver FSM controls packet collection.

```text id="o44o8g"
Idle

↓

Scanning

↓

Handshake

↓

Manifest

↓

Receiving

↓

Reconstructing

↓

Verifying

↓

Completed
```

Allowed transitions SHALL follow this sequence unless terminated.

---

# 26.7 Transfer FSM

The Transfer FSM describes the logical transfer.

```text id="hzf0tb"
Pending

↓

Running

↓

Paused

↓

Recovering

↓

Completed
```

Possible terminal states:

- Completed
- Cancelled
- Failed

---

# 26.8 Resume FSM

Resume controls interrupted Sessions.

```text id="7b4npr"
Paused

↓

Resume Requested

↓

Validating

↓

Resuming

↓

Running
```

Failure transitions:

```text id="w0slgd"
Resume Requested

↓

Validation Failed

↓

Failed
```

---

# 26.9 Recovery FSM

Recovery controls missing packet reconstruction.

```text id="mkr1bp"
Monitoring

↓

Packet Missing

↓

Recovering

↓

Recovered

↓

Monitoring
```

Failure path:

```text id="7g3sct"
Recovering

↓

Recovery Failed

↓

Transfer Failed
```

---

# 26.10 State Transition Rules

State transitions SHALL occur only in response to protocol events.

Examples include:

- Handshake Complete
- Manifest Validated
- Packet Received
- Transfer Cancelled
- Resume Requested
- Timeout Expired

Transitions SHALL NOT occur spontaneously.

---

# 26.11 Invalid Transitions

The following transitions are prohibited:

- Completed → Active
- Expired → Running
- Failed → Sending
- Idle → Sending
- Manifest → Handshake
- Verifying → Receiving

Implementations SHALL reject invalid transitions.

---

# 26.12 Concurrent State Machines

Multiple FSMs operate simultaneously.

Example:

```text id="y1dshq"
Session FSM

Active

Transfer FSM

Running

Sender FSM

Sending

Receiver FSM

Receiving
```

Each FSM SHALL maintain its own state independently.

Protocol events synchronize interactions between FSMs.

---

# 26.13 Error Transitions

Errors SHALL cause deterministic transitions.

Examples:

| Event             | Transition          |
| ----------------- | ------------------- |
| Handshake Timeout | Handshake → Failed  |
| Manifest Failure  | Manifest → Failed   |
| Session Timeout   | Active → Expired    |
| Integrity Failure | Verifying → Failed  |
| User Cancellation | Running → Cancelled |

---

# 26.14 Terminal States

OSP defines the following terminal states:

### Completed

Transfer succeeded.

---

### Failed

Transfer terminated due to protocol error.

---

### Cancelled

Transfer terminated by user action.

---

### Expired

Session exceeded timeout.

Terminal states SHALL NOT transition back to active protocol states.

---

# 26.15 State Persistence

Resume-capable implementations SHALL preserve:

- Session State
- Packet Map
- Manifest
- Recovery State

State persistence SHALL remain implementation-specific.

---

# 26.16 State Machine Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every FSM SHALL occupy exactly one state at any given time.
2. State transitions SHALL occur only in response to valid protocol events.
3. Invalid transitions SHALL be rejected.
4. Terminal states SHALL have no outgoing transitions to active states.
5. Concurrent FSMs SHALL maintain independent state.
6. Session expiration SHALL terminate active transfer states.
7. Resume SHALL preserve previously validated protocol state.
8. Recovery SHALL NOT modify completed state transitions.
9. Every successful transfer SHALL eventually reach the **Completed** terminal state.
10. State machine behavior SHALL remain deterministic across all compliant implementations.

These invariants establish the formal execution model of the photon Protocol and serve as the authoritative reference for implementation, interoperability, and conformance testing.

# 27. Sequence Diagrams

## 27.1 Purpose

This section defines the normative sequence of interactions between protocol participants during common photon Protocol (OSP) operations.

Sequence diagrams describe the chronological exchange of protocol messages and events between the Sender, Receiver, Transport Layer, and supporting protocol components.

These diagrams complement the Protocol State Machines by illustrating **when** interactions occur rather than **which state** each participant occupies.

---

# 27.2 Participants

The following logical participants are used throughout this section.

| Participant | Responsibility                               |
| ----------- | -------------------------------------------- |
| Sender      | Creates and transmits protocol packets       |
| Receiver    | Receives and reconstructs files              |
| Protocol    | Session, Manifest, Packet and Transfer logic |
| Transport   | QR or future optical transport               |
| Display     | Displays encoded transport frames            |
| Camera      | Captures transport frames                    |

Future transport implementations SHALL preserve the logical interaction sequence even if the physical transport changes.

---

# 27.3 Complete Transfer Sequence

The following diagram illustrates a successful transfer.

```text
Sender          Protocol        Transport      Display
  │                 │               │             │
  │ Create Session  │               │             │
  │────────────────▶│               │             │
  │                 │               │             │
  │ Handshake       │──────────────▶│────────────▶│
  │                 │               │             │
                                             Camera
                                                │
Receiver      Transport      Protocol            │
  │              │              │                │
  │◀─────────────┴──────────────┴────────────────┘
  │
  │ Validate Handshake
  │
  │ Receive Manifest
  │
  │ Validate Manifest
  │
  │ Receive Packets
  │
  │ Validate Packets
  │
  │ Reconstruct File
  │
  │ Verify Integrity
  │
  │ Transfer Complete
```

---

# 27.4 Handshake Sequence

```text
Sender                     Receiver

Create Session
      │
Advertisement
      ├────────────────────────▶
      │
      │     Validate Version
      │
      │     Validate Session
      │
Capabilities Agreed
      ◀────────────────────────┤
      │
Handshake Complete
```

The Handshake SHALL complete before Manifest transmission.

---

# 27.5 Manifest Sequence

```text
Sender                     Receiver

Generate Manifest
      │
      ├────────────────────────▶
      │
      │ Validate Manifest
      │
      │ Initialize Packet Map
      │
Manifest Accepted
```

If Manifest validation fails:

- Packet processing SHALL NOT begin.
- The Session MAY terminate.

---

# 27.6 Packet Transmission Sequence

```text
Sender                     Receiver

Packet 0
      ├────────────────────────▶

Packet 1
      ├────────────────────────▶

Packet 2
      ├────────────────────────▶

Packet N
      ├────────────────────────▶
```

Packets MAY be repeated.

Arrival order SHALL NOT affect reconstruction.

---

# 27.7 Duplicate Packet Sequence

```text
Sender                     Receiver

Packet 42
      ├────────────────────────▶
      │
Packet 42
      ├────────────────────────▶
      │
      │ Detect Duplicate
      │
      │ Ignore Packet
```

Previously validated packets SHALL remain unchanged.

---

# 27.8 Missing Packet Recovery Sequence

```text
Sender                     Receiver

Packets

0

1

2

4

5

──────────────▶

Receiver Detects

Packet 3 Missing

↓

Sender Continues Looping

↓

Packet 3 Received

↓

Packet Map Updated
```

Recovery SHALL preserve Packet Indices.

---

# 27.9 Resume Sequence

```text
Sender                     Receiver

Transfer Interrupted

      │

Pause

      │

Resume Requested

      ◀──────────────────────

Continue Packet Loop

────────────────────────────▶

Remaining Packets Received

↓

Transfer Continues
```

Resume SHALL preserve previously validated packets.

---

# 27.10 Multi-file Transfer Sequence

```text
Sender                     Receiver

Manifest

(File A, B, C)

──────────────▶

Packets A

──────────────▶

Packets B

──────────────▶

Packets C

──────────────▶

Reconstruct A

↓

Reconstruct B

↓

Reconstruct C

↓

Transfer Complete
```

Each file SHALL be reconstructed independently.

---

# 27.11 Transfer Failure Sequence

```text
Sender                     Receiver

Packet Received

↓

Integrity Verification

↓

Hash Mismatch

↓

Transfer Failed

↓

Session Terminated
```

The reconstructed file SHALL NOT be reported as successfully received.

---

# 27.12 Session Timeout Sequence

```text
Sender                     Receiver

No Activity

↓

Timeout

↓

Session Expired

↓

Resources Released
```

Expired Sessions SHALL reject subsequent protocol messages.

---

# 27.13 Version Negotiation Sequence

```text
Sender                     Receiver

Supported Versions

──────────────▶

Compare Versions

↓

Select Highest Common Version

◀──────────────

Version Locked
```

Version negotiation SHALL complete before Manifest transmission.

---

# 27.14 Sequence Constraints

All protocol interactions SHALL satisfy the following ordering constraints:

1. Session creation SHALL precede Handshake.
2. Handshake SHALL precede Manifest transmission.
3. Manifest validation SHALL precede Data Packet processing.
4. Packet validation SHALL precede packet storage.
5. Reconstruction SHALL precede file integrity verification.
6. Integrity verification SHALL precede transfer completion.

Implementations SHALL NOT violate these ordering rules.

---

# 27.15 Sequence Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. Every transfer SHALL begin with Session creation.
2. Every Session SHALL complete exactly one successful Handshake before Data Packet transmission.
3. Every Manifest SHALL be validated before packet processing.
4. Every Data Packet SHALL be validated before storage.
5. Reconstruction SHALL occur only after sufficient packets have been collected.
6. File integrity verification SHALL occur before transfer completion.
7. Failed transfers SHALL terminate according to the Error Handling rules.
8. Sequence ordering SHALL remain deterministic across all compliant implementations.
9. Transport implementation SHALL NOT alter protocol interaction order.
10. Every successful transfer SHALL follow the canonical protocol sequence defined in this section.

These sequence diagrams define the normative interaction flow of the photon Protocol and serve as the reference model for interoperable implementations.

# 28. Examples

## 28.1 Purpose

This section provides illustrative examples of common photon Protocol (OSP) operations.

The examples are **informative** and are intended to demonstrate correct protocol usage. They do not introduce new protocol requirements beyond those defined in previous sections.

Binary values, packet contents, hashes, and identifiers shown in this section are representative examples only.

---

# 28.2 Example 1 — Single Image Transfer

Original File

```text
Filename      : vacation.jpg
Size          : 2.4 MB
Compression   : Disabled
Encryption    : Disabled
```

Protocol Flow

```text
Create Session

↓

Handshake

↓

Manifest

↓

Packetize Image

↓

Transmit Packets

↓

Receiver Collects Packets

↓

Reconstruct Image

↓

SHA-256 Verification

↓

Transfer Complete
```

Result

```text
Original SHA-256

=

Reconstructed SHA-256

✓ Transfer Successful
```

---

# 28.3 Example 2 — PDF Transfer

Original File

```text
Filename      : report.pdf
Size          : 18 MB
Compression   : Auto (Skipped)
Encryption    : Enabled
```

Processing Pipeline

```text
PDF

↓

Encrypt

↓

Packetize

↓

QR Encoding

↓

Transmission

↓

Reception

↓

Reconstruction

↓

Decrypt

↓

SHA-256

↓

Save PDF
```

---

# 28.4 Example 3 — Video Transfer

Original File

```text
Filename      : demo.mp4
Size          : 148 MB
Compression   : Disabled
Encryption    : Disabled
```

Packetization

```text
Video

↓

Binary Stream

↓

1,482 Packets

↓

Continuous Packet Loop
```

Receiver

```text
Packet Map

↓

All Packets Received

↓

Reconstruction

↓

Integrity Verification

↓

Save Video
```

---

# 28.5 Example 4 — Multi-file Transfer

Selected Files

```text
Photo.jpg

Presentation.pdf

Song.mp3
```

Manifest

```text
Session

↓

File A

↓

File B

↓

File C
```

Packet Flow

```text
A0

A1

...

B0

B1

...

C0

C1
```

Each file is reconstructed independently.

Transfer completes only after all files pass integrity verification.

---

# 28.6 Example 5 — Duplicate Packet

Received Packets

```text
0

1

2

2

3

4
```

Receiver Behavior

```text
Packet 2

↓

Already Stored

↓

Discard Duplicate
```

Result

```text
Packet Map Unchanged
```

---

# 28.7 Example 6 — Missing Packet

Expected

```text
0

1

2

3

4

5
```

Received

```text
0

1

3

4

5
```

Receiver

```text
Missing Packet

↓

Continue Receiving

↓

Packet 2 Arrives

↓

Packet Map Complete

↓

Reconstruction
```

---

# 28.8 Example 7 — Resume

Transfer Progress

```text
Received

0

1

2

3

4
```

Application Interrupted

↓

Resume

↓

Continue From

```text
5

6

7

8
```

Previously validated packets remain unchanged.

---

# 28.9 Example 8 — Integrity Failure

Receiver

```text
Reconstructed File

↓

SHA-256 Computed

↓

Hash Mismatch
```

Protocol Action

```text
Reject File

↓

Transfer Failed
```

The file SHALL NOT be reported as successfully received.

---

# 28.10 Example 9 — Version Negotiation

Sender

```text
Supports

1.0

1.1

1.2
```

Receiver

```text
Supports

1.0

1.1
```

Negotiated Version

```text
1.1
```

Transfer proceeds using OSP Version 1.1.

---

# 28.11 Example 10 — Adaptive Transport

Initial Transport

```text
20 FPS

QR Version 8
```

Low-Light Detected

↓

Adaptive Transport

```text
12 FPS

QR Version 10

Higher Redundancy
```

Protocol State

```text
Unchanged
```

Only transport parameters change.

---

# 28.12 Example 11 — Encrypted Transfer

Configuration

```text
Compression : Enabled

Encryption : AES-256-GCM
```

Pipeline

```text
File

↓

Compress

↓

Encrypt

↓

Packetize

↓

Transmit

↓

Receive

↓

Decrypt

↓

Decompress

↓

Verify

↓

Complete
```

---

# 28.13 Example 12 — Complete Session Timeline

```text
Idle

↓

Session Created

↓

Handshake

↓

Manifest

↓

Packet Transmission

↓

Packet Validation

↓

Reconstruction

↓

Integrity Verification

↓

Completed
```

Every successful OSP transfer follows this logical sequence.

---

# 28.14 Example Limitations

The examples in this section are illustrative only.

Implementations MAY:

- Use different packet sizes.
- Use different QR versions.
- Use different frame rates.
- Use different timeout values.
- Support additional optional capabilities.

Provided that all normative requirements defined in this specification are preserved.

---

# 28.15 Summary

These examples demonstrate common protocol scenarios including:

- Image transfer.
- PDF transfer.
- Video transfer.
- Multi-file transfer.
- Duplicate detection.
- Missing packet recovery.
- Resume.
- Integrity verification.
- Version negotiation.
- Adaptive Transport.
- Encrypted transfers.

Future protocol versions MAY extend this section with additional examples without modifying protocol semantics.

# 29. Compliance Requirements

## 29.1 Purpose

This section defines the minimum requirements that an implementation MUST satisfy to claim compliance with the photon Protocol (OSP).

Compliance ensures that independently developed implementations can communicate reliably and reconstruct transferred files deterministically.

An implementation SHALL NOT claim OSP compliance unless it satisfies all mandatory requirements defined in this specification.

---

# 29.2 Compliance Objectives

Compliance requirements SHALL:

- Ensure interoperability.
- Define mandatory protocol behavior.
- Distinguish mandatory and optional features.
- Enable independent implementations.
- Support conformance testing.
- Preserve deterministic protocol behavior.

---

# 29.3 Compliance Levels

OSP defines three levels of compliance.

## Level 1 — Core Compliance

A Level 1 implementation SHALL implement all mandatory protocol functionality required for basic interoperability.

Required capabilities include:

- Session Management
- Handshake Protocol
- Manifest Protocol
- Packet Protocol
- Transfer Protocol
- Packet Ordering
- Integrity Verification
- Error Handling
- Version Negotiation

Level 1 implementations SHALL successfully exchange files with other Level 1 implementations.

---

## Level 2 — Enhanced Compliance

A Level 2 implementation SHALL satisfy all Level 1 requirements and additionally implement one or more optional protocol capabilities.

Examples include:

- Compression
- Encryption
- Resume
- Adaptive Transport

Optional capabilities SHALL be negotiated before use.

---

## Level 3 — Full Compliance

A Level 3 implementation SHALL implement every mandatory feature and every optional feature defined for the supported protocol version.

Future protocol revisions MAY define additional compliance levels.

---

# 29.4 Mandatory Requirements

Every compliant implementation SHALL:

- Correctly parse protocol messages.
- Correctly validate Sessions.
- Correctly validate Manifests.
- Correctly validate Packets.
- Preserve Packet Ordering.
- Perform File Integrity Verification.
- Handle protocol errors deterministically.
- Support Version Negotiation.

Mandatory behavior SHALL NOT be disabled.

---

# 29.5 Optional Features

The following protocol features are optional unless explicitly negotiated:

- Compression
- Encryption
- Resume
- Recovery Packets
- Adaptive Transport

Implementations MAY omit optional features.

Unsupported optional features SHALL NOT prevent communication when those features are not required.

---

# 29.6 Interoperability

A compliant implementation SHALL successfully communicate with any other compliant implementation supporting a compatible protocol version and negotiated feature set.

Implementation-specific optimizations SHALL NOT alter protocol semantics.

---

# 29.7 Deterministic Behavior

Given identical protocol inputs, compliant implementations SHALL produce identical protocol outcomes.

Examples include:

- Packet validation.
- Packet ordering.
- Reconstruction.
- Integrity verification.

Implementation details MAY differ provided externally observable protocol behavior remains identical.

---

# 29.8 Prohibited Behavior

A compliant implementation SHALL NOT:

- Modify validated packet payloads.
- Reorder packets during reconstruction.
- Skip mandatory validation.
- Ignore integrity verification failures.
- Bypass Version Negotiation.
- Continue after fatal protocol errors.
- Introduce undefined protocol behavior.

---

# 29.9 Conformance Testing

Compliance SHOULD be verified using a comprehensive conformance test suite.

The test suite SHOULD include:

- Successful transfers.
- Multi-file transfers.
- Resume scenarios.
- Duplicate packets.
- Missing packets.
- Corrupted packets.
- Invalid Manifests.
- Version mismatches.
- Encryption scenarios.
- Compression scenarios.

Passing all mandatory tests SHALL be required for compliance.

---

# 29.10 Implementation Independence

OSP defines protocol behavior rather than implementation architecture.

Compliant implementations MAY use:

- Different programming languages.
- Different operating systems.
- Different UI frameworks.
- Different storage mechanisms.
- Different QR generation libraries.

Provided that protocol behavior remains compliant.

---

# 29.11 Backward Compatibility

Implementations claiming support for multiple protocol versions SHALL correctly negotiate and operate using the selected version.

Behavior SHALL conform to the negotiated protocol version only.

---

# 29.12 Extension Compliance

Future protocol extensions SHALL NOT invalidate existing compliant implementations.

Extensions SHALL:

- Preserve mandatory protocol behavior.
- Use negotiated capabilities.
- Maintain interoperability.

Non-standard extensions SHALL NOT be advertised as standard OSP features.

---

# 29.13 Compliance Verification Checklist

A compliant implementation SHALL satisfy all of the following:

| Requirement            | Status   |
| ---------------------- | -------- |
| Session Management     | Required |
| Handshake              | Required |
| Manifest Processing    | Required |
| Packet Validation      | Required |
| Packet Ordering        | Required |
| File Reconstruction    | Required |
| Integrity Verification | Required |
| Error Handling         | Required |
| Version Negotiation    | Required |
| Deterministic Behavior | Required |

Optional capabilities SHALL be indicated separately.

---

# 29.14 Compliance Declaration

An implementation claiming compliance SHOULD declare:

- Protocol Version
- Supported Compliance Level
- Supported Optional Features
- Supported Compression Algorithms
- Supported Encryption Algorithms
- Supported Integrity Algorithms

This declaration SHOULD be available through documentation or implementation metadata.

---

# 29.15 Compliance Invariants

Every compliant implementation SHALL satisfy the following invariants:

1. All mandatory protocol requirements SHALL be implemented.
2. Optional features SHALL require successful negotiation before use.
3. Protocol behavior SHALL remain deterministic.
4. Successful transfers SHALL produce byte-identical reconstructed files.
5. Mandatory validation steps SHALL NOT be skipped.
6. Fatal protocol errors SHALL terminate the affected Session.
7. Compliance SHALL remain independent of implementation language, platform, or transport.
8. Extension mechanisms SHALL preserve interoperability.
9. Implementations SHALL correctly negotiate supported protocol versions.
10. Only implementations satisfying these requirements SHALL claim compliance with the photon Protocol.

These invariants define the minimum conformance requirements for all implementations of the photon Protocol and serve as the basis for interoperability testing and future certification.

# 30. Future Extensions

## 30.1 Purpose

This section outlines potential future enhancements to the photon Protocol (OSP).

These extensions are **informative** and do not form part of the normative requirements for OSP Version 1.x.

The objective is to provide a structured roadmap for protocol evolution while preserving interoperability and backward compatibility.

---

# 30.2 Design Philosophy

Future versions of OSP SHOULD adhere to the following principles:

- Preserve deterministic behavior.
- Maintain backward compatibility whenever practical.
- Avoid unnecessary protocol complexity.
- Negotiate new capabilities explicitly.
- Preserve transport independence.
- Minimize breaking changes.

Major protocol revisions SHOULD occur only when compatibility cannot reasonably be maintained.

---

# 30.3 Planned Protocol Versions

The anticipated protocol evolution is summarized below.

| Version | Focus                            |
| ------- | -------------------------------- |
| OSP 1.x | Stable QR-based optical transfer |
| OSP 2.x | Advanced transport optimization  |
| OSP 3.x | Multi-device collaboration       |
| OSP 4.x | Hybrid transport ecosystem       |

Version numbers are illustrative and do not constitute a formal release commitment.

---

# 30.4 Advanced Recovery

Future protocol versions MAY introduce advanced recovery mechanisms.

Examples include:

- Reed–Solomon Error Correction
- Fountain Codes
- RaptorQ
- Adaptive Parity Packets

These mechanisms could reduce retransmissions while preserving deterministic reconstruction.

Recovery methods SHALL remain negotiable.

---

# 30.5 Bidirectional Communication

OSP Version 1.x primarily assumes a one-way optical transport.

Future versions MAY support bidirectional communication using:

- Dual-camera exchange.
- Simultaneous sender and receiver displays.
- Optical acknowledgements.
- Optical control messages.

Bidirectional communication SHOULD remain optional.

---

# 30.6 Advanced Transport

Future transport improvements MAY include:

- Color QR Codes.
- High-density optical symbols.
- Animated QR optimization.
- Dynamic QR sizing.
- HDR-aware rendering.
- High-refresh-rate displays.

Transport innovations SHALL NOT modify protocol semantics.

---

# 30.7 Intelligent Adaptation

Future implementations MAY incorporate intelligent transport optimization.

Examples include:

- Automatic environment detection.
- Machine learning-based frame rate adjustment.
- Camera capability prediction.
- Motion compensation.
- Lighting estimation.

Such optimizations SHALL remain transparent to the protocol.

---

# 30.8 Secure Sessions

Future protocol versions MAY introduce stronger security capabilities.

Examples include:

- Mutual device authentication.
- Ephemeral key exchange.
- Digital signatures.
- Certificate-based trust.
- Hardware-backed cryptography.

These enhancements SHOULD preserve existing protocol semantics whenever possible.

---

# 30.9 Folder Synchronization

Future versions MAY support directory-level synchronization.

Potential capabilities include:

- Folder metadata.
- Incremental synchronization.
- File version tracking.
- Delta transfers.
- Change detection.

Synchronization SHOULD remain an extension rather than replacing file transfer semantics.

---

# 30.10 Selective Retransmission

Future versions MAY support Receiver feedback.

Examples include:

- Missing packet requests.
- Window acknowledgements.
- Packet priority scheduling.
- Dynamic retransmission.

Feedback SHALL be explicitly negotiated.

---

# 30.11 Streaming Media

Future versions MAY extend OSP beyond file transfer.

Examples include:

- Live image streaming.
- Live video streaming.
- Live audio streaming.
- Sensor data transmission.

Streaming extensions SHALL define independent timing and buffering requirements.

---

# 30.12 Plugin Architecture

Future versions MAY introduce an extension registry.

Extension categories MAY include:

- Compression plugins.
- Encryption plugins.
- Transport plugins.
- Recovery plugins.
- Integrity algorithms.

Extensions SHALL use globally unique identifiers.

---

# 30.13 Cross-Transport Support

Although OSP Version 1 focuses on QR-based optical transport, future versions MAY support additional transport mechanisms while preserving protocol semantics.

Examples include:

- NFC.
- Bluetooth Low Energy.
- Ultrasonic audio.
- Visible Light Communication (VLC).
- Infrared.
- Hybrid optical-wireless transport.

The protocol layer SHALL remain transport-independent.

---

# 30.14 Standardization

Future development MAY include:

- Public protocol registry.
- Reference implementation.
- Official conformance test suite.
- Formal RFC publication.
- Open governance model.
- Third-party interoperability certification.

These activities would encourage broader ecosystem adoption.

---

# 30.15 Research Directions

Potential research topics include:

- Adaptive packet scheduling.
- AI-assisted transport optimization.
- Energy-efficient optical transmission.
- Ultra-high-density QR encoding.
- Privacy-preserving metadata.
- Error-resilient optical communication.

These topics are outside the scope of OSP Version 1.x.

---

# 30.16 Future Extension Principles

Every future extension SHOULD satisfy the following principles:

1. Preserve interoperability whenever practical.
2. Maintain deterministic reconstruction.
3. Require explicit capability negotiation.
4. Preserve transport independence.
5. Avoid unnecessary breaking changes.
6. Preserve protocol security properties.
7. Remain independently testable.
8. Maintain implementation simplicity where possible.
9. Extend rather than replace existing protocol semantics.
10. Continue to support the core philosophy of reliable offline optical file transfer.

These principles provide the foundation for the long-term evolution of the photon Protocol while ensuring that future versions remain compatible with its original design goals.
