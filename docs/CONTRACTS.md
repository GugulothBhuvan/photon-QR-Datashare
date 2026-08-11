# CONTRACTS.md

# Core Contracts Register

**Status:** Living Document

---

# 1. Purpose

A **contract** is an interface the protocol engine depends on but does not
implement. Contracts are how the engine stays deterministic and platform
independent: everything it needs from the outside world — time, randomness,
storage, a camera, a hash — arrives through one of these, supplied by the
composition root.

This register exists so that the cost of changing one is visible before it is
paid. A module can be rewritten freely; a contract cannot, because everything
on both sides of it depends on the shape staying still.

## 1.1 Where they live

```text
src/core/contracts/     Clock, IdGenerator, IntegrityVerifier, Logger, PacketCodec,
                        PayloadCipher (provisional)
src/camera/cameraPort   CameraAdapter, CameraFrame
src/storage/ports       KeyValueStore, FileStore
src/repositories/       Repository, ValueRepository
```

`src/core/contracts` is one of only two things inside `core` that any layer may
import, the other being `@core/errors`. That exception is encoded in
`eslint.config.js` and probed by a test: contracts are pure declarations with no
implementation, and they exist precisely to be depended upon.

## 1.2 Stability levels

| Level | Meaning |
| --- | --- |
| **Stable** | Breaking changes require the full procedure in §4. Treat as frozen. |
| **Provisional** | Shape is settled but has one known consumer; may still move. |
| **Draft** | Declared ahead of its implementation; expected to change. |

---

# 2. Stable Contracts

The six below are frozen by direction. Any breaking change requires an ADR,
documentation updates and a compatibility review — see §4.

## 2.1 `Clock`

| | |
| --- | --- |
| **Purpose** | The protocol engine's only source of time. |
| **Declared in** | `src/core/contracts/clock.ts` |
| **Owner** | Core protocol |
| **Implementations** | Test clocks (controllable); `Date.now` at the composition root |
| **Stability** | **Stable** |

```ts
interface Clock {
  now(): number; // epoch milliseconds
}
```

**Why it exists.** `PROTOCOL_SPEC.md` §2.4 requires deterministic behaviour and
§22.14 makes the protocol independent of any device clock. A manager calling
`Date.now()` would satisfy neither, and its timeout behaviour could only be
tested by waiting.

**Consumers.** `SessionManager` (timeout, §8.9), the QR benchmark harness.

**Breaking-change policy.** Adding a member breaks every test double, of which
there are many. A monotonic source, if ever needed, should be a *separate*
contract rather than a second method here — the two have different guarantees
and conflating them would make `now()` ambiguous.

## 2.2 `IdGenerator`

| | |
| --- | --- |
| **Purpose** | The engine's only source of new identifiers. |
| **Declared in** | `src/core/contracts/idGenerator.ts` |
| **Owner** | Core protocol |
| **Implementations** | Counting generators (tests); a UUID source at the composition root |
| **Stability** | **Stable** |

```ts
interface IdGenerator {
  next(): string; // canonical UUID
}
```

**Why it exists.** §8.4 requires the sender to generate a unique session id and
§8.17.2 requires uniqueness. Generation needs randomness, which is the second
source of nondeterminism after time.

**Invariant.** Implementations SHALL return a canonical UUID — `PACKET_SPEC.md`
§5 carries identifiers in 16 bytes. `SessionManager` validates this and throws
on a generator that returns anything else, so a bad generator fails at session
creation rather than at serialization.

**Breaking-change policy.** Returning a branded `SessionId` instead of `string`
would be tempting and is wrong: the same generator serves transfers and files,
and a return type naming one of them would make it unusable for the others.

## 2.3 `Logger`

| | |
| --- | --- |
| **Purpose** | Diagnostics for the protocol engine. |
| **Declared in** | `src/core/contracts/logger.ts` |
| **Owner** | Core protocol |
| **Implementations** | A silent default; adapted from `src/telemetry` at the composition root |
| **Stability** | **Stable** |

```ts
interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
```

**Why it is narrower than the application logger.** The engine may not import
`src/telemetry` — the lint boundary blocks `core → telemetry`, because a logger
is a side-effecting collaborator and `planning/DEPENDENCIES.md` §4 allows the
core only domain models and utilities. The composition root adapts one to the
other.

**Constraint.** AGENTS.md §12 forbids logging file contents. Nothing in the
engine passes payload bytes to this interface, and the telemetry implementation
redacts them regardless — two independent guards.

**Breaking-change policy.** Every engine module takes this optionally and
defaults to silent, so logging can never be the reason something fails. Adding
a **required** member would break that.

## 2.4 `IntegrityVerifier`

| | |
| --- | --- |
| **Purpose** | The seam to whatever computes and checks digests. |
| **Declared in** | `src/core/contracts/integrityVerifier.ts` |
| **Owner** | Core protocol |
| **Implementations** | `createSha256Verifier` (`src/security/integrity.ts`), plus deterministic test digests. |
| **Stability** | **Stable** |

```ts
interface IntegrityVerifier {
  readonly algorithm: string;
  digest(bytes: Uint8Array): Uint8Array;
  verify(bytes: Uint8Array, expected: Uint8Array): boolean;
}
```

**Why it exists.** §3.22 defines two levels of integrity verification and §20
owns the algorithms — which have not been read. The engine needs the *verdict*
(§10.8 before accepting a manifest, §11.12.5 before storing a packet, §3.24
before completing a transfer) without computing it.

**Why `algorithm` is a member.** A manifest names its integrity algorithm
(§10.5). The verifier declaring its own lets the reconstruction layer refuse an
algorithm it cannot perform, so *verification skipped* can never be reported as
*verification passed*.

**Breaking-change policy.** Phase 11 supplied SHA-256 against this exact shape,
unchanged. If §20 turns out to require streaming digests over large files, that
is an **addition** (`createDigestStream`) rather than a change to these three
members — a file small enough to hash in one call must keep working.

**Note on synchrony.** The shape being synchronous is what ruled out
`expo-crypto` and led to implementing SHA-256 in the repository — see ADR-0004.
Making these members asynchronous would be a breaking change to a stable
contract and would ripple through reconstruction, the manifest manager and every
caller that treats verification as a step rather than an await.

## 2.5 `PacketCodec`

| | |
| --- | --- |
| **Purpose** | The seam between the Protocol layer and the Binary layer. |
| **Declared in** | `src/core/contracts/packetCodec.ts` |
| **Owner** | Core protocol |
| **Implementations** | Test codecs. The Phase 3 serializer/deserializer are wired through it by the composition root. |
| **Stability** | **Stable** |

```ts
interface PacketCodec {
  encode(packet: Packet): Uint8Array;
  decode(bytes: Uint8Array): DecodedPacket | undefined;
}

interface DecodedPacket {
  readonly packet: Packet;
  readonly integrityVerified: boolean;
}
```

**Why `integrityVerified` travels with the packet.** §11.12 has integrity
decided *before* the protocol layer stores anything. The checksum lives in the
binary layer, so the verdict must cross the seam alongside the packet — a
protocol layer that had to ask a second question would be able to forget.

**Why `decode` returns `undefined` rather than throwing.** Bytes that cannot
produce a packet are the normal case on an optical link. A packet that parsed
but failed validation is returned *with* `integrityVerified: false`, so the
protocol layer can count corrupted packets (§13.16) rather than losing them.

**Breaking-change policy.** This is the contract that makes QR replaceable
(`QR_SPEC.md` §17). Changing it would couple the protocol engine to a transport,
which is the one thing the architecture exists to prevent.

## 2.6 `CameraAdapter`

| | |
| --- | --- |
| **Purpose** | The interface through which the receive path obtains frames. |
| **Declared in** | `src/camera/cameraPort.ts` |
| **Owner** | Camera adapter layer |
| **Implementations** | `createMemoryCamera`. **No device implementation yet — Phase 8.** |
| **Stability** | **Stable** |

```ts
interface CameraAdapter {
  permission(): CameraPermission;
  requestPermission(): Promise<CameraPermission>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  onFrame(listener: FrameListener): Unsubscribe;
}
```

**Why it is the only camera concept above the adapter.** §12's requirements —
continuous capture, autofocus, exposure — are device behaviours a concrete
adapter arranges. Nothing above this interface can tell which adapter is doing
so, which is what lets the entire receive pipeline be built and tested before
any native module exists.

**Invariants.** `start()` is idempotent, because a receive screen may be
resumed more than once. Implementations throw only `AppError`
(`docs/API_SPEC.md` §12).

**Known limitation.** `CameraFrame` carries grayscale or RGBA only (A10-01).
Devices also deliver YUV planar formats; converting is the device adapter's
job. If that proves impractical, adding a `PixelFormat` member is a
**non-breaking addition** — existing consumers already switch on the format.

---

# 3. Provisional and Draft Contracts

Not covered by the §4 procedure. Listed so the distinction is explicit.

| Contract | Declared in | Purpose | Stability | Note |
| --- | --- | --- | --- | --- |
| `KeyValueStore` | `src/storage/ports.ts` | Small synchronous records | **Provisional** | One implementation; MMKV adapter pending |
| `FileStore` | `src/storage/ports.ts` | File content | **Draft** | **No implementation.** Streaming members are expected in Phase 7/10 work |
| `Repository<TId, TEntity>` | `src/repositories/repository.ts` | Persistence of domain entities | **Provisional** | Concrete repositories arrive with their entities |
| `ValueRepository<TValue>` | `src/repositories/repository.ts` | A single stored value | **Provisional** | As above |
| `QrEncoder` | `src/qr/qrEncoder.ts` | Bytes to QR matrix | **Provisional** | Stable in practice; not yet load-bearing across a boundary |
| `QrDecoder` | `src/camera/qrDecoder.ts` | Frame to payload bytes | **Provisional** | As above |

`FileStore` is deliberately unregistered in the composition root: resolving it
fails loudly rather than returning a stub that silently loses data.

---

---

# 3.1 Provisional contracts

A contract that has been declared but not yet proven by a production
implementation is **provisional**: it may change without an ADR until something
real implements it. Listing it here is what stops it being treated as frozen by
accident.

## `PayloadCipher`

| | |
| --- | --- |
| **Purpose** | The seam to whatever provides confidentiality (§19). |
| **Declared in** | `src/core/contracts/payloadCipher.ts` |
| **Owner** | Core protocol |
| **Implementations** | `createDisabledCipher` and `createUnsupportedCipher` only. **No cipher implements it.** |
| **Stability** | **Provisional** |

**Why it is not stable.** Its shape is a prediction about an algorithm nobody
has written. It assumes a cipher operates on a whole file stream synchronously,
which follows from §19.3's pipeline and §19.11's "reconstruction of the
encrypted binary stream" — but an AEAD implementation using a platform keystore
would very likely be asynchronous, and a streaming cipher would want a different
shape entirely. Freezing a contract that has never carried a real implementation
would be freezing a guess.

**What is already load-bearing.** The seam's *placement* is not provisional:
encryption happens after compression and before packetization, decryption after
reassembly and before integrity verification (§19.16.1, §19.16.2, §19.16.9).
Those positions are enforced by where the calls sit in `TransferService` and
`ReceiveService`, and they hold whatever the cipher's eventual shape.

**It becomes stable when** SI-012 is resolved and a real cipher exists.

# 4. Breaking-Change Procedure

Applies to every contract marked **Stable** in §2.

## 4.1 What counts as breaking

- Removing or renaming a member.
- Changing a parameter or return type, including widening a return to include
  `undefined`.
- Adding a **required** member — every existing implementation stops compiling,
  including every test double.
- Changing a documented invariant, such as `start()` ceasing to be idempotent.

**Not** breaking: adding an optional member; narrowing a parameter type;
documentation.

## 4.2 Required steps

1. **ADR** under `docs/decisions/`, recording what changed, why, what was
   rejected, and what it costs. If a specification drove the change, cite the
   section; if a specification *should* change, open a `SPEC_ISSUES.md` entry
   first.
2. **Documentation** — this file, and `docs/COMPATIBILITY.md` if any wire
   behaviour is affected.
3. **Compatibility review** — which builds still interoperate, and what a user
   of an older build experiences. A contract change that alters bytes on the
   wire is also a protocol change and follows `COMPATIBILITY.md` §6.
4. **Update every implementation and double in the same change.** A stable
   contract with a stale implementation is worse than either.

## 4.3 Preferred alternatives

Most pressure on a contract is better relieved another way:

| Pressure | Prefer |
| --- | --- |
| A consumer needs one more thing | A second, narrow contract |
| A member is needed only sometimes | An optional member with a documented default |
| A new transport | A new implementation of `PacketCodec` and `CameraAdapter` |
| A different algorithm | A new `IntegrityVerifier` implementation |

The architecture is built so that new capability arrives as new
implementations. Reaching for a contract change usually means the boundary is
in the wrong place, and that is worth a moment's thought before an ADR.
