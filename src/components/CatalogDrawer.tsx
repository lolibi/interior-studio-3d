import React, { useEffect, useMemo, useState } from 'react';
import type {
  CatalogModel,
  CatalogTexture,
  CreateModelInput,
  CreateTextureInput,
} from '../types/editor';
import type { AuthUser, SystemSettings } from '../types/auth';
import { isPlanAllowed } from '../utils/permissions';

export interface CatalogDrawerProps {
  models: CatalogModel[];
  textures: CatalogTexture[];
  categoryLabels: Record<string, string>;
  textureCategoryLabels: Record<string, string>;
  loading: boolean;
  error: string | null;
  currentUser: AuthUser | null;
  systemSettings: SystemSettings | null;
  onRefreshCatalog: () => Promise<void>;
  onSelectModel: (model: CatalogModel) => void;
  onApplyTextureToSelected: (texture: CatalogTexture) => void;
  onApplyFloorTexture: (texture: CatalogTexture) => void;
  onApplyWallTexture: (texture: CatalogTexture) => void;
  onCreateModel?: (input: CreateModelInput) => Promise<CatalogModel>;
  onUpdateModel?: (id: string, input: Partial<CreateModelInput>) => Promise<CatalogModel>;
  onDeleteModel?: (id: string) => Promise<void>;
  onCreateTexture?: (input: CreateTextureInput) => Promise<CatalogTexture>;
  onUpdateTexture?: (id: string, input: Partial<CreateTextureInput>) => Promise<CatalogTexture>;
  onDeleteTexture?: (id: string) => Promise<void>;
}

const PAGE_SIZE = 30;

export const CatalogDrawer: React.FC<CatalogDrawerProps> = ({
  models,
  textures,
  categoryLabels,
  textureCategoryLabels,
  loading,
  error,
  currentUser,
  systemSettings,
  onRefreshCatalog,
  onSelectModel,
  onApplyTextureToSelected,
  onApplyFloorTexture,
  onApplyWallTexture,
}) => {
  const [tab, setTab] = useState<'models' | 'textures'>('models');

  // Филтри за 3D модели в каталога
  const [modelSearch, setModelSearch] = useState('');
  const [modelCategory, setModelCategory] = useState<string>('all');
  const [modelColor, setModelColor] = useState<string>('all');
  const [modelMaterial, setModelMaterial] = useState<string>('all');
  const [modelPage, setModelPage] = useState<number>(1);

  // Филтри за текстури в каталога
  const [textureSearch, setTextureSearch] = useState('');
  const [textureCategory, setTextureCategory] = useState<string>('all');
  const [textureColor, setTextureColor] = useState<string>('all');
  const [textureFinish, setTextureFinish] = useState<string>('all');
  const [texturePage, setTexturePage] = useState<number>(1);

  const canUsePremium = isPlanAllowed(
    currentUser,
    systemSettings?.planConfigs,
    'allowPremiumCatalog'
  );

  const activeModels = useMemo(
    () => models.filter((m) => m.isActive !== false),
    [models]
  );

  const activeTextures = useMemo(
    () => textures.filter((t) => t.isActive !== false),
    [textures]
  );

  const availableModelCategories = useMemo(() => {
    const slugs = new Set<string>(Object.keys(categoryLabels));
    activeModels.forEach((m) => slugs.add(m.category));
    return Array.from(slugs);
  }, [activeModels, categoryLabels]);

  const availableModelColors = useMemo(() => {
    const set = new Set<string>();
    activeModels.forEach((m) => {
      if (m.color && m.color.trim()) set.add(m.color.trim());
    });
    return Array.from(set).sort();
  }, [activeModels]);

  const availableModelMaterials = useMemo(() => {
    const set = new Set<string>();
    activeModels.forEach((m) => {
      if (m.material && m.material.trim()) set.add(m.material.trim());
    });
    return Array.from(set).sort();
  }, [activeModels]);

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return activeModels.filter((m) => {
      if (modelCategory !== 'all' && m.category !== modelCategory) return false;
      if (modelColor !== 'all' && (m.color || '') !== modelColor) return false;
      if (modelMaterial !== 'all' && (m.material || '') !== modelMaterial) return false;

      if (q) {
        const hay = [
          m.name,
          m.sku || '',
          categoryLabels[m.category] || m.category,
          m.color || '',
          m.material || '',
          m.style || '',
          ...(m.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    activeModels,
    modelSearch,
    modelCategory,
    modelColor,
    modelMaterial,
    categoryLabels,
  ]);

  const modelTotalPages = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE));
  const safeModelPage = Math.min(modelPage, modelTotalPages);
  const pagedModels = useMemo(() => {
    const start = (safeModelPage - 1) * PAGE_SIZE;
    return filteredModels.slice(start, start + PAGE_SIZE);
  }, [filteredModels, safeModelPage]);

  useEffect(() => {
    setModelPage(1);
  }, [modelSearch, modelCategory, modelColor, modelMaterial]);

  const availableTextureCategories = useMemo(() => {
    const slugs = new Set<string>(Object.keys(textureCategoryLabels));
    activeTextures.forEach((t) => slugs.add(t.category));
    return Array.from(slugs);
  }, [activeTextures, textureCategoryLabels]);

  const availableTextureColors = useMemo(() => {
    const set = new Set<string>();
    activeTextures.forEach((t) => {
      if (t.color && t.color.trim()) set.add(t.color.trim());
    });
    return Array.from(set).sort();
  }, [activeTextures]);

  const availableTextureFinishes = useMemo(() => {
    const set = new Set<string>();
    activeTextures.forEach((t) => {
      if (t.finish && t.finish.trim()) set.add(t.finish.trim());
    });
    return Array.from(set).sort();
  }, [activeTextures]);

  const filteredTextures = useMemo(() => {
    const q = textureSearch.trim().toLowerCase();
    return activeTextures.filter((t) => {
      if (textureCategory !== 'all' && t.category !== textureCategory) return false;
      if (textureColor !== 'all' && (t.color || '') !== textureColor) return false;
      if (textureFinish !== 'all' && (t.finish || '') !== textureFinish) return false;

      if (q) {
        const hay = [
          t.name,
          t.sku || '',
          textureCategoryLabels[t.category] || t.category,
          t.color || '',
          t.finish || '',
          ...(t.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    activeTextures,
    textureSearch,
    textureCategory,
    textureColor,
    textureFinish,
    textureCategoryLabels,
  ]);

  const textureTotalPages = Math.max(1, Math.ceil(filteredTextures.length / PAGE_SIZE));
  const safeTexturePage = Math.min(texturePage, textureTotalPages);
  const pagedTextures = useMemo(() => {
    const start = (safeTexturePage - 1) * PAGE_SIZE;
    return filteredTextures.slice(start, start + PAGE_SIZE);
  }, [filteredTextures, safeTexturePage]);

  useEffect(() => {
    setTexturePage(1);
  }, [textureSearch, textureCategory, textureColor, textureFinish]);

  return (
    <aside className="catalog-drawer">
      <div className="catalog-tabs">
        <button
          type="button"
          className={`btn ${tab === 'models' ? 'btn-active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setTab('models')}
        >
          🛋 3D Модели ({activeModels.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'textures' ? 'btn-active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setTab('textures')}
        >
          🎨 Текстури ({activeTextures.length})
        </button>
      </div>

      {error && (
        <div className="catalog-alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn"
            style={{ padding: '3px 8px', fontSize: '11px' }}
            onClick={onRefreshCatalog}
          >
            Опитай пак
          </button>
        </div>
      )}

      {tab === 'models' ? (
        <div className="catalog-body">
          <div className="catalog-filters">
            <input
              type="text"
              className="input-control"
              placeholder="Търси модел, SKU, таг..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
            />

            <select
              className="input-control"
              value={modelCategory}
              onChange={(e) => setModelCategory(e.target.value)}
            >
              <option value="all">Всички категории</option>
              {availableModelCategories.map((slug) => (
                <option key={slug} value={slug}>
                  {categoryLabels[slug] || slug}
                </option>
              ))}
            </select>

            {(availableModelColors.length > 0 || availableModelMaterials.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <select
                  className="input-control"
                  value={modelColor}
                  onChange={(e) => setModelColor(e.target.value)}
                >
                  <option value="all">Всички цветове</option>
                  {availableModelColors.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>

                <select
                  className="input-control"
                  value={modelMaterial}
                  onChange={(e) => setModelMaterial(e.target.value)}
                >
                  <option value="all">Материал / Дамаска</option>
                  {availableModelMaterials.map((mat) => (
                    <option key={mat} value={mat}>
                      {mat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(modelSearch || modelCategory !== 'all' || modelColor !== 'all' || modelMaterial !== 'all') && (
              <button
                type="button"
                className="btn"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => {
                  setModelSearch('');
                  setModelCategory('all');
                  setModelColor('all');
                  setModelMaterial('all');
                }}
              >
                Изчисти филтрите ({filteredModels.length} намерени)
              </button>
            )}
          </div>

          {loading ? (
            <div className="catalog-empty">Зареждане на 3D модели...</div>
          ) : pagedModels.length === 0 ? (
            <div className="catalog-empty">Няма намерени модели по тези критерии.</div>
          ) : (
            <div className="catalog-grid">
              {pagedModels.map((model) => {
                const locked = Boolean(model.isPremium && !canUsePremium);
                return (
                  <button
                    key={model.id}
                    type="button"
                    className={`catalog-card ${locked ? 'catalog-card-locked' : ''}`}
                    onClick={() => onSelectModel(model)}
                    title={
                      locked
                        ? `${model.name} (Премиум модел)`
                        : `Добави ${model.name} (${model.dimensionsCm.width}×${model.dimensionsCm.depth}×${model.dimensionsCm.height} см)`
                    }
                  >
                    <div className="catalog-card-thumb">
                      {model.previewUrl ? (
                        <img src={model.previewUrl} alt={model.name} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: '22px' }}>📦</span>
                      )}
                      {model.isPremium && (
                        <span className="catalog-badge-premium">★ PRO</span>
                      )}
                    </div>
                    <div className="catalog-card-title">{model.name}</div>
                    <div className="catalog-card-meta">
                      {model.dimensionsCm.width}×{model.dimensionsCm.depth}×
                      {model.dimensionsCm.height} см
                    </div>
                    {(model.color || model.material) && (
                      <div className="catalog-card-sub">
                        {[model.color, model.material].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {modelTotalPages > 1 && (
            <div className="catalog-pagination">
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                disabled={safeModelPage <= 1}
                onClick={() => setModelPage((p) => Math.max(1, p - 1))}
              >
                ←
              </button>
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Стр. {safeModelPage} / {modelTotalPages}
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                disabled={safeModelPage >= modelTotalPages}
                onClick={() => setModelPage((p) => Math.min(modelTotalPages, p + 1))}
              >
                →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="catalog-body">
          <div className="catalog-filters">
            <input
              type="text"
              className="input-control"
              placeholder="Търси текстура, SKU, таг..."
              value={textureSearch}
              onChange={(e) => setTextureSearch(e.target.value)}
            />

            <select
              className="input-control"
              value={textureCategory}
              onChange={(e) => setTextureCategory(e.target.value)}
            >
              <option value="all">Всички категории текстури</option>
              {availableTextureCategories.map((slug) => (
                <option key={slug} value={slug}>
                  {textureCategoryLabels[slug] || slug}
                </option>
              ))}
            </select>

            {(availableTextureColors.length > 0 || availableTextureFinishes.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <select
                  className="input-control"
                  value={textureColor}
                  onChange={(e) => setTextureColor(e.target.value)}
                >
                  <option value="all">Всички цветове</option>
                  {availableTextureColors.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>

                <select
                  className="input-control"
                  value={textureFinish}
                  onChange={(e) => setTextureFinish(e.target.value)}
                >
                  <option value="all">Повърхност / Финиш</option>
                  {availableTextureFinishes.map((fin) => (
                    <option key={fin} value={fin}>
                      {fin}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="catalog-empty">Зареждане на текстури...</div>
          ) : pagedTextures.length === 0 ? (
            <div className="catalog-empty">Няма намерени текстури.</div>
          ) : (
            <div className="catalog-grid">
              {pagedTextures.map((tex) => {
                const locked = Boolean(tex.isPremium && !canUsePremium);
                return (
                  <div
                    key={tex.id}
                    className={`catalog-card ${locked ? 'catalog-card-locked' : ''}`}
                  >
                    <div className="catalog-card-thumb">
                      <img src={tex.mapUrl} alt={tex.name} loading="lazy" />
                      {tex.isPremium && (
                        <span className="catalog-badge-premium">★ PRO</span>
                      )}
                    </div>
                    <div className="catalog-card-title">{tex.name}</div>
                    <div className="catalog-card-meta">
                      {tex.tileWidthM}×{tex.tileHeightM} м
                      {tex.finish ? ` · ${tex.finish}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, padding: '3px 5px', fontSize: '10.5px' }}
                        onClick={() => onApplyTextureToSelected(tex)}
                        title="Приложи върху избрания 3D обект"
                      >
                        Обект
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, padding: '3px 5px', fontSize: '10.5px' }}
                        onClick={() => onApplyFloorTexture(tex)}
                        title="Приложи върху пода"
                      >
                        Под
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, padding: '3px 5px', fontSize: '10.5px' }}
                        onClick={() => onApplyWallTexture(tex)}
                        title="Приложи върху стените"
                      >
                        Стени
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {textureTotalPages > 1 && (
            <div className="catalog-pagination">
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                disabled={safeTexturePage <= 1}
                onClick={() => setTexturePage((p) => Math.max(1, p - 1))}
              >
                ←
              </button>
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Стр. {safeTexturePage} / {textureTotalPages}
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                disabled={safeTexturePage >= textureTotalPages}
                onClick={() => setTexturePage((p) => Math.min(textureTotalPages, p + 1))}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};