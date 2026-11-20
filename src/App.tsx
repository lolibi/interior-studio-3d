import { useEffect, useState } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { AdminPanel } from './components/AdminPanel';
import { CATEGORY_LABELS } from './types/editor';
import type {
  CatalogModel,
  DimensionsCm,
  DisplayUnit,
  ModelCategory,
  ScaleMode,
  SceneObject,
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

function formatUnitValue(meters: number, unit: DisplayUnit): number {
  if (unit === 'cm') {
    return Math.round(meters * 1000) / 10;
  }
  return Math.round(meters * 1000) / 1000;
}

function radToDeg(rad: number): number {
  return Math.round(((rad * 180) / Math.PI) * 10) / 10;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function App() {
  const [models, setModels] = useState<CatalogModel[]>(() => loadCatalog());
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<TransformTool>('translate');
  const [unit, setUnit] = useState<DisplayUnit>('cm');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ModelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const unitLabel = unit === 'cm' ? 'см' : 'м';

  const selectedObject =
    sceneObjects.find((obj) => obj.instanceId === selectedInstanceId) ?? null;
  const selectedModel = selectedObject
    ? models.find((m) => m.id === selectedObject.modelId) ?? null
    : null;

  // Клавишни комбинации W / E / R / Delete / Escape (само когато не се пише в текстово поле)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isAdminOpen) return;

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'w') {
        setActiveTool('translate');
      } else if (key === 'e') {
        setActiveTool('rotate');
      } else if (key === 'r') {
        setActiveTool('scale');
      } else if (e.key === 'Escape') {
        setSelectedInstanceId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedInstanceId) {
        e.preventDefault();
        setSceneObjects((prev) =>
          prev.filter((obj) => obj.instanceId !== selectedInstanceId)
        );
        setSelectedInstanceId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdminOpen, selectedInstanceId]);

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
    setSceneObjects((prev) => prev.filter((obj) => obj.modelId !== model.id));
    if (selectedObject?.modelId === model.id) {
      setSelectedInstanceId(null);
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

  function handleAddToScene(model: CatalogModel) {
    const offsetIndex = sceneObjects.length % 6;
    const offsetX = -1.6 + offsetIndex * 0.25;
    const offsetZ = 0.8 + (offsetIndex % 3) * 0.25;

    const newInstance: SceneObject = {
      instanceId: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelId: model.id,
      position: [Number(offsetX.toFixed(2)), 0, Number(offsetZ.toFixed(2))],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    setSceneObjects((prev) => [...prev, newInstance]);
    setSelectedInstanceId(newInstance.instanceId);
  }

  function handleTransformChange(
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) {
    setSceneObjects((prev) =>
      prev.map((obj) =>
        obj.instanceId === instanceId
          ? { ...obj, position, rotation, scale }
          : obj
      )
    );
  }

  function handlePositionInput(axisIndex: 0 | 1 | 2, rawValue: string) {
    if (!selectedObject) return;
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;

    let meters = unit === 'cm' ? parsed / 100 : parsed;
    if (axisIndex === 1) {
      meters = Math.max(0, meters);
    }

    const nextPos: [number, number, number] = [...selectedObject.position];
    nextPos[axisIndex] = meters;
    handleTransformChange(
      selectedObject.instanceId,
      nextPos,
      selectedObject.rotation,
      selectedObject.scale
    );
  }

  function handleRotationInput(axisIndex: 0 | 1 | 2, rawValue: string) {
    if (!selectedObject) return;
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;

    const nextRot: [number, number, number] = [...selectedObject.rotation];
    nextRot[axisIndex] = degToRad(parsed);
    handleTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      nextRot,
      selectedObject.scale
    );
  }

  function handleRotateYBy(deltaDegrees: number) {
    if (!selectedObject) return;
    const nextRot: [number, number, number] = [...selectedObject.rotation];
    nextRot[1] = nextRot[1] + degToRad(deltaDegrees);
    handleTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      nextRot,
      selectedObject.scale
    );
  }

  function isAxisScalable(model: CatalogModel, axis: 'width' | 'height' | 'depth'): boolean {
    if (model.scaleMode === 'fixed') return false;
    if (model.scaleMode === 'free') return true;
    if (axis === 'width') return model.scaleConstraints.allowX;
    if (axis === 'height') return model.scaleConstraints.allowY;
    return model.scaleConstraints.allowZ;
  }

  function handleDimensionInput(axis: 'width' | 'height' | 'depth', rawValue: string) {
    if (!selectedObject || !selectedModel) return;
    if (!isAxisScalable(selectedModel, axis)) return;

    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;

    const inputCm = unit === 'cm' ? parsed : parsed * 100;
    const minAllowed =
      selectedModel.scaleMode === 'free'
        ? 1
        : Math.max(1, selectedModel.scaleConstraints.minCm[axis]);
    const maxAllowed =
      selectedModel.scaleMode === 'free'
        ? 2000
        : Math.max(minAllowed, selectedModel.scaleConstraints.maxCm[axis]);

    const clampedCm = Math.min(maxAllowed, Math.max(minAllowed, inputCm));
    const baseCm = Math.max(1, selectedModel.dimensionsCm[axis]);
    const newRatio = clampedCm / baseCm;

    const nextScale: [number, number, number] = [...selectedObject.scale];
    if (axis === 'width') nextScale[0] = newRatio;
    if (axis === 'height') nextScale[1] = newRatio;
    if (axis === 'depth') nextScale[2] = newRatio;

    handleTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      selectedObject.rotation,
      nextScale
    );
  }

  function handleDuplicateSelected() {
    if (!selectedObject) return;
    const duplicate: SceneObject = {
      instanceId: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelId: selectedObject.modelId,
      position: [
        Number((selectedObject.position[0] + 0.4).toFixed(3)),
        selectedObject.position[1],
        selectedObject.position[2],
      ],
      rotation: [...selectedObject.rotation],
      scale: [...selectedObject.scale],
    };

    setSceneObjects((prev) => [...prev, duplicate]);
    setSelectedInstanceId(duplicate.instanceId);
  }

  function handleDeleteSelected() {
    if (!selectedObject) return;
    setSceneObjects((prev) =>
      prev.filter((obj) => obj.instanceId !== selectedObject.instanceId)
    );
    setSelectedInstanceId(null);
  }

  return (
    <div className="app-shell">
      {/* Горна лента с инструменти */}
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <span>Interior Studio 3D</span>
            <span className="brand-badge">v0.5</span>
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
                        className="btn btn-active"
                        style={{ width: '100%', fontSize: '11px' }}
                        onClick={() => handleAddToScene(model)}
                      >
                        + Добави в сцената
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Централен 3D прозорец */}
          <section className="viewport-container">
            <Viewport3D
              sceneObjects={sceneObjects}
              models={models}
              selectedInstanceId={selectedInstanceId}
              transformTool={activeTool}
              onSelectObject={setSelectedInstanceId}
              onTransformChange={handleTransformChange}
            />
            <div className="viewport-hint">
              Клик върху обект: Избор • W: Преместване • E: Въртене • R: Мащаб • Del: Изтриване |
              Клетка = 10 см / Квадрат = 1 м
            </div>
          </section>

          {/* Десен панел: Настройки на избрания обект */}
          <aside className="sidebar-right">
            <div className="panel-header">
              <span>Настройки на обект</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Единици: {unitLabel}</span>
            </div>

            <div className="panel-body">
              {!selectedObject || !selectedModel ? (
                <>
                  <div className="empty-state-box">
                    Няма избран обект. Добавете мебел от левия панел или кликнете върху обект в
                    3D сцената, за да го местите и въртите.
                  </div>

                  {sceneObjects.length > 0 && (
                    <div>
                      <div className="section-label">
                        Обекти в сцената ({sceneObjects.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sceneObjects.map((obj, idx) => {
                          const m = models.find((item) => item.id === obj.modelId);
                          return (
                            <button
                              key={obj.instanceId}
                              type="button"
                              className="btn"
                              style={{
                                textAlign: 'left',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                              onClick={() => setSelectedInstanceId(obj.instanceId)}
                            >
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {idx + 1}. {m?.name ?? 'Обект'}
                              </span>
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>Избери</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      {selectedModel.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {CATEGORY_LABELS[selectedModel.category]} • Режим:{' '}
                      {SCALE_MODE_SHORT[selectedModel.scaleMode]}
                    </div>
                  </div>

                  {/* Позиция */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <div className="section-label" style={{ marginBottom: 0 }}>
                        Позиция ({unitLabel})
                      </div>
                      {selectedObject.position[1] > 0.001 && (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() =>
                            handleTransformChange(
                              selectedObject.instanceId,
                              [selectedObject.position[0], 0, selectedObject.position[2]],
                              selectedObject.rotation,
                              selectedObject.scale
                            )
                          }
                        >
                          На пода (Y=0)
                        </button>
                      )}
                    </div>
                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>X</span>
                        <input
                          className="input-control"
                          type="number"
                          step={unit === 'cm' ? 1 : 0.01}
                          value={formatUnitValue(selectedObject.position[0], unit)}
                          onChange={(e) => handlePositionInput(0, e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Y</span>
                        <input
                          className="input-control"
                          type="number"
                          min={0}
                          step={unit === 'cm' ? 1 : 0.01}
                          value={formatUnitValue(selectedObject.position[1], unit)}
                          onChange={(e) => handlePositionInput(1, e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Z</span>
                        <input
                          className="input-control"
                          type="number"
                          step={unit === 'cm' ? 1 : 0.01}
                          value={formatUnitValue(selectedObject.position[2], unit)}
                          onChange={(e) => handlePositionInput(2, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ротация */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <div className="section-label" style={{ marginBottom: 0 }}>
                        Ротация (градуси)
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => handleRotateYBy(-90)}
                          title="Завърти наляво с 90°"
                        >
                          -90°
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => handleRotateYBy(90)}
                          title="Завърти надясно с 90°"
                        >
                          +90°
                        </button>
                      </div>
                    </div>
                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>X</span>
                        <input
                          className="input-control"
                          type="number"
                          step={5}
                          value={radToDeg(selectedObject.rotation[0])}
                          onChange={(e) => handleRotationInput(0, e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Y</span>
                        <input
                          className="input-control"
                          type="number"
                          step={5}
                          value={radToDeg(selectedObject.rotation[1])}
                          onChange={(e) => handleRotationInput(1, e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Z</span>
                        <input
                          className="input-control"
                          type="number"
                          step={5}
                          value={radToDeg(selectedObject.rotation[2])}
                          onChange={(e) => handleRotationInput(2, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Размери */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <div className="section-label" style={{ marginBottom: 0 }}>
                        Размери ({unitLabel})
                      </div>
                      {(selectedObject.scale[0] !== 1 ||
                        selectedObject.scale[1] !== 1 ||
                        selectedObject.scale[2] !== 1) && (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() =>
                            handleTransformChange(
                              selectedObject.instanceId,
                              selectedObject.position,
                              selectedObject.rotation,
                              [1, 1, 1]
                            )
                          }
                        >
                          100%
                        </button>
                      )}
                    </div>
                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>Ш (X)</span>
                        <input
                          className="input-control"
                          type="number"
                          step={unit === 'cm' ? 1 : 0.01}
                          disabled={!isAxisScalable(selectedModel, 'width')}
                          value={formatUnitValue(
                            (selectedModel.dimensionsCm.width * selectedObject.scale[0]) / 100,
                            unit
                          )}
                          onChange={(e) => handleDimensionInput('width', e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>В (Y)</span>
                        <input
                          className="input-control"
                          type="number"
                          step={unit === 'cm' ? 1 : 0.01}
                          disabled={!isAxisScalable(selectedModel, 'height')}
                          value={formatUnitValue(
                            (selectedModel.dimensionsCm.height * selectedObject.scale[1]) / 100,
                            unit
                          )}
                          onChange={(e) => handleDimensionInput('height', e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Д (Z)</span>
                        <input
                          className="input-control"
                          type="number"
                          step={unit === 'cm' ? 1 : 0.01}
                          disabled={!isAxisScalable(selectedModel, 'depth')}
                          value={formatUnitValue(
                            (selectedModel.dimensionsCm.depth * selectedObject.scale[2]) / 100,
                            unit
                          )}
                          onChange={(e) => handleDimensionInput('depth', e.target.value)}
                        />
                      </div>
                    </div>
                    {selectedModel.scaleMode === 'fixed' && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Този модел е с фиксирани размери.
                      </div>
                    )}
                  </div>

                  {/* Действия */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      marginTop: '6px',
                      paddingTop: '12px',
                      borderTop: '1px solid #334155',
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      onClick={handleDuplicateSelected}
                    >
                      Дублирай обекта
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDeleteSelected}
                    >
                      Изтрий от сцената (Del)
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

export default App;