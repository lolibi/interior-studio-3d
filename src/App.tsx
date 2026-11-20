import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { AdminPanel } from './components/AdminPanel';
import { CATEGORY_LABELS } from './types/editor';
import type {
  CatalogModel,
  DimensionsCm,
  DisplayUnit,
  ModelCategory,
  SavedSceneSummary,
  ScaleMode,
  SceneObject,
  TransformTool,
} from './types/editor';
import {
  createDefaultRoomConfig,
  createStarterWalls,
  getWallAngleDeg,
  getWallLengthM,
  updateWallGeometry,
} from './types/room';
import type {
  ApartmentTemplate,
  RoomConfig,
  WallSegment,
} from './types/room';
import {
  fetchApartmentTemplates,
  fetchModels,
  fetchSceneById,
  fetchScenes,
  saveSceneToServer,
} from './utils/apiClient';
import {
  clearSavedScene,
  loadSavedScene,
  saveScene,
} from './utils/sceneStorage';

const SCALE_MODE_SHORT: Record<ScaleMode, string> = {
  fixed: 'Фиксиран',
  constrained: 'Ограничен',
  free: 'Свободен',
};

const ROOM_STORAGE_KEY = 'interior_studio_3d_room_v3';

type LeftTab = 'furniture' | 'templates';

function normalizeLoadedRoomConfig(rawRoom: unknown): RoomConfig {
  const base = createDefaultRoomConfig();
  if (!rawRoom || typeof rawRoom !== 'object') {
    return base;
  }

  const obj = rawRoom as Partial<RoomConfig>;
  const defaultHeightM = Number(obj.defaultHeightM) || 2.65;
  const defaultThicknessM = Number(obj.defaultThicknessM) || 0.15;

  const walls: WallSegment[] = Array.isArray(obj.walls)
    ? obj.walls
        .filter(
          (w): w is WallSegment =>
            Boolean(
              w &&
                typeof w.id === 'string' &&
                Array.isArray(w.start) &&
                Array.isArray(w.end)
            )
        )
        .map((w) => ({
          id: w.id,
          start: [Number(w.start[0]) || 0, Number(w.start[1]) || 0],
          end: [Number(w.end[0]) || 0, Number(w.end[1]) || 0],
          heightM: Number(w.heightM) || defaultHeightM,
          thicknessM: Number(w.thicknessM) || defaultThicknessM,
        }))
    : [];

  return {
    templateId: obj.templateId ?? null,
    templateName: obj.templateName ?? null,
    defaultHeightM,
    defaultThicknessM,
    walls: walls.length > 0 ? walls : createStarterWalls(defaultHeightM, defaultThicknessM),
  };
}

function loadSavedRoom(): RoomConfig {
  try {
    const raw = localStorage.getItem(ROOM_STORAGE_KEY);
    if (!raw) return createDefaultRoomConfig();
    return normalizeLoadedRoomConfig(JSON.parse(raw));
  } catch {
    return createDefaultRoomConfig();
  }
}

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
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [leftTab, setLeftTab] = useState<LeftTab>('furniture');
  const [room, setRoom] = useState<RoomConfig>(() => loadSavedRoom());
  const [templates, setTemplates] = useState<ApartmentTemplate[]>([]);

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [wallLengthInput, setWallLengthInput] = useState('');
  const [wallAngleInput, setWallAngleInput] = useState('');
  const [wallHeightInput, setWallHeightInput] = useState('');
  const [wallThicknessInput, setWallThicknessInput] = useState('');

  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);

  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>(() => loadSavedScene());
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [currentSceneTitle, setCurrentSceneTitle] = useState<string>('Нов проект');
  const [savedScenes, setSavedScenes] = useState<SavedSceneSummary[]>([]);
  const [isSavingCloud, setIsSavingCloud] = useState(false);

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<TransformTool>('translate');
  const [unit, setUnit] = useState<DisplayUnit>('cm');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ModelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unitLabel = unit === 'cm' ? 'см' : 'м';

  const showTemporaryNotice = useCallback(
    (text: string, type: 'success' | 'error' = 'success') => {
      setNotice({ type, text });
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = setTimeout(() => {
        setNotice(null);
      }, 3000);
    },
    []
  );

  const refreshServerData = useCallback(async () => {
    setIsLoadingModels(true);
    setApiError(null);
    try {
      const [serverModels, serverScenes, serverTemplates] = await Promise.all([
        fetchModels(),
        fetchScenes(),
        fetchApartmentTemplates(),
      ]);
      setModels(serverModels);
      setSavedScenes(serverScenes);
      setTemplates(serverTemplates);
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : 'Грешка при свързване със сървъра studio.glb3d.com.'
      );
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    refreshServerData();
  }, [refreshServerData]);

  useEffect(() => {
    saveScene(sceneObjects);
  }, [sceneObjects]);

  useEffect(() => {
    try {
      localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(room));
    } catch {
      // Игнориране при пълен localStorage
    }
  }, [room]);

  const selectedObject =
    sceneObjects.find((obj) => obj.instanceId === selectedInstanceId) ?? null;
  const selectedModel = selectedObject
    ? models.find((m) => m.id === selectedObject.modelId) ?? null
    : null;

  const selectedWall = useMemo(
    () => room.walls.find((w) => w.id === selectedWallId) ?? null,
    [room.walls, selectedWallId]
  );

  useEffect(() => {
    if (selectedWall) {
      setWallLengthInput(String(getWallLengthM(selectedWall)));
      setWallAngleInput(String(getWallAngleDeg(selectedWall)));
      setWallHeightInput(String(selectedWall.heightM));
      setWallThicknessInput(String(selectedWall.thicknessM));
    }
  }, [selectedWall]);

  function commitSelectedWallChanges() {
    if (!selectedWall) return;
    const len = parseFloat(wallLengthInput.replace(',', '.'));
    const deg = parseFloat(wallAngleInput.replace(',', '.'));
    const h = parseFloat(wallHeightInput.replace(',', '.'));
    const t = parseFloat(wallThicknessInput.replace(',', '.'));

    const nextLen = Number.isNaN(len) ? getWallLengthM(selectedWall) : len;
    const nextDeg = Number.isNaN(deg) ? getWallAngleDeg(selectedWall) : deg;
    const nextH = Number.isNaN(h)
      ? selectedWall.heightM
      : Math.max(0.2, Math.min(6.0, h));
    const nextT = Number.isNaN(t)
      ? selectedWall.thicknessM
      : Math.max(0.05, Math.min(0.8, t));

    const updatedGeometry = updateWallGeometry(selectedWall, nextLen, nextDeg);
    const updatedWall: WallSegment = {
      ...updatedGeometry,
      heightM: nextH,
      thicknessM: nextT,
    };

    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.map((w) => (w.id === selectedWall.id ? updatedWall : w)),
    }));
  }

  function handleApplyTemplate(tpl: ApartmentTemplate) {
    const clonedWalls: WallSegment[] = tpl.walls.map((w, idx) => ({
      id: `wall-tpl-${Date.now()}-${idx}`,
      start: [w.start[0], w.start[1]],
      end: [w.end[0], w.end[1]],
      heightM: w.heightM || room.defaultHeightM,
      thicknessM: w.thicknessM || room.defaultThicknessM,
    }));

    setRoom((prev) => ({
      ...prev,
      templateId: tpl.id,
      templateName: tpl.name,
      walls: clonedWalls,
    }));
    setSelectedWallId(clonedWalls[0]?.id ?? null);
    setIsDrawingWalls(false);
    setDraftPoints([]);
    showTemporaryNotice(`Зареден шаблон: „${tpl.name}“`, 'success');
  }

  function handleAddChainedWall() {
    const lastWall = room.walls[room.walls.length - 1];
    const startPt: [number, number] = lastWall ? lastWall.end : [0, 0];
    const nextDeg = lastWall ? (getWallAngleDeg(lastWall) + 90) % 360 : 0;
    const rad = (nextDeg * Math.PI) / 180;
    const defaultLen = 3.0;
    const endPt: [number, number] = [
      Number((startPt[0] + Math.cos(rad) * defaultLen).toFixed(3)),
      Number((startPt[1] + Math.sin(rad) * defaultLen).toFixed(3)),
    ];

    const newWall: WallSegment = {
      id: `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      start: startPt,
      end: endPt,
      heightM: lastWall?.heightM ?? room.defaultHeightM,
      thicknessM: lastWall?.thicknessM ?? room.defaultThicknessM,
    };

    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: [...prev.walls, newWall],
    }));
    setSelectedWallId(newWall.id);
    setSelectedInstanceId(null);
  }

  function handleStartCustomEmptyPlan() {
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: [],
    }));
    setSelectedWallId(null);
    setDraftPoints([]);
    setIsDrawingWalls(true);
    showTemporaryNotice('Празен план: кликай точки по мрежата за чертане на стени', 'success');
  }

  function toggleDrawMode() {
    setIsDrawingWalls((prev) => {
      const next = !prev;
      setDraftPoints([]);
      if (next) {
        setSelectedInstanceId(null);
        setSelectedWallId(null);
        showTemporaryNotice('Режим чертане: кликайте точки върху пода (0.25 м)', 'success');
      }
      return next;
    });
  }

  function finalizeDrawnWalls(closeLoop: boolean) {
    if (draftPoints.length < 2) {
      setIsDrawingWalls(false);
      setDraftPoints([]);
      return;
    }

    const newSegments: WallSegment[] = [];
    const count =
      closeLoop && draftPoints.length >= 3
        ? draftPoints.length
        : draftPoints.length - 1;

    for (let i = 0; i < count; i++) {
      const p1 = draftPoints[i];
      const p2 = draftPoints[(i + 1) % draftPoints.length];
      if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 0.05) continue;
      newSegments.push({
        id: `wall-draw-${Date.now()}-${i}`,
        start: p1,
        end: p2,
        heightM: room.defaultHeightM,
        thicknessM: room.defaultThicknessM,
      });
    }

    if (newSegments.length > 0) {
      setRoom((prev) => ({
        ...prev,
        templateId: null,
        templateName: null,
        walls: [...prev.walls, ...newSegments],
      }));
      setSelectedWallId(newSegments[0].id);
      showTemporaryNotice(`Добавени ${newSegments.length} нови стени ✓`, 'success');
    }

    setDraftPoints([]);
    setIsDrawingWalls(false);
  }

  function handleFloorDrawClick(pt: [number, number]) {
    if (!isDrawingWalls) return;

    setDraftPoints((prev) => {
      if (prev.length >= 3) {
        const first = prev[0];
        if (Math.hypot(pt[0] - first[0], pt[1] - first[1]) < 0.01) {
          setTimeout(() => finalizeDrawnWalls(true), 0);
          return prev;
        }
      }
      const last = prev[prev.length - 1];
      if (last && last[0] === pt[0] && last[1] === pt[1]) {
        return prev;
      }
      return [...prev, pt];
    });
  }

  function handleDeleteSelectedWall() {
    if (!selectedWallId) return;
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.filter((w) => w.id !== selectedWallId),
    }));
    setSelectedWallId(null);
    showTemporaryNotice('Стената е премахната', 'success');
  }

  const handleSaveSceneToCloud = useCallback(async () => {
    const inputTitle = window.prompt(
      'Въведете име на интериорния проект (записва се в базата данни):',
      currentSceneTitle
    );
    if (inputTitle === null) return;

    const cleanTitle = inputTitle.trim() || 'Интериорен проект';
    setIsSavingCloud(true);
    try {
      const result = await saveSceneToServer({
        id: currentSceneId ?? undefined,
        title: cleanTitle,
        objects: sceneObjects,
        room,
      });
      setCurrentSceneId(result.id);
      setCurrentSceneTitle(result.title);
      const updatedScenes = await fetchScenes();
      setSavedScenes(updatedScenes);
      showTemporaryNotice(`Проектът „${result.title}“ е запазен в облака ✓`, 'success');
    } catch (err) {
      showTemporaryNotice(
        err instanceof Error ? err.message : 'Неуспешен запис на сцената.',
        'error'
      );
    } finally {
      setIsSavingCloud(false);
    }
  }, [currentSceneId, currentSceneTitle, sceneObjects, room, showTemporaryNotice]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isAdminOpen) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveSceneToCloud();
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      if (e.key === 'Escape') {
        if (isDrawingWalls) {
          setIsDrawingWalls(false);
          setDraftPoints([]);
        } else {
          setSelectedInstanceId(null);
          setSelectedWallId(null);
        }
        return;
      }

      if (isDrawingWalls) return;

      const key = e.key.toLowerCase();
      if (key === 'w') {
        setActiveTool('translate');
      } else if (key === 'e') {
        setActiveTool('rotate');
      } else if (key === 'r') {
        setActiveTool('scale');
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
  }, [isAdminOpen, isDrawingWalls, selectedInstanceId, handleSaveSceneToCloud]);

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

  async function handleLoadCloudScene(sceneId: string) {
    if (!sceneId) return;
    try {
      const scene = await fetchSceneById(sceneId);
      setSceneObjects(scene.objects);
      const loadedRoom = normalizeLoadedRoomConfig(scene.room);
      setRoom(loadedRoom);
      setSelectedWallId(loadedRoom.walls[0]?.id ?? null);
      setCurrentSceneId(scene.id);
      setCurrentSceneTitle(scene.title);
      setSelectedInstanceId(null);
      showTemporaryNotice(`Зареден проект: „${scene.title}“`, 'success');
    } catch (err) {
      showTemporaryNotice(
        err instanceof Error ? err.message : 'Грешка при зареждане на сцената.',
        'error'
      );
    }
  }

  function handleNewScene() {
    if (sceneObjects.length > 0) {
      const confirmed = window.confirm(
        'Сигурни ли сте, че искате да изчистите текущата сцена и да започнете нов проект?'
      );
      if (!confirmed) return;
    }

    setSceneObjects([]);
    setSelectedInstanceId(null);
    setSelectedWallId(null);
    setCurrentSceneId(null);
    setCurrentSceneTitle('Нов проект');
    clearSavedScene();
    showTemporaryNotice('Създадена е нова празна сцена', 'success');
  }

  function handleAddToScene(model: CatalogModel) {
    const offsetIndex = sceneObjects.length % 6;
    const offsetX = -0.8 + offsetIndex * 0.25;
    const offsetZ = 0.6 + (offsetIndex % 3) * 0.25;

    const newInstance: SceneObject = {
      instanceId: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelId: model.id,
      name: model.name,
      position: [Number(offsetX.toFixed(2)), 0, Number(offsetZ.toFixed(2))],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    setSceneObjects((prev) => [...prev, newInstance]);
    setSelectedInstanceId(newInstance.instanceId);
    setSelectedWallId(null);
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
      name: selectedObject.name || selectedModel?.name || 'Копие',
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
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <span>Interior Studio 3D</span>
            <span className="brand-badge">v2.0 Plans</span>
          </div>
        </div>

        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${activeTool === 'translate' && !isDrawingWalls ? 'btn-active' : ''}`}
            onClick={() => {
              setIsDrawingWalls(false);
              setActiveTool('translate');
            }}
          >
            Преместване (W)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'rotate' && !isDrawingWalls ? 'btn-active' : ''}`}
            onClick={() => {
              setIsDrawingWalls(false);
              setActiveTool('rotate');
            }}
          >
            Въртене (E)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'scale' && !isDrawingWalls ? 'btn-active' : ''}`}
            onClick={() => {
              setIsDrawingWalls(false);
              setActiveTool('scale');
            }}
          >
            Мащаб (R)
          </button>
          <button
            type="button"
            className={`btn ${isDrawingWalls ? 'btn-active' : ''}`}
            onClick={toggleDrawMode}
            title="Чертай стени директно върху пода в метри"
          >
            {isDrawingWalls ? 'Чертаеш стени...' : 'Чертай стени'}
          </button>
        </div>

        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${unit === 'cm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('cm')}
            title="Показвай стойностите на мебелите в сантиметри"
          >
            см
          </button>
          <button
            type="button"
            className={`btn ${unit === 'm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('m')}
            title="Показвай стойностите на мебелите в метри"
          >
            м
          </button>

          {savedScenes.length > 0 && (
            <select
              className="select-control"
              style={{ width: '165px', padding: '5px 8px', fontSize: '12px' }}
              value={currentSceneId ?? ''}
              onChange={(e) => handleLoadCloudScene(e.target.value)}
              title="Зареди запазен проект от базата данни"
            >
              <option value="">Зареди проект...</option>
              {savedScenes.map((scn) => (
                <option key={scn.id} value={scn.id}>
                  {scn.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="btn"
            onClick={handleNewScene}
            title="Започни нов празен проект"
          >
            Нов
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleSaveSceneToCloud}
            disabled={isSavingCloud}
            title="Запази проекта в базата данни (Ctrl+S)"
          >
            {isSavingCloud ? 'Запис...' : 'Запази в облака'}
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

      {isAdminOpen ? (
        <AdminPanel
          models={models}
          onModelsUpdated={refreshServerData}
          onClose={() => setIsAdminOpen(false)}
        />
      ) : (
        <main className="workspace">
          <aside className="sidebar-left">
            <div className="panel-header" style={{ padding: '6px 8px', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                <button
                  type="button"
                  className={`btn ${leftTab === 'furniture' ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}
                  onClick={() => setLeftTab('furniture')}
                >
                  Мебели ({activeModels.length})
                </button>
                <button
                  type="button"
                  className={`btn ${leftTab === 'templates' ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '11px', padding: '4px 6px' }}
                  onClick={() => setLeftTab('templates')}
                >
                  Шаблони ({templates.length})
                </button>
              </div>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 6px', fontSize: '10px' }}
                onClick={refreshServerData}
                title="Опресни данните от сървъра"
              >
                ↻
              </button>
            </div>

            <div className="panel-body">
              {leftTab === 'templates' ? (
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
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={handleAddChainedWall}
                    >
                      + Добави стена
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={handleStartCustomEmptyPlan}
                    >
                      Празен чертеж
                    </button>
                  </div>

                  {isDrawingWalls && (
                    <div
                      style={{
                        backgroundColor: 'rgba(2, 132, 199, 0.2)',
                        border: '1px solid #38bdf8',
                        borderRadius: '5px',
                        padding: '8px',
                        fontSize: '11px',
                        color: '#e0f2fe',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div>Точки: {draftPoints.length} (кликни върху пода/мрежата)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn btn-active"
                          style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                          disabled={draftPoints.length < 3}
                          onClick={() => finalizeDrawnWalls(true)}
                        >
                          Затвори контур
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                          disabled={draftPoints.length < 2}
                          onClick={() => finalizeDrawnWalls(false)}
                        >
                          Завърши стени
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Готови шаблони на апартаменти
                  </div>

                  {templates.length === 0 ? (
                    <div className="empty-state-box">
                      Няма добавени шаблони. Можете да създадете шаблон в „Админ панел“ или да
                      начертаете свой план директно върху пода.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {templates.map((tpl) => {
                        const isActiveTpl = room.templateId === tpl.id;
                        return (
                          <div
                            key={tpl.id}
                            style={{
                              backgroundColor: '#1e293b',
                              border: `1px solid ${isActiveTpl ? '#38bdf8' : '#334155'}`,
                              borderRadius: '6px',
                              padding: '8px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '12px', color: '#f8fafc' }}>
                              {tpl.name}
                            </div>
                            {tpl.description && (
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {tpl.description}
                              </div>
                            )}
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              Стени: {tpl.walls.length}
                            </div>
                            <button
                              type="button"
                              className="btn btn-active"
                              style={{ fontSize: '11px' }}
                              onClick={() => handleApplyTemplate(tpl)}
                            >
                              Зареди шаблона
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                    onChange={(e) =>
                      setSelectedCategory(e.target.value as 'all' | ModelCategory)
                    }
                  >
                    <option value="all">Всички категории</option>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>

                  {isLoadingModels ? (
                    <div className="empty-state-box">
                      Зареждане на каталога от studio.glb3d.com...
                    </div>
                  ) : apiError ? (
                    <div
                      style={{
                        backgroundColor: 'rgba(127, 29, 29, 0.45)',
                        border: '1px solid #ef4444',
                        color: '#fecaca',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    >
                      {apiError}
                    </div>
                  ) : activeModels.length === 0 ? (
                    <div className="empty-state-box">
                      Каталогът в базата данни е празен. Отворете „Админ панел“ горе вдясно, за да
                      качите първите си .glb модели.
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
                            {model.previewUrl ? (
                              <img
                                src={model.previewUrl}
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
                                  color: model.glbUrl ? '#34d399' : '#94a3b8',
                                  flexShrink: 0,
                                }}
                              >
                                {model.glbUrl ? 'GLB' : '3D'}
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
                </>
              )}
            </div>
          </aside>

          <section className="viewport-container">
            <Viewport3D
              room={room}
              selectedWallId={selectedWallId}
              onSelectWall={(wallId) => {
                if (isDrawingWalls) return;
                setSelectedWallId(wallId);
                if (wallId) setSelectedInstanceId(null);
              }}
              isDrawingWalls={isDrawingWalls}
              draftPoints={draftPoints}
              onFloorDrawClick={handleFloorDrawClick}
              sceneObjects={sceneObjects}
              models={models}
              selectedInstanceId={selectedInstanceId}
              transformTool={activeTool}
              onSelectObject={setSelectedInstanceId}
              onTransformChange={handleTransformChange}
            />

            {notice && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor:
                    notice.type === 'success'
                      ? 'rgba(6, 95, 70, 0.92)'
                      : 'rgba(127, 29, 29, 0.92)',
                  border: `1px solid ${notice.type === 'success' ? '#10b981' : '#ef4444'}`,
                  color: '#f8fafc',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  pointerEvents: 'none',
                }}
              >
                {notice.text}
              </div>
            )}

            <div className="viewport-hint">
              {isDrawingWalls
                ? `Режим чертане (${draftPoints.length} точки) • Кликни върху пода за точка • Esc за отказ`
                : `Проект: ${currentSceneTitle} • Стени: ${room.walls.length}${room.templateName ? ` • Шаблон: ${room.templateName}` : ''}`}
            </div>
          </section>

          <aside className="sidebar-right">
            <div className="panel-header">
              <span>{selectedWall ? 'Настройки на стена' : 'Настройки на обект'}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {selectedWall ? 'м / °' : `Единици: ${unitLabel}`}
              </span>
            </div>

            <div className="panel-body">
              {selectedWall ? (
                <>
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
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      Стена ({getWallLengthM(selectedWall)} м • {getWallAngleDeg(selectedWall)}°)
                    </div>

                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>Дължина (м)</span>
                        <input
                          type="text"
                          className="input-control"
                          value={wallLengthInput}
                          onChange={(e) => setWallLengthInput(e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Ъгъл (°)</span>
                        <input
                          type="text"
                          className="input-control"
                          value={wallAngleInput}
                          onChange={(e) => setWallAngleInput(e.target.value)}
                        />
                      </div>
                      <div className="axis-field">
                        <span>Височина (м)</span>
                        <input
                          type="text"
                          className="input-control"
                          value={wallHeightInput}
                          onChange={(e) => setWallHeightInput(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>Дебелина (м)</span>
                        <input
                          type="text"
                          className="input-control"
                          value={wallThicknessInput}
                          onChange={(e) => setWallThicknessInput(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-active"
                      onClick={commitSelectedWallChanges}
                    >
                      Приложи промените по стената
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteSelectedWall}
                  >
                    Премахни стената
                  </button>
                </>
              ) : !selectedObject || !selectedModel ? (
                <>
                  <div className="empty-state-box">
                    Няма избран обект или стена. Кликнете върху стена, за да промените дължината и
                    градусите ѝ, или отворете таб „Шаблони“.
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
                                {idx + 1}. {m?.name ?? obj.name}
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