/**
 * Fountain decoder (ADR-0008).
 *
 * Collects coded blocks in any order and reconstructs the payload once enough
 * have arrived. There is no notion of a missing frame: a frame that does not
 * turn up is simply one the receiver did not use.
 *
 * **Peeling.** A frame covering exactly one unsolved block *is* that block.
 * Solving it may reduce another waiting frame to one unknown, which solves
 * that, and so on — a cascade that runs until nothing more can be resolved.
 * Frames covering several unknowns wait, indexed by every block they are
 * waiting on so the cascade can find them in constant time.
 *
 * **Progress must be reported as frames collected, not blocks solved.** The
 * cascade back-loads: blocks stay flat and then resolve in a rush near the end,
 * while frame arrival is linear. A progress bar fed solved blocks looks stalled
 * and then teleports.
 */
import { frameComposition } from './composition';

/** A frame that arrived covering more than one unsolved block. */
interface PendingFrame {
  /** Blocks still unknown in this frame. */
  readonly unknown: Set<number>;
  /** The XOR of the frame, with every solved block already removed. */
  readonly words: Uint32Array;
}

export interface FountainProgress {
  /** Distinct sequence numbers accepted. */
  readonly framesAccepted: number;
  /** Frames whose sequence number had already been seen. */
  readonly framesDuplicate: number;
  /**
   * Frames that were new but carried nothing new.
   *
   * Every block they covered was already solved. Common when a receiver joins
   * late and the carousel sweeps ground it has, and worth reporting separately:
   * a progress estimate fed raw accepted frames overstates itself by exactly
   * this fraction.
   */
  readonly framesRedundant: number;
  readonly blocksSolved: number;
  readonly k: number;
  readonly complete: boolean;
}

export interface FountainDecoder {
  /**
   * Accepts one coded block.
   *
   * Ignores a sequence number already seen, and ignores anything at all once
   * complete. Never throws: a receiver feeding it frames from a camera has no
   * useful response to an exception.
   */
  accept(seq: number, block: Uint8Array): void;
  progress(): FountainProgress;
  /** The reconstructed payload, or `undefined` until every block is solved. */
  assemble(): Uint8Array | undefined;
}

export interface FountainDecoderOptions {
  readonly k: number;
  readonly blockLength: number;
  readonly totalLength: number;
  /** Must match the sender's, or the derived compositions disagree. */
  readonly sessionSeed: number;
}

export function createFountainDecoder(options: FountainDecoderOptions): FountainDecoder {
  const { k, blockLength, totalLength, sessionSeed } = options;

  const words = Math.ceil(blockLength / 4);
  const solved: (Uint32Array | undefined)[] = new Array<Uint32Array | undefined>(k).fill(undefined);

  /** Waiting frames, indexed by every block they still need. */
  const waitingOn = new Map<number, Set<PendingFrame>>();
  const seen = new Set<number>();

  let framesAccepted = 0;
  let framesDuplicate = 0;
  let framesRedundant = 0;
  let blocksSolved = 0;

  function xorInto(target: Uint32Array, source: Uint32Array): void {
    for (let word = 0; word < target.length; word += 1) {
      target[word] = ((target[word] ?? 0) ^ (source[word] ?? 0)) >>> 0;
    }
  }

  /**
   * Records a solved block and runs the cascade it may release.
   *
   * Iterative rather than recursive: a long chain would otherwise be limited by
   * the stack, and on a large transfer the chain can be thousands deep.
   */
  function resolve(firstIndex: number, firstWords: Uint32Array): void {
    const queue: [number, Uint32Array][] = [[firstIndex, firstWords]];

    while (queue.length > 0) {
      const entry = queue.pop();

      if (entry === undefined) {
        break;
      }

      const [index, value] = entry;

      if (solved[index] !== undefined) {
        continue;
      }

      solved[index] = value;
      blocksSolved += 1;

      const waiting = waitingOn.get(index);

      if (waiting === undefined) {
        continue;
      }

      waitingOn.delete(index);

      for (const frame of waiting) {
        xorInto(frame.words, value);
        frame.unknown.delete(index);

        if (frame.unknown.size === 1) {
          const remaining = frame.unknown.values().next().value;

          if (remaining !== undefined) {
            waitingOn.get(remaining)?.delete(frame);

            if (solved[remaining] === undefined) {
              queue.push([remaining, frame.words]);
            }
          }
        }
      }
    }
  }

  return {
    accept(seq, block) {
      if (seen.has(seq)) {
        framesDuplicate += 1;
        return;
      }

      seen.add(seq);
      framesAccepted += 1;

      if (blocksSolved >= k) {
        return;
      }

      const unknown = new Set(frameComposition(k, sessionSeed, seq));
      const value = new Uint32Array(words);
      new Uint8Array(value.buffer).set(block.subarray(0, blockLength));

      // Everything already known is XORed out, which is what turns a
      // high-degree frame into a low-degree one as the transfer proceeds.
      for (const index of [...unknown]) {
        const known = solved[index];

        if (known !== undefined) {
          xorInto(value, known);
          unknown.delete(index);
        }
      }

      if (unknown.size === 0) {
        framesRedundant += 1;
        return;
      }

      if (unknown.size === 1) {
        const index = unknown.values().next().value;

        if (index !== undefined) {
          resolve(index, value);
        }

        return;
      }

      const pending: PendingFrame = { unknown, words: value };

      for (const index of unknown) {
        let set = waitingOn.get(index);

        if (set === undefined) {
          set = new Set<PendingFrame>();
          waitingOn.set(index, set);
        }

        set.add(pending);
      }
    },

    progress() {
      return {
        framesAccepted,
        framesDuplicate,
        framesRedundant,
        blocksSolved,
        k,
        complete: blocksSolved >= k,
      };
    },

    assemble() {
      if (blocksSolved < k) {
        return undefined;
      }

      const out = new Uint8Array(totalLength);

      for (let index = 0; index < k; index += 1) {
        const start = index * blockLength;
        const length = Math.min(blockLength, totalLength - start);
        const block = solved[index];

        if (length > 0 && block !== undefined) {
          out.set(new Uint8Array(block.buffer, 0, length), start);
        }
      }

      return out;
    },
  };
}
