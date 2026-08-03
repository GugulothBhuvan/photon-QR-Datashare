# 06_QR_SPEC.md

# QR Transport Specification (QTS)

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 04_PROTOCOL_SPEC.md
- 05_PACKET_SPEC.md
- 07_SECURITY.md

---

# 1. Purpose

This document specifies the optical transport layer of the photon Protocol (OSP).

It defines how binary packets are encoded into QR codes, displayed on a sender device, captured by a receiver, and decoded back into their original binary representation.

This specification is transport-specific and SHALL NOT define protocol behavior.

---

# 2. Scope

This document covers:

- QR generation
- QR rendering
- Frame scheduling
- Frame timing
- QR decoding
- Adaptive transport
- Rendering recommendations

It does not define:

- Packet structure
- Protocol semantics
- Encryption
- Compression

---

# 3. Design Goals

The QR transport SHALL:

- Be deterministic.
- Be offline.
- Maximize decode reliability.
- Minimize transfer time.
- Support adaptive optimization.
- Remain platform independent.

---

# 4. Transport Pipeline

Sender

```text id="r8l4mn"
Binary Packet

↓

QR Encoder

↓

Frame Scheduler

↓

Display
```

Receiver

```text id="q3xfpt"
Camera

↓

QR Detection

↓

QR Decoder

↓

Binary Packet
```

The transport layer SHALL preserve packet identity.

---

# 5. QR Encoding

Each protocol packet SHALL be encoded into one QR frame.

If a packet exceeds the selected QR capacity, it SHALL be fragmented according to the Protocol Specification.

QR encoding SHALL preserve binary payloads exactly.

---

# 6. QR Versions

Supported QR versions are implementation-defined.

The encoder SHOULD automatically select the smallest version capable of containing the packet payload.

Larger versions MAY be selected to improve scanning reliability.

---

# 7. Error Correction

Supported error correction levels:

| Level | Description |
| ----- | ----------- |
| L     | Low         |
| M     | Medium      |
| Q     | Quartile    |
| H     | High        |

The sender MAY automatically adjust the error correction level based on environmental conditions.

The receiver SHALL support all advertised levels.

---

# 8. Frame Scheduling

Frames SHALL be displayed sequentially.

Example:

```text id="56l4zu"
Frame 0

↓

Frame 1

↓

Frame 2

↓

Frame 3

↓

...
```

Packet ordering SHALL be preserved.

---

# 9. Frame Timing

The sender SHALL support configurable frame durations.

Recommended defaults:

| Mode     | Frame Duration |
| -------- | -------------- |
| Fast     | 100 ms         |
| Balanced | 200 ms         |
| Reliable | 350 ms         |

Actual values MAY be adapted at runtime.

---

# 10. Adaptive Transport

The sender MAY adapt transport parameters during a transfer.

Adjustable parameters include:

- QR Version
- Error Correction Level
- Frame Duration
- Frame Brightness Recommendation

Adaptive changes SHALL NOT modify packet contents.

---

# 11. Display Requirements

The sender SHOULD:

- Use maximum practical screen brightness.
- Render high-contrast QR codes.
- Prevent screen sleep.
- Maintain fixed orientation during transmission.

UI overlays SHOULD NOT obscure QR codes.

---

# 12. Camera Requirements

The receiver SHOULD:

- Continuously capture frames.
- Maintain autofocus.
- Optimize exposure.
- Decode frames as quickly as practical.

Missed frames SHALL be handled by the protocol layer.

---

# 13. QR Rendering

Rendering guidelines:

- Black foreground.
- White background.
- Quiet zone preserved.
- Square aspect ratio.
- No distortion.
- No transparency.

Implementations SHOULD avoid visual effects that reduce readability.

---

# 14. QR Detection

The decoder SHALL:

- Detect QR symbols.
- Correct perspective distortion where supported.
- Decode payload bytes.
- Validate QR integrity.

Decoded payloads SHALL be forwarded unchanged to the Packet Layer.

---

# 15. Transport Modes

Recommended modes:

| Mode     | Description            |
| -------- | ---------------------- |
| Fast     | Maximum throughput     |
| Balanced | General-purpose        |
| Reliable | High redundancy        |
| Adaptive | Automatic optimization |

The selected mode SHALL affect transport parameters only.

---

# 16. Performance Recommendations

Implementations SHOULD:

- Minimize dropped frames.
- Maximize decode success rate.
- Reuse rendering buffers.
- Avoid unnecessary bitmap allocations.

Rendering optimizations SHALL remain transparent to higher layers.

---

# 17. Compatibility

The QR transport SHALL remain compatible across:

- Android
- iOS

Future transports MAY replace QR codes while preserving the Protocol Layer.

Examples include:

- Color QR
- Visible Light Communication
- Dynamic Optical Codes

---

# 18. Validation

Every decoded frame SHALL be validated before being forwarded to the Packet Layer.

Validation includes:

- Successful QR decode.
- Payload extraction.
- Basic transport integrity.

Packet validation is defined in `05_PACKET_SPEC.md`.

---

# 19. Future Extensions

Future transport enhancements MAY include:

- Color QR codes.
- Multi-frame symbols.
- Adaptive QR density.
- HDR-aware rendering.
- AI-assisted decoding.
- Hardware acceleration.

Such extensions SHALL preserve compatibility with the photon Protocol.

---

# Appendix A — Implementation Recommendations

Recommended implementation practices:

- Automatically benchmark device capabilities during session initialization.
- Dynamically adjust frame timing.
- Prefer hardware-accelerated QR generation where available.
- Perform QR decoding using native libraries.
- Separate rendering from protocol execution.
- Maintain a configurable transport profile for different device classes.

These recommendations are informative and do not define normative protocol behavior.
