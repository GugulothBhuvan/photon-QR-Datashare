# 08_STATE_MACHINES.md

# State Machine Specification

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 03_ARCHITECTURE.md
- 04_PROTOCOL_SPEC.md
- 05_PACKET_SPEC.md

---

# 1. Purpose

This document defines the runtime state machines used by the photon system.

State machines describe the legal states of each major subsystem and the valid transitions between those states.

This document does not redefine protocol semantics.

Instead, it formalizes the execution lifecycle of the application.

---

# 2. Design Principles

All state machines SHALL satisfy the following principles.

- Deterministic.
- Event-driven.
- Single active state.
- Explicit transitions.
- Recoverable where applicable.
- Independently testable.

---

# 3. Application State Machine

```text
Launch

↓

Initializing

↓

Ready

↓

Active Transfer

↓

Completed

↓

Ready

↓

Shutdown
```

---

# 4. Sender State Machine

```text
Idle

↓

Preparing

↓

Creating Session

↓

Generating Manifest

↓

Packetizing

↓

Encoding QR

↓

Transmitting

↓

Paused

↓

Resumed

↓

Completed

↓

Idle
```

Allowed transitions:

- Idle → Preparing
- Preparing → Creating Session
- Transmitting → Paused
- Paused → Resumed
- Resumed → Transmitting
- Transmitting → Completed

---

# 5. Receiver State Machine

```text
Idle

↓

Camera Ready

↓

Scanning

↓

Receiving

↓

Validating

↓

Reconstructing

↓

Integrity Check

↓

Saving

↓

Completed

↓

Idle
```

Invalid packets SHALL NOT change the current state.

---

# 6. Session State Machine

```text
Created

↓

Handshake

↓

Active

↓

Paused

↓

Resumed

↓

Completed

↓

Expired
```

Only one Session state SHALL exist at any time.

---

# 7. Transfer State Machine

```text
Pending

↓

Running

↓

Paused

↓

Running

↓

Completed
```

Error transitions:

```text
Running

↓

Failed
```

---

# 8. Packet State Machine

```text
Generated

↓

Serialized

↓

Encoded

↓

Displayed

↓

Captured

↓

Decoded

↓

Validated

↓

Stored

↓

Consumed
```

Packet state SHALL always progress forward.

---

# 9. QR Frame State Machine

```text
Created

↓

Rendered

↓

Displayed

↓

Captured

↓

Decoded

↓

Disposed
```

Frames SHALL NOT be reused after disposal.

---

# 10. Reconstruction State Machine

```text
Waiting

↓

Collecting

↓

Complete

↓

Reconstructing

↓

Verifying

↓

Saved
```

If verification fails:

```text
Verifying

↓

Failed
```

---

# 11. Error State Machine

```text
Normal

↓

Recoverable Error

↓

Retry

↓

Normal
```

or

```text
Normal

↓

Fatal Error

↓

Terminated
```

Fatal errors SHALL terminate the affected Session.

---

# 12. State Transition Rules

Transitions SHALL:

- Be atomic.
- Be deterministic.
- Validate preconditions.
- Emit lifecycle events.
- Preserve protocol correctness.

Illegal transitions SHALL be rejected.

---

# 13. Events

Typical events include:

- SessionCreated
- ManifestReady
- PacketGenerated
- QRDisplayed
- QRCaptured
- PacketValidated
- ReconstructionStarted
- TransferCompleted
- TransferFailed

Events SHALL trigger state transitions.

---

# 14. Error Recovery

Recoverable states MAY retry operations.

Examples:

- QR Decode Failure
- Temporary Camera Loss
- Packet Timeout

Recovery SHALL preserve validated protocol state.

---

# 15. State Invariants

Every implementation SHALL satisfy the following invariants:

1. Only one active state SHALL exist per state machine.
2. State transitions SHALL be deterministic.
3. Illegal transitions SHALL be rejected.
4. Terminal states SHALL not transition except through explicit reset.
5. Every transition SHALL emit a corresponding event.
6. Recoverable errors SHALL preserve valid state.
7. Fatal errors SHALL terminate only the affected workflow.
8. State machines SHALL remain independent of UI implementation.
9. State transitions SHALL preserve protocol correctness.
10. State definitions SHALL remain consistent across all supported platforms.

---

# Appendix A — Summary

| State Machine  | Purpose                       |
| -------------- | ----------------------------- |
| Application    | Overall application lifecycle |
| Sender         | File transmission lifecycle   |
| Receiver       | File reception lifecycle      |
| Session        | Session management            |
| Transfer       | Transfer progress             |
| Packet         | Packet processing             |
| QR Frame       | Optical transport             |
| Reconstruction | File assembly                 |
| Error          | Failure handling              |

This document defines the canonical runtime state machines for photon Version 1.x.
