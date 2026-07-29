/**
 * The inspector edits driving dimensions and options — the small set of values every part is
 * derived from. It never edits a part directly; there would be nowhere to put the change.
 */

import { mm } from '../../core/units.ts';
import {
  type Cabinet,
  type CabinetOptions,
  radiusDefaultOptions,
} from '../../core/model/cabinet.ts';
import { panelExtent } from '../../core/model/panel.ts';
import type { Project } from '../../core/model/project.ts';
import { wallLength } from '../../core/model/room.ts';
import { type WallAnchor, wallAnchorOf } from '../../core/project/wallPlacement.ts';
import { sheetLabel } from './MaterialPicker.tsx';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import { getSpec } from '../../core/rules/registry.ts';
import { useAsk } from './ask.tsx';

interface Props {
  built: BuiltCabinet | null;
  project: Project;
  onUpdate: (id: string, patch: Partial<Cabinet>) => void;
  onUpdateOptions: (id: string, patch: Cabinet['options']) => void;
  onSaveAsType: (cabinetId: string, name: string) => void;
  onPlaceOnWall: (cabinetId: string, anchor: WallAnchor | null) => void;
}

/**
 * Per-cabinet material override. "Same as job default" is the first option and the usual
 * answer — an override is for the odd sink base in HMR, not the general case.
 */
function OverridePicker({
  label,
  options,
  value,
  defaultLabel,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | undefined;
  defaultLabel: string;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Default — {defaultLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = 'mm',
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        <em>{suffix}</em>
      </div>
    </label>
  );
}

/**
 * Where the cabinet stands, said the way you'd say it on site: which wall, and how far along
 * it from the corner.
 *
 * The wall isn't stored on the cabinet — it is read back out of the cabinet's placement every
 * render. That is what keeps one source of truth for position: there is no wall reference to
 * go stale when a wall is renamed, redrawn or deleted, and a cabinet dragged onto a different
 * wall reports the new one without anything having to be kept in step.
 *
 * A cabinet that isn't against a wall — an island, a peninsula — is a normal thing to have, so
 * it gets plain X and Z instead rather than being forced onto a wall.
 */
function PlacementEditor({
  cabinet,
  project,
  onUpdate,
  onPlaceOnWall,
}: {
  cabinet: Cabinet;
  project: Project;
  onUpdate: (id: string, patch: Partial<Cabinet>) => void;
  onPlaceOnWall: (cabinetId: string, anchor: WallAnchor | null) => void;
}) {
  const anchor = wallAnchorOf(project.room, cabinet);
  const wall = anchor ? project.room.walls.find((w) => w.id === anchor.wallId) : undefined;

  const moveTo = (x: number, z: number) =>
    onUpdate(cabinet.id, {
      placement: { ...cabinet.placement, anchor: { ...cabinet.placement.anchor, x: mm(x), z: mm(z) } },
    });

  return (
    <>
      <label className="field">
        <span>Against</span>
        <div className="field-input">
          <select
            value={anchor?.wallId ?? ''}
            onChange={(e) =>
              onPlaceOnWall(
                cabinet.id,
                e.target.value
                  ? { wallId: e.target.value, along: anchor?.along ?? mm(0), offset: anchor?.offset ?? mm(0) }
                  : null,
              )
            }
          >
            <option value="">Nothing — free standing</option>
            {project.room.walls.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {Math.round(wallLength(w))}mm
              </option>
            ))}
          </select>
        </div>
      </label>

      {anchor && wall ? (
        <>
          <NumberField
            label="Along the wall"
            value={anchor.along}
            step={10}
            onChange={(n) => onPlaceOnWall(cabinet.id, { ...anchor, along: mm(n) })}
          />
          <NumberField
            label="Gap behind"
            value={anchor.offset}
            min={0}
            max={200}
            step={1}
            onChange={(n) => onPlaceOnWall(cabinet.id, { ...anchor, offset: mm(n) })}
          />
          {anchor.along + cabinet.width > wallLength(wall) + 0.5 && (
            <p className="note subtle">
              Runs {Math.round(anchor.along + cabinet.width - wallLength(wall))}mm past the end of{' '}
              {wall.name}.
            </p>
          )}
        </>
      ) : (
        <>
          <NumberField
            label="Across the room"
            value={cabinet.placement.anchor.x}
            step={10}
            onChange={(n) => moveTo(n, cabinet.placement.anchor.z)}
          />
          <NumberField
            label="Back into the room"
            value={cabinet.placement.anchor.z}
            step={10}
            onChange={(n) => moveTo(cabinet.placement.anchor.x, n)}
          />
          <NumberField
            label="Turned"
            value={cabinet.placement.yawDeg}
            min={0}
            max={359}
            step={15}
            suffix="°"
            onChange={(n) =>
              onUpdate(cabinet.id, { placement: { ...cabinet.placement, yawDeg: n } })
            }
          />
        </>
      )}

      <NumberField
        label="Height off floor"
        value={cabinet.placement.anchor.y}
        step={10}
        onChange={(n) =>
          onUpdate(cabinet.id, {
            placement: { ...cabinet.placement, anchor: { ...cabinet.placement.anchor, y: mm(n) } },
          })
        }
      />
    </>
  );
}

export function Inspector({
  built,
  project,
  onUpdate,
  onUpdateOptions,
  onSaveAsType,
  onPlaceOnWall,
}: Props) {
  // Before the early return below — a hook can't sit behind a condition.
  const ask = useAsk();

  if (!built) {
    return (
      <section className="panel">
        <header className="panel-head">
          <h2>Inspector</h2>
        </header>
        <p className="empty">Select a cabinet to edit it.</p>
      </section>
    );
  }

  const { cabinet, warnings } = built;
  const spec = getSpec(cabinet.typeId);
  const isDrawerBank = cabinet.typeId === 'drawer-bank';
  const isWall = cabinet.typeId === 'wall';
  const isTall = cabinet.typeId === 'tall';
  const isCustom = cabinet.typeId === 'custom';
  const isRadiusEnd = cabinet.typeId === 'radius-end';

  const sheetOptions = project.materials.sheets.map((m) => ({
    id: m.id,
    label: sheetLabel(m),
  }));
  const bandOptions = project.materials.edgeBands.map((b) => ({
    id: b.id,
    label: `${b.brand} ${b.decor} — ${b.thickness}mm`,
  }));
  const nameOfSheet = (id: string) =>
    project.materials.sheets.find((m) => m.id === id)?.decor ?? id;
  const nameOfBand = (id: string) =>
    project.materials.edgeBands.find((b) => b.id === id)?.decor ?? id;
  const nameOfStyle = (id: string) => project.doorStyles.find((s) => s.id === id)?.name ?? id;

  const setMaterial = (patch: Partial<Cabinet['materials']>) =>
    onUpdate(cabinet.id, { materials: { ...cabinet.materials, ...patch } });

  /** Base, wall and tall carcasses take a rounded front corner. The quarter-round unit *is* one. */
  const canRound = cabinet.typeId === 'base' || isWall || isTall;
  const corner = cabinet.options.radiusCorner;
  const carcassRadius = cabinet.options.carcassRadius ?? 0;

  /*
   * Turning a radius on defaults the cabinet to no doors and no shelves — the common use for
   * one of these is a decorative end, not a cupboard. Applied here, where the change is
   * visible in the form the moment it happens, rather than deep in the rule engine where it
   * would look like the app had quietly lost your doors.
   */
  const setRadius = (patch: CabinetOptions) => {
    const merged = { ...cabinet.options, ...patch };
    const turningOn =
      merged.radiusCorner !== undefined &&
      (merged.carcassRadius ?? 0) > 0 &&
      !(corner !== undefined && carcassRadius > 0);
    onUpdateOptions(cabinet.id, turningOn ? { ...radiusDefaultOptions(merged), ...patch } : patch);
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{cabinet.name}</h2>
        <span className="badge">{spec.name}</span>
      </header>

      <div className="fields">
        <label className="field">
          <span>Name</span>
          <div className="field-input">
            <input
              type="text"
              value={cabinet.name}
              onChange={(e) => onUpdate(cabinet.id, { name: e.target.value })}
            />
          </div>
        </label>

        {/*
          A radiused end has one plan dimension, not two. Its width, its depth and its radius
          are the same number by definition, so it is asked for once and the other two follow.
          Three separate boxes holding one fact is exactly what this codebase avoids in its
          data, and it is no better in a form: two of them would be wrong until you typed the
          third.
        */}
        {isRadiusEnd ? (
          <NumberField
            label="Radius"
            value={cabinet.options.endRadius ?? cabinet.depth}
            min={100}
            max={1200}
            step={10}
            onChange={(n) => {
              onUpdate(cabinet.id, { width: mm(n), depth: mm(n) });
              onUpdateOptions(cabinet.id, { endRadius: mm(n) });
            }}
          />
        ) : (
          <>
            <NumberField
              label="Width"
              value={cabinet.width}
              min={100}
              max={1800}
              step={50}
              onChange={(n) => onUpdate(cabinet.id, { width: mm(n) })}
            />
            <NumberField
              label="Depth"
              value={cabinet.depth}
              min={100}
              max={900}
              step={10}
              onChange={(n) => onUpdate(cabinet.id, { depth: mm(n) })}
            />
          </>
        )}
        <NumberField
          label="Height"
          value={cabinet.height}
          min={100}
          max={2400}
          step={10}
          onChange={(n) => onUpdate(cabinet.id, { height: mm(n) })}
        />
      </div>

      <div className="subhead">Where it stands</div>
      <div className="fields">
        <PlacementEditor
          cabinet={cabinet}
          project={project}
          onUpdate={onUpdate}
          onPlaceOnWall={onPlaceOnWall}
        />
      </div>

      <div className="subhead">Configuration</div>
      <div className="fields">
        {/*
          A radiused end has no doors and no shelves — it is a closed curved feature, and the
          point of it is the outside. Offering the controls anyway would let somebody set a
          door count the spec then silently ignores.
        */}
        {!isDrawerBank && !isRadiusEnd && (
          <>
            <label className="field">
              <span>Doors</span>
              <div className="field-input">
                <select
                  value={cabinet.options.doorCount ?? 2}
                  onChange={(e) =>
                    onUpdateOptions(cabinet.id, {
                      doorCount: Number(e.target.value) as 0 | 1 | 2,
                    })
                  }
                >
                  <option value={0}>None</option>
                  <option value={1}>Single</option>
                  <option value={2}>Pair</option>
                </select>
              </div>
            </label>
            <NumberField
              label="Adjustable shelves"
              value={cabinet.options.shelfCount ?? 0}
              min={0}
              max={8}
              suffix=""
              onChange={(n) => onUpdateOptions(cabinet.id, { shelfCount: Math.round(n) })}
            />
          </>
        )}

        {isCustom && (
          <>
            <label className="field">
              <span>Top</span>
              <div className="field-input">
                <select
                  value={cabinet.options.topStyle ?? 'panel'}
                  onChange={(e) =>
                    onUpdateOptions(cabinet.id, {
                      topStyle: e.target.value as 'panel' | 'rails' | 'open',
                    })
                  }
                >
                  <option value="panel">Full panel</option>
                  <option value="rails">Rails</option>
                  <option value="open">Open</option>
                </select>
              </div>
            </label>
            <label className="field field-check">
              <input
                type="checkbox"
                checked={cabinet.options.hasBack !== false}
                onChange={(e) => onUpdateOptions(cabinet.id, { hasBack: e.target.checked })}
              />
              <span>Back panel</span>
            </label>
            <NumberField
              label="Vertical dividers"
              value={cabinet.options.dividerCount ?? 0}
              min={0}
              max={12}
              suffix=""
              onChange={(n) => onUpdateOptions(cabinet.id, { dividerCount: Math.round(n) })}
            />
            <NumberField
              label="Drawers"
              value={cabinet.options.drawerCount ?? 0}
              min={0}
              max={8}
              suffix=""
              onChange={(n) =>
                onUpdateOptions(cabinet.id, {
                  drawerCount: Math.round(n),
                  drawerFrontHeights: undefined,
                })
              }
            />
            <label className="field field-check">
              <input
                type="checkbox"
                checked={cabinet.options.hasLid === true}
                onChange={(e) => onUpdateOptions(cabinet.id, { hasLid: e.target.checked })}
              />
              <span>Lid / seat top</span>
            </label>
            {cabinet.options.hasLid && (
              <NumberField
                label="Lid overhang"
                value={cabinet.options.lidOverhang ?? 20}
                min={0}
                max={200}
                step={5}
                onChange={(n) => onUpdateOptions(cabinet.id, { lidOverhang: mm(n) })}
              />
            )}
            {/*
              Open radius shelving. Asked for as a bow rather than as a radius because that is
              what gets measured — a straightedge across the front and a tape to the middle.
              Zero is a straight shelf, which is what everything ships as.
            */}
            <NumberField
              label="Shelf front bow"
              value={cabinet.options.shelfBow ?? 0}
              min={0}
              max={Math.max(0, cabinet.depth - 40)}
              step={5}
              onChange={(n) => onUpdateOptions(cabinet.id, { shelfBow: n > 0 ? mm(n) : undefined })}
            />
          </>
        )}

        {isRadiusEnd && (
          <>
            <NumberField
              label="Former spacing (max)"
              value={cabinet.options.formerSpacing ?? 300}
              min={50}
              max={800}
              step={25}
              onChange={(n) => onUpdateOptions(cabinet.id, { formerSpacing: mm(n) })}
            />
            <NumberField
              label="Skin layers"
              value={cabinet.options.skinLayers ?? 2}
              min={1}
              max={4}
              suffix=""
              onChange={(n) => onUpdateOptions(cabinet.id, { skinLayers: Math.round(n) })}
            />
          </>
        )}

        {/*
          A rounded front corner.

          The corner is asked for first and has **no default** — `carcassRadius` does nothing
          until it is named. A run ends left or right and you cannot get the other hand by
          turning a cabinet round, because that puts its back to the room; and a back corner
          rounds into the wall where nobody sees it. So only the two front corners are offered,
          named as you stand and look at the cabinet.
        */}
        {canRound && (
          <>
            <label className="field">
              <span>Rounded corner</span>
              <div className="field-input">
                <select
                  value={corner ?? ''}
                  onChange={(e) =>
                    setRadius({
                      radiusCorner: (e.target.value || undefined) as CabinetOptions['radiusCorner'],
                    })
                  }
                >
                  <option value="">None — square</option>
                  <option value="front-left">Front left</option>
                  <option value="front-right">Front right</option>
                </select>
              </div>
            </label>
            {corner && (
              <NumberField
                label="Corner radius"
                value={carcassRadius}
                min={0}
                max={Math.max(0, Math.min(cabinet.width, cabinet.depth))}
                step={10}
                onChange={(n) => setRadius({ carcassRadius: n > 0 ? mm(n) : undefined })}
              />
            )}
          </>
        )}

        {isTall && (
          <NumberField
            label="Door split height"
            value={cabinet.options.doorSplitHeight ?? 0}
            min={0}
            max={cabinet.height}
            step={10}
            onChange={(n) =>
              onUpdateOptions(cabinet.id, { doorSplitHeight: n > 0 ? mm(n) : undefined })
            }
          />
        )}

        {isDrawerBank && (
          <NumberField
            label="Drawers"
            value={cabinet.options.drawerCount ?? 4}
            min={1}
            max={8}
            suffix=""
            onChange={(n) =>
              onUpdateOptions(cabinet.id, {
                drawerCount: Math.round(n),
                // Explicit heights would override the count, so clear them.
                drawerFrontHeights: undefined,
              })
            }
          />
        )}

        {!isWall && (
          <label className="field field-check">
            <input
              type="checkbox"
              checked={cabinet.options.hasKick !== false}
              onChange={(e) => onUpdateOptions(cabinet.id, { hasKick: e.target.checked })}
            />
            <span>Own kick</span>
          </label>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="subhead">Reuse</div>
      <button
        className="btn full"
        onClick={async () => {
          const name = await ask.prompt(
            'Save this cabinet as a reusable type. What would you call it?',
            cabinet.name,
            { confirmLabel: 'Save type' },
          );
          if (name?.trim()) onSaveAsType(cabinet.id, name.trim());
        }}
      >
        Save as a cabinet type
      </button>
      <p className="note subtle">
        Saves the size and configuration, not where it sits. Available in every job from then on.
      </p>

      <div className="subhead">Finish</div>
      <div className="fields">
        <OverridePicker
          label="Carcass"
          options={sheetOptions}
          value={cabinet.materials.carcass}
          defaultLabel={nameOfSheet(project.defaults.carcassMaterialId)}
          onChange={(carcass) => setMaterial({ carcass })}
        />
        <OverridePicker
          label="Back"
          options={sheetOptions}
          value={cabinet.materials.back}
          defaultLabel={nameOfSheet(project.defaults.backMaterialId)}
          onChange={(back) => setMaterial({ back })}
        />
        <OverridePicker
          label="Fronts"
          options={sheetOptions}
          value={cabinet.materials.door}
          defaultLabel={nameOfSheet(project.defaults.doorMaterialId)}
          onChange={(door) => setMaterial({ door })}
        />
        <OverridePicker
          label="Bendy ply"
          options={sheetOptions}
          value={cabinet.materials.skin}
          defaultLabel={nameOfSheet(project.defaults.skinMaterialId)}
          onChange={(skin) => setMaterial({ skin })}
        />
        <OverridePicker
          label="Edging"
          options={bandOptions}
          value={cabinet.materials.edgeBand}
          defaultLabel={nameOfBand(project.defaults.edgeBandId)}
          onChange={(edgeBand) => setMaterial({ edgeBand })}
        />
        <OverridePicker
          label="Door style"
          options={project.doorStyles.map((s) => ({ id: s.id, label: s.name }))}
          value={cabinet.doorStyleId}
          defaultLabel={nameOfStyle(project.defaults.doorStyleId)}
          onChange={(doorStyleId) => onUpdate(cabinet.id, { doorStyleId })}
        />
      </div>
      {built.doorStyle.kind !== 'slab' && (
        <p className="note subtle">
          {built.doorStyle.name} — routed into the face of every door, drawer front and applied
          end panel on this cabinet. They stay one part each on the cutlist.
        </p>
      )}

      <div className="subhead">Parts</div>
      <table className="parts-table">
        <tbody>
          {built.panels.map((p) => {
            const { length, width } = panelExtent(p);
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{Math.round(length)}</td>
                <td className="num">{Math.round(width)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
