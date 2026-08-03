# Test Vectors

Canonical, version-controlled fixtures used to prove protocol correctness.

Vectors are the shared truth between the specification and the implementation:
a vector is added when a behaviour is specified, and the implementation is
considered correct only when it reproduces the vector byte for byte.

## Layout

| Directory    | Contents                                             | Specification           |
| ------------ | ---------------------------------------------------- | ----------------------- |
| `packets/`   | Serialized packet fixtures (header, payload, footer) | `docs/PACKET_SPEC.md`   |
| `manifests/` | Manifest fixtures                                    | `docs/PROTOCOL_SPEC.md` |
| `sessions/`  | Session handshake and resume fixtures                | `docs/PROTOCOL_SPEC.md` |
| `qr/`        | Encoded QR payload fixtures                          | `docs/QR_SPEC.md`       |

## Rules

1. Vectors are immutable once published. A protocol change adds a new vector
   rather than editing an existing one.
2. Every vector records the protocol version it belongs to.
3. Vectors are generated, never hand-written.

## Regenerating

Packet vectors are produced by the suite that checks them:

```bash
UPDATE_PACKET_VECTORS=1 npm test -- packetVectors
```

Regeneration is deliberately an explicit act. On an ordinary run the suite only
compares, so a wire-format change that was not intended fails the build.

**If a vector changes, the specification should have changed first**
(`AGENTS.md` §7). A diff here with no matching diff in `docs/PACKET_SPEC.md` is
a defect, not an update.

Populated from Phase 3 (Packet Layer) onwards.
