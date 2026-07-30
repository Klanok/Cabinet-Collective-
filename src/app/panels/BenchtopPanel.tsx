/**
 * Benchtops and ladder bases, on screen.
 *
 * Unlike every other panel in this app, what is edited here is **stored**, not derived — see
 * `model/runUnit.ts` for the argument. That shows up in the interface as one thing worth noticing:
 * there is a **Regenerate** button, and it is a button rather than something that happens by
 * itself. A top that moved every time a cabinet did would lose the sink hole you put in it.
 *
 * The other thing this panel exists to make visible is the two supplies. A shop-made top has parts
 * and appears on the cutlist; a bought-in one has none and appears as a fabricator's charge, broken
 * down so it can be held next to a real quote. That difference comes off the chosen material, so
 * changing the material is the whole of switching between them.
 */

import {
  type Benchtop,
  type BenchtopCutout,
  type BenchtopEnd,
  BENCHTOP_END_LABELS,
  CUTOUT_KIND_LABELS,
  type CutoutKind,
  benchtopDepth,
  benchtopLength,
  benchtopSections,
  suggestedJoins,
} from '../../core/model/benchtop.ts';
import type { KickBase } from '../../core/model/kickBase.ts';
import type { Project } from '../../core/model/project.ts';
import { uncoveredRuns } from '../../core/project/generate.ts';
import { buildRunUnits } from '../../core/rules/runUnits.ts';
import { benchtopCharges } from '../../core/costing/benchtopCost.ts';
import { formatAud } from '../../core/units.ts';

interface Props {
  project: Project;
  onGenerateBenchtops: (materialId: string) => void;
  onRegenerateBenchtop: (id: string) => void;
  onUpdateBenchtop: (id: string, patch: Partial<Benchtop>) => void;
  onDeleteBenchtop: (id: string) => void;
  onGenerateKickBases: () => void;
  onRegenerateKickBase: (id: string) => void;
  onUpdateKickBase: (id: string, patch: Partial<KickBase>) => void;
  onDeleteKickBase: (id: string) => void;
}

const END_OPTIONS: readonly BenchtopEnd[] = ['wall', 'exposed', 'waterfall', 'mitred'];
const CUTOUT_OPTIONS: readonly CutoutKind[] = ['sink', 'hob', 'tap-hole', 'other'];

/** Sizes a new cutout arrives at, so adding one gives you something plausible to adjust. */
const NEW_CUTOUT: Record<CutoutKind, { width: number; depth: number; cornerRadius: number }> = {
  sink: { width: 820, depth: 450, cornerRadius: 10 },
  hob: { width: 560, depth: 480, cornerRadius: 8 },
  'tap-hole': { width: 35, depth: 35, cornerRadius: 17.5 },
  other: { width: 100, depth: 100, cornerRadius: 5 },
};

function Num({
  value,
  onChange,
  step = 1,
  width = 62,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  width?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      style={{ width }}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function BenchtopPanel({
  project,
  onGenerateBenchtops,
  onRegenerateBenchtop,
  onUpdateBenchtop,
  onDeleteBenchtop,
  onGenerateKickBases,
  onRegenerateKickBase,
  onUpdateKickBase,
  onDeleteKickBase,
}: Props) {
  const units = buildRunUnits(project);
  const charges = benchtopCharges(project);
  const openTopRuns = uncoveredRuns(project, 'benchtop');
  const openKickRuns = uncoveredRuns(project, 'kick-base').filter((r) => r.datumY > 0);
  const defaultTopMaterial = project.materials.benchtops[0]?.id ?? '';

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Benchtops</h2>
        <span className="badge">{project.benchtops.length}</span>
      </header>

      {openTopRuns.length > 0 && (
        <>
          <p className="note subtle">
            {openTopRuns.length} {openTopRuns.length === 1 ? 'run has' : 'runs have'} no benchtop
            yet — drawn as a ghost in the 3D view, and on nothing else. Nothing is cut or quoted
            until one is generated.
          </p>
          <button className="btn full" onClick={() => onGenerateBenchtops(defaultTopMaterial)}>
            Generate {openTopRuns.length === 1 ? 'a benchtop' : `${openTopRuns.length} benchtops`}
          </button>
        </>
      )}

      {project.benchtops.map((top) => {
        const charge = charges.find((c) => c.benchtopId === top.id);
        const sections = benchtopSections(top);
        const parts = units.find((u) => u.id === top.id)?.panels.length ?? 0;
        return (
          <div key={top.id} className="unit-card">
            <div className="subhead">
              {top.name} — {Math.round(benchtopLength(top))} × {Math.round(benchtopDepth(top))}
            </div>

            <select
              value={top.materialId}
              onChange={(e) => onUpdateBenchtop(top.id, { materialId: e.target.value })}
            >
              {project.materials.benchtops.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.decor} — {m.supply === 'bought-in' ? 'bought in' : 'shop made'}
                </option>
              ))}
            </select>

            <div className="row-grid">
              <label>
                Front over
                <Num
                  value={top.overhangs.front}
                  onChange={(n) =>
                    onUpdateBenchtop(top.id, { overhangs: { ...top.overhangs, front: n } })
                  }
                />
              </label>
              <label>
                Back over
                <Num
                  value={top.overhangs.back}
                  onChange={(n) =>
                    onUpdateBenchtop(top.id, { overhangs: { ...top.overhangs, back: n } })
                  }
                />
              </label>
              <label>
                Left over
                <Num
                  value={top.overhangs.left}
                  onChange={(n) =>
                    onUpdateBenchtop(top.id, { overhangs: { ...top.overhangs, left: n } })
                  }
                />
              </label>
              <label>
                Right over
                <Num
                  value={top.overhangs.right}
                  onChange={(n) =>
                    onUpdateBenchtop(top.id, { overhangs: { ...top.overhangs, right: n } })
                  }
                />
              </label>
            </div>

            <div className="row-grid">
              <label>
                Left end
                <select
                  value={top.ends.left}
                  onChange={(e) =>
                    onUpdateBenchtop(top.id, {
                      ends: { ...top.ends, left: e.target.value as BenchtopEnd },
                    })
                  }
                >
                  {END_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {BENCHTOP_END_LABELS[e]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Right end
                <select
                  value={top.ends.right}
                  onChange={(e) =>
                    onUpdateBenchtop(top.id, {
                      ends: { ...top.ends, right: e.target.value as BenchtopEnd },
                    })
                  }
                >
                  {END_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {BENCHTOP_END_LABELS[e]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="note subtle">
              {sections.length === 1
                ? 'One piece, no joins.'
                : `${sections.length} pieces — ${sections.map((s) => Math.round(s)).join(' + ')}`}
            </div>
            {top.joins.map((join, i) => (
              <div key={i} className="row-grid">
                <label>
                  Join at
                  <Num
                    value={join}
                    onChange={(n) =>
                      onUpdateBenchtop(top.id, {
                        joins: top.joins.map((j, k) => (k === i ? n : j)),
                      })
                    }
                  />
                </label>
                <button
                  className="btn small"
                  onClick={() =>
                    onUpdateBenchtop(top.id, { joins: top.joins.filter((_, k) => k !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="btn small"
              onClick={() =>
                onUpdateBenchtop(top.id, {
                  // Seeded from the slab length rather than from nowhere — a suggestion, which is
                  // all `suggestedJoins` ever claims to be. Where a join really goes is a
                  // judgement about what is least visible.
                  joins: [
                    ...top.joins,
                    suggestedJoins(top, 3000)[0] ?? Math.round(benchtopLength(top) / 2),
                  ],
                })
              }
            >
              Add a join
            </button>

            <div className="note subtle">Cutouts</div>
            {top.cutouts.map((cutout: BenchtopCutout) => (
              <div key={cutout.id} className="row-grid">
                <span className="muted">{CUTOUT_KIND_LABELS[cutout.kind]}</span>
                <label>
                  Along
                  <Num
                    value={cutout.along}
                    onChange={(n) =>
                      onUpdateBenchtop(top.id, {
                        cutouts: top.cutouts.map((c) =>
                          c.id === cutout.id ? { ...c, along: n } : c,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  From back
                  <Num
                    value={cutout.fromBack}
                    onChange={(n) =>
                      onUpdateBenchtop(top.id, {
                        cutouts: top.cutouts.map((c) =>
                          c.id === cutout.id ? { ...c, fromBack: n } : c,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="btn small"
                  onClick={() =>
                    onUpdateBenchtop(top.id, {
                      cutouts: top.cutouts.filter((c) => c.id !== cutout.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="row-grid">
              {CUTOUT_OPTIONS.map((kind) => (
                <button
                  key={kind}
                  className="btn small"
                  onClick={() =>
                    onUpdateBenchtop(top.id, {
                      cutouts: [
                        ...top.cutouts,
                        {
                          id: `${kind}-${top.cutouts.length + 1}`,
                          kind,
                          along: Math.round(benchtopLength(top) / 2),
                          fromBack: Math.round(benchtopDepth(top) / 2),
                          ...NEW_CUTOUT[kind],
                        },
                      ],
                    })
                  }
                >
                  + {CUTOUT_KIND_LABELS[kind]}
                </button>
              ))}
            </div>

            {charge ? (
              <p className="note subtle">
                <strong>Bought in.</strong> {charge.areaM2.toFixed(2)}m² at{' '}
                {formatAud(charge.areaCost)}, {charge.cutoutCount}{' '}
                {charge.cutoutCount === 1 ? 'cutout' : 'cutouts'} {formatAud(charge.cutoutCost)},{' '}
                {charge.joinCount} {charge.joinCount === 1 ? 'join' : 'joins'}{' '}
                {formatAud(charge.joinCost)}, {charge.edgeMetres.toFixed(1)}m of{' '}
                {charge.edgeProfileName} {formatAud(charge.edgeCost)}.{' '}
                {charge.minimumApplied && <strong>The minimum charge applies. </strong>}
                {formatAud(charge.totalExGst)} ex GST. Nothing is cut for it — it is templated on
                site after the cabinets are in.
              </p>
            ) : (
              <p className="note subtle">
                <strong>Shop made.</strong> {parts} parts on the cutlist, priced as sheet and
                banding like everything else.
              </p>
            )}

            <div className="row-grid">
              <button className="btn small" onClick={() => onRegenerateBenchtop(top.id)}>
                Regenerate over its run
              </button>
              <button className="btn small" onClick={() => onDeleteBenchtop(top.id)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}

      <div className="subhead">Ladder bases</div>
      {openKickRuns.length > 0 && (
        <>
          <p className="note subtle">
            {openKickRuns.length} {openKickRuns.length === 1 ? 'run has' : 'runs have'} no plinth.
            Generating one switches the individual kick off every cabinet in the run — a run on a
            continuous plinth does not also carry a kick panel each.
          </p>
          <button className="btn full" onClick={onGenerateKickBases}>
            Generate{' '}
            {openKickRuns.length === 1 ? 'a ladder base' : `${openKickRuns.length} ladder bases`}
          </button>
        </>
      )}

      {project.kickBases.map((base) => {
        const parts = units.find((u) => u.id === base.id)?.panels.length ?? 0;
        return (
          <div key={base.id} className="unit-card">
            <div className="subhead">
              {base.name} — {Math.round(base.length)} × {Math.round(base.depth)} ×{' '}
              {Math.round(base.height)} high
            </div>
            <div className="row-grid">
              <label>
                Depth
                <Num
                  value={base.depth}
                  onChange={(n) => onUpdateKickBase(base.id, { depth: n })}
                />
              </label>
              <label>
                Height
                <Num
                  value={base.height}
                  onChange={(n) => onUpdateKickBase(base.id, { height: n })}
                />
              </label>
              <label>
                Max rib gap
                <Num
                  value={base.maxRibGap ?? project.constructions[0]?.ladderMaxRibGap ?? 600}
                  onChange={(n) => onUpdateKickBase(base.id, { maxRibGap: n })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={base.hasFace}
                onChange={(e) => onUpdateKickBase(base.id, { hasFace: e.target.checked })}
              />
              Kick face on the front
            </label>
            <p className="note subtle">
              {parts} parts. The ribs run to the floor and are what it stands and gets levelled on;
              the rails are cut short so they hang clear.
            </p>
            <div className="row-grid">
              <button className="btn small" onClick={() => onRegenerateKickBase(base.id)}>
                Regenerate over its run
              </button>
              <button className="btn small" onClick={() => onDeleteKickBase(base.id)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {project.benchtops.length === 0 &&
        project.kickBases.length === 0 &&
        openTopRuns.length === 0 &&
        openKickRuns.length === 0 && (
          <p className="note subtle">
            No runs of bench-height cabinets yet. Add some base cabinets side by side and a run will
            appear here to put a top on.
          </p>
        )}
    </section>
  );
}
