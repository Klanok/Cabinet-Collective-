/**
 * The door style library.
 *
 * A style is a *recipe*, not a drawing — a border width and a recess depth applied to whatever
 * size front the job turns out to need. So this screen has no canvas on it: what you type here
 * is what the router does, on a 717mm door and a 140mm drawer front alike.
 *
 * It works on whichever list it is handed — the shop's catalogue or this job's copy of it. The
 * two are edited identically and mean different things, which is exactly the split the rest of
 * the settings screen already draws.
 */

import { useState } from 'react';
import { mm } from '../../core/units.ts';
import { cutWidthAtDepth } from '../../core/model/feature.ts';
import { STOCK_TOOLS, findToolOrNull } from '../../core/library/tools.ts';
import {
  type DoorStyle,
  type DoorStyleKind,
  PLAIN_SLAB_STYLE,
  newDoorStyle,
  removeDoorStyle,
  upsertDoorStyle,
} from '../../core/standards/doorStyles.ts';
import { styleFront } from '../../core/rules/frontStyle.ts';
import { NumberRow, SelectRow, TextRow } from './fields.tsx';
import { useAsk } from './ask.tsx';

const KIND_LABELS: Record<DoorStyleKind, string> = {
  slab: 'Plain slab — nothing machined',
  shaker: 'Shaker — a recessed centre inside a border',
  'v-groove': 'V-groove — grooves down the face',
};

const STRAIGHT_TOOLS = STOCK_TOOLS.filter((t) => t.section.kind === 'straight');
const SHAPED_TOOLS = STOCK_TOOLS.filter((t) => t.section.kind !== 'straight');

const toolOptions = (tools: typeof STOCK_TOOLS) =>
  tools.map((t) => ({ id: t.id, label: t.name }));

/**
 * What this style does to two real fronts.
 *
 * A style that fits a door and not a drawer front is the commonest way one comes out wrong, and
 * it is invisible until the job is on the bench — so both are checked here, against the sizes
 * the sample run actually produces, while the numbers are still being typed.
 */
function StyleCheck({ style }: { style: DoorStyle }) {
  if (style.kind === 'slab') return null;

  const door = styleFront(style, {
    length: mm(717),
    width: mm(447),
    thickness: mm(18),
    upright: 'length',
  });
  const drawer = styleFront(style, {
    length: mm(597),
    width: mm(140),
    thickness: mm(18),
    upright: 'width',
  });

  const describe = (result: ReturnType<typeof styleFront>): string => {
    const n = result.features.length;
    return n > 0 ? `${n} cut${n === 1 ? '' : 's'}` : 'comes out a plain slab';
  };

  const tool = findToolOrNull(style.grooveToolId);

  return (
    <>
      <p className="note subtle">
        On a <strong>717 × 447 door</strong> — {describe(door)}. On a{' '}
        <strong>597 × 140 drawer front</strong> — {describe(drawer)}.
      </p>
      {style.kind === 'v-groove' && tool && (
        <p className="note subtle">
          A {tool.name} at {style.grooveDepth}mm deep opens to{' '}
          <strong>{Math.round(cutWidthAtDepth(tool, style.grooveDepth) * 10) / 10}mm</strong> wide.
          The cutter decides that, not a width you type.
        </p>
      )}
      {[...door.warnings, ...drawer.warnings].length > 0 && (
        <ul className="warnings">
          {[...new Set([...door.warnings, ...drawer.warnings])].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

interface Props {
  styles: readonly DoorStyle[];
  defaultStyleId: string;
  onChangeStyles: (styles: readonly DoorStyle[]) => void;
  onChangeDefault: (id: string) => void;
  /** Whether this list is the shop catalogue or one job's copy of it. */
  scope: 'job' | 'standards';
}

export function DoorStyleEditor({
  styles,
  defaultStyleId,
  onChangeStyles,
  onChangeDefault,
  scope,
}: Props) {
  const ask = useAsk();
  // Open on the style actually in use, not on whatever sorts first — that is the one you came
  // here to look at.
  const [activeId, setActiveId] = useState(defaultStyleId);
  const active = styles.find((s) => s.id === activeId) ?? styles[0];

  const edit = (patch: Partial<DoorStyle>) => {
    if (!active) return;
    onChangeStyles(upsertDoorStyle(styles, { ...active, ...patch }));
  };

  const add = async (kind: DoorStyleKind) => {
    const name = await ask.prompt(
      'What would you call this style? This is the name a client sees.',
      kind === 'shaker' ? 'Shaker' : 'V-groove',
      { confirmLabel: 'Create style' },
    );
    if (!name?.trim()) return;
    const created = newDoorStyle(kind, name.trim());
    onChangeStyles(upsertDoorStyle(styles, created));
    setActiveId(created.id);
  };

  return (
    <>
      <SelectRow
        label="Default door style"
        hint={
          scope === 'standards'
            ? 'What new jobs start with'
            : 'Used on every front unless a cabinet says otherwise'
        }
        value={defaultStyleId}
        options={styles.map((s) => ({ id: s.id, label: s.name }))}
        onChange={onChangeDefault}
      />

      <div className="subhead">The styles you have</div>

      <div className="seg">
        {styles.map((s) => (
          <button
            key={s.id}
            className={`seg-btn${s.id === active?.id ? ' is-active' : ''}`}
            onClick={() => setActiveId(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={() => add('shaker')}>
          New shaker style
        </button>
        <button className="btn" onClick={() => add('v-groove')}>
          New V-groove style
        </button>
      </div>

      {active && (
        <>
          <TextRow label="Name" value={active.name} onChange={(name) => edit({ name })} />

          <SelectRow
            label="Style"
            value={active.kind}
            options={(Object.keys(KIND_LABELS) as DoorStyleKind[]).map((k) => ({
              id: k,
              label: KIND_LABELS[k],
            }))}
            onChange={(kind) => edit({ kind: kind as DoorStyleKind })}
          />

          {active.kind === 'shaker' && (
            <>
              <NumberRow
                label="Border width"
                hint="The frame left standing around the recess, the same all round"
                value={active.borderWidth}
                min={10}
                max={200}
                step={1}
                onChange={(n) => edit({ borderWidth: mm(n) })}
              />
              <NumberRow
                label="Recess depth"
                hint="How far the centre drops below the face"
                value={active.recessDepth}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(n) => edit({ recessDepth: mm(n) })}
              />
              <NumberRow
                label="Internal corner radius"
                hint="Zero lets the cutter's own radius govern"
                value={active.cornerRadius}
                min={0}
                max={20}
                step={0.5}
                onChange={(n) => edit({ cornerRadius: mm(n) })}
              />
              <SelectRow
                label="Recess cutter"
                hint="Straight-sided, so the recess walls come out square"
                value={active.pocketToolId}
                options={toolOptions(STRAIGHT_TOOLS)}
                onChange={(pocketToolId) => edit({ pocketToolId })}
              />
            </>
          )}

          {active.kind === 'v-groove' && (
            <>
              <NumberRow
                label="Groove spacing"
                hint="A target — the face is divided into whole bays nearest this"
                value={active.grooveSpacing}
                min={20}
                max={400}
                step={5}
                onChange={(n) => edit({ grooveSpacing: mm(n) })}
              />
              <NumberRow
                label="Groove depth"
                hint="How wide it opens follows from the cutter"
                value={active.grooveDepth}
                min={0.5}
                max={15}
                step={0.5}
                onChange={(n) => edit({ grooveDepth: mm(n) })}
              />
              <SelectRow
                label="Groove cutter"
                value={active.grooveToolId}
                options={toolOptions(SHAPED_TOOLS)}
                onChange={(grooveToolId) => edit({ grooveToolId })}
              />
              <SelectRow
                label="Grooves run"
                hint="As the front hangs, not as it lies on the saw"
                value={active.grooveDirection}
                options={[
                  { id: 'vertical', label: 'Up and down' },
                  { id: 'horizontal', label: 'Across' },
                ]}
                onChange={(d) => edit({ grooveDirection: d as 'vertical' | 'horizontal' })}
              />
              <NumberRow
                label="Edge margin"
                hint="Plain border left ungrooved at each edge"
                value={active.grooveMargin}
                min={0}
                max={150}
                step={5}
                onChange={(n) => edit({ grooveMargin: mm(n) })}
              />
            </>
          )}

          {active.kind !== 'slab' && (
            <>
              <NumberRow
                label="Smallest centre"
                hint="Below this a front comes out a plain slab and says so"
                value={active.minimumCentre}
                min={0}
                max={400}
                step={5}
                onChange={(n) => edit({ minimumCentre: mm(n) })}
              />
              <NumberRow
                label="Machining time per front"
                hint="Router time this style adds, charged at the shop rate"
                value={active.machiningMinutesPerFront}
                suffix="min"
                min={0}
                max={120}
                step={0.5}
                onChange={(machiningMinutesPerFront) => edit({ machiningMinutesPerFront })}
              />
              <TextRow
                label="Note"
                value={active.note ?? ''}
                onChange={(note) => edit({ note: note || undefined })}
              />

              <StyleCheck style={active} />

              <div className="modal-actions">
                <button
                  className="btn danger"
                  onClick={async () => {
                    const go = await ask.confirm(
                      `Delete the door style "${active.name}"?\n\nAny cabinet using it falls back to a plain slab.`,
                      { confirmLabel: 'Delete style', danger: true },
                    );
                    if (!go) return;
                    onChangeStyles(removeDoorStyle(styles, active.id));
                    setActiveId(PLAIN_SLAB_STYLE.id);
                  }}
                >
                  Delete this style
                </button>
              </div>
            </>
          )}
        </>
      )}

      <p className="note subtle">
        These are one-piece fronts — a single MDF slab with the look routed into its face, then
        wrapped or sprayed. The door stays one part on the cutlist, banded exactly as a plain
        door is; what changes is what the router does to it.
      </p>
      {scope === 'job' && (
        <p className="note warning">
          Editing a style here changes what this job machines. Your shop standard is untouched
          until you save this job's setup as your standards.
        </p>
      )}
    </>
  );
}
