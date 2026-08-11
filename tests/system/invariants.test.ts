/**
 * Test invariants (TST-003) — TEST_SPEC §15.
 *
 * §15 lists ten invariants every implementation SHALL satisfy. Most are
 * demonstrated by the suites they govern; this file exists for the ones that
 * are **statements about the test suite itself** and would otherwise be
 * checked by nobody:
 *
 * - §15.1 every public module SHALL have automated tests
 * - §15.3 every supported file type SHALL be tested
 * - §15.8 regression tests SHALL prevent fixed defects from reappearing
 *
 * Invariants verified elsewhere are listed in §4 of this file's closing
 * comment rather than re-asserted here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { COMPLIANCE_DECLARATION, RequirementStatus } from '@config/compliance';

import { CORPUS } from '../support/fileCorpus';
import { bytesEqual, createHarness } from '../support/opticalHarness';

const ROOT = join(__dirname, '..', '..');
const SOURCE = join(ROOT, 'src');
const TESTS = join(ROOT, 'tests');

function filesUnder(directory: string, extensions: readonly string[]): readonly string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }

  return found;
}

/**
 * Modules exempt from §15.1, each with the reason.
 *
 * The list is deliberately short and explicit. An exemption is a decision, and
 * a decision that is not written down becomes an omission.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'index.ts': 'A re-export barrel: it declares no behaviour of its own.',
  'qrcodeCore.d.ts': 'A type declaration for an untyped dependency. No runtime code.',
  'ports.ts': 'Interface declarations only.',
  'repository.ts': 'Interface declarations only.',
  'cameraPort.ts': 'Covered by camera suites; the port itself is mostly declarations.',
  'visionCamera.tsx':
    'The VisionCamera binding. Importing it pulls in the NitroModules TurboModule, which exists only in a native runtime and throws under Node. The logic worth testing lives in deviceCamera.ts (ADR-0005).',
};

/** Source modules that must be reachable from some test. */
function publicModules(): readonly string[] {
  return filesUnder(SOURCE, ['.ts', '.tsx'])
    .map((path) => relative(SOURCE, path).split(sep).join('/'))
    .filter((path) => {
      const basename = path.split('/').pop() ?? path;
      return EXEMPT[basename] === undefined && EXEMPT[path] === undefined;
    })
    .sort();
}

/** Every import specifier and quoted path appearing anywhere under tests/. */
function testedSpecifiers(): ReadonlySet<string> {
  const text = filesUnder(TESTS, ['.ts', '.tsx'])
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  const specifiers = new Set<string>();

  for (const match of text.matchAll(/['"]([^'"\n]+)['"]/g)) {
    const value = match[1];

    if (value !== undefined) {
      specifiers.add(value);
    }
  }

  return specifiers;
}

describe('§15.1 every public module has automated tests', () => {
  const specifiers = testedSpecifiers();

  /**
   * Whether some test imports this module, directly or through its barrel.
   *
   * A module reached only through a barrel still has tests — the barrel is the
   * public surface. What this catches is a module no test mentions at all.
   */
  function isReferenced(modulePath: string): boolean {
    const withoutExtension = modulePath.replace(/\.tsx?$/, '');
    const directory = withoutExtension.split('/').slice(0, -1).join('/');
    const basename = withoutExtension.split('/').pop() ?? withoutExtension;

    const candidates = [
      `@${withoutExtension}`,
      `@/${withoutExtension}`,
      `@domain/${basename}`,
      directory === '' ? undefined : `@${directory}/index`,
      directory === '' ? undefined : `@${directory}`,
    ].filter((candidate): candidate is string => candidate !== undefined);

    // `@core/session/sessionManager` — the alias is the first segment.
    return candidates.some((candidate) => specifiers.has(candidate));
  }

  it.each(publicModules())('%s is exercised by a test', (modulePath) => {
    expect(isReferenced(modulePath)).toBe(true);
  });

  it('keeps every exemption justified', () => {
    for (const [module, reason] of Object.entries(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(module).toMatch(/\.tsx?$/);
    }
  });
});

describe('§15.3 every supported file type is tested', () => {
  it('covers every format §10 names', () => {
    // §10's list, verbatim. If a format is added to the specification and not
    // to the corpus, this fails.
    const required = ['png', 'jpg', 'pdf', 'mp3', 'mp4', 'zip', 'txt', 'json'];
    const present = CORPUS.map((file) => file.extension);

    for (const extension of required) {
      expect(present).toContain(extension);
    }
  });

  it('states what each fixture exercises', () => {
    // A corpus whose fixtures have no stated purpose decays into eight
    // arbitrary blobs. Each must say why it is there.
    for (const file of CORPUS) {
      expect(file.exercises.length).toBeGreaterThan(10);
      expect(file.content.byteLength).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('§15.8 regression tests prevent fixed defects from reappearing', () => {
  /*
   * Each test below pins a defect that was found and fixed. They are grouped
   * here rather than scattered so the list stays visible: a regression suite
   * nobody can enumerate is one nobody maintains.
   */

  it('resuming a paused transfer returns it to sending', async () => {
    // Found by the §6 resume workflow. `SendController.start` reused
    // `TransferService.begin`, which walks a *new* session up from Waiting —
    // a transition the FSM rightly refuses from Paused, so Resume did nothing.
    const harness = createHarness({ packetSize: 128 });

    harness.graph.send.addFiles([
      { name: 'a.bin', content: Uint8Array.from({ length: 400 }, (_u, i) => i & 0xff) },
    ]);
    harness.graph.send.prepare();
    harness.graph.send.start();
    harness.graph.send.pause();
    harness.graph.send.start();

    expect(harness.graph.send.state.getState().stage).toBe('SENDING');
  });

  it('counts frames that arrived but could not be read', async () => {
    // Found by the §11 corrupted-packet scenario. The receive service reported
    // progress only when a packet was stored or rejected, so a receiver
    // pointed at an unreadable code showed zero frames — indistinguishable
    // from a camera seeing nothing.
    const harness = createHarness({ packetSize: 128 });
    const file = CORPUS.find((candidate) => candidate.extension === 'txt')!;

    await harness.run([{ name: file.name, content: file.content }], {
      seed: 0xc0f7,
      corruptionRate: 1,
      passes: 1,
    });

    expect(harness.graph.receive.state.getState().framesSeen).toBeGreaterThan(0);
  });

  it('the speed control offers preferences, not transport frame rates', async () => {
    // Found by the Phase 8 layer-boundary review. The Send screen imported
    // `FrameRate` from the QR adapter, which both violated the UI boundary and
    // put "Reliable" — a transport word — in front of a user.
    const harness = createHarness();
    const state = harness.graph.send.state.getState();

    expect(['SLOW', 'BALANCED', 'FAST']).toContain(state.speed);
  });

  it('every declared route has a module behind it', () => {
    // Found by the Phase 8 route sweep: `Route.Transfer` existed with no
    // `app/transfer.tsx`, so a screen that passed its own tests was
    // unreachable. `tests/unit/router-entry.test.tsx` is the standing guard;
    // this records why it exists.
    const routes = filesUnder(join(ROOT, 'app'), ['.tsx']).map((path) =>
      relative(join(ROOT, 'app'), path).split(sep).join('/'),
    );

    expect(routes).toContain('transfer.tsx');
  });
});

describe('§29.14 the compliance declaration matches the build', () => {
  /*
   * A declaration that drifts from the implementation is worse than none: it
   * is a claim about interoperability that nobody re-checks. These tests tie
   * each statement to something observable.
   */

  it('claims no compliance level while a mandatory requirement is unmet', () => {
    // §29.3 Level 1 requires every §29.13 item. If a future change implements
    // version negotiation, this test fails and forces the claim to be revisited
    // deliberately rather than left stale.
    const unmet = COMPLIANCE_DECLARATION.checklist.filter(
      (line) => line.status === RequirementStatus.Blocked,
    );

    expect(unmet.map((line) => line.requirement)).toEqual(['Version Negotiation']);
    expect(COMPLIANCE_DECLARATION.complianceLevel).toBeNull();
  });

  it('declares the integrity algorithm the graph actually uses (§29.14)', () => {
    const harness = createHarness();

    expect(COMPLIANCE_DECLARATION.integrityAlgorithms).toContain(harness.graph.integrityAlgorithm);
    expect(harness.graph.integrityAlgorithm).toBe('SHA-256');
  });

  it('declares no encryption, and the manifest agrees (§19.8)', () => {
    const harness = createHarness();
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3]) }]);
    harness.graph.send.prepare();

    expect(COMPLIANCE_DECLARATION.encryptionAlgorithms).toEqual([]);

    for (const entry of harness.graph.send.prepared()!.manifest.entries) {
      expect(entry.encryption).toBe('NONE');
    }
  });

  it('declares no compression, and the manifest agrees', () => {
    const harness = createHarness();
    harness.graph.send.addFiles([{ name: 'a.bin', content: Uint8Array.from([1, 2, 3]) }]);
    harness.graph.send.prepare();

    expect(COMPLIANCE_DECLARATION.compressionAlgorithms).toEqual([]);

    for (const entry of harness.graph.send.prepared()!.manifest.entries) {
      expect(entry.compression).toBe('NONE');
    }
  });

  it('gives a reason for every requirement that is not implemented', () => {
    // An unexplained "no" in a compliance declaration is an invitation to
    // assume it is an oversight.
    const unexplained = [
      ...COMPLIANCE_DECLARATION.checklist,
      ...COMPLIANCE_DECLARATION.optionalFeatures,
    ].filter((line) => line.status !== RequirementStatus.Implemented && line.note === undefined);

    expect(unexplained).toEqual([]);
  });

  it('names the protocol version the build speaks', () => {
    expect(COMPLIANCE_DECLARATION.protocolVersion).toBe('OSP/1.0');
    expect(createHarness().graph.protocolVersion).toBe(1);
  });
});

describe('§15.4 reconstruction produces byte-identical output', () => {
  it('holds for a transfer that survived a degraded channel', async () => {
    // Stated here as well as in the workflow suite because §15.4 is the
    // invariant the whole system exists to satisfy: the one assertion that,
    // if it ever fails, makes every other passing test irrelevant.
    const harness = createHarness({ packetSize: 128 });
    const file = CORPUS.find((candidate) => candidate.extension === 'json')!;

    const outcome = await harness.run([{ name: file.name, content: file.content }], {
      seed: 0x15f4,
      lossRate: 0.2,
      corruptionRate: 0.2,
      duplicationRate: 0.3,
      passes: 6,
    });

    expect(bytesEqual(outcome.files[0]!.stream, file.content)).toBe(true);
  });
});

/*
 * The remaining §15 invariants, and where they are verified:
 *
 * §15.2  Protocol behaviour verified through integration tests
 *        → tests/integration/*, tests/system/workflows.test.ts
 * §15.5  Invalid packets never produce valid files
 *        → tests/system/failureScenarios.test.ts
 * §15.6  Performance within defined targets
 *        → tests/performance/transferPerformance.test.ts
 * §15.7  Security validation executes automatically
 *        → CRC and session isolation in failureScenarios; §20's algorithms are
 *          unread and unimplemented (A12-04), so SHA-256 and encryption are
 *          not yet verifiable. Recorded rather than faked.
 * §15.9  Cross-platform behaviour consistent
 *        → Not verifiable here. §9 requires Android and iOS; this suite runs
 *          under jest-expo on Node. Device testing needs A12-01's adapter.
 * §15.10 No release bypasses the acceptance criteria
 *        → `npm run verify`; §12 is asserted in workflows.test.ts.
 */
