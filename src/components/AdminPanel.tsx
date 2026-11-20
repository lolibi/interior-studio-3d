import { useRef, useState } from 'react';
import { Box3, Mesh, Vector3 } from 'three';
import { createConfiguredGLTFLoader } from '../utils/gltfLoader';
import { CATEGORY_LABELS } from '../types/editor';
import type {
  CatalogModel,
  DimensionsCm,
  ModelCategory,
  ScaleMode,
} from '../types/editor';

interface AdminPanelProps {
  models: CatalogModel[];
  onSaveModel: (model: CatalogModel, glbFile?: File | null) => Promise<void>;
  onToggleActive: (id: string) => void;
  onDeleteModel: (model: CatalogModel) => Promise<void>;
  onResetDefaults: () => void;
  onClose: () => void;
}

type GlbSourceUnit = 'cm' | 'm';

const DEFAULT_DIMS: DimensionsCm = { width: 100, height: 80, depth: 60 };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function computeDimensionsFromRawSize(rawSize: Vector3, sourceUnit: GlbSourceUnit): DimensionsCm {
  // При 3ds Max Scale Factor 100: 1 единица в GLB = 1 см (множител 1 за см)
  // При стандартен glTF (метри): 1 единица в GLB = 1 м (множител 100 за см)
  const toCmFactor = sourceUnit === 'cm' ? 1 : 100;

  return {
    width: Math.max(1, Math.round(rawSize.x * toCmFactor)),
    height: Math.max(1, Math.round(rawSize.y * toCmFactor)),
    depth: Math.max(1, Math.round(rawSize.z * toCmFactor)),
  };
}

export function AdminPanel({
  models,
  onSaveModel,
  onToggleActive,
  onDeleteModel,
  onResetDefaults,
  onClose,
}: AdminPanelProps) {
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ModelCategory>('sofas');
  const [glbSourceUnit, setGlbSourceUnit] = useState<GlbSourceUnit>('cm');
  const [rawBboxSize, setRawBboxSize] = useState<Vector3 | null>(null);
  const [dimensionsCm, setDimensionsCm] = useState<DimensionsCm>({ ...DEFAULT_DIMS });
  const [dimensionsManuallyEdited, setDimensionsManuallyEdited] = useState(false);
  const [detectedBboxCm, setDetectedBboxCm] = useState<DimensionsCm | null>(null);
  const [modelStats, setModelStats] = useState<{ meshes: number; triangles: number } | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fixed');
  const [allowX, setAllowX] = useState(true);
  const [allowY, setAllowY] = useState(false);
  const [allowZ, setAllowZ] = useState(false);
  const [minCm, setMinCm] = useState<DimensionsCm>({ width: 60, height: 40, depth: 40 });
  const [maxCm, setMaxCm] = useState<DimensionsCm>({ width: 300, height: 260, depth: 200 });
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [existingGlbKey, setExistingGlbKey] = useState<string | undefined>(undefined);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function clearFileInputs() {
    if (glbInputRef.current) {
      glbInputRef.current.value = '';
    }
    if (previewInputRef.current) {
      previewInputRef.current.value = '';
    }
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setCategory('sofas');
    setRawBboxSize(null);
    setDimensionsCm({ ...DEFAULT_DIMS });
    setDimensionsManuallyEdited(false);
    setDetectedBboxCm(null);
    setModelStats(null);
    setScaleMode('fixed');
    setAllowX(true);
    setAllowY(false);
    setAllowZ(false);
    setMinCm({ width: 60, height: 40, depth: 40 });
    setMaxCm({ width: 300, height: 260, depth: 200 });
    setGlbFile(null);
    setExistingGlbKey(undefined);
    setPreviewDataUrl(undefined);
    clearFileInputs();
  }

  function startEditing(model: CatalogModel) {
    clearFileInputs();
    setEditingId(model.id);
    setName(model.name);
    setCategory(model.category);
    setRawBboxSize(null);
    setDimensionsCm({ ...model.dimensionsCm });
    setDimensionsManuallyEdited(true);
    setDetectedBboxCm(null);
    setModelStats(null);
    setScaleMode(model.scaleMode);
    setAllowX(model.scaleConstraints.allowX);
    setAllowY(model.scaleConstraints.allowY);
    setAllowZ(model.scaleConstraints.allowZ);
    setMinCm({ ...model.scaleConstraints.minCm });
    setMaxCm({ ...model.scaleConstraints.maxCm });
    setGlbFile(null);
    setExistingGlbKey(model.glbStorageKey);
    setPreviewDataUrl(model.previewDataUrl);
    setStatusMessage(`Редактиране на: ${model.name}`);
  }

  function handleSourceUnitChange(nextUnit: GlbSourceUnit) {
    setGlbSourceUnit(nextUnit);
    if (rawBboxSize) {
      const recalculated = computeDimensionsFromRawSize(rawBboxSize, nextUnit);
      setDetectedBboxCm(recalculated);
      if (!dimensionsManuallyEdited) {
        setDimensionsCm(recalculated);
      }
    }
  }

  async function handleGlbFileChange(file: File | null) {
    setGlbFile(file);
    setRawBboxSize(null);
    setDetectedBboxCm(null);
    setModelStats(null);

    if (!file) return;

    if (!name.trim()) {
      const cleanName = file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ');
      setName(cleanName);
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const loader = createConfiguredGLTFLoader();
      const gltf = await loader.loadAsync(objectUrl);

      let meshes = 0;
      let triangles = 0;
      gltf.scene.traverse((child) => {
        if (child instanceof Mesh && child.geometry) {
          meshes += 1;
          const geom = child.geometry;
          if (geom.index) {
            triangles += Math.round(geom.index.count / 3);
          } else if (geom.attributes.position) {
            triangles += Math.round(geom.attributes.position.count / 3);
          }
        }
      });
      setModelStats({ meshes, triangles });

      gltf.scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(gltf.scene);

      if (!box.isEmpty()) {
        const size = new Vector3();
        box.getSize(size);
        setRawBboxSize(size);

        const bboxDims = computeDimensionsFromRawSize(size, glbSourceUnit);
        setDetectedBboxCm(bboxDims);

        if (!dimensionsManuallyEdited) {
          setDimensionsCm(bboxDims);
          setStatusMessage(
            `Засечен Bounding Box: ${bboxDims.width} × ${bboxDims.height} × ${bboxDims.depth} см (${meshes} меша, ${triangles.toLocaleString('bg-BG')} триъгълника).`
          );
        } else {
          setStatusMessage(
            `Файлът е зареден (${meshes} меша, ${triangles.toLocaleString('bg-BG')} триъгълника). Запазени са ръчно въведените размери.`
          );
        }
      } else {
        setStatusMessage('Файлът няма геометрия за измерване на Bounding Box. Въведете размерите ръчно.');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setStatusMessage(
        `Файлът не можа да бъде анализиран (${reason}). Моля, въведете размерите ръчно.`
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function handleDimensionInput(axis: keyof DimensionsCm, rawValue: string) {
    setDimensionsManuallyEdited(true);
    setDimensionsCm((prev) => ({
      ...prev,
      [axis]: Number(rawValue),
    }));
  }

  async function handlePreviewChange(file: File | undefined) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPreviewDataUrl(dataUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setStatusMessage('Моля, въведете име на модела.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const id = editingId ?? `custom-${Date.now()}`;
      const glbStorageKey = glbFile ? `glb-${id}-${Date.now()}` : existingGlbKey;

      const normalizedConstraints =
        scaleMode === 'fixed'
          ? {
              allowX: false,
              allowY: false,
              allowZ: false,
              minCm: { ...dimensionsCm },
              maxCm: { ...dimensionsCm },
            }
          : scaleMode === 'free'
            ? {
                allowX: true,
                allowY: true,
                allowZ: true,
                minCm: { ...minCm },
                maxCm: { ...maxCm },
              }
            : {
                allowX,
                allowY,
                allowZ,
                minCm: { ...minCm },
                maxCm: { ...maxCm },
              };

      const existingModel = models.find((m) => m.id === editingId);
      const savedName = name.trim();

      const modelToSave: CatalogModel = {
        id,
        name: savedName,
        category,
        dimensionsCm: {
          width: Math.max(1, Number(dimensionsCm.width) || 1),
          height: Math.max(1, Number(dimensionsCm.height) || 1),
          depth: Math.max(1, Number(dimensionsCm.depth) || 1),
        },
        scaleMode,
        scaleConstraints: normalizedConstraints,
        glbStorageKey,
        previewDataUrl,
        isActive: existingModel ? existingModel.isActive : true,
        isBuiltIn: existingModel?.isBuiltIn ?? false,
      };

      await onSaveModel(modelToSave, glbFile);
      resetForm();
      setStatusMessage(
        editingId
          ? `Моделът "${savedName}" беше обновен успешно.`
          : `Моделът "${savedName}" беше добавен в библиотеката. Формата е изчистена за нов модел.`
      );
    } catch {
      setStatusMessage('Възникна грешка при запазването на модела.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteWithConfirm(model: CatalogModel) {
    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете "${model.name}" от библиотеката?`
    );
    if (!confirmed) return;

    await onDeleteModel(model);
    if (editingId === model.id) {
      resetForm();
    }
    setStatusMessage(`Моделът "${model.name}" беше изтрит.`);
  }

  const scaleModeLabels: Record<ScaleMode, string> = {
    fixed: 'Фиксиран',
    constrained: 'Ограничен',
    free: 'Свободен',
  };

  return (
    <main
      className="workspace"
      style={{
        padding: '20px',
        gap: '20px',
        overflowY: 'auto',
        alignItems: 'flex-start',
        backgroundColor: '#0f172a',
      }}
    >
      {/* Лява колона: Форма за добавяне / редакция на модел */}
      <section
        style={{
          width: '430px',
          flexShrink: 0,
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            paddingBottom: '10px',
            borderBottom: '1px solid #334155',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
            {editingId ? 'Редактиране на модел' : 'Добавяне на нов 3D модел'}
          </h2>
          {editingId && (
            <button type="button" className="btn" onClick={resetForm}>
              Отказ
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Единици при експорт от 3ds Max */}
          <div>
            <div className="section-label">Мащаб на GLB файла при експорт</div>
            <select
              className="select-control"
              value={glbSourceUnit}
              onChange={(e) => handleSourceUnitChange(e.target.value as GlbSourceUnit)}
            >
              <option value="cm">Сантиметри (3ds Max Scale Factor 100 → ÷100)</option>
              <option value="m">Метри (стандартен glTF 1:1)</option>
            </select>
          </div>

          {/* Качване на GLB */}
          <div>
            <div className="section-label">3D Файл (.GLB препоръчително)</div>
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,.gltf"
              className="input-control"
              onChange={(e) => handleGlbFileChange(e.target.files?.[0] ?? null)}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              {glbFile
                ? `Файл: ${glbFile.name} (${(glbFile.size / 1024).toFixed(1)} KB)`
                : existingGlbKey
                  ? 'Има прикачен 3D файл (изберете нов само за подмяна)'
                  : 'При избор на GLB размерите се взимат автоматично от Bounding Box.'}
            </div>
            {modelStats && (
              <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                Геометрия: {modelStats.meshes} меша • {modelStats.triangles.toLocaleString('bg-BG')}{' '}
                триъгълника
              </div>
            )}
          </div>

          <div>
            <div className="section-label">Име на модела *</div>
            <input
              type="text"
              className="input-control"
              placeholder="Напр. Ъглов диван Лукс"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="section-label">Категория</div>
            <select
              className="select-control"
              value={category}
              onChange={(e) => setCategory(e.target.value as ModelCategory)}
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Качване на Preview */}
          <div>
            <div className="section-label">Preview изображение (JPG / PNG / WebP)</div>
            <input
              ref={previewInputRef}
              type="file"
              accept="image/*"
              className="input-control"
              onChange={(e) => handlePreviewChange(e.target.files?.[0])}
            />
            {previewDataUrl && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={previewDataUrl}
                  alt="Preview"
                  style={{
                    width: '64px',
                    height: '64px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                  }}
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setPreviewDataUrl(undefined);
                    if (previewInputRef.current) {
                      previewInputRef.current.value = '';
                    }
                  }}
                >
                  Премахни снимката
                </button>
              </div>
            )}
          </div>

          {/* Реални размери в сантиметри */}
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
                Базови размери (см) {detectedBboxCm && !dimensionsManuallyEdited ? '• от BBox' : ''}
              </div>
              {detectedBboxCm && dimensionsManuallyEdited && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 6px', fontSize: '11px' }}
                  onClick={() => {
                    setDimensionsCm(detectedBboxCm);
                    setDimensionsManuallyEdited(false);
                  }}
                >
                  Вземи от BBox ({detectedBboxCm.width}×{detectedBboxCm.height}×{detectedBboxCm.depth})
                </button>
              )}
            </div>
            <div className="axis-grid">
              <div className="axis-field">
                <span>Ширина (X)</span>
                <input
                  type="number"
                  min={1}
                  className="input-control"
                  value={dimensionsCm.width}
                  onChange={(e) => handleDimensionInput('width', e.target.value)}
                />
              </div>
              <div className="axis-field">
                <span>Височина (Y)</span>
                <input
                  type="number"
                  min={1}
                  className="input-control"
                  value={dimensionsCm.height}
                  onChange={(e) => handleDimensionInput('height', e.target.value)}
                />
              </div>
              <div className="axis-field">
                <span>Дълбочина (Z)</span>
                <input
                  type="number"
                  min={1}
                  className="input-control"
                  value={dimensionsCm.depth}
                  onChange={(e) => handleDimensionInput('depth', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Режим на мащабиране */}
          <div>
            <div className="section-label">Режим на мащабиране</div>
            <select
              className="select-control"
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value as ScaleMode)}
            >
              <option value="fixed">Фиксирани размери (без промяна)</option>
              <option value="constrained">Ограничено мащабиране (по оси и мин/макс)</option>
              <option value="free">Свободно мащабиране (по всички оси)</option>
            </select>
          </div>

          {/* Настройки при ограничено или свободно мащабиране */}
          {scaleMode !== 'fixed' && (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {scaleMode === 'constrained' && (
                <div>
                  <div className="section-label">Позволени оси за промяна</div>
                  <div style={{ display: 'flex', gap: '14px', fontSize: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="checkbox"
                        checked={allowX}
                        onChange={(e) => setAllowX(e.target.checked)}
                      />
                      Ширина (X)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="checkbox"
                        checked={allowY}
                        onChange={(e) => setAllowY(e.target.checked)}
                      />
                      Височина (Y)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="checkbox"
                        checked={allowZ}
                        onChange={(e) => setAllowZ(e.target.checked)}
                      />
                      Дълбочина (Z)
                    </label>
                  </div>
                </div>
              )}

              <div>
                <div className="section-label">Минимални размери (см)</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Мин X</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={minCm.width}
                      onChange={(e) => setMinCm({ ...minCm, width: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Мин Y</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={minCm.height}
                      onChange={(e) => setMinCm({ ...minCm, height: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Мин Z</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={minCm.depth}
                      onChange={(e) => setMinCm({ ...minCm, depth: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="section-label">Максимални размери (см)</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Макс X</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={maxCm.width}
                      onChange={(e) => setMaxCm({ ...maxCm, width: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Макс Y</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={maxCm.height}
                      onChange={(e) => setMaxCm({ ...maxCm, height: Number(e.target.value) })}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Макс Z</span>
                    <input
                      type="number"
                      min={1}
                      className="input-control"
                      value={maxCm.depth}
                      onChange={(e) => setMaxCm({ ...maxCm, depth: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {statusMessage && (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #3b82f6',
                color: '#93c5fd',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.45,
              }}
            >
              {statusMessage}
            </div>
          )}

          <button type="submit" className="btn btn-active" disabled={isSaving}>
            {isSaving
              ? 'Запазване...'
              : editingId
                ? 'Запази промените'
                : 'Добави в библиотеката'}
          </button>
        </form>
      </section>

      {/* Дясна колона: Списък с всички модели в каталога */}
      <section
        style={{
          flex: 1,
          minWidth: '360px',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            paddingBottom: '10px',
            borderBottom: '1px solid #334155',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
            Каталог модели ({models.length})
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn" onClick={onResetDefaults}>
              Възстанови базовите
            </button>
            <button type="button" className="btn btn-active" onClick={onClose}>
              Към 3D Редактора
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {models.map((model) => (
            <div
              key={model.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 12px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                opacity: model.isActive ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {model.previewDataUrl ? (
                  <img
                    src={model.previewDataUrl}
                    alt={model.name}
                    style={{
                      width: '48px',
                      height: '48px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '6px',
                      backgroundColor: '#1e293b',
                      border: '1px dashed #475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: '#94a3b8',
                      textAlign: 'center',
                    }}
                  >
                    {model.glbStorageKey ? 'GLB' : '3D'}
                  </div>
                )}

                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>
                    {model.name}{' '}
                    {model.glbStorageKey && (
                      <span
                        style={{
                          fontSize: '10px',
                          backgroundColor: '#065f46',
                          color: '#a7f3d0',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          marginLeft: '4px',
                        }}
                      >
                        GLB
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    {CATEGORY_LABELS[model.category]} • {model.dimensionsCm.width} ×{' '}
                    {model.dimensionsCm.height} × {model.dimensionsCm.depth} см • Мащаб:{' '}
                    {scaleModeLabels[model.scaleMode]}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  className={`btn ${model.isActive ? 'btn-active' : ''}`}
                  onClick={() => onToggleActive(model.id)}
                >
                  {model.isActive ? 'Активен' : 'Скрит'}
                </button>
                <button type="button" className="btn" onClick={() => startEditing(model)}>
                  Редактирай
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteWithConfirm(model)}
                >
                  Изтрий
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}