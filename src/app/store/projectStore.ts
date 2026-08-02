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
import type { SheetMaterial } from '../../core/model/material.ts';
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
import type { DoorStyle } from '../../core/standards/doorStyles.ts';
import type { HardwareLibrary } from '../../core/model/hardware.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  naturalAnchorY,
} from '../../core/project/factory.ts';
import { type WallAnchor, placeAgainstWall } from '../../core/project/wallPlacement.ts';
import type { Benchtop } from '../../core/model/benchtop.ts';
import type { KickBase } from '../../core/model/kickBase.ts';
import {
  generateBenchtops,
  generateKickBases,
  regenerateBenchtop,
  regenerateKickBase,
} from '../../core/project/generate.ts';
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
  /** Edit one sheet material on *this job only* — chiefly what the board really measures. */
  updateSheet: (id: string, patch: Partial<SheetMaterial>) => void;
  /**
   * Replace this job's door style library. The whole list at once, because the editor works
   * out the new list — adding, editing and deleting all come back through here.
   */
  updateDoorStyles: (styles: readonly DoorStyle[]) => void;
  /**
   * Replace this job's hardware library. The whole thing at once, as the door styles are — the
   * editor works out the new library and hands it over.
   */
  updateHardware: (hardware: HardwareLibrary) => void;
  updateRoom: (room: Room) => void;
  /**
   * Move a cabinet on the floor plane, optionally turning it. Height is never changed by
   * dragging — a wall cabinet pushed sideways must not slide down the wall.
   */
  moveCabinet: (id: string, x: Mm, z: Mm, yawDeg?: number) => void;
  /** Stand a cabinet against a wall, or take it off the wall it is on. */
  placeCabinetOnWall: (id: string, anchor: WallAnchor | null) => void;

  /** Make this job's current setup the shop standard for everything after it. */
  saveAsStandards: (name: string) => void;
  /** Pull the shop standards back into this job, discarding its overrides. */
  resetToStandards: () => void;
  updateStandards: (patch: Partial<ShopStandards>) => void;

  /*
   * Benchtops and ladder bases.
   *
   * `generate` **adds** units for runs that haven't got one; it never replaces an existing top,
   * because replacing one silently throws away a sink position. `regenerate` is the deliberate
   * "the cabinets moved, put it back over them", and it keeps everything a person set. See
   * `model/runUnit.ts`.
   */
  generateBenchtops: (materialId: string) => void;
  regenerateBenchtop: (id: string) => void;
  updateBenchtop: (id: string, patch: Partial<Benchtop>) => void;
  deleteBenchtop: (id: string) => void;
  generateKickBases: () => void;
  regenerateKickBase: (id: string) => void;
  updateKickBase: (id: string, patch: Partial<KickBase>) => void;
  deleteKickBase: (id: string) => void;

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
  'radius-end': 'R',
  banquette: 'BQ',
  'banquette-corner': 'BQC',
  panel: 'P',
  appliance: 'A',
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
          // A radiused end is a quarter circle, so it arrives square: its width has to equal
          // its depth or it is not a circle and the spec says so straight away. Adding one and
          // being told off for it is a poor introduction to the feature.
          width: mm(
            typeId === 'radius-end'
              ? state.project.defaults.baseCabinetDepth
              : typeId === 'banquette'
                ? 1200
              : typeId === 'banquette-corner'
                ? 500
              : typeId === 'panel'
                ? 600
              : typeId === 'drawer-bank' || typeId === 'tall'
                ? 600
                : 900,
          ),
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

  updateSheet: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          materials: {
            ...state.project.materials,
            sheets: state.project.materials.sheets.map((s) =>
              s.id === id ? { ...s, ...patch } : s,
            ),
          },
        }),
      ),
    ),

  updateDoorStyles: (doorStyles) =>
    set((state) => persist(touchProject({ ...state.project, doorStyles }))),

  updateHardware: (hardware) =>
    set((state) => persist(touchProject({ ...state.project, hardware }))),

  updateRoom: (room) => set((state) => persist(touchProject({ ...state.project, room }))),

  moveCabinet: (id, x, z, yawDeg) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          cabinets: state.project.cabinets.map((c) =>
            c.id === id
              ? {
                  ...c,
                  placement: {
                    anchor: { ...c.placement.anchor, x, z },
                    yawDeg: yawDeg ?? c.placement.yawDeg,
                  },
                }
              : c,
          ),
        }),
      ),
    ),

  placeCabinetOnWall: (id, anchor) =>
    set((state) => {
      const cabinet = state.project.cabinets.find((c) => c.id === id);
      if (!cabinet) return {};
      // Taking a cabinet off a wall leaves it exactly where it stands — it becomes an island
      // in place, rather than jumping somewhere the user has to go and find it.
      const placement = anchor
        ? placeAgainstWall(state.project.room, anchor, cabinet.placement.anchor.y)
        : cabinet.placement;
      if (!placement) return {};
      return persist(
        touchProject({
          ...state.project,
          cabinets: state.project.cabinets.map((c) => (c.id === id ? { ...c, placement } : c)),
        }),
      );
    }),

  generateBenchtops: (materialId) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          benchtops: [
            ...state.project.benchtops,
            ...generateBenchtops(state.project, materialId),
          ],
        }),
      ),
    ),

  regenerateBenchtop: (id) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          benchtops: state.project.benchtops.map((t) =>
            t.id === id ? regenerateBenchtop(state.project, t) : t,
          ),
        }),
      ),
    ),

  updateBenchtop: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          benchtops: state.project.benchtops.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),
      ),
    ),

  deleteBenchtop: (id) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          benchtops: state.project.benchtops.filter((t) => t.id !== id),
        }),
      ),
    ),

  generateKickBases: () =>
    set((state) => {
      // The cabinets come back changed: every member of a new frame has its own kick switched
      // off, because a run on a continuous plinth does not also carry a kick panel each. See
      // `GeneratedKickBases.cabinets`.
      const { kickBases, cabinets } = generateKickBases(state.project);
      return persist(
        touchProject({
          ...state.project,
          cabinets,
          kickBases: [...state.project.kickBases, ...kickBases],
        }),
      );
    }),

  regenerateKickBase: (id) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          kickBases: state.project.kickBases.map((k) =>
            k.id === id ? regenerateKickBase(state.project, k) : k,
          ),
        }),
      ),
    ),

  updateKickBase: (id, patch) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          kickBases: state.project.kickBases.map((k) => (k.id === id ? { ...k, ...patch } : k)),
        }),
      ),
    ),

  deleteKickBase: (id) =>
    set((state) =>
      persist(
        touchProject({
          ...state.project,
          kickBases: state.project.kickBases.filter((k) => k.id !== id),
        }),
      ),
    ),

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
