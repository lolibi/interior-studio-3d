import { useState } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { AdminPanel } from './components/AdminPanel';
import { CATEGORY_LABELS } from './types/editor';
import type {
  CatalogModel,
  DimensionsCm,
  DisplayUnit,
  ModelCategory,
  ScaleMode,
  TransformTool,
} from './types/editor';
import {
  deleteGlbFile,
  loadCatalog,
  resetCatalogToDefaults,
  saveCatalog,
  saveGlbFile,
} from './utils/modelStorage';

const SCALE_MODE_SHORT: Record<ScaleMode, string> = {
  fixed: 'Фиксиран',
  constrained: 'Ограничен',
  free: 'Свободен',
};

function formatDimensions(dims: DimensionsCm, unit: DisplayUnit): string {
  if (unit === 'cm') {
    return `${dims.width} × ${dims.height} × ${dims.depth} см`;
  }
  return `${(dims.width / 100).toFixed(2)} × ${(dims.height / 100).toFixed(2)} × ${(dims.depth / 100).toFixed(2)} м`;
}

export function App() {
  const [models, setModels] = useState<CatalogModel[]>(() => loadCatalog());
  const [activeTool, setActiveTool] = useState<TransformTool>('translate');
  const [unit, setUnit] = useState<DisplayUnit>('cm');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ModelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const unitLabel = unit === 'cm' ? 'см' : 'м';

  const activeModels = models.filter((model) => {
    if (!model.isActive) return false;
    if (selectedCategory !== 'all' && model.category !== selectedCategory) return false;
    if (
      searchQuery.trim() &&
      !model.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  async function handleSaveModel(model: CatalogModel, glbFile?: File | null) {
    if (glbFile && model.glbStorageKey) {
      const previous = models.find((m) => m.id === model.id);
      if (previous?.glbStorageKey && previous.glbStorageKey !== model.glbStorageKey) {
        await deleteGlbFile(previous.glbStorageKey);
      }
      await saveGlbFile(model.glbStorageKey, glbFile);
    }

    setModels((prev) => {
      const exists = prev.some((m) => m.id === model.id);
      const updated = exists
        ? prev.map((m) => (m.id === model.id ? model : m))
        : [model, ...prev];
      saveCatalog(updated);
      return updated;
    });
  }

  function handleToggleActive(id: string) {
    setModels((prev) => {
      const updated = prev.map((m) =>
        m.id === id ? { ...m, isActive: !m.isActive } : m
      );
      saveCatalog(updated);
      return updated;
    });
  }

  async function handleDeleteModel(model: CatalogModel) {
    if (model.glbStorageKey) {
      await deleteGlbFile(model.glbStorageKey);
    }
    setModels((prev) => {
      const updated = prev.filter((m) => m.id !== model.id);
      saveCatalog(updated);
      return updated;
    });
  }

  function handleResetDefaults() {
    const defaults = resetCatalogToDefaults();
    setModels(defaults);
  }

  return (
    <div className="app-shell">
      {/* Горна лента с инструменти */}
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <span>Interior Studio 3D</span>
            <span className="brand-badge">v0.2</span>
          </div>
        </div>

        {/* Инструменти за трансформация */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${activeTool === 'translate' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('translate')}
          >
            Преместване (W)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'rotate' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('rotate')}
          >
            Въртене (E)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'scale' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('scale')}
          >
            Мащаб (R)
          </button>
        </div>

        {/* Мерни единици, сцена и Админ панел */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${unit === 'cm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('cm')}
            title="Показвай стойностите в сантиметри"
          >
            см
          </button>
          <button
            type="button"
            className={`btn ${unit === 'm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('m')}
            title="Показвай стойностите в метри"
          >
            м
          </button>

          <button type="button" className="btn" disabled title="Ще бъде активирано в Етап 7">
            Запази сцена
          </button>

          <button
            type="button"
            className={`btn ${isAdminOpen ? 'btn-active' : ''}`}
            onClick={() => setIsAdminOpen((prev) => !prev)}
          >
            {isAdminOpen ? 'Към 3D Редактора' : 'Админ панел'}
          </button>
        </div>
      </header>

      {/* Основна работна зона */}
      {isAdminOpen ? (
        <AdminPanel
          models={models}
          onSaveModel={handleSaveModel}
          onToggleActive={handleToggleActive}
          onDeleteModel={handleDeleteModel}
          onResetDefaults={handleResetDefaults}
          onClose={() => setIsAdminOpen(false)}
        />
      ) : (
        <main className="workspace">
          {/* Ляв панел: Библиотека */}
          <aside className="sidebar-left">
            <div className="panel-header">
              <span>Библиотека мебели</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {activeModels.length} модела
              </span>
            </div>

            <div className="panel-body">
              <input
                type="text"
                className="input-control"
                placeholder="Търсене на модел..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <select
                className="select-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as 'all' | ModelCategory)}
              >
                <option value="all">Всички категории</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              {activeModels.length === 0 ? (
                <div className="empty-state-box">
                  Няма намерени активни модели по зададения филтър.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeModels.map((model) => (
                    <div
                      key={model.id}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {model.previewDataUrl ? (
                          <img
                            src={model.previewDataUrl}
                            alt={model.name}
                            style={{
                              width: '48px',
                              height: '48px',
                              objectFit: 'cover',
                              borderRadius: '5px',
                              border: '1px solid #334155',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '5px',
                              backgroundColor: '#1e293b',
                              border: '1px dashed #475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: model.glbStorageKey ? '#34d399' : '#94a3b8',
                              flexShrink: 0,
                            }}
                          >
                            {model.glbStorageKey ? 'GLB' : '3D'}
                          </div>
                        )}

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '12px',
                              color: '#f8fafc',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={model.name}
                          >
                            {model.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {formatDimensions(model.dimensionsCm, unit)}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>
                            {CATEGORY_LABELS[model.category]} • {SCALE_MODE_SHORT[model.scaleMode]}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn"
                        style={{ width: '100%', fontSize: '11px' }}
                        disabled
                        title="Поставянето в 3D сцената ще бъде активирано в Етап 5"
                      >
                        + Добави в сцената (Етап 5)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Централен 3D прозорец */}
          <section className="viewport-container">
            <Viewport3D />
            <div className="viewport-hint">
              Ляв бутон: Въртене • Десен бутон: Преместване • Скрол: Приближаване | Клетка = 10 см /
              Квадрат = 1 м
            </div>
          </section>

          {/* Десен панел: Настройки на избрания обект */}
          <aside className="sidebar-right">
            <div className="panel-header">
              <span>Настройки на обект</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Единици: {unitLabel}</span>
            </div>

            <div className="panel-body">
              <div className="empty-state-box">
                Няма избран обект. В Етап 5 ще активираме поставянето на мебели в апартамента и
                управлението на координатите им тук.
              </div>

              <div>
                <div className="section-label">Позиция ({unitLabel})</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>X</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Y</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Z</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>

              <div>
                <div className="section-label">Ротация (градуси)</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>X</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Y</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Z</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>

              <div>
                <div className="section-label">Размери ({unitLabel})</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Ш (X)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>В (Y)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Д (Z)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

export default App;