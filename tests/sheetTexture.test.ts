import { describe, expect, it } from 'vitest';
import { pointOnSheet } from '../src/app/viewport/sheetTexture.ts';
import { mm } from '../src/core/units.ts';

describe('sheet texture mapping', () => {
  it('uses the panel cut position for an as-cut part', () => {
    expect(pointOnSheet(125, 80, {
      x: mm(400),
      y: mm(220),
      orientation: 'as-cut',
      partLength: mm(700),
      sheetIndex: 1,
    })).toEqual([525, 300]);
  });

  it('follows a part turned on the nest', () => {
    expect(pointOnSheet(125, 80, {
      x: mm(400),
      y: mm(220),
      orientation: 'turned',
      partLength: mm(700),
      sheetIndex: 1,
    })).toEqual([480, 795]);
  });
});
