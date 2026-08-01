/**
 * App shell.
 *
 * Everything shown here is derived from `project` on each render — panels, cutlist and cost
 * are recomputed, never stored. For a job of this size that is comfortably fast, and it means
 * there is exactly one source of truth on screen.
 */

import { useMemo, useState } from 'react';
import { useProjectStore } from './store/projectStore.ts';
import { buildProject } from '../core/rules/build.ts';
import { costProject } from '../core/costing/costing.ts';
import { buildCutlist } from '../core/cutlist/cutlist.ts';
import { checkLayout } from '../core/project/layout.ts';
import { formatAud } from '../core/units.ts';
import { Viewport3D } from './viewport/Viewport3D.tsx';
import { CabinetList } from './panels/CabinetList.tsx';
import { Inspector } from './panels/Inspector.tsx';
import { CostPanel } from './panels/CostPanel.tsx';
import { CutlistPanel } from './panels/CutlistPanel.tsx';
import { NestPanel } from './panels/NestPanel.tsx';
import { HardwarePanel } from './panels/HardwarePanel.tsx';
import { BenchtopPanel } from './panels/BenchtopPanel.tsx';
import { SettingsModal } from './panels/SettingsModal.tsx';
import { PlanView } from './plan/PlanView.tsx';
import { exportProjectFile, importProjectFile } from './store/persistence.ts';

type Tab = 'cutlist' | 'nest' | 'hardware' | 'tops' | 'cost';
type View = '3d' | 'wireframe' | 'plan';

export default function App() {
  const project = useProjectStore((s) => s.project);
  const selectedCabinetId = useProjectStore((s) => s.selectedCabinetId);
  const select = useProjectStore((s) => s.select);
  const addCabinet = useProjectStore((s) => s.addCabinet);
  const updateCabinet = useProjectStore((s) => s.updateCabinet);
  const updateOptions = useProjectStore((s) => s.updateOptions);
  const removeCabinet = useProjectStore((s) => s.removeCabinet);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const loadSampleKitchen = useProjectStore((s) => s.loadSampleKitchen);
  const generateBenchtops = useProjectStore((s) => s.generateBenchtops);
  const regenerateBenchtop = useProjectStore((s) => s.regenerateBenchtop);
  const updateBenchtop = useProjectStore((s) => s.updateBenchtop);
  const deleteBenchtop = useProjectStore((s) => s.deleteBenchtop);
  const generateKickBases = useProjectStore((s) => s.generateKickBases);
  const regenerateKickBase = useProjectStore((s) => s.regenerateKickBase);
  const updateKickBase = useProjectStore((s) => s.updateKickBase);
  const deleteKickBase = useProjectStore((s) => s.deleteKickBase);

  const standards = useProjectStore((s) => s.standards);
  const storageError = useProjectStore((s) => s.storageError);
  const updateConstruction = useProjectStore((s) => s.updateConstruction);
  const updateDefaults = useProjectStore((s) => s.updateDefaults);
  const updateSheet = useProjectStore((s) => s.updateSheet);
  const updateDoorStyles = useProjectStore((s) => s.updateDoorStyles);
  const updateHardware = useProjectStore((s) => s.updateHardware);
  const updateStandards = useProjectStore((s) => s.updateStandards);
  const saveAsStandards = useProjectStore((s) => s.saveAsStandards);
  const resetToStandards = useProjectStore((s) => s.resetToStandards);
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const updateRoom = useProjectStore((s) => s.updateRoom);
  const moveCabinet = useProjectStore((s) => s.moveCabinet);
  const saveCabinetAsType = useProjectStore((s) => s.saveCabinetAsType);
  const addFromSavedType = useProjectStore((s) => s.addFromSavedType);
  const deleteSavedType = useProjectStore((s) => s.deleteSavedType);
  const newProject = useProjectStore((s) => s.newProject);

  const placeCabinetOnWall = useProjectStore((s) => s.placeCabinetOnWall);

  const [tab, setTab] = useState<Tab>('cutlist');
  const [view, setView] = useState<View>('3d');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWalls, setShowWalls] = useState(true);

  const built = useMemo(() => buildProject(project), [project]);
  const cost = useMemo(() => costProject(project), [project]);
  const cutlist = useMemo(() => buildCutlist(project), [project]);
  const layoutIssues = useMemo(() => checkLayout(project), [project]);

  const selected = built.find((b) => b.cabinet.id === selectedCabinetId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Cabinet Collective</strong>
          <span className="muted">Phase 2 — carcasses, drawer boxes, Blum hardware and drilling</span>
        </div>
        <div className="topbar-stats">
          <div className="stat">
            <span className="muted">Cabinets</span>
            <strong>{built.length}</strong>
          </div>
          <div className="stat">
            <span className="muted">Parts</span>
            <strong>{cost.panelCount}</strong>
          </div>
          <div className="stat">
            <span className="muted">Total</span>
            <strong>{formatAud(cost.totalIncGst)}</strong>
          </div>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <div className="menu">
            <button className="btn">Job ▾</button>
            <div className="menu-items">
              <button onClick={() => newProject('New job')}>New empty job</button>
              <button onClick={loadSampleKitchen}>Load sample kitchen</button>
              <button onClick={() => exportProjectFile(project)}>Save to file…</button>
              <label>
                Open from file…
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      replaceProject(await importProjectFile(file));
                    } catch (err) {
                      alert(`Could not open that file: ${err instanceof Error ? err.message : err}`);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      {storageError && (
        <div className="issue-bar">
          <span className="issue">Couldn't save to this browser: {storageError}</span>
        </div>
      )}

      {layoutIssues.length > 0 && (
        <div className="issue-bar">
          {layoutIssues.map((issue) => (
            <button
              key={issue.message}
              className="issue"
              onClick={() => select(issue.cabinetIds[0] ?? null)}
            >
              {issue.message}
            </button>
          ))}
        </div>
      )}

      <div className="layout">
        <aside className="sidebar left">
          <CabinetList
            built={built}
            selectedId={selectedCabinetId}
            onSelect={select}
            onAdd={addCabinet}
            onRemove={removeCabinet}
            savedTypes={standards.savedTypes}
            onAddSaved={addFromSavedType}
            onDeleteSaved={deleteSavedType}
          />
          <Inspector
            built={selected}
            project={project}
            onUpdate={updateCabinet}
            onUpdateOptions={updateOptions}
            onSaveAsType={saveCabinetAsType}
            onPlaceOnWall={placeCabinetOnWall}
          />
        </aside>

        <main className="viewport">
          {view !== 'plan' ? (
            <Viewport3D
              built={built}
              project={project}
              selectedCabinetId={selectedCabinetId}
              onSelect={select}
              showWalls={showWalls}
              wireframe={view === 'wireframe'}
              onMoveCabinet={moveCabinet}
            />
          ) : (
            <PlanView
              project={project}
              selectedCabinetId={selectedCabinetId}
              onSelectCabinet={select}
              onUpdateRoom={updateRoom}
            />
          )}

          <div className="viewport-controls">
            <div className="seg view-seg">
              <button
                className={`seg-btn${view === '3d' ? ' is-active' : ''}`}
                onClick={() => setView('3d')}
              >
                3D
              </button>
              <button
                className={`seg-btn${view === 'wireframe' ? ' is-active' : ''}`}
                onClick={() => setView('wireframe')}
              >
                Wireframe
              </button>
              <button
                className={`seg-btn${view === 'plan' ? ' is-active' : ''}`}
                onClick={() => setView('plan')}
              >
                Plan
              </button>
            </div>
            {view !== 'plan' && (
              <label className="viewport-toggle">
                <input
                  type="checkbox"
                  checked={showWalls}
                  onChange={(e) => setShowWalls(e.target.checked)}
                />
                Walls
              </label>
            )}
          </div>

          <div className="viewport-hint muted">
            {view !== 'plan' ? (
              <>
                Drag to orbit · scroll to zoom · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>{' '}
                move, <kbd>Q</kbd><kbd>E</kbd> down/up, <kbd>Shift</kbd> faster · click to select,
                drag to move — a cabinet dragged near a wall goes flush against it
              </>
            ) : (
              <>Click a wall to select it, then type what it measures</>
            )}
          </div>
        </main>

        <aside className="sidebar right">
          <nav className="tabs">
            <button
              className={`tab${tab === 'cutlist' ? ' is-active' : ''}`}
              onClick={() => setTab('cutlist')}
            >
              Cutlist
            </button>
            <button
              className={`tab${tab === 'nest' ? ' is-active' : ''}`}
              onClick={() => setTab('nest')}
            >
              Nest
            </button>
            <button
              className={`tab${tab === 'hardware' ? ' is-active' : ''}`}
              onClick={() => setTab('hardware')}
            >
              Hardware
            </button>
            <button
              className={`tab${tab === 'tops' ? ' is-active' : ''}`}
              onClick={() => setTab('tops')}
            >
              Tops
            </button>
            <button
              className={`tab${tab === 'cost' ? ' is-active' : ''}`}
              onClick={() => setTab('cost')}
            >
              Cost
            </button>
          </nav>
          {tab === 'cutlist' && <CutlistPanel lines={cutlist} project={project} />}
          {/* The nest the quote was costed from, not a second one — see `CostBreakdown.nest`. */}
          {tab === 'nest' && <NestPanel project={project} nest={cost.nest} />}
          {tab === 'hardware' && <HardwarePanel project={project} />}
          {tab === 'tops' && (
            <BenchtopPanel
              project={project}
              onGenerateBenchtops={generateBenchtops}
              onRegenerateBenchtop={regenerateBenchtop}
              onUpdateBenchtop={updateBenchtop}
              onDeleteBenchtop={deleteBenchtop}
              onGenerateKickBases={generateKickBases}
              onRegenerateKickBase={regenerateKickBase}
              onUpdateKickBase={updateKickBase}
              onDeleteKickBase={deleteKickBase}
            />
          )}
          {tab === 'cost' && (
            <CostPanel cost={cost} settings={project.settings} onUpdateSettings={updateSettings} />
          )}
        </aside>
      </div>

      {settingsOpen && (
        <SettingsModal
          project={project}
          standards={standards}
          onClose={() => setSettingsOpen(false)}
          onUpdateHardware={updateHardware}
          onUpdateConstruction={updateConstruction}
          onUpdateSettings={updateSettings}
          onUpdateDefaults={updateDefaults}
          onUpdateSheet={updateSheet}
          onUpdateDoorStyles={updateDoorStyles}
          onUpdateStandards={updateStandards}
          onSaveAsStandards={saveAsStandards}
          onResetToStandards={resetToStandards}
          onUpdateRoom={updateRoom}
        />
      )}
    </div>
  );
}
