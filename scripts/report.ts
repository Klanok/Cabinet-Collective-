/**
 * Prints the cutlist and cost breakdown for the sample kitchen, in the terminal.
 *
 *   npm run report
 *
 * This is the Phase 1 gate in its most checkable form: a list you can hold next to a
 * hand-written one. It runs entirely on the core model — no browser, no viewport — which is
 * the point of keeping the model layer framework-agnostic.
 *
 * Name a door style to see the same kitchen with routed fronts:
 *
 *   npm run report -- shaker-57
 *
 * The part count and every part size stay exactly the same, which is the thing worth checking:
 * a shaker door is the same rectangle a slab door is. What moves is the routing line on the
 * cost.
 */

import { createSampleKitchen } from '../src/core/project/factory.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { buildCutlist, cutlistTotals } from '../src/core/cutlist/cutlist.ts';
import { drillingTotals } from '../src/core/cutlist/export.ts';
import { buildHardwareBom, drillingSummary, hardwareBomTotals } from '../src/core/hardware/bom.ts';
import { unconfirmedHardwareFigures } from '../src/core/model/hardware.ts';
import {
  benchtopDepth,
  benchtopLength,
  benchtopSections,
} from '../src/core/model/benchtop.ts';
import { findBenchtopMaterial } from '../src/core/model/material.ts';
import { unconfirmedLadderFigures } from '../src/core/model/construction.ts';
import { benchtopCharges } from '../src/core/costing/benchtopCost.ts';
import { deepestStage, nestAreaM2, usableOffcuts } from '../src/core/nest/nest.ts';
import { postProject, postedTotals } from '../src/core/post/post.ts';
import { KDT_NESTING_ROUTER } from '../src/core/library/machines.ts';
import { buildProject } from '../src/core/rules/build.ts';
import { buildRunUnits } from '../src/core/rules/runUnits.ts';
import { formatAud } from '../src/core/units.ts';
import { gstModeLabel } from '../src/core/costing/gst.ts';

const sample = createSampleKitchen();

const requestedStyle = process.argv[2];
if (requestedStyle && !sample.doorStyles.some((s) => s.id === requestedStyle)) {
  console.error(
    `\n  Unknown door style "${requestedStyle}". This job has: ` +
      `${sample.doorStyles.map((s) => s.id).join(', ')}\n`,
  );
  process.exit(1);
}

const project = requestedStyle
  ? { ...sample, defaults: { ...sample.defaults, doorStyleId: requestedStyle } }
  : sample;

const built = buildProject(project);
const cost = costProject(project);
const lines = buildCutlist(project);
const totals = cutlistTotals(lines);

const rule = (label = '') =>
  console.log(label ? `\n── ${label} ${'─'.repeat(Math.max(0, 76 - label.length))}` : '─'.repeat(80));

console.log(`\n${project.name} — ${project.settings.entityName || 'no entity set'}`);
console.log(`${gstModeLabel(project.settings.gstMode)} · margin ${project.settings.marginPercent}%`);
console.log(
  `Fronts: ${project.doorStyles.find((s) => s.id === project.defaults.doorStyleId)?.name ?? '—'}`,
);

rule('CABINETS');
for (const { cabinet, panels, warnings, hardware } of built) {
  // The runner is only worth printing where a drawer actually goes in it.
  const drawers = panels.filter((p) => p.role === 'drawer-bottom').length;
  const runner =
    drawers > 0 && hardware.runner
      ? `  ${hardware.runner.system.name} ${hardware.runner.sideHeight.code} NL ${hardware.runner.nominalLength}`
      : '';
  console.log(
    `  ${cabinet.name.padEnd(18)} ${String(cabinet.width).padStart(4)} × ` +
      `${String(cabinet.height).padStart(4)} × ${String(cabinet.depth).padStart(4)}   ` +
      `${String(panels.length).padStart(2)} parts${runner}`,
  );
  for (const w of warnings) console.log(`      ! ${w}`);
}

rule('CUTLIST');
console.log('  Qty      Length    Width  Banding      Part              Material');
for (const l of lines) {
  console.log(
    `  ${String(l.quantity).padStart(3)}  ${String(l.length).padStart(9)} ` +
      `${String(l.width).padStart(8)}  ${l.banding.padEnd(12)} ${l.name.padEnd(17)} ${l.materialLabel}`,
  );
}
console.log(
  `\n  ${totals.partCount} parts on ${totals.lineCount} lines · ` +
    `${totals.bandedMetres.toFixed(1)}m of edge banding`,
);

rule('HARDWARE');
const bom = buildHardwareBom(project);
const bomTotals = hardwareBomTotals(bom);
for (const l of bom) {
  console.log(
    `  ${String(l.quantity).padStart(4)} ${l.unit.padEnd(5)} ${l.name.padEnd(52)} ` +
      `${formatAud(l.totalExGst).padStart(10)}`,
  );
}
console.log(
  `\n  ${bomTotals.pieceCount} pieces on ${bomTotals.lineCount} lines · ` +
    `${formatAud(bomTotals.totalExGst)} ex GST`,
);

rule('DRILLING');
const drill = drillingTotals(built.flatMap((b) => b.panels));
for (const g of drillingSummary(project)) {
  console.log(
    `  Ø${String(g.diameter).padStart(2)} × ${String(g.depth).padStart(2)}  ` +
      `${String(g.count).padStart(4)} holes   ${g.purposes.join(', ').padEnd(24)}` +
      `${g.face === 'B' ? '  back face' : '  front face'}`,
  );
}
/*
 * Turning over is counted in **parts**, not in holes, and only a part machined on *both* faces has
 * to do it. A plain door with hinge cups in its back and nothing on its show face is bored back-up
 * in one setup — the face being machined is the face that goes up.
 */
console.log(
  `\n  ${drill.holes} holes across ${drill.boredParts} parts. ` +
    (drill.turnedParts === 0
      ? 'None of them turn over — every part is machined on one face only, so each is one setup.'
      : `${drill.turnedParts} of those parts are machined on both faces and turn over, which is a ` +
        'second setup on each.'),
);

rule('BENCHTOPS AND PLINTHS');
if (project.benchtops.length === 0 && project.kickBases.length === 0) {
  console.log('  None on this job.');
}
for (const top of project.benchtops) {
  const material = findBenchtopMaterial(project.materials, top.materialId);
  console.log(
    `  ${top.name.padEnd(10)} ${String(Math.round(benchtopLength(top))).padStart(5)} × ` +
      `${String(Math.round(benchtopDepth(top))).padStart(4)}   ` +
      `${material.brand} ${material.decor}  (${material.supply})`,
  );
  const sections = benchtopSections(top);
  console.log(
    `             ${sections.length} ${sections.length === 1 ? 'piece' : 'pieces'}` +
      `${sections.length > 1 ? ` — ${sections.map((s) => Math.round(s)).join(' + ')}` : ''}` +
      `, ${top.cutouts.length} cutouts, ends ${top.ends.left}/${top.ends.right}`,
  );
}
/*
 * The charges, itemised.
 *
 * Printed as a breakdown rather than a total because it is the breakdown that gets checked against
 * the fabricator's quote — and because a top where the *minimum* is the price is worth seeing as
 * such rather than as a number that happens to be higher than the area suggests.
 */
for (const c of benchtopCharges(project)) {
  console.log(
    `  ${c.name} — ${c.materialLabel}: ${c.areaM2.toFixed(2)}m² ${formatAud(c.areaCost)}` +
      `, ${c.cutoutCount} ${c.cutoutCount === 1 ? 'cutout' : 'cutouts'} ${formatAud(c.cutoutCost)}` +
      `, ${c.joinCount} ${c.joinCount === 1 ? 'join' : 'joins'} ${formatAud(c.joinCost)}` +
      `, ${c.edgeMetres.toFixed(1)}m ${c.edgeProfileName} ${formatAud(c.edgeCost)}`,
  );
  console.log(
    `             ${c.minimumApplied ? 'MINIMUM CHARGE APPLIES — ' : ''}` +
      `${formatAud(c.totalExGst)} ex GST`,
  );
}
const runUnits = buildRunUnits(project);
for (const base of project.kickBases) {
  const built = runUnits.find((u) => u.id === base.id);
  console.log(
    `  ${base.name.padEnd(10)} ${String(Math.round(base.length)).padStart(5)} × ` +
      `${String(Math.round(base.depth)).padStart(4)} × ${String(Math.round(base.height)).padStart(3)}` +
      ` high   ${built?.panels.length ?? 0} parts` +
      `${base.hasFace ? ', kick face on' : ', no face'}`,
  );
}
for (const unit of runUnits) {
  for (const w of unit.warnings) console.log(`      ! ${w}`);
}

rule('MATERIALS');
for (const m of cost.byMaterial) {
  console.log(
    `  ${m.label.padEnd(36)} ${String(m.panelCount).padStart(3)} parts  ` +
      `${m.footprintM2.toFixed(2).padStart(6)}m²  ${String(m.sheets).padStart(2)} × ` +
      `${m.sheetLabel.padEnd(9)} ${(m.yield * 100).toFixed(0).padStart(3)}% yield  ` +
      `${formatAud(m.cost).padStart(10)}`,
  );
}

/*
 * The nest.
 *
 * Printed sheet by sheet because that is the unit somebody works in: one sheet on the bench, its
 * parts, and what is left of it. The cut sequence is in the CSV rather than here — a hundred lines
 * of "cut at 717" is not something anybody reads off a terminal, and the drawing on the Nest tab
 * is the version worth looking at.
 */
rule('NEST');
console.log(
  `  ${cost.nest.sheetCount} sheets, ${nestAreaM2(cost.nest).toFixed(2)}m² of board · ` +
    `${cost.nest.kerf}mm kerf` +
    `${cost.nest.edgeTrim > 0 ? `, ${cost.nest.edgeTrim}mm trimmed off each edge` : ', no edge trim'}` +
    ` · deepest cut ${deepestStage(cost.nest)} stages`,
);
for (const m of cost.nest.byMaterial) {
  console.log(`\n  ${m.label} — ${m.sheetCount} × ${m.sheet.length}×${m.sheet.width}`);
  for (const sheet of m.sheets) {
    const keepers = usableOffcuts(sheet, project.settings.nesting.usableOffcutMin);
    console.log(
      `    Sheet ${sheet.index}:  ${String(sheet.placements.length).padStart(3)} ` +
        `${sheet.placements.length === 1 ? 'part ' : 'parts'}  ` +
        `${(sheet.yield * 100).toFixed(0).padStart(3)}% used  ` +
        `${String(sheet.cuts.length).padStart(3)} cuts  ` +
        (keepers.length > 0
          ? `offcuts ${keepers
              .map((o) => `${Math.round(o.length)}×${Math.round(o.width)}`)
              .join(', ')}`
          : 'no offcut worth keeping'),
    );
  }
}

/*
 * The G-code, or the reason there isn't any.
 *
 * Printed here rather than left to the app because it is the check that catches the one mistake
 * nothing else would: this job is nested for a saw, and the settings that make a nest a saw nest
 * are the ones that ship by default. A shop that never opens this section would find out at the
 * machine.
 */
rule('CAM');
const machine = KDT_NESTING_ROUTER;
const posted = postProject(project, machine, cost.nest);
const camTotals = postedTotals(posted);
console.log(`  ${machine.name}`);
const refused = [...new Set(posted.refused.map((r) => r.message))];
if (refused.length > 0) {
  console.log(`\n  No program written for ${camTotals.sheetCount} sheets:`);
  for (const r of refused) console.log(`      ! ${r}`);
} else {
  console.log(
    `  ${camTotals.written} programs · ${camTotals.operationCount} operations · ` +
      `${camTotals.boreCount} holes`,
  );
  for (const sheet of posted.sheets) {
    if (!sheet.output) continue;
    console.log(
      `    ${sheet.output.filename.padEnd(40)} ` +
        `${String(sheet.program.operations.length).padStart(4)} ops`,
    );
  }
  if (camTotals.needsSecondSetup.length > 0) {
    console.log(
      `\n  Machined on both faces, so not finished in one program: ` +
        `${camTotals.needsSecondSetup.join(', ')}`,
    );
  }
}
for (const w of [...new Set(posted.warnings)]) console.log(`      ! ${w}`);
if (machine.unconfirmed.length > 0) {
  console.log(`\n  ! ${machine.name} has NOT been checked against the machine. Simulate or`);
  console.log('    air-cut before running anything. What is a guess:');
  for (const note of machine.unconfirmed) console.log(`      · ${note}`);
}

rule('COST');
const row = (label: string, value: string) => console.log(`  ${label.padEnd(30)} ${value.padStart(12)}`);
row('Sheet goods', formatAud(cost.sheetCost));
row('Edge banding', formatAud(cost.edgeBandCost));
row('Hardware', formatAud(cost.hardwareCost));
if (cost.benchtopCost > 0) row('Benchtops (bought in)', formatAud(cost.benchtopCost));
if (cost.laminatedCurves > 0) {
  row(
    `Curve laminate (${cost.laminateSheets} × ${cost.laminateSheetLabel}, ${cost.laminatedM2.toFixed(2)}m² used)`,
    formatAud(cost.laminateCost),
  );
}
row('Material', formatAud(cost.materialCost + cost.laminateCost));
row(`Labour (${(cost.labourMinutes / 60).toFixed(1)} h)`, formatAud(cost.labourCost));
if (cost.machiningMinutes > 0) {
  row(
    `Routing ${cost.machinedFrontCount} fronts (${(cost.machiningMinutes / 60).toFixed(1)} h)`,
    formatAud(cost.machiningCost),
  );
}
if (cost.laminateMinutes > 0) {
  row(
    `Laminating ${cost.laminatedCurves} curve${cost.laminatedCurves === 1 ? '' : 's'} (${(cost.laminateMinutes / 60).toFixed(1)} h)`,
    formatAud(cost.laminateLabourCost),
  );
}
row(`Install (${cost.installHours.toFixed(1)} h)`, formatAud(cost.installCost));
rule();
row('Total cost', formatAud(cost.totalCost));
row(`Margin @ ${project.settings.marginPercent}%`, formatAud(cost.marginAmount));
row('Sell (ex GST)', formatAud(cost.sellExGst));
row('GST', formatAud(cost.gst));
row('TOTAL', formatAud(cost.totalIncGst));

if (cost.usesIndicativePricing) {
  console.log(
    '\n  ! Costed on indicative material and hardware rates. Load your real trade pricing\n' +
      '    into src/core/library/materials.au.ts and src/core/library/blum.ts before quoting.',
  );
}

/*
 * The dimensions nobody has checked yet.
 *
 * Printed as loudly as the pricing warning and for the same reason: a hardware figure that is
 * unchecked and *says* it is unchecked costs ten seconds with a catalogue, and one that is unchecked
 * and silent costs a carcass.
 */
const unchecked = [
  ...unconfirmedHardwareFigures(project.hardware),
  // Only when the job actually has a ladder base in it. A figure nobody's build depends on is
  // noise, and noise is what makes a real warning get skipped over.
  ...(project.kickBases.length > 0
    ? project.constructions.flatMap((c) => unconfirmedLadderFigures(c))
    : []),
];
if (unchecked.length > 0) {
  console.log('\n  ! Hardware figures not yet checked against the catalogue:');
  for (const note of unchecked) console.log(`      · ${note}`);
}
for (const w of cost.warnings) console.log(`  ! ${w}`);
console.log();
