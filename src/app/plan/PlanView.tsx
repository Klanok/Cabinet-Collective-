/**
 * The plan — drawing the room, looking straight down at it.
 *
 * Lengths are **typed, never dragged**. A kitchen is measured with a tape and written down;
 * a wall that is 4185 because that is where somebody let go of the mouse is worse than no
 * wall at all. So the drawing is read-only to the pointer: you click a wall to select it and
 * type what it measures. Everything the pointer does — selecting, adding, closing — is a
 * decision, not a dimension.
 *
 * The view is X to the right and Z down the page, which is the world's floor plane seen from
 * above with +Y coming out of the paper at you. Walking the walls in stored order therefore
 * goes clockwise on screen, and each wall's inward normal — the way a cabinet on it faces —
 * points into the shape.
 */

import { useMemo, useState } from 'react';
import { mm } from '../../core/units.ts';
import type { Cabinet } from '../../core/model/cabinet.ts';
import type { Project } from '../../core/model/project.ts';
import {
  type Room,
  type Wall,
  isClosedPlan,
  roomBounds,
  roomFloorArea,
  wallBearingDeg,
  wallInwardNormal,
  wallLength,
} from '../../core/model/room.ts';
import {
  appendWall,
  closePlan,
  planGapLength,
  removeWall,
  setWallBearing,
  setWallHeight,
  setWallLength,
  setWallName,
  setWallThickness,
  splitWall,
  startPlan,
} from '../../core/project/plan.ts';
import { cabinetFootprint } from '../../core/project/wallPlacement.ts';
import { useAsk } from '../panels/ask.tsx';

interface Props {
  project: Project;
  selectedCabinetId: string | null;
  onSelectCabinet: (id: string | null) => void;
  onUpdateRoom: (room: Room) => void;
}

/** Room around the drawing, in millimetres of model space. */
const MARGIN = 900;

interface Viewbox {
  readonly minX: number;
  readonly minZ: number;
  readonly width: number;
  readonly height: number;
}

const viewboxFor = (room: Room, cabinets: readonly Cabinet[]): Viewbox => {
  const bounds = roomBounds(room);
  let minX = bounds.min.x;
  let minZ = bounds.min.y;
  let maxX = bounds.max.x;
  let maxZ = bounds.max.y;

  // A cabinet dragged outside the room still has to be visible, or it can't be dragged back.
  for (const cabinet of cabinets) {
    for (const p of cabinetFootprint(cabinet)) {
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxZ = Math.max(maxZ, p.z);
    }
  }

  const width = Math.max(maxX - minX, 1000) + MARGIN * 2;
  const height = Math.max(maxZ - minZ, 1000) + MARGIN * 2;
  return { minX: minX - MARGIN, minZ: minZ - MARGIN, width, height };
};

const formatMm = (n: number): string => `${Math.round(n)}`;

/** Where a wall's length label goes: just off the wall, on the outside of the room. */
const labelPosition = (wall: Wall, offset: number) => {
  const n = wallInwardNormal(wall);
  return {
    x: (wall.start.x + wall.end.x) / 2 - n.x * offset,
    z: (wall.start.y + wall.end.y) / 2 - n.y * offset,
  };
};

function WallShape({
  wall,
  selected,
  scale,
  onSelect,
}: {
  wall: Wall;
  selected: boolean;
  scale: number;
  onSelect: () => void;
}) {
  const n = wallInwardNormal(wall);
  const t = wall.thickness;
  // The stored line is the inside face, so the wall's body is drawn away from the room.
  const outer = [
    { x: wall.start.x - n.x * t, z: wall.start.y - n.y * t },
    { x: wall.end.x - n.x * t, z: wall.end.y - n.y * t },
  ];
  const points = [
    `${wall.start.x},${wall.start.y}`,
    `${wall.end.x},${wall.end.y}`,
    `${outer[1]!.x},${outer[1]!.z}`,
    `${outer[0]!.x},${outer[0]!.z}`,
  ].join(' ');

  const label = labelPosition(wall, t + 180 * scale);

  return (
    <g className={`plan-wall${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <polygon points={points} />
      {/* A fat invisible line so a thin wall is still easy to hit with the mouse. */}
      <line
        x1={wall.start.x}
        y1={wall.start.y}
        x2={wall.end.x}
        y2={wall.end.y}
        className="plan-wall-hit"
        strokeWidth={220 * scale}
      />
      <text x={label.x} y={label.z} fontSize={190 * scale} textAnchor="middle" dominantBaseline="middle">
        {formatMm(wallLength(wall))}
      </text>
    </g>
  );
}

/**
 * Just the code off the front of a cabinet's name — "B1 Sink base" becomes "B1".
 *
 * A 600 cabinet on a plan is a narrow rectangle, and "B2 Bin cupboard" written across it runs
 * into its neighbours on both sides. A set of drawings labels the box with its code and puts
 * the description in the schedule, which is what the cabinet list down the side already is.
 */
const planLabel = (name: string): string => name.split(' ')[0] ?? name;

/**
 * A cabinet seen from above.
 *
 * Wall cabinets are drawn dashed, which is how every set of joinery drawings distinguishes
 * something above the bench from something on the floor — and it has to be distinguished,
 * because a wall unit sits directly over the base run and would otherwise just be a second
 * rectangle in the same place. Their names are pulled back towards the wall and the base
 * cabinets' pushed forward, so the two rows of labels don't land on top of each other.
 */
function CabinetShape({
  cabinet,
  selected,
  scale,
  onSelect,
}: {
  cabinet: Cabinet;
  selected: boolean;
  scale: number;
  onSelect: () => void;
}) {
  const overhead = cabinet.typeId === 'wall';
  const corners = cabinetFootprint(cabinet);
  const points = corners.map((p) => `${p.x},${p.z}`).join(' ');
  // Corners come back front-left, front-right, back-right, back-left — so the first edge is
  // the door face. Marking it is the whole point of a plan: you can see which way it opens.
  const front = { a: corners[0]!, b: corners[1]! };
  const back = { a: corners[3]!, b: corners[2]! };

  // Label between the back edge and the front edge, nearer the wall for an overhead unit.
  const t = overhead ? 0.4 : 0.78;
  const label = {
    x: (back.a.x + back.b.x) / 2 + ((front.a.x + front.b.x) / 2 - (back.a.x + back.b.x) / 2) * t,
    z: (back.a.z + back.b.z) / 2 + ((front.a.z + front.b.z) / 2 - (back.a.z + back.b.z) / 2) * t,
  };

  return (
    <g
      className={`plan-cabinet${overhead ? ' is-overhead' : ''}${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      <polygon points={points} strokeDasharray={overhead ? `${110 * scale} ${80 * scale}` : undefined} />
      <line x1={front.a.x} y1={front.a.z} x2={front.b.x} y2={front.b.z} className="plan-cabinet-front" />
      <text x={label.x} y={label.z} fontSize={130 * scale} textAnchor="middle" dominantBaseline="middle">
        {planLabel(cabinet.name)}
      </text>
    </g>
  );
}

function NumberRow({
  label,
  hint,
  value,
  suffix = 'mm',
  min,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix?: string;
  min?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="setting-input">
        <input
          type="number"
          value={Math.round(value * 10) / 10}
          min={min}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        <span className="suffix">{suffix}</span>
      </div>
    </div>
  );
}

/** Editing the one wall you have selected. */
function WallEditor({
  room,
  wall,
  onUpdateRoom,
  onSelectWall,
}: {
  room: Room;
  wall: Wall;
  onUpdateRoom: (room: Room) => void;
  onSelectWall: (id: string | null) => void;
}) {
  const index = room.walls.findIndex((w) => w.id === wall.id);
  const previous = room.walls[index - 1];
  const turn = previous ? Math.round(wallBearingDeg(wall) - wallBearingDeg(previous)) : null;

  return (
    <>
      <div className="setting-row">
        <div className="setting-label">
          <span>Name</span>
          <em>What you call it on site — "sink wall", "window wall"</em>
        </div>
        <div className="setting-input">
          <input
            type="text"
            value={wall.name}
            onChange={(e) => onUpdateRoom(setWallName(room, wall.id, e.target.value))}
          />
        </div>
      </div>

      <NumberRow
        label="Length"
        hint="Everything after this wall moves with it"
        value={wallLength(wall)}
        min={50}
        step={10}
        onChange={(n) => onUpdateRoom(setWallLength(room, wall.id, mm(n)))}
      />

      <NumberRow
        label="Direction"
        hint={
          turn === null
            ? 'Measured from across the page, turning clockwise'
            : `${Math.abs(turn)}° ${turn === 0 ? 'straight on' : turn > 0 ? 'right' : 'left'} off the wall before it`
        }
        value={wallBearingDeg(wall)}
        suffix="°"
        step={15}
        onChange={(n) => onUpdateRoom(setWallBearing(room, wall.id, n))}
      />

      <NumberRow
        label="Thickness"
        value={wall.thickness}
        min={10}
        step={10}
        onChange={(n) => onUpdateRoom(setWallThickness(room, wall.id, mm(n)))}
      />
      <NumberRow
        label="Height"
        hint="Per wall, so a bulkhead or a low return can differ"
        value={wall.height}
        min={100}
        step={50}
        onChange={(n) => onUpdateRoom(setWallHeight(room, wall.id, mm(n)))}
      />

      <div className="plan-actions">
        <button
          className="btn"
          onClick={() => onUpdateRoom(setWallBearing(room, wall.id, wallBearingDeg(wall) - 90))}
        >
          Turn left 90°
        </button>
        <button
          className="btn"
          onClick={() => onUpdateRoom(setWallBearing(room, wall.id, wallBearingDeg(wall) + 90))}
        >
          Turn right 90°
        </button>
        <button className="btn" onClick={() => onUpdateRoom(splitWall(room, wall.id))}>
          Split in two
        </button>
        <button
          className="btn danger"
          disabled={room.walls.length <= 1}
          onClick={() => {
            onUpdateRoom(removeWall(room, wall.id));
            onSelectWall(null);
          }}
        >
          Delete wall
        </button>
      </div>

      <p className="note subtle">
        Splitting a wall puts a corner in the middle of it without moving anything. Turn the
        second half and you have a return — which is how a rectangle becomes an L.
      </p>
    </>
  );
}

export function PlanView({ project, selectedCabinetId, onSelectCabinet, onUpdateRoom }: Props) {
  const { room, cabinets } = project;
  const ask = useAsk();
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [newLength, setNewLength] = useState(1800);
  const [newTurn, setNewTurn] = useState(90);

  const view = useMemo(() => viewboxFor(room, cabinets), [room, cabinets]);
  // Text and hairlines are sized in model units, so they have to be scaled back up as the
  // drawing zooms out or a big kitchen gets unreadable labels.
  const scale = view.width / 6000;

  const selectedWall = selectedWallId ? room.walls.find((w) => w.id === selectedWallId) : undefined;
  const closed = isClosedPlan(room);
  const gap = planGapLength(room);
  const area = roomFloorArea(room);

  const lastWall = room.walls[room.walls.length - 1];

  return (
    <div className="plan">
      <div className="plan-canvas">
        <svg
          viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => {
            setSelectedWallId(null);
            onSelectCabinet(null);
          }}
        >
          {room.walls.map((wall) => (
            <WallShape
              key={wall.id}
              wall={wall}
              scale={scale}
              selected={wall.id === selectedWallId}
              onSelect={() => {
                setSelectedWallId(wall.id);
                onSelectCabinet(null);
              }}
            />
          ))}

          {/* Base cabinets first, so the dashed overhead units read on top of them. */}
          {[...cabinets]
            .sort((a, b) => Number(a.typeId === 'wall') - Number(b.typeId === 'wall'))
            .map((cabinet) => (
              <CabinetShape
                key={cabinet.id}
                cabinet={cabinet}
                scale={scale}
                selected={cabinet.id === selectedCabinetId}
                onSelect={() => {
                  onSelectCabinet(cabinet.id);
                  setSelectedWallId(null);
                }}
              />
            ))}

          {/* Where the walk finishes, when it hasn't come back to where it started. */}
          {!closed && lastWall && room.walls[0] && (
            <line
              className="plan-gap"
              x1={lastWall.end.x}
              y1={lastWall.end.y}
              x2={room.walls[0]!.start.x}
              y2={room.walls[0]!.start.y}
              strokeWidth={30 * scale}
              strokeDasharray={`${120 * scale} ${90 * scale}`}
            />
          )}
        </svg>
      </div>

      <aside className="plan-side">
        <header className="panel-head">
          <h2>Plan</h2>
          <span className="badge">{closed ? 'Closed' : 'Open'}</span>
        </header>

        <p className="note">
          {closed ? (
            <>
              {room.walls.length} walls, {(area / 1_000_000).toFixed(2)} m² of floor.
            </>
          ) : (
            <>
              The plan doesn't close yet — {formatMm(gap)}mm from the last corner back to the
              first.
            </>
          )}
        </p>

        <div className="plan-wall-list">
          {room.walls.map((wall, i) => (
            <button
              key={wall.id}
              className={`plan-wall-row${wall.id === selectedWallId ? ' is-active' : ''}`}
              onClick={() => setSelectedWallId(wall.id)}
            >
              <span className="plan-wall-index">{i + 1}</span>
              <span className="plan-wall-name">{wall.name}</span>
              <span className="plan-wall-length">{formatMm(wallLength(wall))}</span>
            </button>
          ))}
        </div>

        {selectedWall ? (
          <>
            <div className="subhead">{selectedWall.name}</div>
            <WallEditor
              room={room}
              wall={selectedWall}
              onUpdateRoom={onUpdateRoom}
              onSelectWall={setSelectedWallId}
            />
          </>
        ) : (
          <p className="empty">Pick a wall to set its length.</p>
        )}

        <div className="subhead">Carry on drawing</div>
        <NumberRow
          label="Next wall"
          hint="How far the tape reads along it"
          value={newLength}
          min={50}
          step={100}
          onChange={setNewLength}
        />
        <NumberRow
          label="Turning"
          hint={
            newTurn === 0
              ? 'Straight on from the last wall'
              : `${Math.abs(newTurn)}° to the ${newTurn > 0 ? 'right' : 'left'} off the last wall`
          }
          value={newTurn}
          suffix="°"
          step={5}
          onChange={setNewTurn}
        />
        <div className="plan-actions">
          <button
            className="btn primary"
            onClick={() => onUpdateRoom(appendWall(room, { length: mm(newLength), turnDeg: newTurn }))}
          >
            Add this wall
          </button>
          <button className="btn" disabled={closed} onClick={() => onUpdateRoom(closePlan(room))}>
            Close the plan
          </button>
        </div>
        {/* The square corners are most of every kitchen, so they stay one click away. */}
        <div className="plan-actions">
          <button className="btn" onClick={() => setNewTurn(-90)}>
            Left 90°
          </button>
          <button className="btn" onClick={() => setNewTurn(0)}>
            Straight
          </button>
          <button className="btn" onClick={() => setNewTurn(90)}>
            Right 90°
          </button>
          <button className="btn" onClick={() => setNewTurn(45)}>
            Right 45°
          </button>
        </div>
        <p className="note subtle">
          Any angle you can type, not just square corners — a 45° splay across a corner is{' '}
          <strong>45</strong>. Negative turns left. An angled wall usually leaves the plan open
          until the walls after it catch up, which is a normal state to be in.
        </p>

        <div className="subhead">Start again</div>
        <button
          className="btn full danger"
          onClick={async () => {
            const go = await ask.confirm(
              'Throw away this room and start a new plan from one 4200mm wall?\n\nCabinets stay where they are.',
              { confirmLabel: 'Redraw', danger: true },
            );
            if (!go) return;
            onUpdateRoom(startPlan(room, { length: mm(4200), bearingDeg: 0, name: 'Wall 1' }));
            setSelectedWallId(null);
          }}
        >
          Redraw from scratch
        </button>
        <p className="note subtle">
          Walk the room the way the numbers read: each wall runs on from the one before it, and
          the last one closes back onto the first. Cabinets are placed against a wall in the
          Inspector, or by dragging them onto one in the 3D view.
        </p>
      </aside>
    </div>
  );
}
