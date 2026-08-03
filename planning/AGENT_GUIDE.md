# AGENT_GUIDE.md

# photon AI Development Guide

**Version:** 1.0

**Audience:** AI Coding Agents & Human Contributors

---

# 1. Purpose

This document defines the engineering rules that every AI agent must follow when contributing to the photon codebase.

These rules take precedence over convenience.

The objective is to preserve architecture, maintainability, and consistency across all generated code.

---

# 2. Primary Objective

When implementing any feature:

1. Follow the Architecture.
2. Follow the Protocol.
3. Follow the API contracts.
4. Write deterministic code.
5. Prefer readability over cleverness.

---

# 3. Build Order

Always implement in this order:

Domain Models

↓

Repositories

↓

Services

↓

Controllers

↓

UI

Never build UI before business logic exists.

---

# 4. Coding Rules

Always:

- Use TypeScript.
- Use strict typing.
- Prefer immutable objects.
- Prefer composition over inheritance.
- Write pure functions whenever practical.
- Keep functions small.

Never:

- Use `any`.
- Introduce global mutable state.
- Duplicate business logic.
- Create hidden side effects.

---

# 5. Folder Ownership

Only modify files within the relevant module.

Example:

Packet changes

↓

src/core/packets

NOT

src/components

---

# 6. Protocol Rules

Protocol behavior is defined exclusively in:

04_PROTOCOL_SPEC.md

Do not redefine protocol behavior elsewhere.

---

# 7. UI Rules

UI SHALL:

- Display state.
- Dispatch actions.
- Never implement protocol logic.

Business logic belongs in Services.

---

# 8. Error Handling

Errors SHALL:

- Use typed error classes.
- Include actionable messages.
- Preserve stack traces.
- Never expose sensitive information.

Do not swallow exceptions silently.

---

# 9. Performance Rules

Prefer:

- Streaming.
- Lazy loading.
- Immutable updates.
- Buffer reuse.

Avoid:

- Loading large files entirely into memory.
- Blocking the UI thread.
- Unnecessary allocations.

---

# 10. Testing Rules

Every new feature SHALL include:

- Unit tests.
- Integration tests (where applicable).
- Updated test vectors if protocol behavior changes.

No feature is complete without tests.

---

# 11. Documentation Rules

When changing behavior:

- Update the relevant specification.
- Update comments if required.
- Do not duplicate documentation across files.

There should always be a single source of truth.

---

# 12. Git Rules

Commits SHOULD be:

- Small
- Atomic
- Descriptive

Avoid mixing unrelated changes in a single commit.

---

# 13. Code Review Checklist

Before marking work complete, verify:

- Builds successfully.
- Lint passes.
- Tests pass.
- No architecture violations.
- No circular dependencies.
- Documentation updated.

---

# 14. Anti-Patterns

Do NOT:

- Put business logic inside React components.
- Access storage directly from screens.
- Serialize packets in UI code.
- Read camera frames in controllers.
- Call platform APIs from protocol code.
- Hardcode configuration values.
- Bypass repositories.

---

# 15. Preferred Patterns

Prefer:

- Repository Pattern
- Dependency Injection
- Event-Driven Communication
- Immutable Models
- Pipeline Processing
- Adapter Pattern
- Composition

---

# 16. AI Task Workflow

For every task, follow this sequence:

1. Read the relevant specification documents.
2. Identify dependencies.
3. Implement the smallest working unit.
4. Write tests.
5. Verify architecture compliance.
6. Update documentation if behavior changed.

Do not skip steps.

---

# 17. Definition of Complete

A task is complete only when:

- Code compiles.
- Tests pass.
- Documentation is current.
- No architectural rules are violated.
- Acceptance criteria are satisfied.

---

# 18. Non-Negotiable Rules

1. Never violate the architecture to implement a feature quickly.
2. Never duplicate business logic.
3. Never introduce circular dependencies.
4. Never bypass repositories or services.
5. Never modify protocol behavior without updating `PROTOCOL_SPEC.md`.
6. Never expose platform-specific APIs outside adapters.
7. Keep modules cohesive and loosely coupled.
8. Favor deterministic implementations over clever optimizations.
9. If uncertain, preserve existing architecture rather than inventing a new pattern.
10. Maintain backward compatibility unless a documented architectural decision explicitly permits breaking changes.

These rules apply to every AI-generated and human-written contribution to the photon project.
