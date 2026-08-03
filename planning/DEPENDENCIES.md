# DEPENDENCIES.md

# photon Dependency Specification

**Version:** 1.0

**Status:** Living Document

---

# 1. Purpose

This document defines the dependency rules for the photon codebase.

It establishes which modules may depend upon others and prohibits architectural violations such as circular dependencies, layer inversion, and UI-business logic coupling.

These rules SHALL be enforced throughout the project.

---

# 2. Dependency Philosophy

The architecture follows these principles:

- Dependencies flow downward.
- Higher layers may depend on lower layers.
- Lower layers must never depend on higher layers.
- Communication occurs through public interfaces.
- Circular dependencies are prohibited.

---

# 3. Layer Dependency Rules

The allowed dependency hierarchy is:

```text
UI
↓

Controllers
↓

Services
↓

Core Protocol
↓

Repositories
↓

Adapters
↓

Platform APIs
```

Dependencies SHALL only flow downward.

---

# 4. Allowed Dependencies

## UI

May depend on:

- Controllers
- Shared Components
- State Stores
- Navigation

Must NOT depend on:

- Packet serialization
- QR encoder
- File system
- Camera implementation
- Protocol internals

---

## Controllers

May depend on:

- Services
- State
- Event Bus

Must NOT depend on:

- React Components
- Platform APIs

---

## Services

May depend on:

- Core Protocol
- Repositories
- Utilities

Must NOT depend on:

- Screens
- Navigation
- UI Components

---

## Core Protocol

May depend on:

- Domain Models
- Utilities

Must NOT depend on:

- React Native
- Expo APIs
- UI
- Camera
- Storage implementation

---

## Repositories

May depend on:

- Storage Adapters

Must NOT depend on:

- UI
- Controllers

---

## Adapters

May depend on:

- Platform APIs only

Must NOT depend on:

- Business Logic
- Protocol
- React Components

---

# 5. Module Dependencies

TransferService

Depends On

- SessionManager
- ManifestManager
- PacketManager
- QRService

Must NOT depend on

- HomeScreen
- CameraScreen

---

PacketManager

Depends On

- Packet
- Header
- Footer
- Validator

Must NOT depend on

- Camera
- Navigation

---

QRService

Depends On

- PacketManager
- Renderer
- Scheduler

Must NOT depend on

- Storage
- UI

---

CameraService

Depends On

- Camera Adapter

Must NOT depend on

- Packet Serialization

---

# 6. Forbidden Dependencies

The following are prohibited:

- UI → Platform APIs
- UI → Packet Layer
- UI → QR Encoder
- Protocol → Expo APIs
- Protocol → React Native
- Services → Screens
- Repositories → UI
- Adapters → Controllers

---

# 7. Circular Dependency Policy

Circular dependencies SHALL NEVER exist.

Example:

```
A → B → C → A
```

This dependency graph is invalid.

---

# 8. Dependency Injection

Dependencies SHALL be injected.

Direct construction of services SHOULD be avoided.

Example:

✓

TransferService(PacketManager)

✗

new PacketManager()

inside TransferService

---

# 9. External Dependencies

Allowed categories:

- Expo SDK
- React Native
- Vision Camera
- MMKV
- TypeScript
- QR Library
- Crypto Library

Every third-party dependency SHALL be reviewed before adoption.

---

# 10. Future Modules

New modules SHALL:

- Declare dependencies explicitly.
- Respect layer boundaries.
- Avoid introducing circular references.
- Preserve protocol independence.

---

# 11. Dependency Invariants

1. Dependencies SHALL always flow downward.
2. Circular dependencies are prohibited.
3. Business logic SHALL remain platform-independent.
4. UI SHALL never implement protocol logic.
5. Platform APIs SHALL be isolated behind adapters.
6. Controllers SHALL coordinate rather than implement business logic.
7. Services SHALL encapsulate business behavior.
8. Repositories SHALL own persistence.
9. Core Protocol SHALL remain dependency-light.
10. Every new module SHALL declare its dependencies before implementation.
