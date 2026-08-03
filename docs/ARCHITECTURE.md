# 03_ARCHITECTURE.md

# 1. Introduction

## 1.1 Purpose

This document defines the software architecture of the **photon** system.

While the photon Protocol (OSP) Specification defines the communication rules governing offline optical file transfer, this document describes how those rules are implemented within the photon application.

The Architecture Specification establishes the logical decomposition of the system into independent components, their responsibilities, interactions, dependencies, and execution boundaries.

It serves as the authoritative reference for software implementation, system integration, performance optimization, and future extensibility.

This document intentionally avoids redefining protocol behavior already specified in **PROTOCOL_SPEC.md**.

Instead, it explains how the software architecture realizes those protocol requirements.

---

## 1.2 Relationship to Other Documents

The photon documentation is divided into independent specifications, each with a distinct responsibility.

| Document             | Responsibility                                        |
| -------------------- | ----------------------------------------------------- |
| 01_PRD.md            | Product vision, requirements, user experience         |
| 02_TRD.md            | Technical requirements and implementation constraints |
| 03_ARCHITECTURE.md   | Software architecture and component design            |
| 04_PROTOCOL_SPEC.md  | Protocol rules and communication semantics            |
| 05_PACKET_SPEC.md    | Binary packet structures                              |
| 06_QR_SPEC.md        | QR encoding and decoding rules                        |
| 07_SECURITY.md       | Cryptography and security implementation              |
| 08_STATE_MACHINES.md | Formal protocol state machines                        |
| 09_UI_SPEC.md        | Application UI specification                          |
| 10_API_SPEC.md       | Internal module interfaces                            |
| 11_TEST_SPEC.md      | Testing and validation strategy                       |
| 12_ROADMAP.md        | Product evolution roadmap                             |

Each document is authoritative only within its defined scope.

No document shall redefine the responsibilities of another.

---

## 1.3 Scope

This document specifies the architecture of the complete photon application, including:

- Application architecture
- OSP protocol engine architecture
- Sender architecture
- Receiver architecture
- Transport architecture
- Storage architecture
- Component interactions
- Dependency management
- Performance architecture
- Security architecture
- Native module integration
- Cross-platform architecture

The following topics are intentionally excluded:

- Protocol semantics
- Packet binary layout
- QR payload encoding
- Cryptographic algorithms
- Product requirements
- User interface behavior

These topics are specified in their respective documents.

---

## 1.4 Intended Audience

This document is intended for:

- Software engineers
- Mobile developers
- Protocol implementers
- System architects
- QA engineers
- Performance engineers
- Security reviewers
- AI-assisted development systems

Readers are expected to have prior familiarity with the OSP Protocol Specification.

---

## 1.5 Architectural Goals

The architecture has been designed around the following goals:

### Modular

Every major subsystem shall exist as an independently maintainable component.

---

### Protocol-Driven

Application behavior shall be derived from the protocol specification rather than application-specific assumptions.

---

### Transport Independent

The architecture shall remain independent of the underlying communication medium.

QR codes represent only one transport implementation.

---

### Cross Platform

The same architecture shall operate across:

- Android
- iOS
- Desktop
- Web (future)

with minimal platform-specific modifications.

---

### Deterministic

Identical protocol inputs shall always produce identical architectural behavior.

---

### Extensible

Future protocol capabilities shall require minimal architectural modification.

---

### Offline First

The architecture shall operate without requiring:

- Internet connectivity
- Cloud services
- External servers
- Network discovery

---

### Performance Oriented

The architecture shall minimize:

- Memory usage
- CPU utilization
- Battery consumption
- Storage writes
- Latency

while maintaining protocol correctness.

---

## 1.6 Architectural Philosophy

The architecture follows a layered design in which responsibilities are strictly separated.

Each layer owns a well-defined portion of the system and communicates only through stable interfaces.

Business logic, protocol logic, transport logic, and platform-specific functionality remain isolated from one another.

This separation enables:

- independent testing,
- protocol evolution,
- transport replacement,
- platform portability,
- long-term maintainability.

---

## 1.7 Conformance

Every implementation claiming compliance with this Architecture Specification shall also comply with:

- PROTOCOL_SPEC.md
- PACKET_SPEC.md
- SECURITY.md

In the event of a conflict, the protocol specification takes precedence over this document.

---

## 1.8 Document Conventions

Throughout this document:

- "Component" refers to an independently deployable software module.
- "Subsystem" refers to a collection of related components.
- "Layer" refers to a logical architectural boundary.
- "Service" refers to a long-lived architectural component providing functionality.
- "Pipeline" refers to an ordered processing sequence.

Normative requirement keywords (MUST, SHOULD, MAY, etc.) follow RFC 2119 as defined in the Protocol Specification.

# 2. System Overview

## 2.1 Overview

photon is a fully offline optical file transfer system that enables the exchange of arbitrary digital content using visual communication.

Unlike traditional sharing systems that depend on network connectivity, photon transfers files through a sequence of dynamically generated QR codes displayed on one device and captured by another.

The application consists of two independent applications executing complementary responsibilities:

- Sender
- Receiver

Both execute the same protocol while assuming different runtime roles.

---

## 2.2 High-Level Architecture

The complete system consists of five major layers.

```text
                    USER
                      │
        ┌─────────────┴─────────────┐
        │                           │
     Sender App                Receiver App
        │                           │
        └─────────────┬─────────────┘
                      │
             Application Layer
                      │
             OSP Protocol Engine
                      │
             Transport Layer
                      │
              Device Hardware
```

Each layer owns a clearly defined responsibility.

---

## 2.3 Major Subsystems

The architecture consists of the following major subsystems.

| Subsystem          | Responsibility                  |
| ------------------ | ------------------------------- |
| User Interface     | User interaction                |
| Application Core   | Business logic                  |
| OSP Engine         | Protocol execution              |
| Transport Engine   | QR communication                |
| Storage Engine     | Temporary and permanent storage |
| Native Integration | Camera, display and filesystem  |
| Security Engine    | Encryption and integrity        |
| Performance Engine | Scheduling and optimization     |

These subsystems communicate through stable interfaces.

---

## 2.4 Runtime Roles

Every photon instance operates in one of two roles.

### Sender

Responsible for:

- Selecting files
- Creating Sessions
- Packet generation
- QR generation
- Display scheduling

---

### Receiver

Responsible for:

- Camera capture
- QR decoding
- Packet validation
- Reconstruction
- Integrity verification
- File storage

Both roles share the same protocol implementation.

Only execution responsibilities differ.

---

## 2.5 End-to-End Data Flow

At the highest level, data flows through the system as follows.

```text
File

↓

Binary Stream

↓

Compression

↓

Encryption

↓

Packetization

↓

QR Encoding

↓

Screen

↓

Camera

↓

QR Decoding

↓

Packet Validation

↓

Reconstruction

↓

Integrity Verification

↓

Recovered File
```

Every stage is independently replaceable while preserving protocol correctness.

---

## 2.6 Core Architectural Layers

The system is divided into the following logical layers.

| Layer              | Responsibility               |
| ------------------ | ---------------------------- |
| Presentation Layer | Screens and user interaction |
| Application Layer  | Business workflows           |
| Protocol Layer     | OSP implementation           |
| Transport Layer    | Optical communication        |
| Platform Layer     | Native device capabilities   |

Each layer communicates only with adjacent layers.

---

## 2.7 System Characteristics

The architecture exhibits the following characteristics:

- Offline-first
- Protocol-centric
- Layered
- Event-driven
- Deterministic
- Cross-platform
- Transport-independent
- Component-oriented
- Extensible
- Fault-tolerant

These characteristics influence every architectural decision throughout the system.

---

## 2.8 Architectural Boundaries

The architecture deliberately separates concerns into independent domains.

```text
Presentation

↓

Application

↓

Protocol

↓

Transport

↓

Platform
```

Protocol logic never accesses platform APIs directly.

Platform-specific code never implements protocol behavior.

This separation significantly simplifies testing and future evolution.

---

## 2.9 System Context

From an architectural perspective, photon interacts only with:

- Device Camera
- Device Display
- Local File System
- Local Storage
- Operating System

No network connectivity is required.

No backend services participate in protocol execution.

---

## 2.10 Architectural Summary

photon is architected as a layered, protocol-first system in which communication semantics are entirely defined by the OSP Protocol Specification.

The application architecture exists solely to implement those semantics in a modular, performant, and cross-platform manner.

Subsequent sections describe each architectural layer, subsystem, component, and execution pipeline in detail.

# 3. Architecture Principles

## 3.1 Purpose

This section defines the fundamental architectural principles governing the design, implementation, and evolution of the photon system.

These principles serve as long-term engineering constraints that guide every architectural decision throughout the project.

All components described in this document SHALL conform to these principles unless explicitly stated otherwise.

---

# 3.2 Principle 1 — Protocol First

The photon Protocol (OSP) is the authoritative source of system behavior.

Application logic SHALL implement the protocol rather than define it.

Business workflows, UI behavior, transport mechanisms, and storage implementations SHALL derive their behavior from the protocol specification.

Protocol semantics SHALL NEVER be duplicated inside application components.

---

# 3.3 Principle 2 — Layer Separation

The architecture SHALL maintain strict separation between logical layers.

Each layer SHALL own a single responsibility.

Example:

```text id="jv5sqn"
Presentation

↓

Application

↓

Protocol

↓

Transport

↓

Platform
```

Layers SHALL communicate only through well-defined interfaces.

Direct access across multiple layers SHALL be prohibited.

---

# 3.4 Principle 3 — Single Responsibility

Every architectural component SHALL own exactly one primary responsibility.

Examples include:

- SessionManager owns Sessions.
- PacketManager owns packet processing.
- ManifestManager owns Manifest processing.
- QRGenerator owns QR generation.

Components SHALL NOT accumulate unrelated responsibilities.

---

# 3.5 Principle 4 — Stateless Transport

The Transport Layer SHALL remain unaware of protocol semantics.

Transport components SHALL NOT interpret:

- Session IDs
- Packet ordering
- File reconstruction
- Recovery state

Their sole responsibility is the reliable movement of encoded transport frames.

---

# 3.6 Principle 5 — Deterministic Execution

Given identical protocol inputs, every compliant implementation SHALL produce identical architectural outcomes.

Execution order SHALL NOT depend upon:

- Device speed
- Operating system
- Screen refresh rate
- Camera frame rate
- Thread scheduling

Determinism is required for interoperability.

---

# 3.7 Principle 6 — Offline First

The architecture SHALL operate without requiring:

- Internet connectivity
- Backend servers
- Cloud storage
- User accounts
- External APIs

Every transfer SHALL be executable entirely on participating devices.

---

# 3.8 Principle 7 — Transport Independence

OSP SHALL remain independent of the physical transport medium.

The current implementation uses animated QR codes.

Future implementations MAY use:

- Color QR
- Visible Light Communication
- Infrared
- Bluetooth
- NFC

The Protocol Layer SHALL remain unchanged.

---

# 3.9 Principle 8 — Component Isolation

Architectural components SHALL remain isolated.

Components SHALL communicate through explicit interfaces.

Shared mutable state SHOULD be minimized.

Components SHALL NOT directly modify internal state owned by other components.

---

# 3.10 Principle 9 — Extensibility

The architecture SHALL permit future extension without requiring large-scale redesign.

Examples include:

- New transport methods.
- New compression algorithms.
- New encryption algorithms.
- Additional recovery strategies.

Extension points SHALL be intentionally designed rather than retrofitted.

---

# 3.11 Principle 10 — Testability

Every component SHALL be independently testable.

Architectural dependencies SHOULD be injectable.

Business logic SHALL remain independent of:

- UI
- Native APIs
- Camera hardware
- File system

This enables deterministic automated testing.

---

# 3.12 Principle 11 — Performance

Architectural decisions SHALL minimize:

- Memory allocations.
- File copies.
- CPU utilization.
- Battery consumption.
- Storage writes.

Performance optimization SHALL NEVER compromise protocol correctness.

---

# 3.13 Principle 12 — Security by Design

Security SHALL be integrated throughout the architecture.

Sensitive operations SHALL remain isolated.

Encryption, integrity verification, and Session validation SHALL be performed by dedicated architectural components.

Security SHALL NOT depend upon UI behavior.

---

# 3.14 Architectural Invariants

Every implementation SHALL preserve the following architectural invariants:

1. Protocol logic SHALL remain independent of UI.
2. Transport SHALL remain independent of protocol semantics.
3. Components SHALL own clearly defined responsibilities.
4. Layers SHALL communicate only through public interfaces.
5. Business logic SHALL remain platform independent.
6. Architecture SHALL support offline execution.
7. Future transport implementations SHALL NOT require protocol redesign.
8. Components SHALL remain independently testable.
9. Architectural decisions SHALL preserve deterministic execution.
10. Performance optimizations SHALL NOT alter protocol correctness.

These invariants define the architectural philosophy upon which the photon system is built.

# 4. Layered Architecture

## 4.1 Purpose

The photon architecture is organized into a layered structure to separate responsibilities, minimize coupling, and improve maintainability.

Each layer owns a well-defined domain of responsibility and exposes stable interfaces to adjacent layers.

No layer SHALL directly access components belonging to non-adjacent layers.

---

# 4.2 Layer Overview

The complete architecture consists of five logical layers.

```text id="m1bhcf"
┌──────────────────────────────┐
│      Presentation Layer      │
├──────────────────────────────┤
│      Application Layer       │
├──────────────────────────────┤
│       Protocol Layer         │
├──────────────────────────────┤
│      Transport Layer         │
├──────────────────────────────┤
│       Platform Layer         │
└──────────────────────────────┘
```

Each layer builds upon the services provided by the layer immediately beneath it.

---

# 4.3 Presentation Layer

The Presentation Layer provides all user-facing functionality.

Responsibilities include:

- Screens
- Navigation
- User interactions
- Progress visualization
- Error presentation
- Settings

The Presentation Layer SHALL NOT implement protocol logic.

---

# 4.4 Application Layer

The Application Layer coordinates user workflows.

Responsibilities include:

- Send workflow
- Receive workflow
- Session lifecycle management
- File selection
- Settings management

The Application Layer translates user actions into protocol operations.

It SHALL NOT perform packet processing.

---

# 4.5 Protocol Layer

The Protocol Layer implements the photon Protocol.

Responsibilities include:

- Session Manager
- Manifest Manager
- Packet Manager
- Transfer Manager
- Resume Manager
- Recovery Manager
- Integrity Manager
- Compression Manager
- Encryption Manager

This layer is entirely platform-independent.

It contains the core business logic of photon.

---

# 4.6 Transport Layer

The Transport Layer converts protocol packets into optical transport frames.

Responsibilities include:

- QR generation
- QR decoding
- Display scheduling
- Camera frame processing
- Adaptive transport
- Frame synchronization

The Transport Layer SHALL NOT interpret protocol semantics.

---

# 4.7 Platform Layer

The Platform Layer provides access to operating system capabilities.

Examples include:

- Camera
- Screen
- File system
- Local storage
- Permissions
- Hardware acceleration

Platform-specific implementations SHALL remain isolated within this layer.

---

# 4.8 Layer Communication

Communication SHALL occur only between adjacent layers.

Example:

```text id="p5jv4h"
Presentation

↓

Application

↓

Protocol

↓

Transport

↓

Platform
```

The following communication paths are prohibited:

```text id="k6m0t2"
Presentation

↓

Transport

❌

Protocol

↓

Platform

❌
```

---

# 4.9 Dependency Direction

Dependencies SHALL always point downward.

```text id="k3r9lu"
Presentation
      │
      ▼
Application
      │
      ▼
Protocol
      │
      ▼
Transport
      │
      ▼
Platform
```

Lower layers SHALL never depend upon higher layers.

---

# 4.10 Cross-Layer Data Flow

A Send operation flows through the architecture as follows.

```text id="l9xt2w"
User

↓

Presentation

↓

Application

↓

Protocol

↓

Transport

↓

Platform

↓

Display
```

A Receive operation follows the reverse direction.

---

# 4.11 Layer Responsibilities

| Layer        | Owns                    |
| ------------ | ----------------------- |
| Presentation | User Interface          |
| Application  | Workflows               |
| Protocol     | Communication Semantics |
| Transport    | Optical Communication   |
| Platform     | Hardware Access         |

Ownership SHALL remain exclusive.

---

# 4.12 Layer Replacement

Each layer SHALL be replaceable independently.

Examples include:

- Replacing Expo with Flutter.
- Replacing QR with Color QR.
- Replacing MMKV with SQLite.
- Replacing Vision Camera with native APIs.

Provided that layer interfaces remain unchanged.

---

# 4.13 Layer Independence

Each layer SHALL expose a stable public interface.

Internal implementation details SHALL remain hidden.

Other layers SHALL depend only upon published interfaces.

---

# 4.14 Layer Invariants

Every implementation SHALL preserve the following invariants:

1. Every architectural component SHALL belong to exactly one layer.
2. Layers SHALL communicate only with adjacent layers.
3. Dependency direction SHALL always point downward.
4. Protocol logic SHALL remain isolated within the Protocol Layer.
5. Transport SHALL remain independent of protocol semantics.
6. Platform-specific code SHALL remain confined to the Platform Layer.
7. Layers SHALL expose stable public interfaces.
8. Layers SHALL be independently replaceable.
9. Layer boundaries SHALL remain explicit.
10. Architectural correctness SHALL not depend on implementation language or platform.

These invariants define the structural organization of the photon architecture and SHALL be preserved by all compliant implementations.

# 5. Overall Component Architecture

## 5.1 Purpose

This section defines the primary software components that comprise the photon system.

Each component represents an independently maintainable architectural unit with clearly defined responsibilities, ownership boundaries, dependencies, and lifecycle.

Collectively, these components implement the complete functionality required by the photon Protocol (OSP).

---

# 5.2 Architectural Component Model

The photon system is composed of five major component groups.

```text id="8m4uyt"
Presentation

↓

Controllers

↓

Protocol Engine

↓

Transport Engine

↓

Platform Services
```

Each group contains multiple independently testable components.

---

# 5.3 Component Hierarchy

The complete component hierarchy is shown below.

```text id="z2r7mc"
photon

├── UI Components
│
├── Controllers
│
├── OSP Core
│
├── Transport
│
├── Storage
│
├── Security
│
├── Native Platform
│
└── Utilities
```

Each subsystem owns a distinct architectural responsibility.

---

# 5.4 Presentation Components

Presentation components implement user interaction.

Examples include:

- Home Screen
- Send Screen
- Receive Screen
- Transfer Progress
- History
- Settings

Responsibilities:

- Display information
- Capture user input
- Dispatch user actions

Presentation components SHALL remain stateless whenever practical.

---

# 5.5 Controller Components

Controllers orchestrate workflows.

Examples:

- TransferController
- SessionController
- ReceiveController
- SendController

Responsibilities:

- Coordinate multiple Managers
- Execute user workflows
- Dispatch protocol operations
- Handle high-level events

Controllers SHALL NOT implement protocol logic.

---

# 5.6 Protocol Components

The Protocol Engine contains the core implementation of OSP.

Components include:

- SessionManager
- ManifestManager
- PacketManager
- TransferManager
- ResumeManager
- RecoveryManager
- CompressionManager
- EncryptionManager
- IntegrityManager

This subsystem SHALL remain platform independent.

---

# 5.7 Transport Components

The Transport subsystem converts protocol packets into optical communication.

Components include:

- QREncoder
- QRDecoder
- FrameScheduler
- CameraProcessor
- AdaptiveTransportEngine

Responsibilities:

- Encode packets
- Decode packets
- Display frames
- Capture frames
- Optimize transmission

Transport components SHALL remain unaware of protocol semantics.

---

# 5.8 Storage Components

Storage components manage persistent and temporary data.

Components include:

- PacketRepository
- SessionRepository
- ManifestRepository
- CacheManager
- FileRepository

Responsibilities:

- Save protocol state
- Cache packets
- Persist sessions
- Store reconstructed files

Repositories SHALL own all persistence logic.

---

# 5.9 Security Components

Security responsibilities are isolated into dedicated services.

Components include:

- EncryptionService
- HashService
- IntegrityService
- KeyManager

Responsibilities:

- Encrypt payloads
- Decrypt payloads
- Compute hashes
- Verify integrity

Security components SHALL remain independent of UI and transport.

---

# 5.10 Native Components

Platform-specific functionality is implemented through adapters.

Examples:

- CameraAdapter
- FileSystemAdapter
- DisplayAdapter
- StorageAdapter
- PermissionAdapter

Native adapters SHALL abstract operating system APIs from higher architectural layers.

---

# 5.11 Utility Components

Utility components provide reusable infrastructure.

Examples include:

- Logger
- EventBus
- Configuration
- TimerService
- BenchmarkService

Utilities SHALL remain stateless whenever possible.

---

# 5.12 Component Relationships

High-level dependencies are illustrated below.

```text id="h7rq6g"
UI

↓

Controllers

↓

Managers

↓

Services

↓

Repositories

↓

Platform Adapters
```

Dependency direction SHALL remain unidirectional.

---

# 5.13 Component Communication

Components communicate using well-defined interfaces.

Permitted mechanisms include:

- Function calls
- Event dispatch
- Dependency Injection
- Observable state

Global mutable state SHALL be avoided.

---

# 5.14 Component Ownership

Each architectural concern SHALL have exactly one owner.

Examples:

| Concern     | Owner            |
| ----------- | ---------------- |
| Sessions    | SessionManager   |
| Packets     | PacketManager    |
| Manifest    | ManifestManager  |
| QR Encoding | QREncoder        |
| Camera      | CameraAdapter    |
| Integrity   | IntegrityManager |

Ownership SHALL remain exclusive.

---

# 5.15 Component Lifecycle

Each component SHALL progress through the following lifecycle.

```text id="0t9m6m"
Created

↓

Initialized

↓

Running

↓

Paused

↓

Disposed
```

Components SHALL release owned resources before disposal.

---

# 5.16 Component Invariants

Every architectural component SHALL satisfy the following invariants:

1. Every component SHALL have a single primary responsibility.
2. Components SHALL communicate through explicit interfaces.
3. Component dependencies SHALL remain unidirectional.
4. Protocol components SHALL remain platform independent.
5. Transport components SHALL remain protocol independent.
6. Persistent storage SHALL be owned exclusively by repositories.
7. Native APIs SHALL be accessed only through adapters.
8. Security responsibilities SHALL remain isolated.
9. Components SHALL be independently testable.
10. Component boundaries SHALL remain stable throughout the lifetime of the project.

These invariants define the structural decomposition of the photon software system.

# 6. Application Architecture

## 6.1 Purpose

The Application Layer coordinates user interactions, business workflows, and protocol execution.

It serves as the orchestration layer between the Presentation Layer and the OSP Protocol Engine.

The Application Layer SHALL contain no protocol semantics.

Instead, it translates user intent into protocol operations.

---

# 6.2 Responsibilities

The Application Layer is responsible for:

- Navigation
- Workflow orchestration
- User settings
- Transfer management
- Session coordination
- State synchronization
- Error presentation
- History management

It SHALL NOT perform packet processing.

---

# 6.3 Application Structure

```text id="76x6sd"
Application

├── Navigation

├── Controllers

├── State Store

├── Services

├── Repositories

└── Event System
```

---

# 6.4 Navigation

Navigation coordinates screen transitions.

Primary routes include:

- Home
- Send
- Receive
- Transfer Progress
- History
- Settings

Navigation SHALL remain independent of protocol execution.

---

# 6.5 Controllers

Controllers coordinate user workflows.

Primary controllers include:

### SendController

Coordinates the Send workflow.

---

### ReceiveController

Coordinates the Receive workflow.

---

### TransferController

Coordinates active transfers.

---

### SessionController

Coordinates Session lifecycle.

Controllers SHALL invoke Protocol components rather than implement protocol logic.

---

# 6.6 State Management

Application state consists of:

- Current Screen
- Active Session
- Active Transfer
- Transfer Progress
- User Preferences
- Device Status

Protocol state SHALL NOT be duplicated within application state.

Instead, application state SHALL reference Protocol state.

---

# 6.7 Services

Application services provide reusable workflow functionality.

Examples:

- NotificationService
- BenchmarkService
- AnalyticsService (optional)
- ThemeService

Services SHALL remain independent of UI components.

---

# 6.8 Repository Layer

Repositories persist application-level data.

Examples:

- PreferencesRepository
- HistoryRepository
- SessionRepository

Repositories SHALL encapsulate storage implementation details.

---

# 6.9 Event Architecture

The Application Layer SHALL use an event-driven model.

Typical events include:

```text id="mw57zw"
TransferStarted

TransferPaused

TransferCompleted

TransferFailed

SessionCreated

SessionExpired
```

Events SHALL propagate upward to Presentation components.

---

# 6.10 Dependency Graph

```text id="tkgqaw"
UI

↓

Controllers

↓

Application Services

↓

OSP Engine

↓

Transport

↓

Platform
```

Application components SHALL never bypass the Protocol Layer.

---

# 6.11 Error Flow

Application-level errors SHALL be categorized as:

- User Errors
- Platform Errors
- Protocol Errors
- Storage Errors

Only user-friendly representations SHALL be exposed to the Presentation Layer.

Protocol details SHALL remain encapsulated.

---

# 6.12 Configuration

The Application Layer owns runtime configuration such as:

- Theme
- Language
- QR Speed Preference
- Performance Mode
- Storage Preferences

Protocol configuration SHALL remain inside the Protocol Engine.

---

# 6.13 Application Lifecycle

The Application Layer follows the lifecycle below.

```text id="zprluh"
Launch

↓

Initialize

↓

Idle

↓

Transfer

↓

Background

↓

Resume

↓

Shutdown
```

The Application Layer SHALL coordinate Protocol lifecycle events throughout these transitions.

---

# 6.14 Application Invariants

Every Application Layer implementation SHALL satisfy the following invariants:

1. Application logic SHALL remain independent of protocol semantics.
2. Controllers SHALL orchestrate workflows rather than perform processing.
3. Navigation SHALL remain independent of protocol execution.
4. Protocol state SHALL not be duplicated within application state.
5. Services SHALL remain reusable and loosely coupled.
6. Repositories SHALL own persistent application data.
7. Events SHALL coordinate communication between architectural layers.
8. User-facing errors SHALL remain independent of protocol internals.
9. Application components SHALL communicate only through defined interfaces.
10. The Application Layer SHALL remain replaceable without requiring modification of the Protocol Engine.

These invariants define the responsibilities and boundaries of the Application Layer within the photon architecture.

# 7. OSP Core Architecture

## 7.1 Purpose

The OSP Core is the central protocol execution engine of the photon system.

It is responsible for implementing every requirement defined in the photon Protocol Specification while remaining completely independent of the user interface, transport implementation, operating system, and hardware platform.

The OSP Core is the only subsystem permitted to implement protocol semantics.

---

# 7.2 Responsibilities

The OSP Core SHALL:

- Execute protocol state machines.
- Manage Sessions.
- Generate and validate Manifests.
- Packetize binary streams.
- Reconstruct files.
- Execute Resume and Recovery.
- Perform integrity verification.
- Coordinate compression and encryption.
- Generate protocol events.

It SHALL NOT:

- Access the camera.
- Render QR codes.
- Display UI.
- Access native APIs directly.

---

# 7.3 Core Architecture

The internal architecture of the OSP Core is shown below.

```text id="1c8vxp"
                OSP Core
                    │
    ┌───────────────┼───────────────┐
    │               │               │
 Session       Manifest        Transfer
 Manager        Manager         Manager
    │               │               │
    └───────────────┼───────────────┘
                    │
              Packet Manager
                    │
        ┌───────────┼───────────┐
        │           │           │
 Compression  Encryption  Integrity
   Manager      Manager      Manager
                    │
             Recovery Manager
                    │
             Resume Manager
```

Every protocol operation SHALL pass through this architecture.

---

# 7.4 Session Manager

The SessionManager owns the complete lifecycle of every Session.

Responsibilities include:

- Session creation
- Session validation
- Session expiration
- Session persistence
- Session termination

No other component SHALL modify Session state directly.

---

# 7.5 Manifest Manager

The ManifestManager owns all Manifest operations.

Responsibilities include:

- Manifest generation
- Manifest validation
- Manifest serialization
- Manifest parsing
- Manifest persistence

The Manifest SHALL remain immutable after validation.

---

# 7.6 Packet Manager

The PacketManager owns packet processing.

Responsibilities include:

- Packet generation
- Packet serialization
- Packet parsing
- Packet validation
- Packet buffering
- Packet indexing

Every packet SHALL pass through the PacketManager exactly once during generation and once during reception.

---

# 7.7 Transfer Manager

The TransferManager coordinates complete transfers.

Responsibilities include:

- Transfer lifecycle
- Progress tracking
- Completion detection
- Timeout handling
- Event generation

The TransferManager SHALL coordinate protocol managers without owning packet data.

---

# 7.8 Compression Manager

Responsible for:

- Compression selection
- Compression execution
- Compression metadata

Compression SHALL occur before encryption.

---

# 7.9 Encryption Manager

Responsible for:

- Encryption
- Decryption
- Key context management

Encryption SHALL occur before packetization.

---

# 7.10 Integrity Manager

Responsible for:

- Packet integrity
- File integrity
- Hash generation
- Hash validation

IntegrityManager SHALL determine transfer success.

---

# 7.11 Recovery Manager

Responsible for:

- Missing packet detection
- Recovery packet processing
- Recovery progress

Recovery SHALL NOT modify validated packets.

---

# 7.12 Resume Manager

Responsible for:

- Resume eligibility
- Packet map preservation
- Resume validation

Resume SHALL preserve protocol correctness.

---

# 7.13 Event System

The OSP Core publishes protocol events.

Examples:

```text id="tdo79n"
SessionCreated

ManifestValidated

PacketValidated

TransferStarted

TransferCompleted

TransferFailed

RecoveryStarted

ResumeCompleted
```

The OSP Core SHALL NOT consume Presentation Layer events.

---

# 7.14 Internal Dependencies

Dependencies within the OSP Core SHALL remain acyclic.

```text id="j6kz3x"
TransferManager

↓

SessionManager

↓

ManifestManager

↓

PacketManager

↓

IntegrityManager
```

Circular dependencies SHALL NOT exist.

---

# 7.15 OSP Core Invariants

Every implementation SHALL satisfy the following invariants:

1. The OSP Core SHALL remain platform independent.
2. Protocol semantics SHALL exist only within the OSP Core.
3. Managers SHALL communicate through explicit interfaces.
4. Packet processing SHALL remain deterministic.
5. Session ownership SHALL belong exclusively to the SessionManager.
6. Manifest ownership SHALL belong exclusively to the ManifestManager.
7. Transfer completion SHALL be determined by the IntegrityManager.
8. Circular dependencies SHALL not exist.
9. The OSP Core SHALL be independently testable.
10. Transport implementations SHALL not alter OSP Core behavior.

These invariants define the internal organization of the photon protocol engine.

# 8. Sender Architecture

## 8.1 Purpose

The Sender Architecture defines how the photon application transforms user-selected files into an optical data stream that conforms to the photon Protocol.

The Sender owns every operation from file selection until completion of packet transmission.

---

# 8.2 Sender Responsibilities

The Sender SHALL:

- Select files.
- Create Sessions.
- Generate Manifests.
- Read binary data.
- Compress files.
- Encrypt files.
- Packetize binary streams.
- Encode QR frames.
- Schedule frame display.
- Monitor transfer progress.

The Sender SHALL NOT perform packet reconstruction.

---

# 8.3 Sender Pipeline

The Sender execution pipeline is shown below.

```text id="hm9q8r"
User

↓

File Picker

↓

TransferController

↓

SessionManager

↓

ManifestManager

↓

Compression

↓

Encryption

↓

PacketManager

↓

QREncoder

↓

FrameScheduler

↓

Display
```

Every Send operation SHALL follow this pipeline.

---

# 8.4 File Processing

Files SHALL be processed sequentially through the protocol pipeline.

Each file undergoes:

1. Binary reading.
2. Compression (optional).
3. Encryption (optional).
4. Packet generation.
5. Packet validation.
6. QR encoding.

The original file SHALL remain unchanged.

---

# 8.5 Session Initialization

The Sender begins every transfer by:

- Creating a Session.
- Negotiating protocol version.
- Generating the Manifest.
- Initializing TransferManager.

No packet SHALL be generated before Session initialization completes.

---

# 8.6 Packet Generation

Packet generation SHALL be delegated exclusively to the PacketManager.

The Sender SHALL NOT construct packets directly.

Generated packets SHALL remain immutable.

---

# 8.7 QR Generation

The QREncoder converts protocol packets into transport frames.

Responsibilities include:

- QR Version selection.
- Error correction configuration.
- Payload encoding.
- Frame generation.

QR generation SHALL remain transport-specific.

---

# 8.8 Frame Scheduling

The FrameScheduler controls optical transmission.

Responsibilities include:

- Frame ordering.
- Display timing.
- Packet looping.
- Adaptive frame rate.

Frame scheduling SHALL NOT modify packet contents.

---

# 8.9 Adaptive Transport

The Sender MAY adjust transport parameters during transmission.

Adjustable parameters include:

- Frame duration.
- QR Version.
- Error correction level.
- Redundancy.

Adaptive Transport SHALL preserve protocol correctness.

---

# 8.10 Progress Monitoring

The Sender tracks:

- Packets generated.
- Packets transmitted.
- Estimated completion.
- Active Session.
- Transfer duration.

Progress reporting SHALL remain informational.

---

# 8.11 Resource Management

The Sender SHOULD:

- Stream large files.
- Avoid buffering entire transfers.
- Release temporary memory promptly.
- Minimize disk writes.

These optimizations SHALL remain transparent to the protocol.

---

# 8.12 Sender State

The Sender progresses through the following runtime states.

```text id="5skfka"
Idle

↓

Preparing

↓

Generating

↓

Transmitting

↓

Paused

↓

Completed
```

Only one active Sender state SHALL exist at any time.

---

# 8.13 Sender Shutdown

Upon transfer completion or cancellation, the Sender SHALL:

- Dispose temporary buffers.
- Release Session resources.
- Stop frame scheduling.
- Reset transport state.

The original files SHALL remain unaffected.

---

# 8.14 Sender Invariants

Every Sender implementation SHALL satisfy the following invariants:

1. Every transfer SHALL begin with Session creation.
2. File processing SHALL precede packet generation.
3. Packet generation SHALL precede QR generation.
4. QR generation SHALL precede frame scheduling.
5. Frame scheduling SHALL preserve packet ordering.
6. Packet contents SHALL remain immutable after generation.
7. Adaptive Transport SHALL not alter protocol semantics.
8. Sender resources SHALL be released after transfer completion.
9. The Sender SHALL remain independent of Receiver implementation details.
10. Every transmitted packet SHALL conform to the photon Protocol Specification.

These invariants define the runtime behavior of the Sender within the photon architecture.

# 9. Receiver Architecture

## 9.1 Purpose

The Receiver Architecture defines how the photon application captures an optical transmission and reconstructs the original file in accordance with the photon Protocol (OSP).

The Receiver owns every operation from camera initialization until the reconstructed file has been successfully verified and stored.

The Receiver SHALL perform no assumptions about the transmitted content beyond those defined by the protocol.

---

# 9.2 Responsibilities

The Receiver SHALL:

- Initialize the camera.
- Capture optical frames.
- Detect QR codes.
- Decode QR payloads.
- Validate packets.
- Maintain packet maps.
- Reconstruct binary data.
- Decrypt payloads (if enabled).
- Decompress payloads (if enabled).
- Verify file integrity.
- Save reconstructed files.

The Receiver SHALL NOT generate protocol packets.

---

# 9.3 Receiver Pipeline

The complete Receiver execution pipeline is illustrated below.

```text id="zq4cwb"
Camera

↓

Frame Capture

↓

QR Detection

↓

QR Decoder

↓

Packet Parser

↓

Packet Validation

↓

Packet Repository

↓

Packet Reconstruction

↓

Decryption

↓

Decompression

↓

Integrity Verification

↓

File Storage
```

Every Receive operation SHALL follow this processing pipeline.

---

# 9.4 Camera Processing

The Camera subsystem is responsible for:

- Camera initialization.
- Continuous frame capture.
- Exposure monitoring.
- Focus management.
- Frame delivery.

Captured frames SHALL be forwarded to the QR Decoder without protocol interpretation.

---

# 9.5 QR Decoding

The QR Decoder SHALL:

- Detect QR symbols.
- Decode payloads.
- Validate QR format.
- Extract protocol packets.

QR decoding SHALL remain independent of packet semantics.

---

# 9.6 Packet Validation

Every decoded packet SHALL undergo validation before being accepted.

Validation includes:

- Session verification.
- Manifest verification.
- Packet index verification.
- Payload validation.
- Duplicate detection.

Invalid packets SHALL be discarded.

---

# 9.7 Packet Repository

The Packet Repository maintains the current packet map.

Responsibilities include:

- Store validated packets.
- Detect duplicates.
- Track missing packets.
- Report reconstruction readiness.

Packets SHALL be immutable after storage.

---

# 9.8 Reconstruction

The Reconstruction Engine SHALL:

- Sort packets.
- Reassemble payloads.
- Restore original binary stream.

Reconstruction SHALL begin only after sufficient packets have been collected.

---

# 9.9 Post-Processing

After reconstruction:

1. Decrypt (if required).
2. Decompress (if required).
3. Compute integrity hash.
4. Compare expected hash.
5. Save file.

Failure at any stage SHALL terminate reconstruction.

---

# 9.10 File Storage

Successfully reconstructed files SHALL be written using the File Repository.

Responsibilities include:

- Destination selection.
- File creation.
- Metadata restoration.
- Storage validation.

Partial files SHALL NOT replace valid files.

---

# 9.11 Progress Monitoring

The Receiver SHALL continuously monitor:

- Packets received.
- Packet completion percentage.
- Missing packet count.
- Estimated completion.
- Reconstruction status.

Progress calculations SHALL remain informational.

---

# 9.12 Receiver State

The Receiver SHALL progress through the following runtime states.

```text id="o8gd7u"
Idle

↓

Scanning

↓

Receiving

↓

Validating

↓

Reconstructing

↓

Verifying

↓

Saving

↓

Completed
```

Only one active Receiver state SHALL exist at any time.

---

# 9.13 Failure Recovery

The Receiver SHALL gracefully recover from:

- Duplicate packets.
- Temporary frame loss.
- Camera interruptions.
- Low-light conditions.
- Motion blur.

Recovery SHALL preserve previously validated packets.

---

# 9.14 Receiver Invariants

Every Receiver implementation SHALL satisfy the following invariants:

1. Camera processing SHALL remain independent of protocol logic.
2. QR decoding SHALL precede packet validation.
3. Packet validation SHALL precede storage.
4. Reconstruction SHALL occur only after sufficient packets are available.
5. Decryption SHALL precede decompression when both are enabled.
6. Integrity verification SHALL precede file storage.
7. Invalid packets SHALL never participate in reconstruction.
8. Previously validated packets SHALL remain immutable.
9. Receiver behavior SHALL remain deterministic.
10. Successfully reconstructed files SHALL be byte-identical to the original transmitted file.

These invariants define the runtime behavior of the Receiver architecture.

# 10. Transport Architecture

## 10.1 Purpose

The Transport Architecture defines how protocol packets are converted into optical signals and subsequently reconstructed from those signals.

The Transport Layer provides a protocol-independent communication medium.

Its sole responsibility is reliable packet transportation.

It SHALL NOT implement protocol semantics.

---

# 10.2 Responsibilities

The Transport Layer SHALL:

- Encode protocol packets.
- Decode protocol packets.
- Display optical frames.
- Capture optical frames.
- Schedule frame presentation.
- Optimize transport parameters.

It SHALL NOT:

- Interpret Sessions.
- Validate Manifests.
- Reconstruct files.
- Verify integrity.

---

# 10.3 Transport Pipeline

Sender

```text id="zupz6o"
Protocol Packet

↓

QR Encoder

↓

Frame Scheduler

↓

Display Engine

↓

Screen
```

Receiver

```text id="gr4jv0"
Camera

↓

Frame Capture

↓

QR Decoder

↓

Decoded Packet

↓

Protocol Layer
```

The Transport Layer SHALL remain transparent to protocol processing.

---

# 10.4 QR Encoder

Responsibilities include:

- Payload encoding.
- QR Version selection.
- Error correction configuration.
- Bitmap generation.

The encoder SHALL receive complete protocol packets as input.

---

# 10.5 QR Decoder

Responsibilities include:

- Symbol detection.
- Payload extraction.
- Decode validation.

The decoder SHALL return protocol packets without interpretation.

---

# 10.6 Frame Scheduler

The Frame Scheduler coordinates visual transmission.

Responsibilities include:

- Frame sequencing.
- Frame timing.
- Packet repetition.
- Loop management.
- Synchronization.

Frame scheduling SHALL preserve logical packet order.

---

# 10.7 Adaptive Transport Engine

The Adaptive Transport Engine continuously optimizes transmission.

Input signals include:

- Ambient brightness.
- Camera FPS.
- Decode success rate.
- Device performance.
- Packet throughput.

Adjustments MAY include:

- QR Version.
- Frame duration.
- Error correction level.
- Packet redundancy.

Adaptive optimization SHALL preserve protocol correctness.

---

# 10.8 Camera Engine

The Camera Engine provides continuous image acquisition.

Responsibilities include:

- Camera selection.
- Autofocus.
- Exposure control.
- Frame buffering.

Camera-specific logic SHALL remain platform dependent.

---

# 10.9 Display Engine

The Display Engine manages optical output.

Responsibilities include:

- Frame rendering.
- Brightness management.
- Screen wake lock.
- Orientation control.

Display optimization SHALL remain independent of packet contents.

---

# 10.10 Transport Performance

The Transport Layer SHOULD maximize:

- Decode success rate.
- Transfer throughput.
- Battery efficiency.
- Frame stability.
- Visual clarity.

Performance optimization SHALL never modify protocol semantics.

---

# 10.11 Transport Independence

The Protocol Layer SHALL remain unaware of transport implementation.

Future transport technologies MAY include:

- Color QR.
- High-density QR.
- Visible Light Communication.
- Infrared.
- Bluetooth.
- NFC.

Only the Transport Layer SHALL require modification.

---

# 10.12 Transport Runtime Flow

The runtime transport flow is illustrated below.

```text id="mq7i4s"
Packet

↓

Encode

↓

Schedule

↓

Display

↓

Capture

↓

Decode

↓

Packet
```

Transport SHALL preserve packet identity throughout this process.

---

# 10.13 Transport Invariants

Every Transport implementation SHALL satisfy the following invariants:

1. Transport SHALL remain protocol independent.
2. Every encoded frame SHALL correspond to exactly one protocol packet.
3. Frame scheduling SHALL preserve packet ordering.
4. Adaptive optimization SHALL not modify packet contents.
5. Camera processing SHALL remain independent of protocol semantics.
6. Display logic SHALL remain independent of protocol semantics.
7. Packet identity SHALL be preserved across transport.
8. Future transport technologies SHALL preserve protocol interfaces.
9. Transport SHALL expose stable interfaces to the Protocol Layer.
10. Transport SHALL remain replaceable without modifying protocol behavior.

These invariants define the architectural boundaries of the Transport Layer and ensure that future transport implementations remain interoperable with the photon Protocol.

# 11. Data Flow Architecture

## 11.1 Purpose

The Data Flow Architecture defines how information moves through the photon system from user input to completed file transfer.

Unlike the Protocol Specification, which defines communication semantics, this section specifies the internal movement, transformation, ownership, and lifecycle of data within the software architecture.

Every data transformation SHALL preserve protocol correctness.

---

# 11.2 Data Flow Principles

The architecture follows the following principles:

- Unidirectional data flow.
- Immutable protocol data.
- Streaming over buffering.
- Minimal data copying.
- Clear ownership.
- Deterministic transformations.

---

# 11.3 High-Level Data Flow

The complete end-to-end flow is shown below.

```text id="w8r5pd"
File

↓

Binary Stream

↓

Compression

↓

Encryption

↓

Packetization

↓

QR Encoding

↓

Display

↓

Camera

↓

QR Decoding

↓

Packet Validation

↓

Packet Repository

↓

Reconstruction

↓

Decryption

↓

Decompression

↓

Integrity Verification

↓

Recovered File
```

Each transformation has exactly one architectural owner.

---

# 11.4 Sender Data Flow

Within the Sender, data moves through the following components.

```text id="9gh3xm"
FileRepository

↓

CompressionManager

↓

EncryptionManager

↓

PacketManager

↓

QREncoder

↓

FrameScheduler

↓

DisplayEngine
```

Each component SHALL consume the output of the previous component without modifying upstream state.

---

# 11.5 Receiver Data Flow

Within the Receiver:

```text id="r7m2zk"
Camera

↓

QRDecoder

↓

PacketManager

↓

PacketRepository

↓

ReconstructionEngine

↓

EncryptionManager

↓

CompressionManager

↓

IntegrityManager

↓

FileRepository
```

The Receiver SHALL reconstruct data in the reverse order of Sender processing.

---

# 11.6 Data Ownership

Every data object SHALL have exactly one owner.

Examples:

| Data          | Owner                |
| ------------- | -------------------- |
| Session       | SessionManager       |
| Manifest      | ManifestManager      |
| Packet        | PacketManager        |
| Packet Map    | PacketRepository     |
| Binary Stream | ReconstructionEngine |
| Final File    | FileRepository       |

Ownership SHALL transfer only through defined interfaces.

---

# 11.7 Immutable Data

The following objects SHALL remain immutable after creation:

- Session
- Manifest
- Packet Header
- Packet Payload
- File Hash

Mutable state SHALL be confined to runtime controllers and repositories.

---

# 11.8 Streaming Architecture

Large files SHALL be processed using streaming techniques whenever practical.

Streaming SHALL minimize:

- Memory allocation.
- Temporary storage.
- Full-file buffering.

Example:

```text id="cn5bya"
Read Chunk

↓

Compress

↓

Encrypt

↓

Packetize

↓

Emit Packet
```

The architecture SHOULD avoid loading an entire file into memory.

---

# 11.9 Data Transformation Pipeline

Every transformation SHALL satisfy the following properties:

- Deterministic.
- Reversible (where applicable).
- Stateless where possible.
- Independently testable.

Transformation order SHALL remain fixed.

---

# 11.10 Error Propagation

Errors SHALL propagate upward through the architecture.

```text id="m4pfks"
Transport

↓

Protocol

↓

Application

↓

Presentation
```

Lower layers SHALL NOT directly display user-facing errors.

---

# 11.11 Event Flow

Application events SHALL propagate independently from data.

Examples include:

- TransferStarted
- PacketValidated
- ProgressUpdated
- TransferCompleted
- TransferFailed

Events SHALL NOT modify protocol data.

---

# 11.12 Performance Considerations

The architecture SHOULD minimize:

- Data duplication.
- Memory fragmentation.
- Serialization overhead.
- Disk writes.

Zero-copy transfers SHOULD be preferred where supported by the platform.

---

# 11.13 Data Flow Invariants

Every implementation SHALL satisfy the following invariants:

1. Data SHALL flow in one direction.
2. Every transformation SHALL have exactly one owner.
3. Immutable protocol data SHALL never be modified.
4. Large files SHOULD be streamed rather than buffered.
5. Events SHALL remain separate from protocol data.
6. Errors SHALL propagate upward.
7. Data transformations SHALL remain deterministic.
8. Packet payloads SHALL remain immutable.
9. Ownership SHALL remain explicit.
10. Data flow SHALL remain independent of the transport implementation.

These invariants define the internal movement of data throughout the photon architecture.

# 12. Storage Architecture

## 12.1 Purpose

The Storage Architecture defines how the photon application stores, retrieves, caches, and manages persistent data.

Storage responsibilities are isolated from protocol execution to improve portability, maintainability, and scalability.

The architecture distinguishes between temporary protocol state and permanent user data.

---

# 12.2 Storage Principles

The storage architecture is designed according to the following principles:

- Separation of temporary and permanent data.
- Repository ownership.
- Immutable protocol records.
- Automatic cleanup.
- Platform abstraction.

---

# 12.3 Storage Overview

The storage subsystem consists of four logical areas.

```text id="vhk4tr"
Application Storage

├── Session Storage

├── Packet Cache

├── Temporary Files

└── User Files
```

Each area has independent lifecycle management.

---

# 12.4 Session Storage

Session Storage maintains active Session metadata.

Stored information includes:

- Session ID.
- Manifest.
- Transfer status.
- Resume state.
- Timestamps.

Expired Sessions SHALL be removed automatically.

---

# 12.5 Packet Cache

Packet Cache temporarily stores validated packets.

Responsibilities include:

- Packet lookup.
- Duplicate detection.
- Missing packet tracking.
- Reconstruction readiness.

Packet Cache SHALL be cleared after transfer completion.

---

# 12.6 Temporary Storage

Temporary storage is used for:

- Compression output.
- Encryption output.
- Intermediate reconstruction.
- QR generation buffers.

Temporary data SHALL be deleted after successful transfer or cancellation.

---

# 12.7 Permanent Storage

Permanent storage contains reconstructed user files.

Responsibilities include:

- Final file creation.
- Metadata preservation.
- User-selected destination.

Permanent storage SHALL remain independent of protocol execution.

---

# 12.8 Repository Architecture

Storage SHALL be accessed exclusively through repositories.

Repositories include:

- SessionRepository
- PacketRepository
- ManifestRepository
- FileRepository
- PreferencesRepository

Direct filesystem access by higher layers SHALL be prohibited.

---

# 12.9 Storage Lifecycle

The lifecycle of stored data is shown below.

```text id="ax6m3r"
Create

↓

Read

↓

Update

↓

Delete
```

Protocol records SHOULD minimize updates after creation.

---

# 12.10 Storage Cleanup

Cleanup SHALL occur when:

- Transfer completes.
- Transfer is cancelled.
- Session expires.
- Storage limits are exceeded.

Cleanup SHALL preserve user files.

---

# 12.11 Storage Security

Sensitive temporary data SHOULD be:

- Encrypted where appropriate.
- Removed immediately after use.
- Inaccessible to unrelated Sessions.

Storage architecture SHALL preserve Session isolation.

---

# 12.12 Platform Independence

Storage interfaces SHALL remain platform independent.

Platform-specific implementations MAY use:

- Expo FileSystem
- MMKV
- SQLite
- Secure Storage

Higher architectural layers SHALL remain unaware of the underlying storage implementation.

---

# 12.13 Storage Invariants

Every implementation SHALL satisfy the following invariants:

1. Storage SHALL be accessed only through repositories.
2. Temporary protocol data SHALL remain separate from user files.
3. Session data SHALL be isolated.
4. Packet Cache SHALL contain only validated packets.
5. Temporary storage SHALL be cleaned after transfer completion.
6. User files SHALL never be modified by cleanup operations.
7. Storage implementations SHALL remain platform independent.
8. Repository interfaces SHALL remain stable.
9. Storage SHALL preserve protocol correctness.
10. Storage architecture SHALL support Resume and Recovery without compromising data integrity.

These invariants define the storage responsibilities and persistence model of the photon architecture.

# 13. Execution & Threading Architecture

## 13.1 Purpose

This section defines how execution is distributed across the various runtime contexts of the photon application.

The objective is to maximize throughput while ensuring that user interactions remain responsive throughout file transmission and reconstruction.

Execution architecture defines:

- Thread ownership
- Task scheduling
- Background processing
- Pipeline execution
- Resource isolation

Protocol semantics remain defined by the OSP Protocol Specification.

---

# 13.2 Design Goals

The execution architecture SHALL:

- Prevent UI blocking.
- Maximize parallelism.
- Minimize thread contention.
- Support large file transfers.
- Scale across device capabilities.
- Preserve deterministic protocol behavior.

---

# 13.3 Runtime Contexts

The application executes within several logical runtime contexts.

```text id="p9x6hk"
UI Thread

↓

JS Runtime

↓

Background Workers

↓

Native Runtime

↓

Operating System
```

Each runtime owns distinct responsibilities.

---

# 13.4 UI Thread

The UI Thread is responsible for:

- Screen rendering.
- Navigation.
- User input.
- Animations.
- Progress indicators.

The UI Thread SHALL NEVER perform:

- Compression.
- Encryption.
- Packetization.
- QR generation.
- QR decoding.
- File reconstruction.

UI responsiveness SHALL remain the highest priority.

---

# 13.5 JavaScript Runtime

The JavaScript runtime coordinates application logic.

Responsibilities include:

- Workflow orchestration.
- Controller execution.
- Event dispatch.
- State synchronization.
- Component coordination.

Long-running computational tasks SHOULD be delegated to workers or native modules.

---

# 13.6 Background Workers

Background workers execute computationally intensive operations.

Typical tasks include:

- Compression.
- Encryption.
- Hash computation.
- Packet generation.
- Packet reconstruction.
- Integrity verification.

Workers SHALL communicate using immutable messages.

Shared mutable state SHOULD be avoided.

---

# 13.7 Native Runtime

Native code executes platform-specific functionality.

Examples include:

- Camera processing.
- QR detection.
- Display rendering.
- File operations.
- Hardware acceleration.

Native execution SHALL remain isolated behind adapters.

---

# 13.8 Execution Pipeline

Sender

```text id="xtjqso"
UI

↓

JS Controller

↓

Worker

↓

Native Renderer

↓

Display
```

Receiver

```text id="gfm55k"
Camera

↓

Native Decoder

↓

Worker

↓

Protocol

↓

UI
```

The execution pipeline SHALL preserve protocol ordering.

---

# 13.9 Task Scheduling

The scheduler SHOULD prioritize:

1. Camera processing.
2. QR decoding.
3. Packet validation.
4. UI rendering.
5. Background maintenance.

Tasks SHALL be interruptible where practical.

---

# 13.10 Thread Safety

Shared resources SHALL be synchronized.

The following objects SHALL remain immutable:

- Manifest
- Packet
- Session Metadata
- Hash Values

Only repositories MAY own mutable runtime state.

---

# 13.11 Performance Constraints

Execution SHOULD satisfy:

- Zero dropped UI frames during normal transfers.
- Minimal memory allocations.
- Efficient CPU utilization.
- Predictable latency.

Performance optimization SHALL NOT alter protocol correctness.

---

# 13.12 Execution Invariants

Every implementation SHALL satisfy the following invariants:

1. UI rendering SHALL remain responsive.
2. Heavy computation SHALL execute outside the UI Thread.
3. Native APIs SHALL remain isolated.
4. Worker communication SHALL use immutable data.
5. Thread ownership SHALL remain explicit.
6. Execution SHALL remain deterministic.
7. Background tasks SHALL preserve protocol ordering.
8. Long-running operations SHALL be interruptible where practical.
9. Platform scheduling SHALL not affect protocol semantics.
10. Execution architecture SHALL remain portable across supported platforms.

These invariants define the runtime execution model of the photon architecture.

# 14. Native Module Architecture

## 14.1 Purpose

The Native Module Architecture defines how platform-specific capabilities are exposed to the photon application.

Native functionality SHALL be encapsulated behind stable interfaces to preserve cross-platform portability.

Business logic and protocol execution SHALL remain independent of native implementations.

---

# 14.2 Design Principles

Native modules SHALL:

- Encapsulate platform APIs.
- Expose stable interfaces.
- Hide implementation details.
- Remain independently replaceable.
- Avoid protocol semantics.

---

# 14.3 Architecture Overview

```text id="e8wvca"
Application

↓

Protocol

↓

Native Adapters

↓

Android / iOS APIs
```

Platform-specific implementations SHALL terminate at the adapter boundary.

---

# 14.4 Camera Adapter

Responsibilities include:

- Camera initialization.
- Frame acquisition.
- Exposure control.
- Focus management.
- Frame streaming.

The Camera Adapter SHALL expose decoded image frames without interpreting protocol data.

---

# 14.5 Display Adapter

Responsibilities include:

- Frame rendering.
- Brightness control.
- Orientation locking.
- Wake lock management.

Display logic SHALL remain independent of protocol processing.

---

# 14.6 File System Adapter

Responsibilities include:

- File reading.
- File writing.
- Directory creation.
- Storage permissions.
- Temporary file management.

The File System Adapter SHALL expose binary streams rather than application-specific objects.

---

# 14.7 Storage Adapter

Responsibilities include:

- Preferences.
- Session persistence.
- Packet cache.
- Temporary storage.

Higher layers SHALL interact only through repository interfaces.

---

# 14.8 Permission Adapter

Responsibilities include:

- Camera permission.
- Storage permission.
- Media library access.

Permission handling SHALL remain isolated from business logic.

---

# 14.9 QR Processing Adapter

Native QR libraries MAY provide:

- QR detection.
- QR decoding.
- Hardware acceleration.

Decoded protocol packets SHALL be returned without modification.

---

# 14.10 Platform Independence

Native adapters SHALL expose identical interfaces across:

- Android.
- iOS.
- Desktop (future).

Platform-specific behavior SHALL remain encapsulated.

---

# 14.11 Failure Isolation

Native failures SHALL NOT propagate platform-specific exceptions beyond the adapter layer.

Instead, adapters SHALL translate failures into standardized application errors.

Examples include:

- Camera unavailable.
- Permission denied.
- Storage unavailable.
- Rendering failure.

---

# 14.12 Replaceability

Every native adapter SHALL be replaceable.

Example:

```text id="rl9s5h"
Vision Camera

↓

Camera Adapter

↓

Application
```

Replacing Vision Camera with another implementation SHALL NOT require changes to higher architectural layers.

---

# 14.13 Native Module Invariants

Every implementation SHALL satisfy the following invariants:

1. Native APIs SHALL be accessed only through adapters.
2. Platform-specific code SHALL remain isolated.
3. Native modules SHALL not implement protocol semantics.
4. Stable interfaces SHALL be preserved.
5. Adapter failures SHALL be translated into standardized application errors.
6. Native implementations SHALL be independently replaceable.
7. Platform-specific optimizations SHALL remain transparent to higher layers.
8. Business logic SHALL remain platform independent.
9. Native modules SHALL preserve protocol correctness.
10. Cross-platform portability SHALL remain a primary architectural objective.

These invariants define the interaction between the photon application and the underlying operating system.

# 15. Dependency Architecture

## 15.1 Purpose

The Dependency Architecture defines how architectural components depend upon one another throughout the photon system.

Its objective is to establish a predictable dependency graph that minimizes coupling, prevents cyclic dependencies, and enables independent development, testing, and replacement of components.

Dependencies describe compile-time and runtime relationships between architectural units.

Protocol semantics remain defined exclusively by the OSP Protocol Specification.

---

# 15.2 Design Principles

The dependency architecture is based on the following principles:

- Unidirectional dependencies.
- Dependency inversion.
- Explicit ownership.
- Interface-driven communication.
- Component replaceability.
- Testability.

Dependencies SHALL remain deterministic.

---

# 15.3 Dependency Hierarchy

The complete dependency hierarchy is shown below.

```text id="wzmt8k"
Presentation

↓

Controllers

↓

Managers

↓

Services

↓

Repositories

↓

Adapters

↓

Platform APIs
```

Dependency direction SHALL always flow downward.

---

# 15.4 Dependency Rules

Every architectural dependency SHALL satisfy the following rules.

### Rule 1

Higher layers MAY depend on lower layers.

---

### Rule 2

Lower layers SHALL NEVER depend upon higher layers.

---

### Rule 3

Components SHALL communicate through interfaces rather than concrete implementations.

---

### Rule 4

Circular dependencies SHALL NOT exist.

---

### Rule 5

Protocol components SHALL remain independent of platform components.

---

# 15.5 Component Dependency Graph

The primary dependency graph is shown below.

```text id="l3vtrm"
UI

↓

TransferController

↓

TransferManager

↓

SessionManager

↓

ManifestManager

↓

PacketManager

↓

Repositories

↓

Adapters
```

Each dependency SHALL have a clearly defined responsibility.

---

# 15.6 Dependency Injection

Dependencies SHOULD be injected during component construction.

Example:

```text id="jpw74f"
TransferController

↓

PacketManager

↓

PacketRepository

↓

StorageAdapter
```

Global singleton access SHOULD be avoided.

---

# 15.7 Repository Dependencies

Repositories SHALL depend only upon:

- Storage adapters.
- Serialization utilities.

Repositories SHALL NOT depend upon:

- Controllers.
- UI.
- Protocol Managers.

---

# 15.8 Adapter Dependencies

Adapters SHALL depend only upon:

- Platform APIs.

Adapters SHALL NOT depend upon:

- Protocol.
- Controllers.
- Presentation.

---

# 15.9 Utility Dependencies

Utilities SHALL remain dependency-free whenever practical.

Examples include:

- Logger
- Timer
- Benchmark
- Configuration

Shared utilities SHALL avoid application-specific behavior.

---

# 15.10 Cyclic Dependency Prevention

The architecture SHALL prohibit cyclic dependency graphs.

Example:

```text id="h4o9kl"
A

↓

B

↓

C

↓

A

❌
```

Dependency analysis SHOULD be automated during CI.

---

# 15.11 Dependency Visibility

Each component SHALL expose only its public interface.

Internal implementation details SHALL remain private.

Consumers SHALL depend only upon published contracts.

---

# 15.12 Dependency Invariants

Every implementation SHALL satisfy the following invariants:

1. Dependencies SHALL remain acyclic.
2. Dependency direction SHALL always flow downward.
3. Interfaces SHALL be preferred over concrete implementations.
4. Protocol components SHALL remain platform independent.
5. Repositories SHALL own persistence.
6. Adapters SHALL encapsulate platform APIs.
7. Utilities SHOULD remain dependency-free.
8. Components SHALL expose minimal public interfaces.
9. Dependency inversion SHALL be preferred over direct instantiation.
10. Dependency architecture SHALL remain stable across protocol versions.

These invariants define the dependency structure of the photon architecture.

# 16. State Management Architecture

## 16.1 Purpose

The State Management Architecture defines how runtime state is created, owned, synchronized, persisted, and destroyed throughout the photon system.

The objective is to ensure predictable application behavior while minimizing duplicated state and synchronization complexity.

---

# 16.2 State Categories

photon defines five categories of runtime state.

| State             | Owner              |
| ----------------- | ------------------ |
| UI State          | Presentation Layer |
| Application State | Controllers        |
| Protocol State    | OSP Core           |
| Transport State   | Transport Engine   |
| Platform State    | Native Adapters    |

Each category SHALL have exactly one owner.

---

# 16.3 State Ownership

Ownership SHALL remain exclusive.

Examples:

| Object          | Owner            |
| --------------- | ---------------- |
| Session         | SessionManager   |
| Manifest        | ManifestManager  |
| Packet Map      | PacketRepository |
| Active Transfer | TransferManager  |
| Camera Status   | CameraAdapter    |

Ownership SHALL never be ambiguous.

---

# 16.4 Immutable State

The following objects SHALL remain immutable.

- Session
- Manifest
- Packet Header
- Packet Payload
- File Hash
- Protocol Version

Immutable state SHALL never be modified after creation.

---

# 16.5 Mutable State

Mutable runtime state includes:

- Transfer Progress
- Camera Status
- Active Screen
- Selected Files
- User Preferences

Mutable state SHALL remain localized.

---

# 16.6 State Synchronization

State synchronization SHALL occur through events.

Example:

```text id="dquxw3"
Packet Stored

↓

Transfer Progress Updated

↓

UI Refresh
```

Direct polling SHOULD be avoided.

---

# 16.7 Persistent State

Persistent state SHALL include:

- User preferences.
- Session metadata.
- Resume information.
- Transfer history.

Persistent state SHALL be owned exclusively by repositories.

---

# 16.8 Ephemeral State

Ephemeral state includes:

- Temporary buffers.
- QR bitmaps.
- Camera frames.
- Intermediate binary chunks.

Ephemeral state SHALL be destroyed immediately after use.

---

# 16.9 State Lifecycle

Every state object follows the lifecycle below.

```text id="c0vgrj"
Created

↓

Initialized

↓

Active

↓

Released

↓

Destroyed
```

Destroyed state SHALL NOT be reused.

---

# 16.10 State Propagation

State SHALL propagate upward through architectural layers.

```text id="mnx6qv"
Protocol

↓

Application

↓

Presentation
```

Lower layers SHALL never directly manipulate Presentation state.

---

# 16.11 State Consistency

The architecture SHALL guarantee:

- Single source of truth.
- No duplicated protocol state.
- Deterministic updates.
- Explicit ownership.

Consistency SHALL take precedence over convenience.

---

# 16.12 State Invariants

Every implementation SHALL satisfy the following invariants:

1. Every state object SHALL have exactly one owner.
2. Protocol state SHALL remain immutable whenever possible.
3. Mutable state SHALL remain localized.
4. State synchronization SHALL be event-driven.
5. Persistent state SHALL be managed by repositories.
6. Ephemeral state SHALL be released promptly.
7. State propagation SHALL respect architectural layers.
8. Single source of truth SHALL be maintained.
9. Destroyed state SHALL never be reused.
10. State architecture SHALL remain deterministic across all supported platforms.

These invariants define the runtime state model of the photon architecture.

# 17. Performance Architecture

## 17.1 Purpose

The Performance Architecture defines how the photon system achieves efficient execution while preserving protocol correctness.

Its objective is to maximize transfer throughput, minimize latency, reduce resource consumption, and maintain a responsive user experience across a wide range of supported devices.

Performance optimizations SHALL NOT alter protocol semantics.

---

# 17.2 Performance Goals

The architecture SHALL optimize for:

- Transfer throughput.
- QR decode success rate.
- UI responsiveness.
- Memory efficiency.
- CPU utilization.
- Battery consumption.
- Storage efficiency.
- Startup time.

Performance SHALL always remain secondary to correctness.

---

# 17.3 Performance Model

The runtime performance model is shown below.

```text id="3hmykw"
CPU

↓

Packet Processing

↓

QR Generation

↓

Display

↓

Camera

↓

QR Decode

↓

Reconstruction

↓

Storage
```

Each stage contributes independently to overall transfer performance.

---

# 17.4 Throughput Optimization

The architecture SHOULD maximize:

- Packets per second.
- Frames per second.
- Successful QR decodes.
- End-to-end transfer rate.

Throughput SHALL be continuously monitored during active transfers.

---

# 17.5 Memory Architecture

Memory consumption SHALL be minimized by:

- Streaming large files.
- Avoiding unnecessary copies.
- Releasing temporary buffers promptly.
- Reusing reusable buffers where practical.

Large files SHOULD NOT require loading the complete file into memory.

---

# 17.6 CPU Optimization

CPU-intensive operations include:

- Compression.
- Encryption.
- QR generation.
- QR decoding.
- Integrity hashing.

These operations SHOULD execute outside the UI Thread.

---

# 17.7 Rendering Performance

Display rendering SHALL:

- Maintain stable frame timing.
- Avoid dropped frames.
- Minimize bitmap allocations.
- Reuse rendering resources.

Rendering optimization SHALL remain transparent to the Protocol Layer.

---

# 17.8 Camera Performance

Camera processing SHOULD optimize:

- Frame acquisition.
- Exposure stability.
- Autofocus latency.
- Decode frequency.

Camera processing SHALL prioritize decode reliability over raw frame rate.

---

# 17.9 Adaptive Optimization

The Adaptive Transport Engine MAY optimize:

- QR Version.
- Error correction level.
- Frame duration.
- Packet redundancy.
- Brightness recommendations.

Adaptive optimization SHALL remain protocol-independent.

---

# 17.10 Resource Monitoring

The architecture SHOULD continuously monitor:

- CPU utilization.
- Memory usage.
- Battery level.
- Decode success rate.
- Transfer throughput.
- Frame latency.

These metrics MAY be used to guide adaptive transport decisions.

---

# 17.11 Performance Metrics

Representative runtime metrics include:

| Metric              | Description               |
| ------------------- | ------------------------- |
| Packets/sec         | Packet transmission rate  |
| Frames/sec          | Display update rate       |
| Decode Rate         | Successful QR decodes     |
| Transfer Rate       | Effective data throughput |
| Memory Usage        | Active runtime memory     |
| CPU Usage           | Processing utilization    |
| Reconstruction Time | File assembly duration    |

These metrics SHOULD be collected without impacting transfer performance.

---

# 17.12 Performance Invariants

Every implementation SHALL satisfy the following invariants:

1. UI responsiveness SHALL take precedence over throughput.
2. Large files SHALL be processed using streaming techniques where practical.
3. CPU-intensive tasks SHALL avoid the UI Thread.
4. Memory usage SHALL remain bounded.
5. Temporary resources SHALL be released promptly.
6. Adaptive optimization SHALL not alter protocol correctness.
7. Rendering SHALL preserve packet ordering.
8. Performance monitoring SHALL remain non-invasive.
9. Platform-specific optimizations SHALL remain transparent to higher layers.
10. Performance architecture SHALL remain independent of protocol semantics.

These invariants define the performance characteristics expected of compliant photon implementations.

# 18. Security Architecture

## 18.1 Purpose

The Security Architecture defines how security-related components are organized and interact within the photon application.

Unlike the protocol-level Security Specification, this section describes the architectural placement and responsibilities of security components.

Security architecture SHALL remain independent of the user interface and transport implementation.

---

# 18.2 Security Objectives

The Security Architecture SHALL provide:

- Confidentiality.
- Integrity.
- Session isolation.
- Secure storage.
- Secure execution.
- Deterministic validation.

Implementation details of cryptographic algorithms are defined in **SECURITY.md**.

---

# 18.3 Security Components

The primary security components include:

- EncryptionManager.
- IntegrityManager.
- HashService.
- KeyManager.
- SecureStorageAdapter.

Each component owns a distinct security responsibility.

---

# 18.4 Security Pipeline

The security processing pipeline is illustrated below.

Sender:

```text id="m48ypr"
Binary Data

↓

Compression

↓

Encryption

↓

Packetization
```

Receiver:

```text id="l0g8fb"
Packet Reconstruction

↓

Decryption

↓

Decompression

↓

Integrity Verification
```

The order of operations SHALL remain fixed.

---

# 18.5 Key Management

The KeyManager is responsible for:

- Key generation.
- Key storage.
- Key retrieval.
- Key lifecycle management.

Application components SHALL never access raw cryptographic keys directly.

---

# 18.6 Secure Storage

Sensitive information MAY be stored using secure platform facilities.

Examples include:

- Encryption keys.
- Session secrets.
- Authentication metadata.

Secure storage SHALL remain abstracted behind dedicated adapters.

---

# 18.7 Session Isolation

Every active Session SHALL remain isolated.

Session data SHALL NOT be accessible by unrelated transfers.

Isolation SHALL extend to:

- Packet repositories.
- Temporary files.
- Runtime buffers.
- Security contexts.

---

# 18.8 Failure Handling

Security failures include:

- Authentication failure.
- Integrity mismatch.
- Decryption failure.
- Invalid security context.

Security failures SHALL terminate the affected transfer without exposing sensitive information.

---

# 18.9 Security Logging

Security events MAY be logged for diagnostic purposes.

Logs SHOULD avoid storing:

- Plaintext payloads.
- Encryption keys.
- Sensitive user data.

Logging SHALL preserve user privacy.

---

# 18.10 Component Interaction

Security components interact with the broader architecture as follows.

```text id="c2xj8v"
TransferManager

↓

EncryptionManager

↓

IntegrityManager

↓

SecureStorageAdapter
```

Higher architectural layers SHALL communicate only through public interfaces.

---

# 18.11 Security Boundaries

Security-sensitive processing SHALL remain confined to dedicated components.

Other architectural layers SHALL treat security operations as black-box services.

This separation minimizes accidental exposure of sensitive information.

---

# 18.12 Security Invariants

Every implementation SHALL satisfy the following invariants:

1. Security responsibilities SHALL remain isolated.
2. Cryptographic keys SHALL never be exposed outside the KeyManager.
3. Secure storage SHALL be abstracted behind adapters.
4. Session isolation SHALL be preserved.
5. Security failures SHALL terminate only the affected transfer.
6. Logging SHALL not expose sensitive information.
7. Security components SHALL remain independently testable.
8. Security architecture SHALL remain platform independent.
9. Security processing SHALL preserve protocol correctness.
10. Cryptographic implementation details SHALL remain outside the scope of this document.

These invariants define the organizational structure of security within the photon architecture.

# 20. Architectural Decision Records (ADRs)

## 20.1 Purpose

This section documents the major architectural decisions that shaped the design of the photon system.

Architectural Decision Records (ADRs) provide historical context, design rationale, alternatives considered, and expected consequences.

Future contributors SHOULD consult these records before introducing architectural changes.

---

# ADR-001 — Protocol-First Architecture

### Decision

The system SHALL be designed around the photon Protocol (OSP).

### Rationale

Separating protocol semantics from application logic enables:

- Independent implementations.
- Future protocol evolution.
- Cross-platform portability.
- Easier testing.

### Alternatives Considered

- Application-specific implementation.
- UI-driven architecture.

### Consequences

Protocol changes remain isolated from application code.

---

# ADR-002 — Layered Architecture

### Decision

The application SHALL use a layered architecture.

### Rationale

Layering reduces coupling and improves maintainability.

### Consequences

Each layer owns a single architectural responsibility.

---

# ADR-003 — Pipeline Processing

### Decision

File processing SHALL use pipeline stages.

```text id="69t5lf"
Read

↓

Compress

↓

Encrypt

↓

Packetize

↓

QR Encode
```

### Rationale

Pipeline processing supports:

- Streaming.
- Parallelism.
- Future extensions.

---

# ADR-004 — Immutable Protocol Objects

### Decision

Protocol objects SHALL become immutable after creation.

### Rationale

Immutable objects simplify:

- Testing.
- Thread safety.
- Recovery.
- Deterministic execution.

---

# ADR-005 — Repository Pattern

### Decision

Persistent storage SHALL be accessed exclusively through repositories.

### Rationale

Repositories isolate storage implementation details from business logic.

---

# ADR-006 — Adapter Pattern

### Decision

Native APIs SHALL be accessed only through adapters.

### Rationale

This preserves platform independence.

---

# ADR-007 — Event-Driven Communication

### Decision

Application components SHALL communicate using events where appropriate.

### Rationale

Event-driven communication reduces coupling and improves scalability.

---

# ADR-008 — Offline-First Design

### Decision

The application SHALL require no network connectivity.

### Rationale

Offline execution is a primary product requirement.

---

# ADR-009 — Transport Independence

### Decision

OSP SHALL remain independent of QR technology.

### Rationale

Future transport methods should not require protocol redesign.

Potential future transports include:

- Color QR.
- VLC.
- BLE.
- NFC.

---

# ADR-010 — Expo + React Native

### Decision

The reference implementation SHALL use Expo and React Native.

### Rationale

Benefits include:

- Cross-platform development.
- Shared codebase.
- Faster iteration.
- Mature ecosystem.

Native performance-sensitive functionality remains isolated behind adapters.

---

# ADR-011 — AI-First Documentation

### Decision

All engineering documentation SHALL be written for both humans and AI-assisted development tools.

### Rationale

The project is intended to be developed using agentic IDEs.

Documentation therefore emphasizes:

- Deterministic behavior.
- Explicit ownership.
- Clear interfaces.
- Stable terminology.
- Formal invariants.

---

# ADR-012 — Modular Evolution

### Decision

The architecture SHALL evolve through modular extensions rather than large-scale rewrites.

### Rationale

Long-term maintainability requires stable architectural boundaries.

Future protocol versions should extend existing components rather than replace them.

---

# Architectural Governance

Future architectural modifications SHOULD:

- Preserve documented invariants.
- Maintain protocol compatibility.
- Respect component boundaries.
- Introduce new ADRs when significant design decisions are made.

Existing ADRs SHALL remain part of the permanent project history.

---

# Architecture Summary

The photon Architecture is founded upon the following principles:

- Protocol-first design.
- Layered architecture.
- Component isolation.
- Pipeline processing.
- Offline-first operation.
- Cross-platform portability.
- Deterministic execution.
- Transport independence.
- Explicit ownership.
- Long-term extensibility.

These decisions collectively establish the architectural foundation upon which all future versions of photon SHALL be built.
