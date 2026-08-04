/**
 * A machine has two heads, and they are not interchangeable.
 *
 * Everything asserted here is read off `docs/woodtron-dialect.md` — twenty-one `.nc` files from one
 * real job — rather than reasoned out from first principles. That is the difference between this
 * file and `tests/cam.test.ts`, whose own header is careful to say it proves geometry and not
 * dialect. **These are the first dialect assertions in the suite that come from a program the
 * machine actually runs.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ## The four figures, longhand, on the 16.3mm carcass sheet
 *
 * Straight off §2 of the dialect doc. Every one of these Z values appears literally in the files:
 *
 *                              programmed Z      = thickness + height
 *   drill head, rapid plane        Z46.3         = 16.3 + 30
 *   router head, rapid plane       Z36.3         = 16.3 + 20      ← ten lower, and it is not a typo
 *   either head, plunge clearance  Z26.3         = 16.3 + 10
 *   a drill going right through    Z0.0          = 16.3 − 16.3    ← stops exactly at the table
 *   the router taking a part out   Z-0.2         = 16.3 − 16.5    ← 0.2 into the spoilboard
 *
 * The last two are the pair worth staring at. **A through drill and a through route do not finish
 * at the same Z**, and the reason is not a preference: a drill that overcut would be putting a Ø5
 * hole in the bed on every through-hole, hundreds of times a sheet, where the router's 0.2 is a
 * single pass round each part. So the overcut is a property of the *head*, not of the machine.
 *
 * ## The work offsets, and why they are the finding that matters most
 *
 *   G54   MULTIDRILL ORIGIN
 *   G55   ROUTER ORIGIN
 *
 * The two heads are bolted to the same gantry in different places and the machine keeps a separate
 * origin for each. A post that writes one origin for both puts **every hole wrong relative to every
 * cut**, by the distance between the heads — and the file it writes is perfectly plausible: every
 * coordinate is a number the machine accepts, every part is the right size, and the holes are
 * simply somewhere else. There is no assertion about part size that catches it, which is why the
 * assertion below is about which word is written and when.
 *
 * ## The spindle map, §6
 *
 * Solved from `B6`–`B15`, which carry enough variety to pin it where the first five files did not.
 * Spindle *n* sits at (n − 1) × 32 along X, and `B<n>` is a bitmask with bit n − 1:
 *
 *   D5 1        spindle 1    X0      B1        = 2^0
 *   D5 21       spindle 2    X32     B3        = 2^0 + 2^1     (two spindles firing)
 *   D5 51234    spindle 5    X128    B31       = 2^0..2^4      (five, one plunge, System 32)
 *   D3 7        spindle 7    X192    B64       = 2^6
 *   D10 16      spindle 16   Y160    B32768    = 2^15          ← second row, other axis
 *   D35 17      spindle 17   Y192    B65536    = 2^16
 *
 * **And the one thing it does not settle**, which is why the bank is still switched off: whether a
 * programmed coordinate positions the *reference spindle* or the *head origin*. Both readings give
 * identical holes for a symmetric pattern and differ by 128mm for an asymmetric one, and every
 * drilled row in the twenty-one files is symmetric. No amount of re-reading them answers it.
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  GENERIC_ISO_ROUTER,
  KDT_NESTING_ROUTER,
  MACHINE_PROFILES,
  WOODTRON_DRILL_BANK_WITHOUT_DATUM,
  WOODTRON_NESTING_ROUTER,
} from '../src/core/library/machines.ts';
import { findToolOrNull } from '../src/core/library/tools.ts';
import {
  type MachineProfile,
  type MachineTool,
  bitmaskSelect,
  drillRow,
  headOf,
  spindlesOfDiameter,
  throughDepth,
  zAtDepth,
  zClearance,
  zPlunge,
} from '../src/core/post/machine.ts';
import { writeSheetProgram } from '../src/core/post/iso.ts';
import type { Operation, SheetProgram } from '../src/core/cam/operation.ts';

const WOODTRON = WOODTRON_NESTING_ROUTER;
/** The carcass sheet the dialect doc's figures are all quoted on. */
const CARCASS = mm(16.3);

// ── The two heads ────────────────────────────────────────────────────────────────────────────

describe('the two heads, read off twenty-one real programs', () => {
  it('rapids the drill head ten millimetres higher than the router', () => {
    expect(WOODTRON.heads.drill.clearanceHeight).toBe(30);
    expect(WOODTRON.heads.router.clearanceHeight).toBe(20);
  });

  it('puts each head’s rapid plane at the Z the files actually contain', () => {
    // The two figures that are literally in the programs, on the 16.3 sheet.
    expect(zClearance(WOODTRON, 'drill', CARCASS)).toBeCloseTo(46.3, 9);
    expect(zClearance(WOODTRON, 'router', CARCASS)).toBeCloseTo(36.3, 9);
  });

  it('drops both heads to the same plunge clearance, which is the one figure they share', () => {
    expect(zPlunge(WOODTRON, 'drill', CARCASS)).toBeCloseTo(26.3, 9);
    expect(zPlunge(WOODTRON, 'router', CARCASS)).toBeCloseTo(26.3, 9);
  });

  it('gives the multidrill G54 and the router G55', () => {
    expect(WOODTRON.heads.drill.workOffset).toBe('G54');
    expect(WOODTRON.heads.router.workOffset).toBe('G55');
  });

  it('never leaves a work offset in a preamble, where it could only ever be one of the two', () => {
    for (const profile of MACHINE_PROFILES) {
      const offsets = profile.preamble.filter((line) => /^G5[4-9]\b/.test(line));
      expect(offsets, `${profile.name} preamble`).toEqual([]);
    }
  });

  it('gives every profile both heads, so nothing downstream has to ask whether it has two', () => {
    for (const profile of MACHINE_PROFILES) {
      expect(profile.heads.router, profile.name).toBeDefined();
      expect(profile.heads.drill, profile.name).toBeDefined();
    }
  });
});

// ── Through a drill and through a router are different depths ────────────────────────────────

describe('a through drill stops at the table; a through route goes past it', () => {
  it('finishes a Woodtron through-hole at exactly Z0', () => {
    // 16.3 − (16.3 + 0) = 0. The files say `G1 Z0.0` and this is why.
    const depth = throughDepth(WOODTRON, 'drill', CARCASS, CARCASS, true);
    expect(zAtDepth(WOODTRON, depth, CARCASS)).toBeCloseTo(0, 9);
  });

  it('finishes a Woodtron through-cut 0.2 inside the spoilboard', () => {
    const depth = throughDepth(WOODTRON, 'router', CARCASS, CARCASS, true);
    expect(zAtDepth(WOODTRON, depth, CARCASS)).toBeCloseTo(-0.2, 9);
  });

  it('is a difference between the heads, not a coincidence of one machine', () => {
    // Asserted as an inequality so that setting the two equal — on any profile — fails here.
    for (const profile of MACHINE_PROFILES) {
      expect(profile.heads.drill.throughOvercut, `${profile.name} drill overcut`).toBe(0);
    }
    expect(WOODTRON.heads.router.throughOvercut).toBeGreaterThan(0);
    expect(KDT_NESTING_ROUTER.heads.router.throughOvercut).toBeGreaterThan(0);
  });

  it('drills a hole that does not go through to exactly the depth it asked for', () => {
    // A 13mm hinge cup is 13mm deep whatever the head's overcut is.
    expect(throughDepth(WOODTRON, 'drill', mm(18), mm(13), false)).toBe(13);
  });

  it('never pulls back a hole asked deeper than the board', () => {
    /*
     * The `max` in `throughDepth`, and it is not hypothetical: a feature stating 20mm into 16mm
     * board means it, and a drill head with a zero overcut would otherwise quietly shorten it to
     * 16. A hole that does not reach is a part that goes back on the machine.
     */
    expect(throughDepth(WOODTRON, 'drill', mm(16), mm(20), true)).toBe(20);
  });
});

// ── What the writer does with them ───────────────────────────────────────────────────────────

/** A bare program with one bore and one contour, so the writer can be read line by line. */
const twoOperationProgram = (): SheetProgram => {
  const operations: Operation[] = [
    {
      kind: 'bore',
      id: 'p:hole',
      partId: 'p',
      partName: 'Test part',
      purpose: 'shelf-pin',
      at: { x: mm(100), y: mm(100) },
      diameter: mm(5),
      depth: mm(12),
      through: false,
    },
    {
      kind: 'contour',
      id: 'p:perimeter',
      partId: 'p',
      partName: 'Test part',
      purpose: 'perimeter',
      path: [
        { x: mm(0), y: mm(0) },
        { x: mm(200), y: mm(0) },
        { x: mm(200), y: mm(200) },
        { x: mm(0), y: mm(200) },
      ],
      closed: true,
      depth: mm(15.3),
      toolId: 'straight-10',
    },
  ];
  return {
    materialId: 'hmr-white-16',
    materialLabel: 'White carcass',
    sheetIndex: 1,
    sheetLength: mm(2410),
    sheetWidth: mm(1205),
    thickness: CARCASS,
    operations,
    needsSecondSetup: [],
    warnings: [],
  };
};

/** The same profile with a Ø5 drill moved onto the drill head, so a head change can be observed. */
const withDrillHead = (profile: MachineProfile): MachineProfile => {
  const bankDrill: MachineTool = {
    toolId: 'drill-5',
    pocket: 90,
    feed: 3000,
    plungeFeed: 3000,
    spindleRpm: 6000,
    maxDepthOfCut: mm(20),
    head: 'drill',
  };
  return { ...profile, tools: [...profile.tools, bankDrill] };
};

describe('the writer, and where the work offset lands', () => {
  it('says a single-head program’s offset once, and before the first retract', () => {
    const { text } = writeSheetProgram(twoOperationProgram(), KDT_NESTING_ROUTER, 'Test');
    const lines = text.split('\r\n').filter((l) => !l.startsWith('('));
    expect(lines.filter((l) => l === 'G54')).toHaveLength(1);

    /*
     * The order is load-bearing. The clearance about to be rapided to is the incoming head's, so
     * it has to be measured in the incoming head's own coordinate system — retracting first would
     * put the tool at the new head's clearance height above the old head's zero, which is a number
     * that means nothing on either. It also lands exactly where the KDT's preamble `G54` used to
     * sit, which is what keeps every already-written program unchanged.
     */
    const offsetAt = lines.indexOf('G54');
    const retractAt = lines.findIndex((l) => l.startsWith('G0 Z'));
    expect(offsetAt).toBeLessThan(retractAt);
  });

  it('writes both offsets, in order, when a program uses both heads', () => {
    const profile = withDrillHead(WOODTRON);
    const { text } = writeSheetProgram(twoOperationProgram(), profile, 'Test');
    const offsets = text.split('\r\n').filter((l) => l === 'G54' || l === 'G55');
    // Boring happens first (`orderOperations` puts it in bucket 0, while the sheet is whole), so
    // the multidrill origin comes before the router origin.
    expect(offsets).toEqual(['G54', 'G55']);
  });

  it('rapids each head to its own plane inside one program', () => {
    const profile = withDrillHead(WOODTRON);
    const { text } = writeSheetProgram(twoOperationProgram(), profile, 'Test');
    // 16.3 + 30 for the drill, 16.3 + 20 for the router. Both, in the one file.
    expect(text).toContain('G0 Z46.3');
    expect(text).toContain('G0 Z36.3');
  });

  it('keeps a router-only program off the drill head’s plane entirely', () => {
    const { text } = writeSheetProgram(twoOperationProgram(), WOODTRON, 'Test');
    expect(text).toContain('G0 Z36.3');
    expect(text).not.toContain('46.3');
  });
});

// ── The drill bank ───────────────────────────────────────────────────────────────────────────

describe('the drill bank’s spindle map, solved in §6', () => {
  const bank = WOODTRON_DRILL_BANK_WITHOUT_DATUM;
  const spindle = (n: number) => bank.spindles.find((s) => s.number === n)!;

  it('puts spindle n at (n − 1) × 32 along X — every observation in the files', () => {
    expect(spindle(1).at.x).toBe(0);
    expect(spindle(2).at.x).toBe(32);
    expect(spindle(5).at.x).toBe(128);
    expect(spindle(7).at.x).toBe(192);
  });

  it('puts the second row on Y, keeping the pitch but not the numbering origin', () => {
    // 160, not 15 × 32 — which is why `drillRow` takes a base at all.
    expect(spindle(16).at.y).toBe(160);
    expect(spindle(17).at.y).toBe(192);
    expect(spindle(17).at.y - spindle(16).at.y).toBe(32);
  });

  it('carries the diameters the tool comments name, including the odd one out', () => {
    expect(spindle(1).diameter).toBe(5);
    expect(spindle(7).diameter).toBe(3); // `D3 7` — a row is not all one size
    expect(spindle(16).diameter).toBe(10);
    expect(spindle(17).diameter).toBe(35); // the hinge borer, on its own axis
  });

  it('reproduces every B code seen in the files', () => {
    expect(bank.select([1])).toBe('B1');
    expect(bank.select([1, 2])).toBe('B3');
    expect(bank.select([1, 2, 3, 4, 5])).toBe('B31'); // a System 32 row in one plunge
    expect(bank.select([7])).toBe('B64');
    expect(bank.select([16])).toBe('B32768');
    expect(bank.select([17])).toBe('B65536');
    expect(bank.allUp).toBe('B0');
  });

  it('builds the mask without a shift, so a spindle past 31 does not go negative', () => {
    // `1 << 31` is negative in JS. A head this size does not reach it, but the next one might, and
    // the failure would be a select code the machine reads as something else entirely.
    expect(bitmaskSelect('B')([32])).toBe('B2147483648');
  });

  it('finds the five Ø5 spindles a shelf-pin row would fire together', () => {
    const five = spindlesOfDiameter({ ...bank, datum: 'head-origin' }, mm(5)).slice(0, 5);
    expect(five.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(five.map((s) => s.at.x)).toEqual([0, 32, 64, 96, 128]);
  });

  it('spaces a row evenly from its own base', () => {
    const row = drillRow({
      axis: 'Y',
      pitch: mm(32),
      from: 16,
      count: 2,
      base: mm(160),
      across: mm(0),
      diameter: mm(10),
    });
    expect(row.map((s) => s.at.y)).toEqual([160, 192]);
    expect(row.map((s) => s.number)).toEqual([16, 17]);
  });
});

describe('the bank is not fitted, and the type says why', () => {
  it('leaves the Woodtron boring every hole with the router', () => {
    expect(WOODTRON.drillBank).toBeUndefined();
  });

  it('cannot be plugged in without answering the datum question', () => {
    /*
     * The guard is the type, not a comment: `WOODTRON_DRILL_BANK_WITHOUT_DATUM` is an
     * `Omit<DrillBank, 'datum'>`, so assigning it to `drillBank` does not compile. There is no
     * value that could sit in that field honestly — the files cannot distinguish the two readings,
     * because every drilled row in them is symmetric about its part.
     */
    expect(WOODTRON_DRILL_BANK_WITHOUT_DATUM).not.toHaveProperty('datum');
  });

  it('names the datum question in the profile’s unconfirmed list', () => {
    const said = WOODTRON.unconfirmed.join(' ');
    expect(said).toMatch(/128mm/);
    expect(said).toMatch(/reference spindle|head origin/i);
  });
});

// ── The Woodtron profile itself ──────────────────────────────────────────────────────────────

describe('the Woodtron profile, against the files it was read from', () => {
  it('works from the table up', () => {
    expect(WOODTRON.zDatum).toBe('table');
  });

  it('writes holes as explicit plunges, because there is not one G81 in twenty-one files', () => {
    expect(WOODTRON.drillStyle).toBe('explicit');
  });

  it('cuts parts out with the 10mm compression spiral, in pocket 1', () => {
    expect(WOODTRON.partCutterToolId).toBe('straight-10');
    expect(findToolOrNull('straight-10')?.section).toEqual({ kind: 'straight', diameter: 10 });
    const t1 = WOODTRON.tools.find((t) => t.toolId === 'straight-10')!;
    expect(t1.pocket).toBe(1);
    expect(t1.feed).toBe(21000);
    expect(t1.spindleRpm).toBe(24000);
  });

  it('keeps the tool table sparse, because the numbers are the machine’s own pockets', () => {
    // T1 and T8, with nothing invented in between — §5. A dense 1..n table would be a fiction.
    expect(WOODTRON.tools.map((t) => t.pocket).sort((a, b) => a - b)).toEqual([1, 8]);
  });

  it('changes tools with G666 and cancels the length offset first', () => {
    const change = WOODTRON.toolChange(WOODTRON.tools[0]!);
    expect(change).toContain('G49');
    expect(change.some((l) => l.startsWith('G666 T'))).toBe(true);
    expect(change.some((l) => l.includes('M6 '))).toBe(false);
  });

  it('sets the length offset register to the same number as the tool', () => {
    // `H` always equals `T` in the files, which is why a profile needs one number and not two.
    for (const tool of WOODTRON.tools) {
      expect(WOODTRON.startSpindle(tool)).toContain(`G43 H${tool.pocket}`);
    }
  });

  it('never cuts a part clean out, because the second sheet-wide pass is not written', () => {
    /*
     * **The one that would cost a part.** The machine cuts every contour on the sheet to a 1.0mm
     * skin and only then takes them all through, which is what keeps each part held on the vacuum
     * while its neighbours are cut. This post finishes each part before starting the next, so a
     * `leaveUncut` of zero here would free the first part under a spinning cutter — matching the
     * machine's finished depth by doing the one thing its two-pass structure exists to prevent.
     */
    expect(WOODTRON.leaveUncut).toBeGreaterThan(0);
    expect(WOODTRON.leaveUncut).toBe(1.0);
  });

  it('says out loud that parts do not come free, and that no holes are drilled', () => {
    expect(WOODTRON.unconfirmed[0]).toMatch(/PARTS DO NOT COME FREE/);
    expect(WOODTRON.unconfirmed[1]).toMatch(/NO HOLES ARE DRILLED/);
  });

  it('has no boring bit at all, because every drill on this machine is on the bank', () => {
    /*
     * Not an oversight. The twenty-one files show all four diameters — Ø3, Ø5, Ø10, Ø35 — on the
     * multidrill head and nothing boring with the router, so putting a drill in this tool table
     * would be inventing a bit the machine has not been seen to hold. The post reports each hole
     * it cannot make, by part name, rather than boring it with the nearest thing.
     */
    for (const tool of WOODTRON.tools) {
      const section = findToolOrNull(tool.toolId)?.section;
      expect(section?.kind === 'straight' && section.diameter >= 10).toBe(true);
    }
  });
});

// ── What must not have changed ───────────────────────────────────────────────────────────────

describe('nothing already written moves', () => {
  it('leaves every KDT figure exactly where it was before the heads existed', () => {
    // The three fields that used to sit flat on the profile, now on the router head, unchanged.
    expect(KDT_NESTING_ROUTER.heads.router.clearanceHeight).toBe(20);
    expect(KDT_NESTING_ROUTER.heads.router.plungeClearance).toBe(3);
    expect(KDT_NESTING_ROUTER.heads.router.throughOvercut).toBe(0.5);
    expect(KDT_NESTING_ROUTER.leaveUncut).toBe(0.2);
  });

  it('does not import a single Woodtron figure into the KDT', () => {
    /*
     * Twenty-one files exist for the Woodtron and none for the KDT. The only KDT fact anybody has
     * is the Z datum, stated by the shop directly — so the two heads carry the same numbers here,
     * and that sameness is a statement rather than a placeholder.
     */
    expect(KDT_NESTING_ROUTER.heads.drill.workOffset).toBe(
      KDT_NESTING_ROUTER.heads.router.workOffset,
    );
    expect(KDT_NESTING_ROUTER.heads.drill.clearanceHeight).toBe(
      KDT_NESTING_ROUTER.heads.router.clearanceHeight,
    );
    expect(KDT_NESTING_ROUTER.drillBank).toBeUndefined();
    expect(GENERIC_ISO_ROUTER.drillBank).toBeUndefined();
  });

  it('puts a tool on the router head unless it says otherwise', () => {
    for (const profile of MACHINE_PROFILES) {
      for (const tool of profile.tools) {
        expect(headOf(tool), `${profile.name} ${tool.toolId}`).toBe('router');
      }
    }
  });

  it('still flags every profile as unverified', () => {
    // The Woodtron's dialect is read, but the profile as a whole is not proved until a program off
    // it has been run — and four things in it are still known to be wrong. Same contract as ever.
    for (const profile of MACHINE_PROFILES) {
      expect(profile.unconfirmed.length, profile.name).toBeGreaterThan(0);
    }
  });
});
