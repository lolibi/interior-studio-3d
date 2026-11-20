import { useEffect, useState } from 'react';
import { CATEGORY_LABELS } from '../types/editor';
import type {
  CatalogModel,
  CreateModelInput,
  ModelCategory,
  ScaleMode,
} from '../types/editor';
import {
  createStarterWalls,
  getWallAngleDeg,
  getWallLengthM,
  updateWallGeometry,
} from '../types/room';
import type { ApartmentTemplate, WallSegment } from '../types/room';
import {
  createModelOnServer,
  deleteApartmentTemplateOnServer,
  deleteModelOnServer,
  fetchApartmentTemplates,
  saveApartmentTemplateToServer,
  updateModelOnServer,
  uploadGlbFile,
  uploadPreviewImage,
} from '../utils/apiClient';

interface AdminPanelProps {
  models: CatalogModel[];
  onModelsUpdated: () => Promise<void> | void;
  onClose: () => void;
}

const ADMIN_PASS_STORAGE_KEY = 'interior_studio_3d_admin_pass_v1';

const DEFAULT_MODEL_FORM: CreateModelInput = {
  name: '',
  category: 'living_room',
  glbUrl: '',
  previewUrl: '',
  dimensionsCm: { width: 200, height: 85, depth: 95 },
  scaleMode: 'fixed',
  scaleConstraints: {
    allowX: true,
    allowY: false,
    allowZ: true,
    minCm: { width: 100, height: 50, depth: 50 },
    maxCm: { width: 400, height: 250, depth: 250 },
  },
  isActive: true,
};

export function AdminPanel({ models, onModelsUpdated, onClose }: AdminPanelProps) {
  const [adminPassword, setAdminPassword] = useState<string>(() => {
    try {
      return localStorage.getItem(ADMIN_PASS_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // --- Каталог мебели ---
  const [form, setForm] = useState<CreateModelInput>(DEFAULT_MODEL_FORM);
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);

  // --- Шаблони за апартаменти (само през Админ панела) ---
  const [templates, setTemplates] = useState<ApartmentTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateWalls, setTemplateWalls] = useState<WallSegment[]>(() =>
    createStarterWalls(2.65, 0.15)
  );
  const [selectedTplWallId, setSelectedTplWallId] = useState<string | null>(
    () => createStarterWalls(2.65, 0.15)[0]?.id ?? null
  );
  const [tplWallLenInput, setTplWallLenInput] = useState('5');
  const [tplWallDegInput, setTplWallDegInput] = useState('0');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  function handlePasswordChange(value: string) {
    setAdminPassword(value);
    try {
      localStorage.setItem(ADMIN_PASS_STORAGE_KEY, value);
    } catch {
      // Игнориране при пълен localStorage
    }
  }

  useEffect(() => {
    let active = true;
    fetchApartmentTemplates().then((list) => {
      if (active) setTemplates(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedTplWall =
    templateWalls.find((w) => w.id === selectedTplWallId) ?? null;

  useEffect(() => {
    if (selectedTplWall) {
      setTplWallLenInput(String(getWallLengthM(selectedTplWall)));
      setTplWallDegInput(String(getWallAngleDeg(selectedTplWall)));
    }
  }, [selectedTplWall]);

  function applySelectedTplWallGeometry() {
    if (!selectedTplWall) return;
    const len = parseFloat(tplWallLenInput.replace(',', '.'));
    const deg = parseFloat(tplWallDegInput.replace(',', '.'));
    if (Number.isNaN(len) || Number.isNaN(deg)) return;

    const updatedWall = updateWallGeometry(selectedTplWall, len, deg);
    setTemplateWalls((prev) =>
      prev.map((w) => (w.id === selectedTplWall.id ? updatedWall : w))
    );
  }

  function handleAddChainedTplWall() {
    const lastWall = templateWalls[templateWalls.length - 1];
    const startPt: [number, number] = lastWall ? lastWall.end : [0, 0];
    const nextAngleDeg = lastWall ? (getWallAngleDeg(lastWall) + 90) % 360 : 0;
    const rad = (nextAngleDeg * Math.PI) / 180;
    const len = 3.0;
    const endPt: [number, number] = [
      Number((startPt[0] + Math.cos(rad) * len).toFixed(3)),
      Number((startPt[1] + Math.sin(rad) * len).toFixed(3)),
    ];

    const newWall: WallSegment = {
      id: `tpl-wall-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      start: startPt,
      end: endPt,
      heightM: lastWall?.heightM ?? 2.65,
      thicknessM: lastWall?.thicknessM ?? 0.15,
    };

    setTemplateWalls((prev) => [...prev, newWall]);
    setSelectedTplWallId(newWall.id);
  }

  function handleDeleteTplWall(wallId: string) {
    setTemplateWalls((prev) => {
      const next = prev.filter((w) => w.id !== wallId);
      if (selectedTplWallId === wallId) {
        setSelectedTplWallId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола най-горе.',
      });
      return;
    }

    const cleanName = templateName.trim();
    if (!cleanName) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете име на шаблона за апартамент (напр. „Тристаен панел“).',
      });
      return;
    }

    if (templateWalls.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Добавете поне една стена към шаблона.',
      });
      return;
    }

    setIsSavingTemplate(true);
    try {
      const newTpl: ApartmentTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        description: templateDesc.trim() || undefined,
        walls: templateWalls,
        updatedAt: new Date().toISOString(),
      };

      await saveApartmentTemplateToServer(newTpl, adminPassword.trim());
      const updatedList = await fetchApartmentTemplates();
      setTemplates(updatedList);
      setTemplateName('');
      setTemplateDesc('');
      setStatusMessage({
        type: 'success',
        text: `Шаблонът „${cleanName}“ е запазен.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при запазване на шаблона.',
      });
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(tpl: ApartmentTemplate) {
    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола, за да изтриете шаблон.',
      });
      return;
    }

    try {
      await deleteApartmentTemplateOnServer(tpl.id, adminPassword.trim());
      const updatedList = await fetchApartmentTemplates();
      setTemplates(updatedList);
      setStatusMessage({
        type: 'success',
        text: `Шаблонът „${tpl.name}“ е изтрит.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при изтриване на шаблона.',
      });
    }
  }

  // --- Каталог мебели логика ---
  function updateDimension(axis: 'width' | 'height' | 'depth', value: number) {
    const safeVal = Number.isFinite(value) && value > 0 ? value : 1;
    setForm((prev) => ({
      ...prev,
      dimensionsCm: {
        ...prev.dimensionsCm,
        [axis]: safeVal,
      },
    }));
  }

  function updateConstraintBound(
    bound: 'minCm' | 'maxCm',
    axis: 'width' | 'height' | 'depth',
    value: number
  ) {
    const safeVal = Number.isFinite(value) && value >= 0 ? value : 0;
    setForm((prev) => ({
      ...prev,
      scaleConstraints: {
        ...prev.scaleConstraints,
        [bound]: {
          ...prev.scaleConstraints[bound],
          [axis]: safeVal,
        },
      },
    }));
  }

  async function handleCreateModel(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола, за да добавите модел в базата данни.',
      });
      return;
    }

    if (!form.name.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Моля, въведете наименование на модела.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const pass = adminPassword.trim();
      let finalGlbUrl = form.glbUrl.trim();
      let finalPreviewUrl = form.previewUrl.trim();

      if (glbFile) {
        const uploadedGlb = await uploadGlbFile(glbFile, pass);
        finalGlbUrl = uploadedGlb.url;
      }

      if (previewFile) {
        const uploadedPreview = await uploadPreviewImage(previewFile, pass);
        finalPreviewUrl = uploadedPreview.url;
      }

      if (!finalGlbUrl) {
        throw new Error('Качете .glb файл или посочете валиден URL към .glb модела.');
      }

      await createModelOnServer(
        {
          ...form,
          name: form.name.trim(),
          glbUrl: finalGlbUrl,
          previewUrl: finalPreviewUrl,
        },
        pass
      );

      setForm(DEFAULT_MODEL_FORM);
      setGlbFile(null);
      setPreviewFile(null);
      await onModelsUpdated();

      setStatusMessage({
        type: 'success',
        text: 'Моделът е записан успешно в базата данни на studio.glb3d.com.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Възникна грешка при запис.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(model: CatalogModel) {
    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола за промяна на статуса.',
      });
      return;
    }

    setBusyModelId(model.id);
    setStatusMessage(null);
    try {
      await updateModelOnServer(
        model.id,
        { isActive: !model.isActive },
        adminPassword.trim()
      );
      await onModelsUpdated();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при актуализация.',
      });
    } finally {
      setBusyModelId(null);
    }
  }

  async function handleDeleteModel(model: CatalogModel) {
    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола за изтриване на модел.',
      });
      return;
    }

    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете „${model.name}“ от каталога?`
    );
    if (!confirmed) return;

    setBusyModelId(model.id);
    setStatusMessage(null);
    try {
      await deleteModelOnServer(model.id, adminPassword.trim());
      await onModelsUpdated();
      setStatusMessage({
        type: 'success',
        text: `Моделът „${model.name}“ беше изтрит.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при изтриване.',
      });
    } finally {
      setBusyModelId(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#0f172a' }}>
      <div style={{ maxWidth: '1220px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '14px 18px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>
              Административен панел — Каталог и Шаблони на апартаменти
            </h2>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Управление на .glb модели и шаблони на апартаменти в метри и градуси
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="password"
              className="input-control"
              style={{ width: '210px' }}
              placeholder="Админ парола..."
              value={adminPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
            />
            <button type="button" className="btn" onClick={onClose}>
              ← Обратно към 3D Редактора
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor:
                statusMessage.type === 'success'
                  ? 'rgba(6, 95, 70, 0.45)'
                  : 'rgba(127, 29, 29, 0.5)',
              border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
              color: statusMessage.type === 'success' ? '#a7f3d0' : '#fecaca',
            }}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Секция Шаблони за апартаменти */}
        <div
          style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
              Създаване на шаблон за апартамент ({templates.length} запазени)
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" className="btn" onClick={handleAddChainedTplWall}>
                + Добави стена
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const reset = createStarterWalls(2.65, 0.15);
                  setTemplateWalls(reset);
                  setSelectedTplWallId(reset[0]?.id ?? null);
                }}
              >
                Базов контур
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSaveTemplate}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Име на шаблона *
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Напр. Тристаен 85 кв.м"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Описание (по избор)
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Напр. Панелен апартамент с хол, спалня и кухня"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                />
              </div>

              {selectedTplWall && (
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Редакция на избрана стена в шаблона
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                    <div className="axis-field">
                      <span>Дължина (м)</span>
                      <input
                        type="text"
                        className="input-control"
                        value={tplWallLenInput}
                        onChange={(e) => setTplWallLenInput(e.target.value)}
                      />
                    </div>
                    <div className="axis-field">
                      <span>Ъгъл (°)</span>
                      <input
                        type="text"
                        className="input-control"
                        value={tplWallDegInput}
                        onChange={(e) => setTplWallDegInput(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-active"
                      onClick={applySelectedTplWallGeometry}
                    >
                      Приложи
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-active"
                disabled={isSavingTemplate}
              >
                {isSavingTemplate ? 'Записване...' : 'Запази шаблон за апартамент'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="section-label" style={{ marginBottom: 0 }}>
                Стени в шаблона ({templateWalls.length})
              </div>
              <div
                style={{
                  maxHeight: '190px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              >
                {templateWalls.map((w, idx) => {
                  const isSel = w.id === selectedTplWallId;
                  return (
                    <div
                      key={w.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: isSel ? '#1e3a8a' : '#1e293b',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedTplWallId(w.id)}
                    >
                      <span>
                        Стена {idx + 1}: {getWallLengthM(w)} м • {getWallAngleDeg(w)}°
                      </span>
                      {templateWalls.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTplWall(w.id);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {templates.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '5px',
                        padding: '4px 8px',
                        fontSize: '11px',
                      }}
                    >
                      <span>{tpl.name} ({tpl.walls.length} стени)</span>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '1px 5px', fontSize: '10px' }}
                        onClick={() => handleDeleteTemplate(tpl)}
                      >
                        Изтрий
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Секция Каталог мебели */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={handleCreateModel}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
              Добавяне на нов 3D модел (.glb)
            </h3>

            <div>
              <label className="section-label" style={{ display: 'block' }}>
                Наименование на модела *
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="Напр. Ъглов диван Милано"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Категория
                </label>
                <select
                  className="select-control"
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      category: e.target.value as ModelCategory,
                    }))
                  }
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Режим на мащабиране
                </label>
                <select
                  className="select-control"
                  value={form.scaleMode}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      scaleMode: e.target.value as ScaleMode,
                    }))
                  }
                >
                  <option value="fixed">Фиксиран (1:1)</option>
                  <option value="constrained">Ограничен (мин/макс см)</option>
                  <option value="free">Свободен</option>
                </select>
              </div>
            </div>

            <div>
              <label className="section-label" style={{ display: 'block' }}>
                Качване на .glb файл към сървъра
              </label>
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                className="input-control"
                onChange={(e) => setGlbFile(e.target.files?.[0] ?? null)}
              />
              <input
                type="text"
                className="input-control"
                style={{ marginTop: '6px' }}
                placeholder="...или директно URL към .glb файл"
                value={form.glbUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, glbUrl: e.target.value }))}
              />
            </div>

            <div>
              <label className="section-label" style={{ display: 'block' }}>
                Превю изображение (по избор)
              </label>
              <input
                type="file"
                accept="image/*"
                className="input-control"
                onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)}
              />
              <input
                type="text"
                className="input-control"
                style={{ marginTop: '6px' }}
                placeholder="...или URL към превю снимка"
                value={form.previewUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, previewUrl: e.target.value }))}
              />
            </div>

            <div>
              <div className="section-label">Реални размери на модела (см)</div>
              <div className="axis-grid">
                <div className="axis-field">
                  <span>Ширина</span>
                  <input
                    type="number"
                    min={1}
                    className="input-control"
                    value={form.dimensionsCm.width}
                    onChange={(e) => updateDimension('width', parseFloat(e.target.value))}
                  />
                </div>
                <div className="axis-field">
                  <span>Височина</span>
                  <input
                    type="number"
                    min={1}
                    className="input-control"
                    value={form.dimensionsCm.height}
                    onChange={(e) => updateDimension('height', parseFloat(e.target.value))}
                  />
                </div>
                <div className="axis-field">
                  <span>Дълбочина</span>
                  <input
                    type="number"
                    min={1}
                    className="input-control"
                    value={form.dimensionsCm.depth}
                    onChange={(e) => updateDimension('depth', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {form.scaleMode === 'constrained' && (
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Ограничения на мащаба (см)
                </div>

                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#cbd5e1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="checkbox"
                      checked={form.scaleConstraints.allowX}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          scaleConstraints: {
                            ...prev.scaleConstraints,
                            allowX: e.target.checked,
                          },
                        }))
                      }
                    />
                    Ширина (X)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="checkbox"
                      checked={form.scaleConstraints.allowY}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          scaleConstraints: {
                            ...prev.scaleConstraints,
                            allowY: e.target.checked,
                          },
                        }))
                      }
                    />
                    Височина (Y)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="checkbox"
                      checked={form.scaleConstraints.allowZ}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          scaleConstraints: {
                            ...prev.scaleConstraints,
                            allowZ: e.target.checked,
                          },
                        }))
                      }
                    />
                    Дълбочина (Z)
                  </label>
                </div>

                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Мин. Ш</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.minCm.width}
                      onChange={(e) =>
                        updateConstraintBound('minCm', 'width', parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Мин. В</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.minCm.height}
                      onChange={(e) =>
                        updateConstraintBound('minCm', 'height', parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Мин. Д</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.minCm.depth}
                      onChange={(e) =>
                        updateConstraintBound('minCm', 'depth', parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Макс. Ш</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.maxCm.width}
                      onChange={(e) =>
                        updateConstraintBound('maxCm', 'width', parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Макс. В</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.maxCm.height}
                      onChange={(e) =>
                        updateConstraintBound('maxCm', 'height', parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Макс. Д</span>
                    <input
                      type="number"
                      className="input-control"
                      value={form.scaleConstraints.maxCm.depth}
                      onChange={(e) =>
                        updateConstraintBound('maxCm', 'depth', parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Активен в каталога на редактора
            </label>

            <button
              type="submit"
              className="btn btn-active"
              disabled={isSubmitting}
              style={{ padding: '10px 14px', fontSize: '13px' }}
            >
              {isSubmitting ? 'Записване в базата...' : '+ Запази модела в каталога'}
            </button>
          </form>

          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
              Модели в базата данни ({models.length})
            </h3>

            {models.length === 0 ? (
              <div className="empty-state-box">
                Все още няма добавени модели в каталога. Използвайте формата вляво, за да
                качите първия .glb модел.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {models.map((model) => {
                  const isBusy = busyModelId === model.id;
                  return (
                    <div
                      key={model.id}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                          {model.name}{' '}
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              marginLeft: '6px',
                              backgroundColor: model.isActive
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(100, 116, 139, 0.25)',
                              color: model.isActive ? '#34d399' : '#94a3b8',
                            }}
                          >
                            {model.isActive ? 'Активен' : 'Скрит'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {CATEGORY_LABELS[model.category]} • {model.dimensionsCm.width}×
                          {model.dimensionsCm.height}×{model.dimensionsCm.depth} см
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '11px', padding: '5px 8px' }}
                          disabled={isBusy}
                          onClick={() => handleToggleActive(model)}
                        >
                          {model.isActive ? 'Скрий' : 'Активирай'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '11px', padding: '5px 8px' }}
                          disabled={isBusy}
                          onClick={() => handleDeleteModel(model)}
                        >
                          Изтрий
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}