/** A quarter-circle connector for two banquettes meeting at right angles. */
import { type Mm, mm } from '../../units.ts';
import { rectProfile } from '../../geom/profile.ts';
import { placement } from '../../geom/placement.ts';
import { v3 } from '../../geom/vec.ts';
import type { RuleContext } from '../context.ts';
import type { CabinetSpec, PartInstance } from '../spec.ts';
import { BAND_ALL, BAND_NONE } from '../spec.ts';
import { type CornerRadius, planPlate, resolveCornerRadius } from '../radius.ts';
import { cornerFormers, formerHeights, wrapLayers } from '../parts.ts';

const radius = (ctx: RuleContext): Mm => mm(ctx.options.insideCornerRadius ?? ctx.W);
const layers = (ctx: RuleContext): number => Math.max(1, Math.round(ctx.options.skinLayers ?? 2));

const asCorner = (ctx: RuleContext): CornerRadius => {
  const r = radius(ctx);
  return resolveCornerRadius({
    corner: 'front-right', radius: r, layers: layers(ctx), W: r, D: r,
    t: ctx.t, tb: ctx.tb, ts: ctx.ts, stripWidth: mm(0),
  });
};

const quarterRing = (r: Mm) => [
  { x: mm(0), z: mm(0) },
  { x: r, z: mm(0), bulge: Math.tan(Math.PI / 8) },
  { x: mm(0), z: r },
] as const;

const lid = (ctx: RuleContext): PartInstance[] => {
  const r = radius(ctx);
  const plate = planPlate(quarterRing(r), ctx.H, 'up');
  return [{
    name: 'Corner lid', role: 'lid', profile: plate.profile, placement: plate.placement,
    material: 'door', bandedDirections: BAND_ALL, grain: 'any',
    note: `Quarter-circle banquette lid, ${Math.round(r)}mm radius`,
  }];
};

const backs = (ctx: RuleContext): PartInstance[] => {
  const r = radius(ctx);
  return [
    {
      name: 'Corner back A', role: 'back', profile: rectProfile(r, ctx.H),
      placement: placement(v3(0, 0, 0), '+X', '+Y'), material: 'back',
      bandedDirections: BAND_NONE, grain: 'any',
    },
    {
      name: 'Corner back B', role: 'back', profile: rectProfile(r, ctx.H),
      placement: placement(v3(0, 0, r), '-Z', '+Y'), material: 'back',
      bandedDirections: BAND_NONE, grain: 'any',
    },
  ];
};

export const BANQUETTE_CORNER_SPEC: CabinetSpec = {
  typeId: 'banquette-corner',
  name: 'Inside banquette corner',
  capabilities: {
    // Same argument as the radiused end: this unit is already a single quarter circle, sized by
    // `insideCornerRadius`, and `validate` rejects anything that is not.
    cornerRadius:
      'An inside banquette corner is already a quarter circle — its width and depth are its ' +
      'radius. Change the corner radius rather than adding a second one to it.',
    appliedEnds:
      'An inside banquette corner is a connector: both of its ends butt into the banquettes it ' +
      'joins, so neither is exposed. Put the end on the banquette at the end of the run.',
    customFeatures: true,
  },
  defaultOptions: {
    formerSpacing: mm(250), skinLayers: 2, hasKick: false, hasBack: true,
    doorCount: 0, drawerCount: 0, shelfCount: 0, insideCornerRadius: mm(500),
    seatCushionThickness: mm(80), seatCushionInset: mm(5), hasBackCushion: true,
    backCushionHeight: mm(400), backCushionThickness: mm(80), backCushionAngle: 0,
    cushionCornerRadius: mm(18),
  },
  carcassLift: () => mm(0),
  validate: (ctx) => {
    const r = radius(ctx);
    const problems: string[] = [];
    if (Math.abs(ctx.W - r) > 0.5 || Math.abs(ctx.D - r) > 0.5) {
      problems.push(`An inside corner is a quarter circle, so width and depth must match its ${Math.round(r)}mm radius.`);
    }
    if (asCorner(ctx).rSub <= 0) problems.push('The selected skin build-up leaves no former radius.');
    return problems;
  },
  parts: [
    { key: 'backs', produce: backs },
    { key: 'formers', produce: (ctx) => cornerFormers(ctx, asCorner(ctx), formerHeights(ctx), 'Corner former') },
    { key: 'skin', produce: (ctx) => wrapLayers(ctx, asCorner(ctx)) },
    { key: 'lid', produce: lid },
  ],
};
