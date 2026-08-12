# Milestone F — Fountain optical transport

| | |
| --- | --- |
| **Decision** | ADR-0008 |
| **Analysis** | `docs/DECIMEN_COMPARISON.md` |
| **Shape** | A second engine beside the packet engine, not a replacement |

Three decisions were taken before any code was written:

1. **One file per transfer.** The packet engine keeps the multi-file manifest;
   this engine deliberately does not have one.
2. **Both engines ship.** The packet engine stays the default until a hardware
   benchmark shows the fountain engine wins on real devices.
3. **The specification consequence is recorded**, in ADR-0008, rather than left
   for someone to discover that the code no longer matches `PROTOCOL_SPEC.md`.

---

# Status

| | Item | State |
| --- | --- | --- |
| **F1** | Fountain encoder and decoder | **Done** |
| **F2** | Self-describing frame, single-file container | **Done** |
| **F3** | Multi-QR frame generation | Not started |
| **F4** | Decoding off the JS thread | Not started — same spike as E4 |
| **F5** | Backpressure | **Done** — built for the packet engine, reused unchanged |
| **F6** | Hardware benchmark | Not started |
| **F7** | Services, controllers, composition wiring | **Done** — engine selectable, packet still default |
| **F8** | Screens driving the fountain engine | Not started — the last step before F6 |

---

# F1 — The codec `[done]`

A cycle is `k` systematic frames then `k` repair frames, forever. The
systematic half means a receiver catching a clean sweep completes in **exactly
k frames with no coding overhead**, which a pure LT code cannot do.

Repair frames are uniform mid-degree rather than robust soliton, for two
reasons. After a sweep the receiver already holds most blocks, so soliton's
heavy degree-1 mass re-sends what it has. And a uniform draw needs no
logarithm — which is the load-bearing reason: `Math.log` is
implementation-approximated, and a one-ulp difference between two JavaScript
engines would shift a sampled degree and leave sender and receiver silently
disagreeing about what a frame contained. Everything in `composition.ts` is
integer arithmetic and is pinned as wire format.

Measured properties: exactly `k` frames on a clean sweep, byte-identical
reconstruction, order independence, and reconstruction through 10, 30 and 50
per cent loss with deterministic dropping so a failure is reproducible.

# F2 — Frame and container `[done]`

**Twenty bytes of header**, against the packet engine's fifty-four. Paid on
every frame, so at 512-byte blocks it is the difference between 4% and 10% of
the channel.

```text
 0  u8    magic 0x50
 1  u8    format version
 2  u16   sessionSeed
 4  u32   seq
 8  u16   k
10  u16   blockLength
12  u32   totalLength
16  u32   payloadCrc
20  ...   coded block
```

Every frame carries the whole shape of the transfer, so **there is no preamble
to miss**. A receiver decoding any single frame can begin collecting from it.

`streamIdentity` is every field except `seq`, and a receiver resets on any
disagreement rather than only on a new session: the session is sixteen bits, so
a collision across a restart is unlikely but real, and a foreign frame XORed
into an existing decoder corrupts it silently until the final checksum fails.

The container carries name, media type and SHA-256 **inside** the payload, so
metadata arrives through the same rateless mechanism as the bytes. The digest
is over the content, so it stays meaningful if compression is added later. The
digest is *supplied* rather than computed: the core layer may not reach into
`@security`, and which algorithm verifies a transfer is the composition root's
decision.

Received names are sanitised on the way out, not only on the way in — the name
is whatever the other screen chose to send.

---

# F3 — Multiple codes on screen `[not started]`

The largest untapped multiplier, and it changes no wire byte: each code is a
different sequence number. Two pieces of work — laying out *n* codes with
staggered flips so one exposure cannot catch every code mid-transition, and a
receiver that finds several symbols per frame, which the crop tracking from E5
already provides the machinery for.

# F4 — Decoding off the JS thread `[not started]`

Unchanged from E4, including the finding that the easy path is closed:
VisionCamera 5's native scanner returns `value?: string` with no byte accessor,
which is SI-013 one library later. Spike a worklet runtime hosting jsQR first;
fall back to a native plugin over ZXing or MLKit if it cannot host one.

# F6 — Hardware benchmark `[not started]`

The decision point. Both engines ship until a device says which is faster, and
until then nothing in `HARDWARE_VALIDATION.md` moves off `UNMEASURED`.

# F7 — Services and wiring `[done]`

`fountainSendService` turns one file into an **endless** stream of QR frames.
Endless is the load-bearing word: the packet engine prepares a finite frame
list and loops it, so what it will ever show is known before it starts. Here
the sender emits sequence numbers until the user stops and the receiver decides
when it has enough, so frames are encoded **on demand** — encoding ahead would
mean deciding a length the protocol does not have.

`fountainReceiveService` starts knowing nothing. No session id is passed in
because there is nothing to pass: the first frame it decodes carries the block
count, the block length, the payload length and the checksum, and it begins
from there. That is the whole difference from `receiveService.ts`, which must
be handed a session whose manifest has already been accepted and therefore
cannot begin until discovery has caught a preamble.

Frames from another transfer are **detected, not ignored**, and counted. A
foreign block XORed into a decoder is undetectable until the final checksum
fails, so a user pointing a camera at two senders can see why nothing
progresses.

Failure is an outcome rather than a warning attached to a delivered file:
`CHECKSUM_FAILED`, `UNREADABLE` and `INTEGRITY_FAILED` are distinct, and §20.14
forbids presenting a file that did not verify.

Both engines are built whichever is selected — they share the camera, the
decoder and the QR layer, so carrying both costs a little memory and nothing
else, and it is what makes F6 a measurement rather than an assertion.
`engine` defaults to `PACKET`.

## Proven across the real optical path

`tests/integration/fountainOptical.test.ts` drives the real services from the
real composition root through the **same rasteriser and the same jsQR decoder
the packet engine uses**, so the two differ in transport and nothing else and a
later measurement is attributable:

- reconstructs, verifies against the container digest, keeps its name
- completes **having never seen the start of the stream** — the property the
  packet engine cannot have at all
- reconstructs with every third frame never captured
- reports progress from the first frame read
- counts foreign frames rather than corrupting itself
- refuses a block length past QR capacity before displaying anything
