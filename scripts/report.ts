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
import { buildProject } from '../src/core/rules/build.ts';
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
for (const { cabinet, panels, warnings } of built) {
  console.log(
    `  ${cabinet.name.padEnd(18)} ${String(cabinet.width).padStart(4)} × ` +
      `${String(cabinet.height).padStart(4)} × ${String(cabinet.depth).padStart(4)}   ` +
      `${String(panels.length).padStart(2)} parts`,
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

rule('MATERIALS');
for (const m of cost.byMaterial) {
  console.log(
    `  ${m.label.padEnd(36)} ${String(m.panelCount).padStart(3)} parts  ` +
      `${m.footprintM2.toFixed(2).padStart(6)}m²  ~${String(m.estimatedSheets).padStart(2)} sheets  ` +
      `${formatAud(m.cost).padStart(10)}`,
  );
}

rule('COST');
const row = (label: string, value: string) => console.log(`  ${label.padEnd(30)} ${value.padStart(12)}`);
row('Sheet goods', formatAud(cost.sheetCost));
row('Edge banding', formatAud(cost.edgeBandCost));
row('Material', formatAud(cost.materialCost));
row(`Labour (${(cost.labourMinutes / 60).toFixed(1)} h)`, formatAud(cost.labourCost));
if (cost.machiningMinutes > 0) {
  row(
    `Routing ${cost.machinedFrontCount} fronts (${(cost.machiningMinutes / 60).toFixed(1)} h)`,
    formatAud(cost.machiningCost),
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
    '\n  ! Costed on indicative material rates. Load your real trade pricing into\n' +
      '    src/core/library/materials.au.ts before quoting from this.',
  );
}
for (const w of cost.warnings) console.log(`  ! ${w}`);
console.log();
