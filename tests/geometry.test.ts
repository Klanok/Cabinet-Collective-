import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  notchedRectProfile,
  profileArea,
  profileExtent,
  isRectangular,
  rectProfile,
  signedArea,
  polygonPerimeter,
} from '../src/core/geom/profile.ts';
import { extrudeProfile, triangulatePolygon } from '../src/core/geom/extrude.ts';
import { crossAxis, negateAxis, v3 } from '../src/core/geom/vec.ts';
import {
  cabinetToPart,
  cabinetToWorld,
  partToCabinet,
  partToWorld,
  placement,
  placementNormal,
  worldToPart,
  yawForFrontFacing,
} from '../src/core/geom/placement.ts';

describe('profiles', () => {
  it('gives a rectangle the right area, extent and winding', () => {
    const p = rectProfile(mm(720), mm(544));
    expect(profileArea(p)).toBe(720 * 544);
    expect(profileExtent(p)).toEqual({ length: 720, width: 544 });
    expect(signedArea(p.outline)).toBeGreaterThan(0); // counter-clockwise
    expect(isRectangular(p)).toBe(true);
    expect(polygonPerimeter(p.outline)).toBe(2 * (720 + 544));
  });

  it('removes the notch area from a notched profile but not its extent', () => {
    const full = 600 * 400;
    const p = notchedRectProfile(mm(600), mm(400), 'x1y1', mm(100), mm(50));
    expect(profileArea(p)).toBe(full - 100 * 50);
    // A notched part still occupies its full bounding box on a sheet.
    expect(profileExtent(p)).toEqual({ length: 600, width: 400 });
    expect(isRectangular(p)).toBe(false);
    expect(signedArea(p.outline)).toBeGreaterThan(0);
  });

  it('notches every corner without inverting the winding', () => {
    for (const corner of ['x0y0', 'x1y0', 'x1y1', 'x0y1'] as const) {
      const p = notchedRectProfile(mm(600), mm(400), corner, mm(100), mm(50));
      expect(signedArea(p.outline)).toBeCloseTo(600 * 400 - 100 * 50, 6);
    }
  });

  it('refuses a notch that does not fit', () => {
    expect(() => notchedRectProfile(mm(600), mm(400), 'x0y0', mm(600), mm(50))).toThrow();
  });
});

describe('triangulation', () => {
  it('splits a rectangle into two triangles', () => {
    expect(triangulatePolygon(rectProfile(mm(100), mm(50)).outline)).toHaveLength(6);
  });

  it('handles the reflex corner of a notched profile', () => {
    const p = notchedRectProfile(mm(600), mm(400), 'x1y1', mm(100), mm(50));
    // Six vertices; a simple polygon of n vertices triangulates to n-2 triangles.
    expect(p.outline).toHaveLength(6);
    expect(triangulatePolygon(p.outline)).toHaveLength(4 * 3);
  });

  it('produces the same triangle count regardless of winding', () => {
    const ccw = rectProfile(mm(100), mm(50)).outline;
    const cw = [...ccw].reverse();
    expect(triangulatePolygon(cw)).toHaveLength(triangulatePolygon(ccw).length);
  });
});

describe('extrusion', () => {
  it('builds two caps and one wall per edge', () => {
    const mesh = extrudeProfile(rectProfile(mm(100), mm(50)), mm(16));
    // 4 verts per cap × 2, plus 4 verts per edge wall × 4 edges.
    expect(mesh.positions.length / 3).toBe(4 + 4 + 16);
    // 2 triangles per cap × 2, plus 2 per edge wall × 4.
    expect(mesh.indices.length / 3).toBe(2 + 2 + 8);
    expect(mesh.normals.length).toBe(mesh.positions.length);
  });

  it('places the A-face at z = thickness and the B-face at z = 0', () => {
    const t = mm(16);
    const mesh = extrudeProfile(rectProfile(mm(100), mm(50)), t);
    const zs: number[] = [];
    for (let i = 2; i < mesh.positions.length; i += 3) zs.push(mesh.positions[i]!);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBe(t);
  });

  it('points cap normals along ±Z', () => {
    const mesh = extrudeProfile(rectProfile(mm(100), mm(50)), mm(16));
    // First 4 vertices are the A-face, next 4 the B-face.
    expect([mesh.normals[0], mesh.normals[1], mesh.normals[2]]).toEqual([0, 0, 1]);
    expect([mesh.normals[12], mesh.normals[13], mesh.normals[14]]).toEqual([0, 0, -1]);
  });
});

describe('signed axes', () => {
  it('follows the right-hand rule', () => {
    expect(crossAxis('+X', '+Y')).toBe('+Z');
    expect(crossAxis('+Y', '+Z')).toBe('+X');
    expect(crossAxis('+Z', '+X')).toBe('+Y');
    expect(crossAxis('+Y', '-Z')).toBe('-X');
    expect(crossAxis('+X', '-Z')).toBe('+Y');
    expect(crossAxis('+Y', '-X')).toBe('+Z');
  });

  it('rejects parallel axes rather than returning a degenerate normal', () => {
    expect(() => crossAxis('+X', '-X')).toThrow(/perpendicular/);
  });

  it('negates axes', () => {
    expect(negateAxis('+Z')).toBe('-Z');
    expect(negateAxis('-Y')).toBe('+Y');
  });
});

describe('the transform chain', () => {
  const pan = placement(v3(10, 20, 30), '+Y', '-Z');
  const cab = { anchor: v3(1000, 150, 500), yawDeg: 90 };

  it('derives the thickness direction from the placement axes', () => {
    expect(placementNormal(pan)).toBe('-X');
    expect(placementNormal(placement(v3(0, 0, 0), '+X', '+Y'))).toBe('+Z');
  });

  it('round-trips part → cabinet → part', () => {
    const p = v3(717, 544, 16);
    expect(cabinetToPart(pan, partToCabinet(pan, p))).toEqual(p);
  });

  it('round-trips part → world → part', () => {
    const p = v3(717, 544, 16);
    const back = worldToPart(cab, pan, partToWorld(cab, pan, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    expect(back.z).toBeCloseTo(p.z, 9);
  });

  it('keeps the cardinal yaws exact', () => {
    // A 90° yaw must not leave 6.1e-17 in every coordinate downstream.
    const rotated = cabinetToWorld({ anchor: v3(0, 0, 0), yawDeg: 90 }, v3(100, 0, 0));
    expect(rotated).toEqual(v3(0, 0, -100));
    expect(cabinetToWorld({ anchor: v3(0, 0, 0), yawDeg: 180 }, v3(100, 0, 0))).toEqual(
      v3(-100, 0, 0),
    );
  });

  it('leaves height untouched under yaw', () => {
    const p = cabinetToWorld({ anchor: v3(0, 150, 0), yawDeg: 37 }, v3(100, 720, 50));
    expect(p.y).toBe(870);
  });

  it('maps front-facing directions to yaw', () => {
    expect(yawForFrontFacing('+Z')).toBe(0);
    expect(yawForFrontFacing('+X')).toBe(90);
    expect(yawForFrontFacing('-Z')).toBe(180);
    expect(yawForFrontFacing('-X')).toBe(270);
    expect(() => yawForFrontFacing('+Y')).toThrow(/upright/);
  });
});
