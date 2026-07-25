/**
 * Application state.
 *
 * The store holds the project and the current selection — nothing derived. Panels, cutlist
 * and costing are always recomputed from the project by the components that need them, so
 * there is no cached copy to fall out of step with an edit.
 */

import { create } from 'zustand';
import { type Mm, mm } from '../../core/units.ts';
import type { Cabinet, CabinetOptions, CabinetTypeId } from '../../core/model/cabinet.ts';
import type { Project, ProjectSettings } from '../../core/model/project.ts';
import { touchProject } from '../../core/model/project.ts';
import { createCabinet, createSampleKitchen, naturalAnchorY } from '../../core/project/factory.ts';

export interface ProjectStore {
  project: Project;
  selectedCabinetId: string | null;

  select: (id: string | null) => void;
  addCabinet: (typeId: CabinetTypeId) => void;
  updateCabinet: (id: string, patch: Partial<Cabinet>) => void;
  updateOptions: (id: string, patch: CabinetOptions) => void;
  removeCabinet: (id: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  loadSampleKitchen: () => void;
}

/** Right-hand end of the existing run of cabinets of the same class. */
const nextFreeX = (project: Project, typeId: CabinetTypeId): Mm => {
  const isWall = typeId === 'wall';
  const siblings = project.cabinets.filter((c) => (c.typeId === 'wall') === isWall);
  if (siblings.length === 0) return mm(0);
  return mm(Math.max(...siblings.map((c) => c.placement.anchor.x + c.width)));
};

const nextName = (project: Project, typeId: CabinetTypeId): string => {
  const prefix = typeId === 'wall' ? 'W' : typeId === 'drawer-bank' ? 'D' : 'B';
  const used = project.cabinets.filter((c) => c.name.startsWith(prefix)).length;
  return `${prefix}${used + 1}`;
};

export const useProjectStore = create<ProjectStore>((set) => ({
  project: createSampleKitchen(),
  selectedCabinetId: null,

  select: (id) => set({ selectedCabinetId: id }),

  addCabinet: (typeId) =>
    set((state) => {
      const cabinet = createCabinet(
        {
          typeId,
          name: nextName(state.project, typeId),
          width: mm(typeId === 'drawer-bank' ? 600 : 900),
          x: nextFreeX(state.project, typeId),
        },
        state.project.defaults,
      );
      return {
        project: touchProject({
          ...state.project,
          cabinets: [...state.project.cabinets, cabinet],
        }),
        selectedCabinetId: cabinet.id,
      };
    }),

  updateCabinet: (id, patch) =>
    set((state) => ({
      project: touchProject({
        ...state.project,
        cabinets: state.project.cabinets.map((c) => {
          if (c.id !== id) return c;
          const updated = { ...c, ...patch };
          // Changing whether a cabinet has a kick moves its carcass, so keep the anchor in
          // step unless the caller set it explicitly.
          if (patch.options && !patch.placement) {
            const y = naturalAnchorY(updated.typeId, updated.constructionId, updated.options);
            return { ...updated, placement: { ...updated.placement, anchor: { ...updated.placement.anchor, y } } };
          }
          return updated;
        }),
      }),
    })),

  updateOptions: (id, patch) =>
    set((state) => ({
      project: touchProject({
        ...state.project,
        cabinets: state.project.cabinets.map((c) =>
          c.id === id ? { ...c, options: { ...c.options, ...patch } } : c,
        ),
      }),
    })),

  removeCabinet: (id) =>
    set((state) => ({
      project: touchProject({
        ...state.project,
        cabinets: state.project.cabinets.filter((c) => c.id !== id),
      }),
      selectedCabinetId: state.selectedCabinetId === id ? null : state.selectedCabinetId,
    })),

  updateSettings: (patch) =>
    set((state) => ({
      project: touchProject({ ...state.project, settings: { ...state.project.settings, ...patch } }),
    })),

  loadSampleKitchen: () => set({ project: createSampleKitchen(), selectedCabinetId: null }),
}));
