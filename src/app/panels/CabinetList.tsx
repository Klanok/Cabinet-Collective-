import { CABINET_TYPE_LABELS, type CabinetTypeId } from '../../core/model/cabinet.ts';
import type { BuiltCabinet } from '../../core/rules/build.ts';
import type { SavedCabinetType } from '../../core/standards/savedTypes.ts';

interface Props {
  built: readonly BuiltCabinet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (typeId: CabinetTypeId) => void;
  onRemove: (id: string) => void;
  savedTypes: readonly SavedCabinetType[];
  onAddSaved: (typeId: string) => void;
  onDeleteSaved: (typeId: string) => void;
}

export function CabinetList({
  built,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
  savedTypes,
  onAddSaved,
  onDeleteSaved,
}: Props) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Cabinets</h2>
        <span className="badge">{built.length}</span>
      </header>

      <div className="add-row">
        {(['base', 'wall', 'tall', 'drawer-bank', 'custom'] as const).map((t) => (
          <button key={t} className="btn" onClick={() => onAdd(t)}>
            + {CABINET_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {savedTypes.length > 0 && (
        <div className="saved-types">
          <div className="saved-types-head">My types</div>
          {savedTypes.map((t) => (
            <div key={t.id} className="saved-type">
              <button className="saved-type-add" onClick={() => onAddSaved(t.id)} title={t.note}>
                + {t.name}
                <em>
                  {t.width} × {t.height} × {t.depth}
                </em>
              </button>
              <button
                className="icon-btn"
                title="Forget this type"
                onClick={() => {
                  if (window.confirm(`Forget the saved type "${t.name}"?`)) onDeleteSaved(t.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <ul className="cabinet-list">
        {built.map(({ cabinet, panels, warnings }) => (
          <li
            key={cabinet.id}
            className={`cabinet-row${cabinet.id === selectedId ? ' is-selected' : ''}`}
            onClick={() => onSelect(cabinet.id)}
          >
            <div className="cabinet-row-main">
              <span className="cabinet-name">{cabinet.name}</span>
              <span className="cabinet-dims">
                {cabinet.width} × {cabinet.height} × {cabinet.depth}
              </span>
            </div>
            <div className="cabinet-row-meta">
              <span className="muted">{CABINET_TYPE_LABELS[cabinet.typeId]}</span>
              <span className="muted">{panels.length} parts</span>
              {warnings.length > 0 && (
                <span className="warn-dot" title={warnings.join('\n')}>
                  !
                </span>
              )}
              <button
                className="icon-btn"
                title="Remove cabinet"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(cabinet.id);
                }}
              >
                ×
              </button>
            </div>
          </li>
        ))}
        {built.length === 0 && <li className="empty">No cabinets yet — add one above.</li>}
      </ul>
    </section>
  );
}
