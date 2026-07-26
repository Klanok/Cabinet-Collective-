/**
 * Application state.
 *
 * The store holds the current job, the shop standards, and the selection — nothing derived.
 * Panels, cutlist and costing are always recomputed from the job by the components that need
 * them, so there is no cached copy to fall out of step with an edit.
 *
 * Both the job and the standards are written to local storage on every change, so closing the
 * tab doesn't lose work.
 */

import { create } from 'zustand';
import { type Mm, mm } from '../../core/units.ts';
import type { Cabinet, CabinetOptions, CabinetTypeId } from '../../core/model/cabinet.ts';
import type { ConstructionMethod } from '../../core/model/construction.ts';
import type { Project, ProjectDefaults, ProjectSettings } from '../../core/model/project.ts';
import type { Room } from '../../core/model/room.ts';
import { touchProject } from '../../core/model/project.ts';
import {
  type ShopStandards,
  applyStandards,
  standardsFromProject,
} from '../../core/standards/standards.ts';
import {
  type SavedCabinetType,
  removeSavedType,
  savedTypeFromCabinet,
  upsertSavedType,
} from '../../core/standards/savedTypes.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  naturalAnchorY,
} from '../../core/project/factory.ts';
import { loadProject, loadStandards, saveProject, saveStandards } from './persistence.ts';

export interface ProjectStore {
  project: Project;
  standards: ShopStandards;
  selectedCabinetId: string | null;
  /** Set when a save or load failed, so the UI can say so instead of silently losing work. */
  storageError: string | null;

  select: (id: string | null) => void;
  addCabinet: (typeId: CabinetTypeId) => void;
  updateCabinet: (id: string, patch: Partial<Cabinet>) => void;
  updateOptions: (id: string, patch: CabinetOptions) => void;
  removeCabinet: (id: string) => void;

  updateSettings: (patch: Partial<ProjectSettings>) => void;
  updateProject: (patch: Partial<Pick<Project, 'name' | 'client'>>) => void;
  /** Edit one construction method on *this job only*. */
  updateConstruction: (id: string, patch: Partial<ConstructionMethod>) => void;
  updateDefaults: (patch: Partial<ProjectDefaults>) => void;
  updateRoom: (room: Room) => void;

  /** Make this job's current setup the shop standard for everything after it. */
  saveAsStandards: (name: string) => void;
  /** Pull the shop standards back into this job, discarding its overrides. */
  resetToStandards: () => void;
  updateStandards: (patch: Partial<ShopStandards>) => void;

  /** Save a placed cabinet as a reusable type. */
  saveCabinetAsType: (cabinetId: string, name: string, note?: string) => void;
  /** Place a new cabinet from a saved type. */
  addFromSavedType: (typeId: string) => void;
  deleteSavedType: (typeId: string) => void;

  newProject: (name: string) => void;
  loadSampleKitchen: () => void;
  replaceProject: (project: Project) => void;
}

/** Right-hand end of the existing run of cabinets of the same class. */
const nextFreeX = (project: Project, typeId: CabinetTypeId): Mm => {
  const isWall = typeId === 'wall';
  const siblings = project.cabinets.filter((c) => (c.typeId === 'wall') === isWall);
  if (siblings.length === 0) return mm(0);
  return mm(Math.max(...siblings.map((c) => c.placement.anchor.x + c.width)));
};

const NAME_PREFIX: Record<CabinetTypeId, string> = {
  base: 'B',
  wall: 'W',
  tall: 'T',
  'drawer-bank': 'D',
  custom: 'C',
};

const nextName = (project: Project, typeId: CabinetTypeId): string => {
  const prefix = NAME_PREFIX[typeId];
  const used = project.cabinets.filter((c) => c.name.startsWith(prefix)).length;
  return `${prefix}${used + 1}`;
};

const initialStandards = loadStandards();
const initialProject = loadProject();

/** Persist and pass through, so every mutation saves without each one remembering to. */
const persist = (project: Project): { project: Project; storageError: string | null } => ({
  project,
  storageError: saveProject(project) ?? null,
});

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: initialProject.project ?? createSampleKitchen(initialStandards.standards),
  standards: initialStandards.standards,
  selectedCabinetId: null,
  storageError: initialProject.error ?? initialStandards.error ?? null,

  select: (id) => set({ selectedCabinetId: id }),

  addCabinet: (typeId) =>
    set((state) => {
      const cabinet = createCabinet(
        {
          typeId,
          name: nextName(state.project, typeId),
          width: mm(typeId === 'drawer-bank' || typeId === 'tall' ? 600 : 900),
          x: nextFreeX(state.project, typeId),
        },
        state.project.defaults,
        state.project.constructions,
      );
      return {
        ...persist(
          touchProject({ ...state.project, cabinets: [...state.project.cabinets, cabinet] }),
        ),
        selectedCabinetId: cabinet.id,
      };
    }),

  updateCabinet: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          cabinets: state.project.cabinets.map((c) => {
            if (c.id !== id) return c;
            const updated = { ...c, ...patch };
            // Changing whether a cabinet has a kick moves its carcass, so keep the anchor in
            // step unless the caller set it explicitly.
            if (patch.options && !patch.placement) {
              const y = naturalAnchorY(
                updated.typeId,
                updated.constructionId,
                updated.options,
                state.project.constructions,
                state.project.defaults,
              );
              return {
                ...updated,
                placement: { ...updated.placement, anchor: { ...updated.placement.anchor, y } },
              };
            }
            return updated;
          }),
        }),
      ),
    ),

  updateOptions: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          cabinets: state.project.cabinets.map((c) =>
            c.id === id ? { ...c, options: { ...c.options, ...patch } } : c,
          ),
        }),
      ),
    ),

  removeCabinet: (id) =>
    set((state) => ({
      ...persist(
        touchProject({
          ...state.project,
          cabinets: state.project.cabinets.filter((c) => c.id !== id),
        }),
      ),
      selectedCabinetId: state.selectedCabinetId === id ? null : state.selectedCabinetId,
    })),

  updateSettings: (patch) =>
    set((state) =>
      persist(
        touchProject({ ...state.project, settings: { ...state.project.settings, ...patch } }),
      ),
    ),

  updateProject: (patch) => set((state) => persist(touchProject({ ...state.project, ...patch }))),

  updateConstruction: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          constructions: state.project.constructions.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        }),
      ),
    ),

  updateDefaults: (patch) =>
    set((state) =>
      persist(
        touchProject({ ...state.project, defaults: { ...state.project.defaults, ...patch } }),
      ),
    ),

  updateRoom: (room) => set((state) => persist(touchProject({ ...state.project, room }))),

  saveCabinetAsType: (cabinetId, name, note) =>
    set((state) => {
      const cabinet = state.project.cabinets.find((c) => c.id === cabinetId);
      if (!cabinet || !name.trim()) return {};
      const saved: SavedCabinetType = savedTypeFromCabinet(cabinet, name.trim(), note);
      const standards: ShopStandards = {
        ...state.standards,
        savedTypes: upsertSavedType(state.standards.savedTypes, saved),
        updatedAt: new Date().toISOString(),
      };
      return { standards, storageError: saveStandards(standards) ?? null };
    }),

  addFromSavedType: (typeId) =>
    set((state) => {
      const saved = state.standards.savedTypes.find((t) => t.id === typeId);
      if (!saved) return {};
      const cabinet = createCabinet(
        {
          typeId: saved.typeId,
          name: nextName(state.project, saved.typeId),
          width: saved.width,
          height: saved.height,
          depth: saved.depth,
          x: nextFreeX(state.project, saved.typeId),
          options: saved.options,
        },
        state.project.defaults,
        state.project.constructions,
      );
      // The recipe's material overrides come across too; everything else follows the job.
      const placed = { ...cabinet, materials: { ...saved.materials } };
      return {
        ...persist(
          touchProject({ ...state.project, cabinets: [...state.project.cabinets, placed] }),
        ),
        selectedCabinetId: placed.id,
      };
    }),

  deleteSavedType: (typeId) =>
    set((state) => {
      const standards: ShopStandards = {
        ...state.standards,
        savedTypes: removeSavedType(state.standards.savedTypes, typeId),
        updatedAt: new Date().toISOString(),
      };
      return { standards, storageError: saveStandards(standards) ?? null };
    }),

  saveAsStandards: (name) =>
    set((state) => {
      const standards = standardsFromProject(state.project, name, state.standards);
      return { standards, storageError: saveStandards(standards) ?? null };
    }),

  resetToStandards: () =>
    set((state) => persist(applyStandards(state.project, state.standards))),

  updateStandards: (patch) =>
    set((state) => {
      const standards = {
        ...state.standards,
        ...patch,
        updatedAt: new Date().toISOString(),
      } as ShopStandards;
      return { standards, storageError: saveStandards(standards) ?? null };
    }),

  newProject: (name) =>
    set((state) => ({
      ...persist(createEmptyProject(name, undefined, state.standards)),
      selectedCabinetId: null,
    })),

  loadSampleKitchen: () =>
    set((state) => ({
      ...persist(createSampleKitchen(state.standards)),
      selectedCabinetId: null,
    })),

  replaceProject: (project) => {
    void get();
    set({ ...persist(project), selectedCabinetId: null });
  },
}));
