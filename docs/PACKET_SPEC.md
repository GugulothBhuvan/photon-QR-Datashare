# 05_PACKET_SPEC.md

# Binary Packet Specification (BPS)

**Document Version:** 1.0

**Status:** Draft

**Related Documents**

- 04_PROTOCOL_SPEC.md
- 06_QR_SPEC.md
- 07_SECURITY.md

---

# 1. Purpose

This document defines the binary representation of every packet transmitted using the photon Protocol (OSP).

Unlike `PROTOCOL_SPEC.md`, this document does **not** define protocol behavior.

It specifies:

- Binary layouts
- Header fields
- Payload formats
- Serialization rules
- Parsing rules
- Validation rules

Protocol semantics SHALL be referenced from `04_PROTOCOL_SPEC.md`.

---

# 2. Design Goals

The packet format has been designed to satisfy the following goals:

- Compact binary representation
- Fast serialization
- Fast parsing
- Deterministic decoding
- Forward compatibility
- Extensibility
- Platform independence

---

# 3. Binary Encoding Rules

Unless otherwise specified:

| Type    | Encoding    |
| ------- | ----------- |
| UInt8   | 1 Byte      |
| UInt16  | 2 Bytes     |
| UInt32  | 4 Bytes     |
| UInt64  | 8 Bytes     |
| Boolean | UInt8 (0/1) |
| UUID    | 16 Bytes    |
| String  | UTF-8       |
| Binary  | Raw Bytes   |

All multi-byte integers SHALL use **Big Endian** encoding.

---

# 4. Universal Packet Structure

Every packet SHALL use the following layout.

```text
+------------------------------------------------+
| Fixed Header                                   |
+------------------------------------------------+
| Payload (Variable Length)                      |
+------------------------------------------------+
| Footer                                         |
+------------------------------------------------+
```

The header and footer remain identical for all packet types.

Only the payload varies.

---

# 5. Common Header

| Offset | Size | Field            |
| ------ | ---- | ---------------- |
| 0      | 2    | Magic Number     |
| 2      | 1    | Protocol Version |
| 3      | 1    | Packet Type      |
| 4      | 2    | Flags            |
| 6      | 16   | Session ID       |
| 22     | 16   | File ID          |
| 38     | 4    | Packet Index     |
| 42     | 4    | Total Packets    |
| 46     | 4    | Payload Length   |

**Header Size:** 50 Bytes

---

# 6. Footer

| Offset   | Size | Field              |
| -------- | ---- | ------------------ |
| Variable | 4    | CRC32              |
| Variable | 32   | SHA-256 (Optional) |

Footer size depends on protocol configuration.

---

# 7. Packet Registry

| Packet ID | Name                  |
| --------- | --------------------- |
| 0x01      | Handshake             |
| 0x02      | Handshake Response    |
| 0x03      | Manifest              |
| 0x04      | Manifest Continuation |
| 0x05      | Data                  |
| 0x06      | Recovery              |
| 0x07      | Resume                |
| 0x08      | Resume Response       |
| 0x09      | Complete              |
| 0x0A      | Error                 |
| 0x0B      | Cancel                |
| 0x0C      | Keep Alive            |
| 0x0D      | Capability            |

Packet semantics are defined in `PROTOCOL_SPEC.md`.

---

# 8. Packet Flags

| Bit  | Meaning             |
| ---- | ------------------- |
| 0    | Compression Enabled |
| 1    | Encryption Enabled  |
| 2    | Final Packet        |
| 3    | Recovery Packet     |
| 4    | Resume Packet       |
| 5    | High Priority       |
| 6-15 | Reserved            |

Reserved bits SHALL be zero.

---

# 9. Packet Layouts

## 9.1 Handshake

```text
Header

↓

Capabilities

↓

Footer
```

Payload

| Field             | Type   |
| ----------------- | ------ |
| Supported Version | UInt8  |
| Capability Bitmap | UInt32 |

---

## 9.2 Manifest

```text
Header

↓

Manifest Data

↓

Footer
```

Payload

| Field      | Type     |
| ---------- | -------- |
| File Count | UInt16   |
| Metadata   | Variable |

Manifest format is defined in `PROTOCOL_SPEC.md`.

---

## 9.3 Data Packet

```text
Header

↓

Binary Payload

↓

Footer
```

Payload

Raw binary bytes.

No additional metadata.

---

## 9.4 Recovery Packet

```text
Header

↓

Recovery Information

↓

Footer
```

Payload

Recovery metadata as defined in `PROTOCOL_SPEC.md`.

---

## 9.5 Resume Packet

```text
Header

↓

Resume State

↓

Footer
```

---

## 9.6 Completion Packet

Contains no payload.

```text
Header

↓

Footer
```

---

## 9.7 Error Packet

Payload

| Field      | Type   |
| ---------- | ------ |
| Error Code | UInt16 |
| Message    | UTF-8  |

---

# 10. Serialization Rules

Serialization SHALL occur in the following order.

```text
Header

↓

Payload

↓

Footer
```

Every field SHALL be serialized exactly once.

Field ordering SHALL remain fixed.

---

# 11. Parsing Rules

Parsing SHALL occur in the following order.

```text
Header

↓

Header Validation

↓

Payload

↓

Footer

↓

Integrity Validation
```

Packets failing validation SHALL be discarded.

---

# 12. Validation Rules

Every received packet SHALL be validated.

Validation includes:

- Magic Number
- Version
- Packet Type
- Payload Length
- Session ID
- CRC
- Packet Index

Protocol validation SHALL follow `PROTOCOL_SPEC.md`.

---

# 13. Binary Examples

Example Header

```text
Magic Number      0x4F53
Version           0x01
Packet Type       0x05
Flags             0x0003
Session ID        72E8...
File ID           91AB...
Packet Index      000012
Total Packets     000874
Payload Length    000960
```

Example Data Packet

```text
+----------------------+
| Header               |
+----------------------+
| 960 Bytes Payload    |
+----------------------+
| CRC32                |
+----------------------+
```

---

# 14. Reserved Fields

Reserved fields SHALL:

- Be initialized to zero.
- Be ignored by receivers.
- Be preserved where applicable.

Future protocol versions MAY define additional meanings.

---

# 15. References

- `04_PROTOCOL_SPEC.md`
- `06_QR_SPEC.md`
- `07_SECURITY.md`

---

# Appendix A — Implementation Notes

Recommended implementation approach:

- Use immutable packet objects.
- Validate before parsing payload.
- Avoid unnecessary memory copies.
- Prefer streaming serialization.
- Keep packet parsing independent of QR decoding.
- Separate transport from packet processing.

These recommendations are non-normative.
