import React, { useState } from 'react';
import type { EditorTool, PlacementMode } from '../types/editor';
import type { ViewportOverlaySettings } from '../types/room';
import type { AuthUser, SystemSettings } from '../types/auth';
import type { CloudSceneListItem } from '../utils/apiClient';
import type { ViewportCameraMode } from './Viewport3D';
import { canAccessAdminPanel, getPlanLabel, getRoleLabel } from '../utils/permissions';

export interface TopBarProps {
  activeTool: EditorTool;
  placementMode: PlacementMode;
  snapEnabled: boolean;
  overlaySettings: ViewportOverlaySettings;
  catalogOpen: boolean;
  viewMode: ViewportCameraMode;
  isDrawingWalls: boolean;
  isDrawingFloorZone: boolean;
  roomPanelOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sceneTitle: string;
  currentSceneId?: string;
  cloudScenes: CloudSceneListItem[];
  currentUser: AuthUser | null;
  systemSettings: SystemSettings | null;
  statusMessage: string | null;
  onSelectTool: (tool: EditorTool) => void;
  onSelectPlacementMode: (mode: PlacementMode) => void;
  onToggleSnap: () => void;
  onUpdateOverlaySettings: (patch: Partial<ViewportOverlaySettings>) => void;
  onToggleCatalog: () => void;
  onToggleViewMode: (mode: ViewportCameraMode) => void;
  onToggleDrawWalls: () => void;
  onToggleDrawFloorZone: () => void;
  onToggleRoomPanel: () => void;
  onOpenBomModal: () => void;
  onOpenAdminPage: () => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onSceneTitleChange: (title: string) => void;
  onSaveCloud: () => void;
  onLoadCloud: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetScene: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTool,
  placementMode,
  snapEnabled,
  overlaySettings,
  catalogOpen,
  viewMode,
  isDrawingWalls,
  isDrawingFloorZone,
  roomPanelOpen,
  canUndo,
  canRedo,
  sceneTitle,
  currentSceneId,
  cloudScenes,
  currentUser,
  systemSettings,
  statusMessage,
  onSelectTool,
  onSelectPlacementMode,
  onToggleSnap,
  onUpdateOverlaySettings,
  onToggleCatalog,
  onToggleViewMode,
  onToggleDrawWalls,
  onToggleDrawFloorZone,
  onToggleRoomPanel,
  onOpenBomModal,
  onOpenAdminPage,
  onOpenAuthModal,
  onLogout,
  onSceneTitleChange,
  onSaveCloud,
  onLoadCloud,
  onUndo,
  onRedo,
  onResetScene,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showAdminBtn = canAccessAdminPanel(currentUser);

  return (
    <header className="topbar">
      <div className="topbar-group">
        <button
          type="button"
          className={`btn ${catalogOpen ? 'btn-active' : ''}`}
          onClick={onToggleCatalog}
          title="Покажи или скрий каталога с модели и текстури"
        >
          {catalogOpen ? '☰ Каталог' : '☰ Отвори каталог'}
        </button>

        <div className="divider-v" />

        <button
          type="button"
          className={`btn ${viewMode === '3d' ? 'btn-active' : ''}`}
          onClick={() => onToggleViewMode('3d')}
          title="3D перспективен изглед"
        >
          🧊 3D
        </button>
        <button
          type="button"
          className={`btn ${viewMode === 'top' ? 'btn-active' : ''}`}
          onClick={() => onToggleViewMode('top')}
          title="2D архитектурен план (поглед отгоре)"
        >
          📐 2D План
        </button>

        <button
          type="button"
          className={`btn ${isDrawingWalls ? 'btn-active' : ''}`}
          onClick={onToggleDrawWalls}
          title="Чертаене на стени по плана (клик за точки, Esc за край)"
        >
          🧱 {isDrawingWalls ? 'Приключи стени' : 'Чертай стени'}
        </button>

        <button
          type="button"
          className={`btn ${isDrawingFloorZone ? 'btn-active' : ''}`}
          onClick={onToggleDrawFloorZone}
          title="Очертай отделна подова зона (настилка)"
        >
          ⬡ {isDrawingFloorZone ? 'Затвори зона' : 'Подова зона'}
        </button>

        <button
          type="button"
          className={`btn ${roomPanelOpen ? 'btn-active' : ''}`}
          onClick={onToggleRoomPanel}
          title="Шаблони на стаи, височина таван и 2D подложка"
        >
          🏠 Стая и подложка
        </button>

        <button
          type="button"
          className="btn"
          onClick={onOpenBomModal}
          title="Спецификация, квадратури и разкрой на материали"
        >
          📋 Спецификация
        </button>

        <div className="divider-v" />

        <button
          type="button"
          className={`btn ${activeTool === 'select' ? 'btn-active' : ''}`}
          onClick={() => onSelectTool('select')}
        >
          ↖ Избор
        </button>
        <button
          type="button"
          className={`btn ${activeTool === 'move' ? 'btn-active' : ''}`}
          onClick={() => onSelectTool('move')}
        >
          ✥ Местене
        </button>
        <button
          type="button"
          className={`btn ${activeTool === 'rotate' ? 'btn-active' : ''}`}
          onClick={() => onSelectTool('rotate')}
        >
          ↻ Завъртане
        </button>
        <button
          type="button"
          className={`btn ${activeTool === 'scale' ? 'btn-active' : ''}`}
          onClick={() => onSelectTool('scale')}
        >
          ⤢ Мащаб
        </button>

        <select
          className="input-control topbar-select"
          value={placementMode}
          onChange={(e) => onSelectPlacementMode(e.target.value as PlacementMode)}
          title="Режим на поставяне на нови модели"
        >
          <option value="free">Поставяне: Свободно</option>
          <option value="wall">Поставяне: Към стена</option>
          <option value="grid">Поставяне: По мрежа</option>
        </select>

        <button
          type="button"
          className={`btn ${settingsOpen ? 'btn-active' : ''}`}
          onClick={() => setSettingsOpen((p) => !p)}
          title="Настройки на изгледа, размерите и снапването"
        >
          ⚙ Настройки
        </button>

        <button
          type="button"
          className="btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Назад (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Напред (Ctrl+Y)"
        >
          ↷
        </button>
      </div>

      <div className="topbar-group">
        <input
          type="text"
          className="input-control topbar-title-input"
          value={sceneTitle}
          onChange={(e) => onSceneTitleChange(e.target.value)}
          placeholder="Име на проекта"
          title="Наименование на текущия проект"
        />

        <button
          type="button"
          className="btn btn-active"
          onClick={onSaveCloud}
          title="Запази в облака (MySQL)"
        >
          ☁ Запази
        </button>

        {cloudScenes.length > 0 && (
          <select
            className="input-control topbar-select"
            value={currentSceneId || ''}
            onChange={(e) => {
              if (e.target.value) onLoadCloud(e.target.value);
            }}
            title="Зареди запазен проект от облака"
          >
            <option value="">☁ Облачни проекти ({cloudScenes.length})</option>
            {cloudScenes.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.title}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="btn"
          onClick={onResetScene}
          title="Нова празна сцена"
        >
          🗑 Нова
        </button>

        {showAdminBtn && (
          <button
            type="button"
            className="btn btn-active"
            onClick={onOpenAdminPage}
            title="Отвори самостоятелната страница за управление (/admin)"
          >
            🛠 Админ
          </button>
        )}

        {currentUser ? (
          <div className="topbar-user-chip">
            <span title={`${currentUser.email} (${getRoleLabel(currentUser.role)})`}>
              {currentUser.name} ·{' '}
              <strong>{getPlanLabel(currentUser.planLevel, systemSettings?.planConfigs)}</strong> ·{' '}
              <span style={{ color: '#a78bfa' }}>
                {currentUser.totalAvailableCredits} AI
              </span>
            </span>
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={onLogout}
            >
              Изход
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-active" onClick={onOpenAuthModal}>
            Вход / Регистрация
          </button>
        )}
      </div>

      {settingsOpen && (
        <div className="settings-popover">
          <div className="section-label" style={{ marginBottom: 0 }}>
            Настройки на работното поле
          </div>

          <label className="settings-row">
            <span>📏 Размери на стените</span>
            <input
              type="checkbox"
              checked={overlaySettings.showWallDimensions}
              onChange={(e) =>
                onUpdateOverlaySettings({ showWallDimensions: e.target.checked })
              }
            />
          </label>

          <label className="settings-row">
            <span>📐 Дебелина на стените</span>
            <input
              type="checkbox"
              checked={overlaySettings.showWallThicknessLabels}
              onChange={(e) =>
                onUpdateOverlaySettings({
                  showWallThicknessLabels: e.target.checked,
                })
              }
            />
          </label>

          <label className="settings-row">
            <span>⬛ Площи на стаите (м²)</span>
            <input
              type="checkbox"
              checked={overlaySettings.showRoomAreas}
              onChange={(e) =>
                onUpdateOverlaySettings({ showRoomAreas: e.target.checked })
              }
            />
          </label>

          <label className="settings-row">
            <span>🔵 Ъглови точки (дръжки)</span>
            <input
              type="checkbox"
              checked={overlaySettings.showVertexHandles}
              onChange={(e) =>
                onUpdateOverlaySettings({ showVertexHandles: e.target.checked })
              }
            />
          </label>

          <label className="settings-row">
            <span>🚪 Отваряне на врати в 2D</span>
            <input
              type="checkbox"
              checked={overlaySettings.show2DDoorSwings}
              onChange={(e) =>
                onUpdateOverlaySettings({ show2DDoorSwings: e.target.checked })
              }
            />
          </label>

          <label className="settings-row">
            <span>🧲 Магнитно прилепване (Snap)</span>
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={onToggleSnap}
            />
          </label>

          <label className="settings-row">
            <span># Подова мрежа</span>
            <input
              type="checkbox"
              checked={overlaySettings.showGrid}
              onChange={(e) =>
                onUpdateOverlaySettings({ showGrid: e.target.checked })
              }
            />
          </label>

          <div className="settings-row">
            <span>Мерни единици</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className={`btn ${overlaySettings.dimensionUnit === 'm' ? 'btn-active' : ''}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => onUpdateOverlaySettings({ dimensionUnit: 'm' })}
              >
                Метри (м)
              </button>
              <button
                type="button"
                className={`btn ${overlaySettings.dimensionUnit === 'cm' ? 'btn-active' : ''}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => onUpdateOverlaySettings({ dimensionUnit: 'cm' })}
              >
                Сантиметри (см)
              </button>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="topbar-status" role="status">
          {statusMessage}
        </div>
      )}
    </header>
  );
};