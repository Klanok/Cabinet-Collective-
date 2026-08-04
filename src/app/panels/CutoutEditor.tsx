/**
 * Cutouts on an individual part — the form for §5.12.
 *
 * Everything here is a way of saying one sentence: *which part, and how far in from which
 * edges*. There is deliberately **no way to type a part-space X and Y**, because a side panel's
 * part axes run opposite ways on the two hands and a raw coordinate would put a hole 100mm from
 * the front of one side and 100mm from the back of the other. So the two dropdowns offer the
 * edges the selected part actually has — asked of the panel's own placement, not of a list kept
 * here — and the rule engine resolves them.
 *
 * The parts list comes from `BuiltCabinet.partKeys`, so what you pick is the **rule key** —
 * `side-left`, `fronts` — and not a position in the part list. Resize the cabinet, change the
 * board, add a shelf: the cutout is still on the left hand end.
 */

import { useState } from 'react';
import { mm } from '../../core/units.ts';
import type { Cabinet } from '../../core/model/cabinet.ts';
import {
  type CustomFeature,
  type CustomFeatureKind,
  type PartDatum,
  CUSTOM_FEATURE_LABELS,
  describeCustomFeature,
  nextCustomFeatureId,
} from '../../core/model/partFeature.ts';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import { edgeDatumsOf, faceDatumsOf } from '../../core/rules/customFeatures.ts';
import { refusalOf } from '../../core/rules/spec.ts';
import { getSpec } from '../../core/rules/registry.ts';
import { useAsk } from './ask.tsx';

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One part somebody can put a cutout on: the rule key, and how many that rule made. */
interface PartChoice {
  readonly key: string;
  readonly count: number;
  readonly name: string;
}

const partChoicesOf = (built: BuiltCabinet): PartChoice[] => {
  const byKey = new Map<string, PartChoice>();
  for (const part of built.partKeys) {
    const existing = byKey.get(part.key);
    byKey.set(
      part.key,
      existing ? { ...existing, count: existing.count + 1 } : { key: part.key, count: 1, name: part.name },
    );
  }
  return [...byKey.values()];
};

/** The panel a feature lands on, so its own edges and faces can be offered. */
const panelFor = (built: BuiltCabinet, part: string, index: number | undefined) => {
  const at = built.partKeys.findIndex(
    (k) => k.key === part && (index === undefined || k.index === index),
  );
  return at >= 0 ? built.panels[at] : undefined;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">{children}</div>
    </label>
  );
}

function DatumPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: PartDatum;
  options: readonly PartDatum[];
  onChange: (d: PartDatum) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as PartDatum)}>
        {options.map((d) => (
          <option key={d} value={d}>
            {titleCase(d)}
          </option>
        ))}
        {/*
          A part changed under an existing feature can leave it measuring from a side that is a
          face of *this* board rather than an edge of it. The engine reports that and does not
          apply the feature; the picker keeps showing what was asked for, so there is something on
          screen to change. A select whose value is not in its list renders blank, which reads as
          the app having lost the setting.
        */}
        {!options.includes(value) && (
          <option value={value}>{titleCase(value)} — not an edge of this part</option>
        )}
      </select>
    </Field>
  );
}

function MmField({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        min={min}
        step={1}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      <em>mm</em>
    </Field>
  );
}

/**
 * A new feature of each kind, with figures somebody would recognise.
 *
 * The edges come from the part that was picked rather than being named here, which is what makes
 * "add a cutout" produce something valid on a side, a shelf, a back or a front without the form
 * having to know which of those it is looking at.
 */
const blankFeature = (
  kind: CustomFeatureKind,
  part: string,
  edges: readonly PartDatum[],
  faces: readonly PartDatum[],
): CustomFeature => {
  const id = nextCustomFeatureId();
  // Four edges in opposite pairs, so the first and the third are at right angles.
  const along = edges[0] ?? 'front';
  const across = edges[2] ?? 'bottom';
  switch (kind) {
    case 'hole':
      return {
        id,
        kind: 'hole',
        part,
        at: [
          { from: along, at: mm(100) },
          { from: across, at: mm(100) },
        ],
        diameter: mm(50),
      };
    case 'notch':
      return {
        id,
        kind: 'notch',
        part,
        edge: along,
        depth: mm(20),
        length: mm(100),
        from: { from: across, at: mm(0) },
      };
    case 'groove':
      return {
        id,
        kind: 'groove',
        part,
        face: faces[0] ?? 'front',
        edge: along,
        offset: mm(50),
        width: mm(6),
        depth: mm(8),
      };
  }
};

interface Props {
  cabinet: Cabinet;
  built: BuiltCabinet;
  onUpdate: (id: string, patch: Partial<Cabinet>) => void;
}

export function CutoutEditor({ cabinet, built, onUpdate }: Props) {
  const ask = useAsk();
  const spec = getSpec(cabinet.typeId);
  const refusal = refusalOf(spec.capabilities.customFeatures);
  const features = cabinet.customFeatures ?? [];
  const choices = partChoicesOf(built);
  const [kind, setKind] = useState<CustomFeatureKind>('hole');
  const [part, setPart] = useState<string>(choices[0]?.key ?? '');

  // A type that cuts no parts says so in its own words, and only once somebody has actually put
  // a cutout on it — otherwise every appliance space in the job carries a paragraph about
  // something nobody asked for.
  if (refusal !== null && features.length === 0) return null;

  const write = (next: readonly CustomFeature[]) =>
    onUpdate(cabinet.id, { customFeatures: next });

  const patch = (id: string, change: Partial<CustomFeature>) =>
    write(features.map((f) => (f.id === id ? ({ ...f, ...change } as CustomFeature) : f)));

  const selected = choices.find((c) => c.key === part) ?? choices[0];

  return (
    <>
      <div className="subhead">Cutouts</div>

      {refusal !== null && <p className="note warning">{refusal}</p>}

      {features.length === 0 ? (
        <p className="note subtle">
          Nothing cut into this cabinet's parts yet. A cutout is measured in from named edges — "250
          up from the bottom, 100 in from the front" — so it stays where you put it when the cabinet
          is resized, and comes out as a mirror image on the other hand.
        </p>
      ) : (
        features.map((feature) => {
          const panel = panelFor(built, feature.part, feature.index);
          const edges = panel ? edgeDatumsOf(panel.placement) : [];
          const faces = panel ? faceDatumsOf(panel.placement) : [];
          const choice = choices.find((c) => c.key === feature.part);

          return (
            <div className="fields" key={feature.id}>
              <div className="field">
                <span>{CUSTOM_FEATURE_LABELS[feature.kind]}</span>
                <div className="field-input">
                  <button
                    className="btn"
                    onClick={async () => {
                      const go = await ask.confirm(
                        `Remove this cutout?\n\n${describeCustomFeature(feature)}`,
                        { confirmLabel: 'Remove' },
                      );
                      if (go) write(features.filter((f) => f.id !== feature.id));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <Field label="On the part">
                <select
                  value={feature.part}
                  onChange={(e) => patch(feature.id, { part: e.target.value })}
                >
                  {choices.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.key})
                    </option>
                  ))}
                  {!choices.some((c) => c.key === feature.part) && (
                    <option value={feature.part}>{feature.part} — not built</option>
                  )}
                </select>
              </Field>

              {(choice?.count ?? 1) > 1 && (
                <Field label="Which one">
                  <select
                    value={feature.index ?? ''}
                    onChange={(e) =>
                      patch(feature.id, {
                        index: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">Every one</option>
                    {Array.from({ length: choice!.count }, (_, i) => (
                      <option key={i} value={i}>
                        No. {i + 1}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {feature.kind === 'hole' && (
                <>
                  <MmField
                    label="Diameter"
                    value={feature.diameter}
                    onChange={(n) => patch(feature.id, { diameter: mm(n) })}
                  />
                  {[0, 1].map((i) => (
                    <div key={i}>
                      <MmField
                        label={i === 0 ? 'In from' : 'And in from'}
                        value={feature.at[i]!.at}
                        onChange={(n) =>
                          patch(feature.id, {
                            at: replaceAt(feature.at, i, { ...feature.at[i]!, at: mm(n) }),
                          })
                        }
                      />
                      <DatumPicker
                        label="the"
                        value={feature.at[i]!.from}
                        options={edges}
                        onChange={(from) =>
                          patch(feature.id, {
                            at: replaceAt(feature.at, i, { ...feature.at[i]!, from }),
                          })
                        }
                      />
                    </div>
                  ))}
                </>
              )}

              {feature.kind === 'notch' && (
                <>
                  <DatumPicker
                    label="Off the edge"
                    value={feature.edge}
                    options={edges}
                    onChange={(edge) => patch(feature.id, { edge })}
                  />
                  <MmField
                    label="Depth in"
                    value={feature.depth}
                    onChange={(n) => patch(feature.id, { depth: mm(n) })}
                  />
                  <MmField
                    label="Length along"
                    value={feature.length}
                    onChange={(n) => patch(feature.id, { length: mm(n) })}
                  />
                  <MmField
                    label="Starting in from"
                    value={feature.from.at}
                    onChange={(n) => patch(feature.id, { from: { ...feature.from, at: mm(n) } })}
                  />
                  <DatumPicker
                    label="the"
                    value={feature.from.from}
                    options={edges}
                    onChange={(from) => patch(feature.id, { from: { ...feature.from, from } })}
                  />
                </>
              )}

              {feature.kind === 'groove' && (
                <>
                  <DatumPicker
                    label="In the face toward the"
                    value={feature.face}
                    options={faces}
                    onChange={(face) => patch(feature.id, { face })}
                  />
                  <MmField
                    label="Width"
                    value={feature.width}
                    onChange={(n) => patch(feature.id, { width: mm(n) })}
                  />
                  <MmField
                    label="Depth"
                    value={feature.depth}
                    onChange={(n) => patch(feature.id, { depth: mm(n) })}
                  />
                  <MmField
                    label="In from"
                    value={feature.offset}
                    onChange={(n) => patch(feature.id, { offset: mm(n) })}
                  />
                  <DatumPicker
                    label="the"
                    value={feature.edge}
                    options={edges}
                    onChange={(edge) => patch(feature.id, { edge })}
                  />
                </>
              )}

              <p className="note subtle">{titleCase(describeCustomFeature(feature))}.</p>
            </div>
          );
        })
      )}

      {refusal === null && choices.length > 0 && (
        <div className="fields">
          <Field label="Add">
            <select value={kind} onChange={(e) => setKind(e.target.value as CustomFeatureKind)}>
              {(Object.keys(CUSTOM_FEATURE_LABELS) as CustomFeatureKind[]).map((k) => (
                <option key={k} value={k}>
                  {CUSTOM_FEATURE_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="On">
            <select value={selected?.key ?? ''} onChange={(e) => setPart(e.target.value)}>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn full"
            onClick={() => {
              const key = selected?.key;
              if (!key) return;
              const panel = panelFor(built, key, undefined);
              if (!panel) return;
              write([
                ...features,
                blankFeature(kind, key, edgeDatumsOf(panel.placement), faceDatumsOf(panel.placement)),
              ]);
            }}
          >
            Add this cutout
          </button>
        </div>
      )}

      {built.warnings.filter((w) => w.includes('Not applied')).map((w) => (
        <p className="note warning" key={w}>
          {w}
        </p>
      ))}
    </>
  );
}

const replaceAt = <T,>(pair: readonly [T, T], at: number, value: T): [T, T] =>
  at === 0 ? [value, pair[1]] : [pair[0], value];
