import { useEffect, useState } from 'react';
import { CATEGORY_LABELS, TEXTURE_CATEGORY_LABELS } from '../types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  CreateModelInput,
  CreateTextureInput,
  ModelCategory,
  ScaleMode,
  TextureCategory,
} from '../types/editor';
import type { ApartmentTemplate, RoomConfig } from '../types/room';
import {
  createModelOnServer,
  createTextureOnServer,
  deleteApartmentTemplateOnServer,
  deleteModelOnServer,
  deleteTextureOnServer,
  fetchApartmentTemplates,
  fetchTextures,
  saveApartmentTemplateToServer,
  updateModelOnServer,
  updateTextureOnServer,
  uploadGlbFile,
  uploadPreviewImage,
  uploadTextureImage,
} from '../utils/apiClient';

interface AdminPanelProps {
  models: CatalogModel[];
  currentRoom: RoomConfig;
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

const DEFAULT_TEXTURE_FORM: CreateTextureInput = {
  name: '',
  category: 'floor',
  mapUrl: '',
  tileWidthM: 0.6,
  tileHeightM: 0.6,
  roughness: 0.5,
  metalness: 0.05,
  isActive: true,
};

export function AdminPanel({
  models,
  currentRoom,
  onModelsUpdated,
  onClose,
}: AdminPanelProps) {
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

  // --- Каталог PBR текстури (подове, плочки, стени, мебели) ---
  const [textures, setTextures] = useState<CatalogTexture[]>([]);
  const [textureForm, setTextureForm] =
    useState<CreateTextureInput>(DEFAULT_TEXTURE_FORM);
  const [textureFile, setTextureFile] = useState<File | null>(null);
  const [isSubmittingTexture, setIsSubmittingTexture] = useState(false);
  const [busyTextureId, setBusyTextureId] = useState<string | null>(null);

  // --- Шаблони за апартаменти (в MySQL базата данни) ---
  const [templates, setTemplates] = useState<ApartmentTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
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
    fetchApartmentTemplates()
      .then((list) => {
        if (active) setTemplates(list);
      })
      .catch(() => {});

    fetchTextures()
      .then((list) => {
        if (active) setTextures(list);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // --- Текстури логика ---
  async function handleCreateTexture(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола най-горе.',
      });
      return;
    }

    if (!textureForm.name.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете име на текстурата (напр. „Паркет Дъб Натур“ или „Плочки Мрамор 60x60“).',
      });
      return;
    }

    setIsSubmittingTexture(true);
    try {
      const pass = adminPassword.trim();
      let finalMapUrl = textureForm.mapUrl.trim();

      if (textureFile) {
        const uploaded = await uploadTextureImage(textureFile, pass);
        finalMapUrl = uploaded.url;
      }

      if (!finalMapUrl) {
        throw new Error('Качете файл (PNG/JPG/WEBP) или посочете валиден URL на текстурата.');
      }

      await createTextureOnServer(
        {
          ...textureForm,
          name: textureForm.name.trim(),
          mapUrl: finalMapUrl,
          tileWidthM: Math.max(0.05, Number(textureForm.tileWidthM) || 0.6),
          tileHeightM: Math.max(0.05, Number(textureForm.tileHeightM) || 0.6),
          roughness: Math.min(1, Math.max(0, Number(textureForm.roughness) || 0.5)),
          metalness: Math.min(1, Math.max(0, Number(textureForm.metalness) || 0.05)),
        },
        pass
      );

      const updatedTextures = await fetchTextures();
      setTextures(updatedTextures);
      setTextureForm(DEFAULT_TEXTURE_FORM);
      setTextureFile(null);
      await onModelsUpdated();

      setStatusMessage({
        type: 'success',
        text: 'Текстурата е качена и записана успешно в каталога.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при запис на текстурата.',
      });
    } finally {
      setIsSubmittingTexture(false);
    }
  }

  async function handleToggleTextureActive(tex: CatalogTexture) {
    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола за промяна на статуса.',
      });
      return;
    }

    setBusyTextureId(tex.id);
    setStatusMessage(null);
    try {
      await updateTextureOnServer(
        tex.id,
        { isActive: !tex.isActive },
        adminPassword.trim()
      );
      const updatedTextures = await fetchTextures();
      setTextures(updatedTextures);
      await onModelsUpdated();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при актуализация на текстурата.',
      });
    } finally {
      setBusyTextureId(null);
    }
  }

  async function handleDeleteTexture(tex: CatalogTexture) {
    if (!adminPassword.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Въведете администраторска парола за изтриване на текстура.',
      });
      return;
    }

    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете текстурата „${tex.name}“?`
    );
    if (!confirmed) return;

    setBusyTextureId(tex.id);
    setStatusMessage(null);
    try {
      await deleteTextureOnServer(tex.id, adminPassword.trim());
      const updatedTextures = await fetchTextures();
      setTextures(updatedTextures);
      await onModelsUpdated();
      setStatusMessage({
        type: 'success',
        text: `Текстурата „${tex.name}“ беше изтрита.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Грешка при изтриване на текстурата.',
      });
    } finally {
      setBusyTextureId(null);
    }
  }

  // --- Шаблони за апартаменти логика ---
  async function handleSaveCurrentPlanAsTemplate(e: React.FormEvent) {
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
        text: 'Въведете име на шаблона за апартамент (напр. „Тристаен 85 кв.м“).',
      });
      return;
    }

    if (currentRoom.walls.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Текущият чертеж в редактора няма стени. Начертайте стените в 2D/3D изгледа и опитайте отново.',
      });
      return;
    }

    setIsSavingTemplate(true);
    try {
      const newTpl: ApartmentTemplate = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        description: templateDesc.trim() || undefined,
        ceilingHeightM: currentRoom.ceilingHeightM,
        defaultThicknessM: currentRoom.defaultThicknessM,
        walls: currentRoom.walls.map((w, idx) => ({
          ...w,
          id: `tpl-wall-${idx + 1}`,
          start: [w.start[0], w.start[1]],
          end: [w.end[0], w.end[1]],
        })),
        openings: currentRoom.openings ?? [],
        floorZones: currentRoom.floorZones ?? [],
        updatedAt: new Date().toISOString(),
      };

      await saveApartmentTemplateToServer(newTpl, adminPassword.trim());
      const updatedList = await fetchApartmentTemplates();
      setTemplates(updatedList);
      setTemplateName('');
      setTemplateDesc('');
      await onModelsUpdated();
      setStatusMessage({
        type: 'success',
        text: `Шаблонът „${cleanName}“ (${newTpl.walls.length} стени, височина ${newTpl.ceilingHeightM} м) е записан в базата данни.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Грешка при запис на шаблона в базата данни.',
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

    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете шаблона „${tpl.name}“?`
    );
    if (!confirmed) return;

    try {
      await deleteApartmentTemplateOnServer(tpl.id, adminPassword.trim());
      const updatedList = await fetchApartmentTemplates();
      setTemplates(updatedList);
      await onModelsUpdated();
      setStatusMessage({
        type: 'success',
        text: `Шаблонът „${tpl.name}“ е изтрит от базата данни.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Грешка при изтриване на шаблона.',
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
              Административен панел — Модели, Текстури и Шаблони
            </h2>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Всички текстури, шаблони и 3D модели се записват директно в базата данни на studio.glb3d.com
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

        {/* Секция Каталог PBR Текстури (Подове, Плочки, Стени, Мебели) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={handleCreateTexture}
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
              Добавяне на текстура / плочки / настилка
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Име на материала *
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Напр. Плочки Мрамор 60x60"
                  value={textureForm.name}
                  onChange={(e) =>
                    setTextureForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block' }}>
                  Категория
                </label>
                <select
                  className="select-control"
                  value={textureForm.category}
                  onChange={(e) =>
                    setTextureForm((prev) => ({
                      ...prev,
                      category: e.target.value as TextureCategory,
                    }))
                  }
                >
                  {Object.entries(TEXTURE_CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="section-label" style={{ display: 'block' }}>
                Снимка на текстурата (seamless PNG / JPG / WEBP)
              </label>
              <input
                type="file"
                accept="image/*"
                className="input-control"
                onChange={(e) => setTextureFile(e.target.files?.[0] ?? null)}
              />
              <input
                type="text"
                className="input-control"
                style={{ marginTop: '6px' }}
                placeholder="...или директно URL към текстура"
                value={textureForm.mapUrl}
                onChange={(e) =>
                  setTextureForm((prev) => ({ ...prev, mapUrl: e.target.value }))
                }
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span className="section-label" style={{ marginBottom: 0 }}>
                  Реален размер на 1 плочка / шарка (м)
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { label: '30×30', w: 0.3, h: 0.3 },
                    { label: '60×60', w: 0.6, h: 0.6 },
                    { label: '120×60', w: 1.2, h: 0.6 },
                    { label: 'Паркет 1.2×1.2', w: 1.2, h: 1.2 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="btn"
                      style={{ padding: '2px 6px', fontSize: '10px' }}
                      onClick={() =>
                        setTextureForm((prev) => ({
                          ...prev,
                          tileWidthM: preset.w,
                          tileHeightM: preset.h,
                        }))
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="axis-field">
                  <span>Ширина (м)</span>
                  <input
                    type="number"
                    step={0.05}
                    min={0.05}
                    className="input-control"
                    value={textureForm.tileWidthM}
                    onChange={(e) =>
                      setTextureForm((prev) => ({
                        ...prev,
                        tileWidthM: parseFloat(e.target.value) || 0.6,
                      }))
                    }
                  />
                </div>
                <div className="axis-field">
                  <span>Височина (м)</span>
                  <input
                    type="number"
                    step={0.05}
                    min={0.05}
                    className="input-control"
                    value={textureForm.tileHeightM}
                    onChange={(e) =>
                      setTextureForm((prev) => ({
                        ...prev,
                        tileHeightM: parseFloat(e.target.value) || 0.6,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="axis-field">
                <span>Грапавост (0 = гланц, 1 = мат)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="input-control"
                  value={textureForm.roughness}
                  onChange={(e) =>
                    setTextureForm((prev) => ({
                      ...prev,
                      roughness: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="axis-field">
                <span>Отражателност / Метал (0 – 1)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="input-control"
                  value={textureForm.metalness}
                  onChange={(e) =>
                    setTextureForm((prev) => ({
                      ...prev,
                      metalness: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-active"
              disabled={isSubmittingTexture}
              style={{ padding: '9px 14px', fontSize: '13px' }}
            >
              {isSubmittingTexture ? 'Качване в базата...' : '+ Запази текстурата в каталога'}
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
              Текстури в базата данни ({textures.length})
            </h3>

            {textures.length === 0 ? (
              <div className="empty-state-box">
                Няма качени текстури. Качете паркет, плочки за баня или декоративна мазилка отляво.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '340px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {textures.map((tex) => {
                  const isBusy = busyTextureId === tex.id;
                  return (
                    <div
                      key={tex.id}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <img
                          src={tex.mapUrl}
                          alt={tex.name}
                          style={{
                            width: '40px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', color: '#f8fafc' }}>
                            {tex.name}{' '}
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                marginLeft: '4px',
                                backgroundColor: tex.isActive
                                  ? 'rgba(16, 185, 129, 0.2)'
                                  : 'rgba(100, 116, 139, 0.25)',
                                color: tex.isActive ? '#34d399' : '#94a3b8',
                              }}
                            >
                              {tex.isActive ? 'Активна' : 'Скрита'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {TEXTURE_CATEGORY_LABELS[tex.category]} • {tex.tileWidthM}×{tex.tileHeightM} м
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          disabled={isBusy}
                          onClick={() => handleToggleTextureActive(tex)}
                        >
                          {tex.isActive ? 'Скрий' : 'Активирай'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          disabled={isBusy}
                          onClick={() => handleDeleteTexture(tex)}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>
                Публикуване на шаблон за апартамент в базата ({templates.length} активни)
              </h3>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                Начертай разпределението в 2D/3D редактора (по подложка от строителя или с точни размери) и го запази тук за клиентите.
              </div>
            </div>
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                color: '#38bdf8',
              }}
            >
              Текущ план в редактора: <strong>{currentRoom.walls.length} стени</strong> • Височина:{' '}
              <strong>{currentRoom.ceilingHeightM} м</strong>
            </div>
          </div>

          <form
            onSubmit={handleSaveCurrentPlanAsTemplate}
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
                  placeholder="Напр. Тристаен 85 кв.м (Южен)"
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
                  placeholder="Напр. Хол с кухненски бокс, две спални, баня и коридор"
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-active"
                disabled={isSavingTemplate}
              >
                {isSavingTemplate
                  ? 'Записване в базата...'
                  : 'Запази текущия начертан план като шаблон'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="section-label" style={{ marginBottom: 0 }}>
                Запазени шаблони в базата данни ({templates.length})
              </div>
              {templates.length === 0 ? (
                <div className="empty-state-box">
                  Все още няма запазени шаблони в базата данни.
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '185px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px',
                  }}
                >
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        fontSize: '12px',
                        gap: '8px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{tpl.name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {tpl.walls.length} стени • Височина: {tpl.ceilingHeightM} м
                          {tpl.description ? ` • ${tpl.description}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '11px', flexShrink: 0 }}
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