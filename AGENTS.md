# AGENTS.md

# photon AI Agent Guide

> **Read this file before making any code changes.**

---

# 1. Project Overview

photon is a cross-platform offline file transfer application built with **Expo**, **React Native**, and **TypeScript**.

The application transfers files between devices using an optical communication protocol based on sequential QR codes.

Supported file types include (but are not limited to):

- Images
- Videos
- Audio
- PDFs
- Documents
- Archives
- Any arbitrary binary file

The project is **protocol-first**, meaning the protocol defines system behavior and the application is an implementation of that protocol.

---

# 2. Primary Objective

Your objective is to implement features while preserving:

- Architecture
- Protocol correctness
- Maintainability
- Testability
- Deterministic behavior

Never sacrifice architecture for speed.

---

# 3. Documentation Hierarchy

Always treat documents in the following order of authority.

## Product

```
docs/01_PRD.md
```

Defines product vision and requirements.

---

## Technical

```
docs/02_TRD.md
```

Defines technical requirements.

---

## Architecture

```
docs/03_ARCHITECTURE.md
```

Defines system organization.

---

## Protocol

```
docs/04_PROTOCOL_SPEC.md
```

This is the canonical source of protocol behavior.

Do NOT redefine protocol behavior elsewhere.

---

## Binary Format

```
docs/05_PACKET_SPEC.md
```

Defines packet layouts.

---

## QR Transport

```
docs/06_QR_SPEC.md
```

Defines optical transport.

---

## Security

```
docs/07_SECURITY.md
```

Defines security requirements.

---

## Runtime

```
docs/08_STATE_MACHINES.md
```

Defines execution state machines.

---

## UI

```
docs/09_UI_SPEC.md
```

Defines application screens.

---

## Internal APIs

```
docs/10_API_SPEC.md
```

Defines module interfaces.

---

## Testing

```
docs/11_TEST_SPEC.md
```

Defines acceptance tests.

---

## Roadmap

```
docs/12_ROADMAP.md
```

Defines future development.

---

## Planning

```
planning/
```

Contains implementation guidance.

Read in this order:

1. IMPLEMENTATION_PLAN.md
2. TASK_GRAPH.md
3. DEPENDENCIES.md
4. AGENT_GUIDE.md

---

# 4. Development Workflow

Every implementation should follow this workflow.

```
Understand Requirement

↓

Read Relevant Documentation

↓

Identify Dependencies

↓

Implement Smallest Working Unit

↓

Write Tests

↓

Run Validation

↓

Update Documentation (if required)

↓

Commit
```

Never skip validation.

---

# 5. Architecture Rules

Always follow the architecture.

Allowed dependency direction:

```
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

Do not introduce circular dependencies.

Do not bypass architectural layers.

---

# 6. Code Generation Rules

Always:

- Use TypeScript.
- Enable strict typing.
- Prefer immutable data.
- Write deterministic code.
- Keep functions focused.
- Prefer composition over inheritance.

Avoid:

- `any`
- Global mutable state
- Hidden side effects
- Duplicate logic

---

# 7. Protocol Rules

Protocol behavior is defined only in:

```
docs/04_PROTOCOL_SPEC.md
```

If protocol behavior changes:

- Update the specification first.
- Then update the implementation.
- Then update tests.

Never change protocol behavior silently.

---

# 8. UI Rules

React components should:

- Render UI.
- Display state.
- Dispatch actions.

React components must NOT:

- Serialize packets.
- Read files.
- Generate QR codes.
- Perform protocol logic.
- Implement business rules.

---

# 9. Testing Requirements

Every feature should include appropriate tests.

Minimum expectations:

- Unit tests
- Integration tests (where applicable)
- Regression coverage for changed behavior

No implementation is complete without tests.

---

# 10. Documentation Rules

Every concept has a single source of truth.

Do not duplicate documentation.

Instead, reference the authoritative document.

When behavior changes:

- Update the specification.
- Update tests.
- Update code.

Keep documentation synchronized with implementation.

---

# 11. Performance Guidelines

Optimize for:

- Streaming
- Low memory usage
- Responsive UI
- Efficient QR generation
- Fast QR decoding

Never block the UI thread with expensive operations.

---

# 12. Security Guidelines

Do not:

- Log sensitive file contents.
- Expose encryption keys.
- Store temporary decrypted data longer than necessary.

Validate integrity before reconstruction.

---

# 13. Preferred Design Patterns

Use:

- Repository Pattern
- Dependency Injection
- Adapter Pattern
- Event Bus
- Pipeline Processing
- Immutable Models
- Single Responsibility Principle

Avoid introducing new architectural patterns unless justified by an Architectural Decision Record (ADR).

---

# 14. Before Writing Code

Before implementing any task, confirm:

- The relevant specification has been read.
- Dependencies are understood.
- Existing modules can be reused.
- The implementation fits the architecture.
- Acceptance criteria are clear.

If information is missing, prefer clarification over assumptions.

---

# 15. Before Completing a Task

Verify:

- Project builds successfully.
- Lint passes.
- Tests pass.
- No architectural violations.
- No circular dependencies.
- Documentation is current.
- Acceptance criteria are satisfied.

Only then mark the task complete.

---

# 16. AI Agent Checklist

Before every implementation:

- Read the relevant specification documents.
- Respect architectural boundaries.
- Keep changes focused and minimal.
- Reuse existing components whenever possible.
- Add or update tests.
- Avoid introducing unnecessary complexity.

---

# 17. Non-Negotiable Rules

1. Follow the documented architecture.
2. Preserve protocol correctness.
3. Never duplicate business logic.
4. Keep modules loosely coupled.
5. Do not bypass repositories or services.
6. Do not expose platform-specific APIs outside adapters.
7. Do not introduce circular dependencies.
8. Keep documentation synchronized with implementation.
9. Maintain deterministic behavior.
10. Prefer maintainability over clever optimizations.

---

# 18. Mission

The goal is not simply to produce working code.

The goal is to build a maintainable, extensible, protocol-driven system that remains understandable by both humans and AI contributors for years to come.

When in doubt, choose the solution that best preserves clarity, consistency, and long-term maintainability.
