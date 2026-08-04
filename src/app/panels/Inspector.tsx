/**
 * The inspector edits driving dimensions and options — the small set of values every part is
 * derived from. It never edits a part directly; there would be nowhere to put the change.
 */

import { mm } from '../../core/units.ts';
import {
  type Cabinet,
  type CabinetEnd,
  type CabinetOptions,
  hasAppliedEnd,
  isRadiused,
  radiusDefaultOptions,
} from '../../core/model/cabinet.ts';
import { panelExtent } from '../../core/model/panel.ts';
import { actualThicknessOf, findSheet } from '../../core/model/material.ts';
import type { Project } from '../../core/model/project.ts';
import { wallLength } from '../../core/model/room.ts';
import { type WallAnchor, wallAnchorOf } from '../../core/project/wallPlacement.ts';
import { sheetLabel } from './MaterialPicker.tsx';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import { getSpec } from '../../core/rules/registry.ts';
import { useAsk } from './ask.tsx';
import { tallestSideHeightFor } from '../../core/model/hardware.ts';

import { AU_UPHOLSTERY_MATERIALS } from '../../core/library/upholstery.au.ts';

/**
 * Each drawer front's height, set on its own.
 *
 * Seeded from the fronts the cabinet **actually built**, so the first edit starts from the equal
 * split already on screen rather than from an empty box. Touching any one of them writes the whole
 * list, because a bank is either sharing the opening equally or it is not — a half-explicit list
 * would leave the rest to a rule that no longer knows how much room is left.
 *
 * The box height each front can carry is shown beside it, because that is the consequence somebody
 * is changing the heights *for*: a 300mm front takes a much deeper box than a 150mm one, and until
 * the number is on screen the trade is invisible.
 */
function DrawerFrontHeights({
  cabinet,
  built,
  onUpdateOptions,
}: {
  cabinet: Cabinet;
  built: BuiltCabinet;
  onUpdateOptions: (id: string, patch: Partial<CabinetOptions>) => void;
}) {
  const fronts = built.panels
    .filter((p) => p.role === 'drawer-front')
    .map((p) => Math.round(panelExtent(p).width));
  if (fronts.length === 0) return null;

  const explicit = (cabinet.options.drawerFrontHeights?.length ?? 0) > 0;
  const system = built.hardware.runnerSystem;
  const setOne = (i: number, value: number) => {
    const next = fronts.map((h, j) => mm(j === i ? Math.max(20, Math.round(value)) : h));
    onUpdateOptions(cabinet.id, { drawerFrontHeights: next });
  };

  return (
    <>
      <div className="subhead">Drawer front heights</div>
      {fronts.map((height, i) => {
        const box = tallestSideHeightFor(system, mm(height));
        return (
          <NumberField
            key={i}
            label={`Front ${i + 1}${i === 0 ? ' (bottom)' : ''} — ${box ? box.name : 'no box fits'}`}
            value={height}
            min={20}
            max={1200}
            step={5}
            onChange={(n) => setOne(i, n)}
          />
        );
      })}
      {explicit ? (
        <>
          <p className="note subtle">
            Set by hand. Each drawer gets the tallest box its own front will carry, so a mixed bank
            is not held down to its shortest front. A cabinet that names its own box height keeps
            it.
          </p>
          <button
            className="btn full"
            onClick={() => onUpdateOptions(cabinet.id, { drawerFrontHeights: undefined })}
          >
            Back to equal fronts
          </button>
        </>
      ) : (
        <p className="note subtle">
          Sharing the opening equally. Change any one and the bank keeps these heights from then
          on, and each drawer takes the deepest box its front allows.
        </p>
      )}
    </>
  );
}
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

/**
 * The hardware on this cabinet — which runner, how long, which hinge, how many.
 *
 * Everything here is an *override*: blank means the job default, exactly as the material pickers
 * work. The nominal length is the one thing with no job default at all, because the right answer
 * depends on the cabinet's own depth — so it reads "Automatic" and says which length that came out
 * as, rather than pretending somebody chose it.
 *
 * The read-out under each is the point of the panel. A drawer bank says the two cut sizes and where
 * they came from, so the number on the cutlist can be checked against the Blum sheet without leaving
 * the screen.
 */
function HardwareSection({
  cabinet,
  built,
  project,
  onUpdateOptions,
}: {
  cabinet: Cabinet;
  built: BuiltCabinet;
  project: Project;
  onUpdateOptions: (id: string, patch: CabinetOptions) => void;
}) {
  const hw = built.hardware;
  const hasDrawers = built.panels.some((p) => p.role === 'drawer-front');
  const hasDoors = built.panels.some((p) => p.role === 'door');
  if (!hasDrawers && !hasDoors) return null;

  const cups = built.panels.reduce(
    (sum, p) => sum + p.features.filter((f) => f.purpose === 'hinge-cup').length,
    0,
  );
  const box = built.panels.find((p) => p.role === 'drawer-bottom');
  const back = built.panels.find((p) => p.role === 'drawer-back');

  return (
    <>
      <div className="subhead">Hardware</div>
      <div className="fields">
        {hasDrawers && (
          <>
            <OverridePicker
              label="Runners"
              options={project.hardware.runnerSystems.map((s) => ({ id: s.id, label: s.name }))}
              value={cabinet.options.runnerSystemId}
              defaultLabel={
                project.hardware.runnerSystems.find(
                  (s) => s.id === project.defaults.runnerSystemId,
                )?.name ?? project.defaults.runnerSystemId
              }
              onChange={(runnerSystemId) => onUpdateOptions(cabinet.id, { runnerSystemId })}
            />
            <OverridePicker
              label="Box height"
              options={hw.runnerSystem.sideHeights.map((h) => ({ id: h.code, label: h.name }))}
              value={cabinet.options.drawerSideHeightCode}
              defaultLabel={hw.sideHeight.name}
              onChange={(drawerSideHeightCode) =>
                onUpdateOptions(cabinet.id, { drawerSideHeightCode })
              }
            />
            <label className="field">
              <span>Runner length</span>
              <div className="field-input">
                <select
                  value={cabinet.options.drawerNominalLength ?? ''}
                  onChange={(e) =>
                    onUpdateOptions(cabinet.id, {
                      drawerNominalLength: e.target.value ? mm(Number(e.target.value)) : undefined,
                    })
                  }
                >
                  <option value="">
                    Automatic — {hw.runner ? `${hw.runner.nominalLength}mm` : 'nothing fits'}
                  </option>
                  {(hw.sideHeight.nominalLengths ?? hw.runnerSystem.nominalLengths).map((nl) => (
                    <option key={nl} value={nl}>
                      NL {nl}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </>
        )}

        {hasDoors && (
          <>
            <OverridePicker
              label="Hinges"
              options={project.hardware.hingeSystems.map((s) => ({ id: s.id, label: s.name }))}
              value={cabinet.options.hingeSystemId}
              defaultLabel={
                project.hardware.hingeSystems.find((s) => s.id === project.defaults.hingeSystemId)
                  ?.name ?? project.defaults.hingeSystemId
              }
              onChange={(hingeSystemId) => onUpdateOptions(cabinet.id, { hingeSystemId })}
            />
            <label className="field">
              <span>Hinges per door</span>
              <div className="field-input">
                <select
                  value={cabinet.options.hingeCount ?? ''}
                  onChange={(e) =>
                    onUpdateOptions(cabinet.id, {
                      hingeCount: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">By door height</option>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </>
        )}
      </div>

      {hasDrawers && box && back && (
        <p className="note subtle">
          {hw.runner?.system.name} {hw.runner?.sideHeight.name}, NL {hw.runner?.nominalLength} —
          bottom {Math.round(panelExtent(box).length)} × {Math.round(panelExtent(box).width)}, back{' '}
          {Math.round(panelExtent(back).length)} × {Math.round(panelExtent(back).width)}. Cut from
          the clear opening less {hw.runner?.system.bottomWidthDeduction}mm, and the nominal length
          less {hw.runner?.system.bottomLengthDeduction}mm. Sides and runners are bought.
        </p>
      )}
      {hasDoors && cups > 0 && (
        <p className="note subtle">
          {cups} hinge{cups === 1 ? '' : 's'} and {cups} plate{cups === 1 ? '' : 's'}. The cup is
          Ø{hw.hinge.cupDiameter} × {hw.hinge.cupDepth} deep,{' '}
          {hw.hinge.cupDistance}mm in from the door edge and {hw.hinge.cupEndSetback}mm from each
          end — bored in the <strong>back</strong> of the door, so it turns over on the machine.
        </p>
      )}
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
  const isPanel = cabinet.typeId === 'panel';
  const isBanquette = cabinet.typeId === 'banquette';
  const isBanquetteCorner = cabinet.typeId === 'banquette-corner';
  const resolvedSkinMaterialId = cabinet.materials.skin ?? project.defaults.skinMaterialId;
  const usesLegacyBendyPly =
    (isRadiusEnd || isBanquetteCorner || isRadiused(cabinet.options)) && resolvedSkinMaterialId === 'bendy-ply-3';

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

  const setMaterial = (patch: Partial<Cabinet['materials']>) => {
    // `depth` is the plan footprint used by wall snapping. For a standalone panel it mirrors
    // the selected board's actual thickness; it is never an independently editable dimension.
    const depth =
      isPanel && Object.hasOwn(patch, 'carcass')
        ? actualThicknessOf(
            findSheet(project.materials, patch.carcass ?? project.defaults.carcassMaterialId),
          )
        : undefined;
    const update: Partial<Cabinet> = {
      materials: { ...cabinet.materials, ...patch },
      ...(depth === undefined ? {} : { depth }),
    };
    onUpdate(cabinet.id, update);
  };

  /*
   * Applied end panels. Stored as a list of named ends, so ticking one adds it and clearing one
   * removes it — and the list is *sorted*, so two cabinets detailed the same way compare equal
   * however the boxes were clicked. Ends are named as you stand and look at the cabinet, which
   * is how the model names them and how somebody at the bench would say it.
   */
  const ends: readonly { end: CabinetEnd; label: string }[] = [
    { end: 'left', label: 'Applied end — left' },
    { end: 'right', label: 'Applied end — right' },
  ];
  const setEnd = (end: CabinetEnd, on: boolean): CabinetEnd[] =>
    ends.map((e) => e.end).filter((e) => (e === end ? on : hasAppliedEnd(cabinet.options, e)));

  /*
   * Which controls this type actually has, asked of its spec.
   *
   * Both of these used to be a list of type ids written out here, a second copy of the list the
   * rule engine kept — and the two had already drifted: the radius control was offered on a
   * banquette while the engine warned that a banquette could not have one. The spec is the only
   * thing that knows what it builds, so it is the only thing asked.
   */
  const canRound = spec.capabilities.cornerRadius === true;
  const canApplyEnds = spec.capabilities.appliedEnds === true;

  /*
   * A control a type refuses is hidden — unless the cabinet is already carrying the option, in
   * which case it stays so it can be cleared. Hiding it outright would leave a job that has been
   * retyped from a base cabinet to a custom one warning about a radius with nothing on screen to
   * turn off, which is the unfixable-job failure `ErrorScreen` exists because of.
   */
  const showRound = canRound || isRadiused(cabinet.options);
  const showEnds = canApplyEnds || (cabinet.options.appliedEnds?.length ?? 0) > 0;
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
    // A job created from old shop standards can still carry the former 3mm default. Starting a
    // new radius is the safe point to correct that cabinet: existing radiused work is untouched,
    // while newly created curved work uses the shop's current 8mm bendy ply.
    if (
      turningOn &&
      resolvedSkinMaterialId === 'bendy-ply-3' &&
      project.materials.sheets.some((material) => material.id === 'bendy-ply-8')
    ) {
      setMaterial({ skin: 'bendy-ply-8' });
    }
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
        {isRadiusEnd || isBanquetteCorner ? (
          <NumberField
            label="Radius"
            value={isBanquetteCorner ? cabinet.options.insideCornerRadius ?? cabinet.depth : cabinet.options.endRadius ?? cabinet.depth}
            min={100}
            max={1200}
            step={10}
            onChange={(n) => {
              onUpdate(cabinet.id, { width: mm(n), depth: mm(n) });
              onUpdateOptions(cabinet.id, isBanquetteCorner ? { insideCornerRadius: mm(n) } : { endRadius: mm(n) });
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
            {!isPanel && (
              <NumberField
                label="Depth"
                value={cabinet.depth}
                min={100}
                max={900}
                step={10}
                onChange={(n) => onUpdate(cabinet.id, { depth: mm(n) })}
              />
            )}
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

      {!isPanel && <div className="subhead">Configuration</div>}
      {!isPanel && <div className="fields">
        {/*
          A radiused end has no doors and no shelves — it is a closed curved feature, and the
          point of it is the outside. Offering the controls anyway would let somebody set a
          door count the spec then silently ignores.
        */}
        {!isDrawerBank && !isRadiusEnd && !isBanquette && !isBanquetteCorner && (
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
            {/*
              Which way a single door swings.

              Shown only for one door, and that is the whole reason it exists. A **pair** is
              decided by comparing the two doors to each other — the left-hand one hinges left —
              so there is nothing to ask and asking would be offering a setting that gets
              overruled. A **single** door has nothing in the geometry to read, so somebody has
              to say, and until now nobody could: `doorSwing` has been in the model and read by
              `hingeHands` since the boring rules landed, with no way to set it. Every single
              door in every job came out hinged left.

              Named by the side the hinges are on, facing the cabinet, because that is what the
              model means by it and what somebody at the bench would say. "Opens left" is the
              same door described from the other end and is exactly how these get transposed.
            */}
            {(cabinet.options.doorCount ?? 2) === 1 && (
              <label className="field">
                <span>Hinges on</span>
                <div className="field-input">
                  <select
                    value={cabinet.options.doorSwing ?? 'left'}
                    onChange={(e) =>
                      onUpdateOptions(cabinet.id, {
                        doorSwing: e.target.value as CabinetOptions['doorSwing'],
                      })
                    }
                  >
                    <option value="left">Left — opens from the right</option>
                    <option value="right">Right — opens from the left</option>
                  </select>
                </div>
              </label>
            )}
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

        {(isCustom || isBanquette) && (
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
            {isBanquette && (cabinet.options.dividerCount ?? 0) === 0 && cabinet.width - 2 * 16 > 1200 && (
              <p className="note subtle">
                A divider is added anyway above a 1200mm clear span, to stiffen the seat.
              </p>
            )}
            {isBanquette && <>
              <label className="field field-check"><input type="checkbox" checked={cabinet.options.hasFixedFront !== false} onChange={(e) => onUpdateOptions(cabinet.id, { hasFixedFront: e.target.checked })} /><span>Solid front (door decor, fixed)</span></label>
              <label className="field field-check"><input type="checkbox" checked={cabinet.options.hasLiftUp !== false} onChange={(e) => onUpdateOptions(cabinet.id, { hasLiftUp: e.target.checked })} /><span>Hinged lift-up</span></label>
              {cabinet.options.hasLiftUp !== false && (
                <NumberField label="Lift-up clearance" value={cabinet.options.liftUpClearance ?? 2} min={0} max={10} step={1} onChange={(n) => onUpdateOptions(cabinet.id, { liftUpClearance: mm(n) })} />
              )}
              <NumberField label="Seat cushion" value={cabinet.options.seatCushionThickness ?? 80} min={30} max={200} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { seatCushionThickness: mm(n) })} />
              <NumberField label="Cushion inset" value={cabinet.options.seatCushionInset ?? 5} min={0} max={100} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { seatCushionInset: mm(n) })} />
              <NumberField label="Cushion radius" value={cabinet.options.cushionCornerRadius ?? 18} min={1} max={150} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { cushionCornerRadius: mm(n) })} />
              <label className="field field-check"><input type="checkbox" checked={cabinet.options.hasBackCushion !== false} onChange={(e) => onUpdateOptions(cabinet.id, { hasBackCushion: e.target.checked })} /><span>Back cushion</span></label>
              {cabinet.options.hasBackCushion !== false && <>
                <NumberField label="Back cushion height" value={cabinet.options.backCushionHeight ?? 400} min={100} max={1000} step={10} onChange={(n) => onUpdateOptions(cabinet.id, { backCushionHeight: mm(n) })} />
                <NumberField label="Back cushion thickness" value={cabinet.options.backCushionThickness ?? 80} min={30} max={200} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { backCushionThickness: mm(n) })} />
                <NumberField label="Back angle" value={cabinet.options.backCushionAngle ?? 0} min={0} max={15} step={1} suffix="°" onChange={(n) => onUpdateOptions(cabinet.id, { backCushionAngle: n })} />
                <label className="field field-check"><input type="checkbox" checked={cabinet.options.leftEndCushion === true} onChange={(e) => onUpdateOptions(cabinet.id, { leftEndCushion: e.target.checked })} /><span>Left end cushion</span></label>
                <label className="field field-check"><input type="checkbox" checked={cabinet.options.rightEndCushion === true} onChange={(e) => onUpdateOptions(cabinet.id, { rightEndCushion: e.target.checked })} /><span>Right end cushion</span></label>
              </>}
            </>}
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
        {showRound && (
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

        {(cabinet.options.drawerCount ?? 0) > 0 && (
          <DrawerFrontHeights
            cabinet={cabinet}
            built={built}
            onUpdateOptions={onUpdateOptions}
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

        {/*
          Applied end panels.

          Named ends, one tick each, and **nothing is derived**. Whether an end of a run is open
          is not something a cabinet can know — it has no idea what is beside it — so offering
          "outside end" or guessing from the position would be guessing, and a panel on the wrong
          side is the right part in the wrong place: right size, right banding, and a remake.

          Both are offered on every carcass that builds them, because both happen: an island is
          finished at both ends, and a peninsula returning to a wall is finished at one. On a type
          that does not build them the boxes are gone rather than ticking to nothing — the rule
          engine still says why if a saved job arrives carrying one.
        */}
        {showEnds && ends.map(({ end, label }) => (
          <label className="field field-check" key={end}>
            <input
              type="checkbox"
              checked={hasAppliedEnd(cabinet.options, end)}
              onChange={(e) => onUpdateOptions(cabinet.id, { appliedEnds: setEnd(end, e.target.checked) })}
            />
            <span>{label}</span>
          </label>
        ))}
        {showEnds && (cabinet.options.appliedEnds?.length ?? 0) > 0 && (
          <label className="field">
            <span>Applied end height</span>
            <div className="field-input">
              <select
                value={cabinet.options.appliedEndHeight ?? ''}
                onChange={(e) => onUpdateOptions(cabinet.id, {
                  appliedEndHeight: (e.target.value || undefined) as CabinetOptions['appliedEndHeight'],
                })}
              >
                <option value="">Shop default</option>
                <option value="carcass">Match carcass</option>
                <option value="floor">Run to floor</option>
              </select>
            </div>
          </label>
        )}

        {isBanquetteCorner && <>
          <NumberField label="Seat cushion" value={cabinet.options.seatCushionThickness ?? 80} min={30} max={200} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { seatCushionThickness: mm(n) })} />
          <NumberField label="Cushion inset" value={cabinet.options.seatCushionInset ?? 5} min={0} max={100} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { seatCushionInset: mm(n) })} />
          <label className="field field-check"><input type="checkbox" checked={cabinet.options.hasBackCushion !== false} onChange={(e) => onUpdateOptions(cabinet.id, { hasBackCushion: e.target.checked })} /><span>Back cushions</span></label>
          {cabinet.options.hasBackCushion !== false && <>
            <NumberField label="Back cushion height" value={cabinet.options.backCushionHeight ?? 400} min={100} max={1000} step={10} onChange={(n) => onUpdateOptions(cabinet.id, { backCushionHeight: mm(n) })} />
            <NumberField label="Back cushion thickness" value={cabinet.options.backCushionThickness ?? 80} min={30} max={200} step={5} onChange={(n) => onUpdateOptions(cabinet.id, { backCushionThickness: mm(n) })} />
            <NumberField label="Back angle" value={cabinet.options.backCushionAngle ?? 0} min={0} max={15} step={1} suffix="°" onChange={(n) => onUpdateOptions(cabinet.id, { backCushionAngle: n })} />
          </>}
          <NumberField label="Former spacing (max)" value={cabinet.options.formerSpacing ?? 250} min={50} max={800} step={25} onChange={(n) => onUpdateOptions(cabinet.id, { formerSpacing: mm(n) })} />
          <NumberField label="Skin layers" value={cabinet.options.skinLayers ?? 2} min={1} max={4} step={1} suffix="" onChange={(n) => onUpdateOptions(cabinet.id, { skinLayers: Math.round(n) })} />
        </>}
      </div>}

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <HardwareSection
        cabinet={cabinet}
        built={built}
        project={project}
        onUpdateOptions={onUpdateOptions}
      />

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
        {(isBanquette || isBanquetteCorner) && <label className="field"><span>Upholstery</span><div className="field-input"><select
          value={cabinet.materials.upholstery ?? (project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS)[0]?.id ?? ''}
          onChange={(e) => setMaterial({ upholstery: e.target.value })}
        >{(project.materials.upholstery ?? AU_UPHOLSTERY_MATERIALS).map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.brand} {fabric.collection} — {fabric.colour}</option>)}</select></div></label>}
        <OverridePicker
          label={isPanel ? 'Panel material' : 'Carcass'}
          options={sheetOptions}
          value={cabinet.materials.carcass}
          defaultLabel={nameOfSheet(project.defaults.carcassMaterialId)}
          onChange={(carcass) => setMaterial({ carcass })}
        />
        {isPanel && (
          <p className="note subtle">
            Panel thickness comes from the selected sheet material. All four edges are banded;
            per-edge banding is not a control yet.
          </p>
        )}
        {!isPanel && <>
        <OverridePicker
          label="Back"
          options={sheetOptions}
          value={cabinet.materials.back}
          defaultLabel={nameOfSheet(project.defaults.backMaterialId)}
          onChange={(back) => setMaterial({ back })}
        />
        <OverridePicker
          label="Fronts — this cabinet"
          options={sheetOptions}
          value={cabinet.materials.door}
          defaultLabel={nameOfSheet(project.defaults.doorMaterialId)}
          onChange={(door) => setMaterial({ door })}
        />
        <p className="note subtle">
          This selection applies only to {cabinet.name}. Use Job settings → Materials → Fronts to
          change the default used by every cabinet that has no override.
        </p>
        <OverridePicker
          label="Bendy ply"
          options={sheetOptions}
          value={cabinet.materials.skin}
          defaultLabel={nameOfSheet(project.defaults.skinMaterialId)}
          onChange={(skin) => setMaterial({ skin })}
        />
        {usesLegacyBendyPly && project.materials.sheets.some((m) => m.id === 'bendy-ply-8') && (
          <div>
            <p className="note warning">
              This curve still uses the legacy 3mm ply. The shop material is now 8mm; changing it
              recalculates the formers, skin lengths and price.
            </p>
            <button
              className="btn full"
              onClick={async () => {
                const go = await ask.confirm(
                  'Upgrade this cabinet from 3mm to 8mm bendy ply?\n\n' +
                    'The cabinet will be regenerated. Former radii, flat skin lengths and price ' +
                    'will change; the existing 3mm selection is kept if you cancel.',
                  { confirmLabel: 'Upgrade to 8mm' },
                );
                if (go) setMaterial({ skin: 'bendy-ply-8' });
              }}
            >
              Upgrade this cabinet to 8mm ply
            </button>
          </div>
        )}
        </>}
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
        <label className="field"><span>{isPanel ? 'Grain' : 'Front grain'}</span><div className="field-input"><select
          value={cabinet.options.grainDirection ?? ''}
          onChange={(e) =>
            onUpdateOptions(cabinet.id, {
              grainDirection: (e.target.value || undefined) as 'vertical' | 'horizontal' | undefined,
            })
          }
        >
          <option value="">{isPanel ? 'Vertical (default)' : 'By part (default)'}</option>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select></div></label>
      </div>
      {cabinet.options.grainDirection === undefined ? (
        <p className="note subtle">
          {isPanel
            ? 'A standalone panel is cut with the grain running up it unless you say otherwise.'
            : "Grain runs the way each part's shape wants it: up a door, across a bank of drawer " +
              'fronts. Set it here to run every front on this cabinet the same way.'}
        </p>
      ) : (
        <p className="note subtle">
          {isPanel
            ? `This panel is cut with the grain running ${cabinet.options.grainDirection}.`
            : `Every door, drawer front, false front and applied end on this cabinet is cut with ` +
              `the grain running ${cabinet.options.grainDirection}. Carcass parts are unaffected — ` +
              `their grain is a construction fact, and leaving it free is what lets the nester ` +
              `turn them for yield.`}
          {' '}On a grained decor this decides which way the part is turned on the sheet, so the
          cut plan follows it.
        </p>
      )}
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
