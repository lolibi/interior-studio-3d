import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CATEGORY_LABELS,
  DEFAULT_TEXTURE_CATEGORY_LABELS,
} from './types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  DisplayUnit,
  EditorTool,
  MaterialOverride,
  ParametricFurnitureConfig,
  PlacementMode,
  SceneObject,
  TransformTool,
} from './types/editor';
import {
  createDefaultRoomConfig,
  createStarterWalls,
  DEFAULT_OVERLAY_SETTINGS,
  getWallAngleDeg,
  getWallLengthM,
  isSameSurface,
} from './types/room';
import type {
  FloorZone,
  OpeningType,
  RoomConfig,
  SelectedFloorVertex,
  SelectedWallVertex,
  StandaloneOpening,
  SurfaceTarget,
  ViewportOverlaySettings,
  WallOpening,
  WallSegment,
} from './types/room';
import type { AuthUser, SystemSettings } from './types/auth';
import {
  fetchCategories,
  fetchMe,
  fetchModels,
  fetchTextures,
  listScenes,
  loadScene,
  logoutUser,
  saveScene,
  uploadFloorplanFile,
} from './utils/apiClient';
import type { CloudSceneListItem } from './utils/apiClient';
import { useHistoryState } from './hooks/useHistoryState';
import { TopBar } from './components/TopBar';
import { CatalogDrawer } from './components/CatalogDrawer';
import { Viewport3D } from './components/Viewport3D';
import type { ViewportCameraMode } from './components/Viewport3D';
import { RightInspector } from './components/RightInspector';
import type { SurfaceBatchPatch } from './components/RightInspector';
import type { DiscoveredMaterialSlot } from './components/SceneItemMesh';
import { ParametricBuilderModal } from './components/ParametricBuilderModal';
import { ProjectBomModal } from './components/ProjectBomModal';
import { AuthModal } from './components/AuthModal';
import { AdminPage } from './components/AdminPage';

interface SceneHistorySnapshot {
  room: RoomConfig;
  objects: SceneObject[];
}

function normalizeLoadedRoom(rawRoom: any): RoomConfig {
  const base = createDefaultRoomConfig();
  if (!rawRoom || typeof rawRoom !== 'object') {
    return base;
  }

  // Съвместимост със стари проекти, запазени като правоъгълник (widthM / depthM / heightM)
  if (!Array.isArray(rawRoom.walls)) {
    const w = Number(rawRoom.widthM) > 0 ? Number(rawRoom.widthM) : 5.0;
    const d = Number(rawRoom.depthM) > 0 ? Number(rawRoom.depthM) : 4.0;
    const h = Number(rawRoom.heightM) > 0 ? Number(rawRoom.heightM) : 2.65;

    const walls: WallSegment[] = [
      {
        id: 'wall-migrated-1',
        start: [-w / 2, -d / 2],
        end: [w / 2, -d / 2],
        thicknessM: 0.15,
        frontColor: rawRoom.wallColor || '#f1f5f9',
        backColor: rawRoom.wallColor || '#f1f5f9',
        frontTextureId: rawRoom.wallTextureId || undefined,
        backTextureId: rawRoom.wallTextureId || undefined,
        openings: [],
      },
      {
        id: 'wall-migrated-2',
        start: [w / 2, -d / 2],
        end: [w / 2, d / 2],
        thicknessM: 0.15,
        frontColor: rawRoom.wallColor || '#f1f5f9',
        backColor: rawRoom.wallColor || '#f1f5f9',
        frontTextureId: rawRoom.wallTextureId || undefined,
        backTextureId: rawRoom.wallTextureId || undefined,
        openings: [],
      },
      {
        id: 'wall-migrated-3',
        start: [w / 2, d / 2],
        end: [-w / 2, d / 2],
        thicknessM: 0.15,
        frontColor: rawRoom.wallColor || '#f1f5f9',
        backColor: rawRoom.wallColor || '#f1f5f9',
        frontTextureId: rawRoom.wallTextureId || undefined,
        backTextureId: rawRoom.wallTextureId || undefined,
        openings: [],
      },
      {
        id: 'wall-migrated-4',
        start: [-w / 2, d / 2],
        end: [-w / 2, -d / 2],
        thicknessM: 0.15,
        frontColor: rawRoom.wallColor || '#f1f5f9',
        backColor: rawRoom.wallColor || '#f1f5f9',
        frontTextureId: rawRoom.wallTextureId || undefined,
        backTextureId: rawRoom.wallTextureId || undefined,
        openings: [],
      },
    ];

    const floorZones: FloorZone[] =
      rawRoom.floorTextureId || rawRoom.floorColor
        ? [
            {
              id: 'zone-migrated-main',
              name: 'Основен под',
              points: [
                [-w / 2, -d / 2],
                [w / 2, -d / 2],
                [w / 2, d / 2],
                [-w / 2, d / 2],
              ],
              color: rawRoom.floorColor || '#b08968',
              roughness: 0.55,
              metalness: 0.05,
              textureId: rawRoom.floorTextureId || undefined,
            },
          ]
        : [];

    return {
      ...base,
      walls,
      ceilingHeightM: h,
      floorZones,
    };
  }

  return {
    templateId: rawRoom.templateId ?? null,
    templateName: rawRoom.templateName ?? null,
    ceilingHeightM:
      Number(rawRoom.ceilingHeightM) > 0 ? Number(rawRoom.ceilingHeightM) : 2.65,
    defaultThicknessM:
      Number(rawRoom.defaultThicknessM) > 0
        ? Number(rawRoom.defaultThicknessM)
        : 0.15,
    ceilingColor: rawRoom.ceilingColor || '#f8fafc',
    showCeiling: Boolean(rawRoom.showCeiling),
    walls: rawRoom.walls.map((w: any, idx: number) => ({
      id: w.id || `wall-${idx}-${Date.now()}`,
      start: Array.isArray(w.start)
        ? [Number(w.start[0]) || 0, Number(w.start[1]) || 0]
        : [0, 0],
      end: Array.isArray(w.end)
        ? [Number(w.end[0]) || 0, Number(w.end[1]) || 0]
        : [1, 0],
      thicknessM: Number(w.thicknessM) > 0 ? Number(w.thicknessM) : 0.15,
      frontColor: w.frontColor || '#f1f5f9',
      backColor: w.backColor || '#f1f5f9',
      startColor: w.startColor,
      endColor: w.endColor,
      frontTextureId: w.frontTextureId,
      backTextureId: w.backTextureId,
      startTextureId: w.startTextureId,
      endTextureId: w.endTextureId,
      frontTileHeightM: w.frontTileHeightM,
      backTileHeightM: w.backTileHeightM,
      startTileHeightM: w.startTileHeightM,
      endTileHeightM: w.endTileHeightM,
      frontUvw: w.frontUvw,
      backUvw: w.backUvw,
      startUvw: w.startUvw,
      endUvw: w.endUvw,
      openings: Array.isArray(w.openings) ? w.openings : [],
    })),
    openings: Array.isArray(rawRoom.openings) ? rawRoom.openings : [],
    floorZones: Array.isArray(rawRoom.floorZones)
      ? rawRoom.floorZones.map((z: any, idx: number) => ({
          id: z.id || `zone-${idx}-${Date.now()}`,
          name: z.name || `Зона ${idx + 1}`,
          points: Array.isArray(z.points) ? z.points : [],
          color: z.color || '#b08968',
          roughness: typeof z.roughness === 'number' ? z.roughness : 0.55,
          metalness: typeof z.metalness === 'number' ? z.metalness : 0.05,
          textureId: z.textureId ?? undefined,
          textureRotationDeg: z.textureRotationDeg,
          uvw: z.uvw,
        }))
      : [],
    savedCameras: Array.isArray(rawRoom.savedCameras)
      ? rawRoom.savedCameras
      : [],
    floorplan: rawRoom.floorplan ?? null,
  };
}

function normalizeLoadedObjects(rawObjects: any): SceneObject[] {
  if (!Array.isArray(rawObjects)) return [];
  return rawObjects.map((o: any, idx: number) => ({
    ...o,
    instanceId: o.instanceId || o.id || `inst-loaded-${idx}-${Date.now()}`,
    modelId: o.modelId || 'unknown-model',
    name: o.name || 'Обект',
    category: o.category || 'other',
    position: Array.isArray(o.position)
      ? [
          Number(o.position[0]) || 0,
          Number(o.position[1]) || 0,
          Number(o.position[2]) || 0,
        ]
      : [0, 0, 0],
    rotation: Array.isArray(o.rotation)
      ? [
          Number(o.rotation[0]) || 0,
          Number(o.rotation[1]) || 0,
          Number(o.rotation[2]) || 0,
        ]
      : [0, 0, 0],
    scale: Array.isArray(o.scale)
      ? [
          Number(o.scale[0]) || 1,
          Number(o.scale[1]) || 1,
          Number(o.scale[2]) || 1,
        ]
      : [1, 1, 1],
  }));
}

export function App() {
  // Навигация към /admin страницата
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() =>
    window.location.pathname.startsWith('/admin')
  );

  // Потребителска сесия
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(
    null
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Каталог от сървъра
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [textures, setTextures] = useState<CatalogTexture[]>([]);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>(
    DEFAULT_CATEGORY_LABELS
  );
  const [textureCategoryLabels, setTextureCategoryLabels] = useState<
    Record<string, string>
  >(DEFAULT_TEXTURE_CATEGORY_LABELS);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Облачни проекти
  const [cloudScenes, setCloudScenes] = useState<CloudSceneListItem[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | undefined>(
    undefined
  );
  const [sceneTitle, setSceneTitle] = useState<string>('Нов интериорен проект');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // История (Undo / Redo) за стаята и обектите
  const {
    state: sceneState,
    set: setSceneState,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useHistoryState<SceneHistorySnapshot>({
    room: createDefaultRoomConfig(),
    objects: [],
  });

  const room = sceneState.room;
  const sceneObjects = sceneState.objects;

  // Инструменти, изглед и настройки на работното поле
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [placementMode, setPlacementMode] = useState<PlacementMode>('free');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [overlaySettings, setOverlaySettings] =
    useState<ViewportOverlaySettings>(DEFAULT_OVERLAY_SETTINGS);
  const [catalogOpen, setCatalogOpen] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewportCameraMode>('3d');
  const [roomPanelOpen, setRoomPanelOpen] = useState<boolean>(false);

  const unit: DisplayUnit = overlaySettings.dimensionUnit;

  // Модали
  const [parametricModalOpen, setParametricModalOpen] =
    useState<boolean>(false);
  const [editingParametricObj, setEditingParametricObj] =
    useState<SceneObject | null>(null);
  const [bomModalOpen, setBomModalOpen] = useState<boolean>(false);

  // Селекция на обекти, стени, отвори, подови зони и повърхности
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null
  );
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    null
  );
  const [selectedStandaloneOpeningId, setSelectedStandaloneOpeningId] =
    useState<string | null>(null);
  const [selectedFloorZoneId, setSelectedFloorZoneId] = useState<string | null>(
    null
  );
  const [selectedSurfaces, setSelectedSurfaces] = useState<SurfaceTarget[]>([]);
  const [selectedWallVertex, setSelectedWallVertex] =
    useState<SelectedWallVertex | null>(null);
  const [selectedFloorVertex, setSelectedFloorVertex] =
    useState<SelectedFloorVertex | null>(null);
  const [linkedVertexJoint, setLinkedVertexJoint] = useState<boolean>(true);
  const [autoStraightenVertices, setAutoStraightenVertices] =
    useState<boolean>(true);

  // Чертаене на стени, подови зони и калибрация на 2D подложка
  const [isDrawingWalls, setIsDrawingWalls] = useState<boolean>(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [isDrawingFloorZone, setIsDrawingFloorZone] = useState<boolean>(false);
  const [zoneDraftPoints, setZoneDraftPoints] = useState<[number, number][]>(
    []
  );
  const [isCalibratingPlan, setIsCalibratingPlan] = useState<boolean>(false);
  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [calibRealLengthM, setCalibRealLengthM] = useState<string>('4.0');
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

  // Динамично открити слотове на материали в GLB моделите
  const [discoveredMaterialsMap, setDiscoveredMaterialsMap] = useState<
    Record<string, DiscoveredMaterialSlot[]>
  >({});

  // Текстови полета за размерите на избраната стена
  const [wallLengthInput, setWallLengthInput] = useState<string>('');
  const [wallAngleInput, setWallAngleInput] = useState<string>('');
  const [wallThicknessInput, setWallThicknessInput] = useState<string>('');

  const statusTimerRef = useRef<number | null>(null);
  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
    }, 3500);
  }, []);

  // Производни селектирани елементи
  const selectedWall = useMemo(
    () => room.walls.find((w) => w.id === selectedWallId) ?? null,
    [room.walls, selectedWallId]
  );

  const selectedStandaloneOpening = useMemo(
    () =>
      (room.openings ?? []).find((o) => o.id === selectedStandaloneOpeningId) ??
      null,
    [room.openings, selectedStandaloneOpeningId]
  );

  const selectedFloorZone = useMemo(
    () =>
      (room.floorZones ?? []).find((z) => z.id === selectedFloorZoneId) ?? null,
    [room.floorZones, selectedFloorZoneId]
  );

  const selectedObject = useMemo(
    () =>
      sceneObjects.find((o) => o.instanceId === selectedInstanceId) ?? null,
    [sceneObjects, selectedInstanceId]
  );

  const selectedModel = useMemo(() => {
    if (!selectedObject) return null;
    return models.find((m) => m.id === selectedObject.modelId) ?? null;
  }, [selectedObject, models]);

  useEffect(() => {
    if (!selectedWall) return;
    setWallLengthInput(String(getWallLengthM(selectedWall)));
    setWallAngleInput(String(getWallAngleDeg(selectedWall)));
    setWallThicknessInput(String(selectedWall.thicknessM));
  }, [selectedWall]);

  const transformTool: TransformTool =
    activeTool === 'rotate'
      ? 'rotate'
      : activeTool === 'scale'
        ? 'scale'
        : 'translate';

  // Зареждане на сесия, каталог и облачни проекти
  const refreshCatalogAndScenes = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const [modelsRes, texturesRes, modelCats, texCats] = await Promise.all([
        fetchModels(),
        fetchTextures(),
        fetchCategories('model').catch(() => []),
        fetchCategories('texture').catch(() => []),
      ]);

      setModels(modelsRes);
      setTextures(texturesRes);

      if (modelCats.length > 0) {
        const map: Record<string, string> = { ...DEFAULT_CATEGORY_LABELS };
        modelCats.forEach((c) => {
          map[c.slug] = c.name;
        });
        setCategoryLabels(map);
      }

      if (texCats.length > 0) {
        const map: Record<string, string> = {
          ...DEFAULT_TEXTURE_CATEGORY_LABELS,
        };
        texCats.forEach((c) => {
          map[c.slug] = c.name;
        });
        setTextureCategoryLabels(map);
      }
    } catch (err: any) {
      setCatalogError(err?.message || 'Грешка при зареждане на каталога.');
    } finally {
      setCatalogLoading(false);
    }

    try {
      const scenes = await listScenes();
      setCloudScenes(scenes);
    } catch {
      // ignore if unauthenticated
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetchMe();
      setCurrentUser(res.user);
      setSystemSettings(res.settings);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshMe();
    refreshCatalogAndScenes();
  }, [refreshMe, refreshCatalogAndScenes]);

  // Клавишни комбинации (Escape, Undo, Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Escape') {
        setIsDrawingWalls(false);
        setDraftPoints([]);
        setIsDrawingFloorZone(false);
        setZoneDraftPoints([]);
        setIsCalibratingPlan(false);
        setCalibPoints([]);
        setHoverPoint(null);
        setSelectedInstanceId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedStandaloneOpeningId(null);
        setSelectedFloorZoneId(null);
        setSelectedWallVertex(null);
        setSelectedFloorVertex(null);
        setSelectedSurfaces([]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // Облачно запазване и зареждане
  const handleSaveCloud = async () => {
    try {
      const res = await saveScene({
        id: currentSceneId,
        title: sceneTitle.trim() || 'Проект без име',
        objects: sceneObjects,
        room,
      });
      setCurrentSceneId(res.id);
      setSceneTitle(res.title);
      showStatus(`☁ Проектът „${res.title}“ е запазен в облака.`);
      const updatedList = await listScenes();
      setCloudScenes(updatedList);
    } catch (err: any) {
      showStatus(`❌ ${err?.message || 'Грешка при запазване.'}`);
    }
  };

  const handleLoadCloud = async (id: string) => {
    try {
      const loaded = await loadScene(id);
      const safeRoom = normalizeLoadedRoom(loaded.room);
      const safeObjects = normalizeLoadedObjects(loaded.objects);

      resetHistory({
        room: safeRoom,
        objects: safeObjects,
      });
      setCurrentSceneId(loaded.id || id);
      setSceneTitle(loaded.title || 'Зареден проект');
      setSelectedInstanceId(null);
      setSelectedWallId(null);
      setSelectedOpeningId(null);
      setSelectedStandaloneOpeningId(null);
      setSelectedFloorZoneId(null);
      setSelectedSurfaces([]);
      showStatus(`☁ Зареден проект: ${loaded.title || id}`);
    } catch (err: any) {
      showStatus(`❌ ${err?.message || 'Неуспешно зареждане на проекта.'}`);
    }
  };

  const handleResetScene = () => {
    resetHistory({
      room: createDefaultRoomConfig(),
      objects: [],
    });
    setCurrentSceneId(undefined);
    setSceneTitle('Нов интериорен проект');
    setSelectedInstanceId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setSelectedSurfaces([]);
    showStatus('Създадена е нова празна стая.');
  };

  // Чертаене на стени по пода
  const handleFloorDrawClick = (pt: [number, number]) => {
    setDraftPoints((prev) => {
      if (prev.length === 0) {
        return [pt];
      }
      const last = prev[prev.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.05) {
        return prev;
      }

      const newWall: WallSegment = {
        id: `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        start: last,
        end: pt,
        thicknessM: room.defaultThicknessM || 0.15,
        frontColor: '#f1f5f9',
        backColor: '#f1f5f9',
        openings: [],
      };

      setSceneState(
        (curr) => ({
          ...curr,
          room: {
            ...curr.room,
            walls: [...curr.room.walls, newWall],
          },
        }),
        true
      );

      if (
        prev.length >= 2 &&
        Math.hypot(pt[0] - prev[0][0], pt[1] - prev[0][1]) < 0.08
      ) {
        setIsDrawingWalls(false);
        setHoverPoint(null);
        showStatus('Контурът на помещението е затворен.');
        return [];
      }

      return [...prev, pt];
    });
  };

  // Чертаене на подова зона
  const handleFloorZoneDrawClick = (pt: [number, number]) => {
    setZoneDraftPoints((prev) => {
      if (
        prev.length >= 3 &&
        Math.hypot(pt[0] - prev[0][0], pt[1] - prev[0][1]) < 0.12
      ) {
        const newZone: FloorZone = {
          id: `zone-${Date.now()}`,
          name: `Зона ${(room.floorZones ?? []).length + 1}`,
          points: prev,
          color: '#b08968',
          roughness: 0.55,
          metalness: 0.05,
        };
        setSceneState(
          (curr) => ({
            ...curr,
            room: {
              ...curr.room,
              floorZones: [...(curr.room.floorZones ?? []), newZone],
            },
          }),
          true
        );
        setSelectedFloorZoneId(newZone.id);
        setIsDrawingFloorZone(false);
        setHoverPoint(null);
        showStatus('Подовата зона е създадена.');
        return [];
      }
      return [...prev, pt];
    });
  };

  // Калибрация на 2D архитектурна подложка
  const handleCalibFloorClick = (pt: [number, number]) => {
    setCalibPoints((prev) => {
      if (prev.length === 0) return [pt];
      const p1 = prev[0];
      const measuredDistM = Math.hypot(pt[0] - p1[0], pt[1] - p1[1]);
      const realDistM = parseFloat(calibRealLengthM.replace(',', '.'));
      if (measuredDistM > 0.05 && realDistM > 0.1 && room.floorplan) {
        const ratio = realDistM / measuredDistM;
        setSceneState(
          (curr) => ({
            ...curr,
            room: {
              ...curr.room,
              floorplan: curr.room.floorplan
                ? {
                    ...curr.room.floorplan,
                    widthM: Number((curr.room.floorplan.widthM * ratio).toFixed(2)),
                    depthM: Number((curr.room.floorplan.depthM * ratio).toFixed(2)),
                  }
                : null,
            },
          }),
          true
        );
        showStatus(`Мащабът на подложката е калибриран (${realDistM} м).`);
      }
      setIsCalibratingPlan(false);
      setHoverPoint(null);
      return [];
    });
  };

  // Селекция на повърхности (стени / подови зони)
  const handleSelectSurface = (target: SurfaceTarget, additive: boolean) => {
    setSelectedInstanceId(null);
    setSelectedStandaloneOpeningId(null);

    if (target.kind === 'wall') {
      setSelectedWallId(target.wallId);
      setSelectedFloorZoneId(null);
    } else {
      setSelectedFloorZoneId(target.zoneId);
      setSelectedWallId(null);
    }

    setSelectedSurfaces((prev) => {
      if (!additive) return [target];
      const exists = prev.some((s) => isSameSurface(s, target));
      return exists
        ? prev.filter((s) => !isSameSurface(s, target))
        : [...prev, target];
    });
  };

  const handleMaterializeAutoFloorZone = (
    points: [number, number][],
    options?: {
      textureId?: string | null;
      selectZone?: boolean;
      additive?: boolean;
    }
  ): string | null => {
    const newZone: FloorZone = {
      id: `zone-${Date.now()}`,
      name: `Под ${(room.floorZones ?? []).length + 1}`,
      points,
      color: options?.textureId ? '#ffffff' : '#b08968',
      roughness: 0.55,
      metalness: 0.05,
      textureId: options?.textureId || undefined,
    };

    setSceneState(
      (curr) => ({
        ...curr,
        room: {
          ...curr.room,
          floorZones: [...(curr.room.floorZones ?? []), newZone],
        },
      }),
      true
    );

    if (options?.selectZone) {
      handleSelectSurface(
        { kind: 'floor', zoneId: newZone.id },
        Boolean(options.additive)
      );
    }
    return newZone.id;
  };

  const handleApplySurfaceBatch = (patch: SurfaceBatchPatch) => {
    if (selectedSurfaces.length === 0) return;

    setSceneState(
      (curr) => {
        const nextWalls = curr.room.walls.map((w) => {
          const matchingSides = selectedSurfaces.filter(
            (s): s is Extract<SurfaceTarget, { kind: 'wall' }> =>
              s.kind === 'wall' && s.wallId === w.id
          );
          if (matchingSides.length === 0) return w;

          let updated = { ...w };
          for (const m of matchingSides) {
            const side = m.side;
            if (patch.color !== undefined) {
              if (side === 'front') updated.frontColor = patch.color;
              if (side === 'back') updated.backColor = patch.color;
              if (side === 'start') updated.startColor = patch.color;
              if (side === 'end') updated.endColor = patch.color;
            }
            if (patch.textureId !== undefined) {
              const tid = patch.textureId || undefined;
              if (side === 'front') updated.frontTextureId = tid;
              if (side === 'back') updated.backTextureId = tid;
              if (side === 'start') updated.startTextureId = tid;
              if (side === 'end') updated.endTextureId = tid;
            }
            if (patch.tileHeightM !== undefined) {
              if (side === 'front') updated.frontTileHeightM = patch.tileHeightM;
              if (side === 'back') updated.backTileHeightM = patch.tileHeightM;
              if (side === 'start') updated.startTileHeightM = patch.tileHeightM;
              if (side === 'end') updated.endTileHeightM = patch.tileHeightM;
            }
            if (patch.resetUvw) {
              if (side === 'front') updated.frontUvw = undefined;
              if (side === 'back') updated.backUvw = undefined;
              if (side === 'start') updated.startUvw = undefined;
              if (side === 'end') updated.endUvw = undefined;
            } else if (patch.uvwPatch) {
              if (side === 'front')
                updated.frontUvw = {
                  ...(updated.frontUvw ?? {}),
                  ...patch.uvwPatch,
                };
              if (side === 'back')
                updated.backUvw = {
                  ...(updated.backUvw ?? {}),
                  ...patch.uvwPatch,
                };
              if (side === 'start')
                updated.startUvw = {
                  ...(updated.startUvw ?? {}),
                  ...patch.uvwPatch,
                };
              if (side === 'end')
                updated.endUvw = {
                  ...(updated.endUvw ?? {}),
                  ...patch.uvwPatch,
                };
            }
          }
          return updated;
        });

        const nextZones = (curr.room.floorZones ?? []).map((z) => {
          const isMatched = selectedSurfaces.some(
            (s) => s.kind === 'floor' && s.zoneId === z.id
          );
          if (!isMatched) return z;

          return {
            ...z,
            color: patch.color !== undefined ? patch.color : z.color,
            textureId:
              patch.textureId !== undefined
                ? patch.textureId || undefined
                : z.textureId,
            roughness:
              patch.roughness !== undefined ? patch.roughness : z.roughness,
            metalness:
              patch.metalness !== undefined ? patch.metalness : z.metalness,
            uvw: patch.resetUvw
              ? undefined
              : patch.uvwPatch
                ? { ...(z.uvw ?? {}), ...patch.uvwPatch }
                : z.uvw,
          };
        });

        return {
          ...curr,
          room: {
            ...curr.room,
            walls: nextWalls,
            floorZones: nextZones,
          },
        };
      },
      true
    );
  };

  // Добавяне на модел от каталога
  const handleSelectCatalogModel = (model: CatalogModel) => {
    const newObj: SceneObject = {
      instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      modelId: model.id,
      name: model.name,
      category: model.category,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensionsCm: model.dimensionsCm,
      scaleMode: model.scaleMode,
      scaleConstraints: model.scaleConstraints,
      glbUrl: model.glbUrl,
    };

    setSceneState(
      (curr) => ({
        ...curr,
        objects: [...curr.objects, newObj],
      }),
      true
    );
    setSelectedInstanceId(newObj.instanceId);
    setSelectedWallId(null);
    setSelectedFloorZoneId(null);
    setSelectedSurfaces([]);
    setActiveTool('move');
    showStatus(`Добавен модел: ${model.name}`);
  };

  // Прилагане на текстура от каталога върху избрания обект, под или стени
  const handleApplyTextureFromCatalog = (
    targetMode: 'selected' | 'floor' | 'walls',
    texture: CatalogTexture
  ) => {
    if (targetMode === 'selected') {
      if (selectedSurfaces.length > 0) {
        handleApplySurfaceBatch({ textureId: texture.id, color: '#ffffff' });
        showStatus(
          `Приложена текстура „${texture.name}“ върху избраните повърхности.`
        );
        return;
      }
      if (selectedObject) {
        const slots = discoveredMaterialsMap[selectedObject.instanceId] ?? [];
        const targetKey = slots[0]?.key || 'default';
        setSceneState(
          (curr) => ({
            ...curr,
            objects: curr.objects.map((o) =>
              o.instanceId === selectedObject.instanceId
                ? {
                    ...o,
                    materialOverrides: {
                      ...(o.materialOverrides ?? {}),
                      [targetKey]: {
                        color: '#ffffff',
                        textureId: texture.id,
                      },
                    },
                  }
                : o
            ),
          }),
          true
        );
        showStatus(
          `Приложена текстура „${texture.name}“ върху ${selectedObject.name}.`
        );
        return;
      }
      showStatus('Първо избери стена, под или 3D обект в сцената.');
      return;
    }

    if (targetMode === 'floor') {
      if ((room.floorZones ?? []).length === 0) {
        showStatus(
          'Кликни върху пода в 3D, за да се създаде подова зона, или очертай зона.'
        );
        return;
      }
      setSceneState(
        (curr) => ({
          ...curr,
          room: {
            ...curr.room,
            floorZones: (curr.room.floorZones ?? []).map((z) => ({
              ...z,
              color: '#ffffff',
              textureId: texture.id,
            })),
          },
        }),
        true
      );
      showStatus(`Настилката „${texture.name}“ е приложена върху подовете.`);
      return;
    }

    if (targetMode === 'walls') {
      setSceneState(
        (curr) => ({
          ...curr,
          room: {
            ...curr.room,
            walls: curr.room.walls.map((w) => ({
              ...w,
              frontColor: '#ffffff',
              backColor: '#ffffff',
              frontTextureId: texture.id,
              backTextureId: texture.id,
            })),
          },
        }),
        true
      );
      showStatus(`Облицовката „${texture.name}“ е приложена върху стените.`);
    }
  };

  // Параметрични мебели (създаване / редакция)
  const handleConfirmParametric = (
    name: string,
    config: ParametricFurnitureConfig
  ) => {
    if (editingParametricObj) {
      setSceneState(
        (curr) => ({
          ...curr,
          objects: curr.objects.map((o) =>
            o.instanceId === editingParametricObj.instanceId
              ? { ...o, name, parametric: config }
              : o
          ),
        }),
        true
      );
      setEditingParametricObj(null);
      setParametricModalOpen(false);
      showStatus(`Обновен параметричен модул: ${name}`);
      return;
    }

    const newObj: SceneObject = {
      instanceId: `param-${Date.now()}`,
      modelId: 'parametric-custom',
      name,
      category: config.kind === 'kitchen' ? 'kitchen' : 'wardrobes',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parametric: config,
    };

    setSceneState(
      (curr) => ({
        ...curr,
        objects: [...curr.objects, newObj],
      }),
      true
    );
    setSelectedInstanceId(newObj.instanceId);
    setParametricModalOpen(false);
    setActiveTool('move');
    showStatus(`Създаден параметричен модул: ${name}`);
  };

  // АДМИН СТРАНИЦА (/admin)
  if (isAdminRoute) {
    return (
      <AdminPage
        currentUser={currentUser}
        systemSettings={systemSettings}
        onSystemSettingsUpdated={(next) => setSystemSettings(next)}
        onRefreshCurrentUser={refreshMe}
        onCatalogUpdated={refreshCatalogAndScenes}
        onExitToStudio={() => {
          window.history.pushState({}, '', '/');
          setIsAdminRoute(false);
          refreshCatalogAndScenes();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        activeTool={activeTool}
        placementMode={placementMode}
        snapEnabled={snapEnabled}
        overlaySettings={overlaySettings}
        catalogOpen={catalogOpen}
        viewMode={viewMode}
        isDrawingWalls={isDrawingWalls}
        isDrawingFloorZone={isDrawingFloorZone}
        roomPanelOpen={roomPanelOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        sceneTitle={sceneTitle}
        currentSceneId={currentSceneId}
        cloudScenes={cloudScenes}
        currentUser={currentUser}
        systemSettings={systemSettings}
        statusMessage={statusMessage}
        onSelectTool={setActiveTool}
        onSelectPlacementMode={setPlacementMode}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onUpdateOverlaySettings={(patch) =>
          setOverlaySettings((prev) => ({ ...prev, ...patch }))
        }
        onToggleCatalog={() => setCatalogOpen((c) => !c)}
        onToggleViewMode={(mode) => setViewMode(mode)}
        onToggleDrawWalls={() => {
          setIsDrawingWalls((prev) => {
            const next = !prev;
            if (next) {
              setIsDrawingFloorZone(false);
              setIsCalibratingPlan(false);
              setViewMode('top');
              showStatus('Кликни по плана за стени. Esc за край.');
            } else {
              setDraftPoints([]);
              setHoverPoint(null);
            }
            return next;
          });
        }}
        onToggleDrawFloorZone={() => {
          setIsDrawingFloorZone((prev) => {
            const next = !prev;
            if (next) {
              setIsDrawingWalls(false);
              setIsCalibratingPlan(false);
              setViewMode('top');
              showStatus(
                'Очертай ъглите на подовата зона и затвори в първата точка.'
              );
            } else {
              setZoneDraftPoints([]);
              setHoverPoint(null);
            }
            return next;
          });
        }}
        onToggleRoomPanel={() => setRoomPanelOpen((p) => !p)}
        onOpenBomModal={() => setBomModalOpen(true)}
        onOpenAdminPage={() => {
          window.history.pushState({}, '', '/admin');
          setIsAdminRoute(true);
        }}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await logoutUser();
          setCurrentUser(null);
          showStatus('Излязохте от профила си.');
        }}
        onSceneTitleChange={setSceneTitle}
        onSaveCloud={handleSaveCloud}
        onLoadCloud={handleLoadCloud}
        onUndo={undo}
        onRedo={redo}
        onResetScene={handleResetScene}
      />

      {/* ПАНЕЛ ЗА ШАБЛОНИ НА СТАЯ, ТАВАН И 2D ПОДЛОЖКА */}
      {roomPanelOpen && (
        <div
          style={{
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #334155',
            padding: '10px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '14px',
            zIndex: 25,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}
            >
              Шаблон:
            </span>
            <button
              type="button"
              className="btn"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={() => {
                setSceneState(
                  (curr) => ({
                    ...curr,
                    room: {
                      ...curr.room,
                      walls: createStarterWalls(
                        curr.room.defaultThicknessM || 0.15
                      ),
                      floorZones: [],
                    },
                  }),
                  true
                );
                showStatus('Заредена е правоъгълна стая 5 × 4 м.');
              }}
            >
              Правоъгълна 5 × 4 м
            </button>
          </div>

          <div className="divider-v" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              Височина таван (м):
            </span>
            <input
              type="number"
              step={0.05}
              min={2}
              max={6}
              className="input-control"
              style={{ width: '72px' }}
              value={room.ceilingHeightM}
              onChange={(e) => {
                const h = parseFloat(e.target.value);
                if (h >= 1.5 && h <= 8) {
                  setSceneState(
                    (curr) => ({
                      ...curr,
                      room: { ...curr.room, ceilingHeightM: h },
                    }),
                    true
                  );
                }
              }}
            />
          </div>

          <div className="divider-v" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              className="btn"
              style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer' }}
            >
              🗺 Качи 2D план (снимка)
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const url = await uploadFloorplanFile(file);
                    setSceneState(
                      (curr) => ({
                        ...curr,
                        room: {
                          ...curr.room,
                          floorplan: {
                            imageUrl: url,
                            widthM: 10,
                            depthM: 8,
                            aspectRatio: 1.25,
                            offsetX: 0,
                            offsetZ: 0,
                            rotationDeg: 0,
                            opacity: 0.45,
                            visible: true,
                          },
                        },
                      }),
                      true
                    );
                    setViewMode('top');
                    showStatus('2D планът е качен като подложка.');
                  } catch (err: any) {
                    showStatus(
                      `❌ ${err?.message || 'Грешка при качване на плана.'}`
                    );
                  }
                }}
              />
            </label>

            {room.floorplan && (
              <>
                <button
                  type="button"
                  className={`btn ${isCalibratingPlan ? 'btn-active' : ''}`}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => {
                    setIsCalibratingPlan((p) => !p);
                    setCalibPoints([]);
                    setViewMode('top');
                    showStatus(
                      'Кликни двата края на известна стена върху снимката.'
                    );
                  }}
                >
                  📏 Калибрирай мащаб
                </button>
                {isCalibratingPlan && (
                  <input
                    type="number"
                    step={0.1}
                    className="input-control"
                    style={{ width: '68px' }}
                    value={calibRealLengthM}
                    onChange={(e) => setCalibRealLengthM(e.target.value)}
                    title="Реална дължина в метри"
                  />
                )}
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() =>
                    setSceneState(
                      (curr) => ({
                        ...curr,
                        room: {
                          ...curr.room,
                          floorplan: curr.room.floorplan
                            ? {
                                ...curr.room.floorplan,
                                visible: !curr.room.floorplan.visible,
                              }
                            : null,
                        },
                      }),
                      true
                    )
                  }
                >
                  {room.floorplan.visible
                    ? '👁 Скрий подложка'
                    : '👁 Покажи подложка'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="workspace-body">
        {catalogOpen && (
          <CatalogDrawer
            models={models}
            textures={textures}
            categoryLabels={categoryLabels}
            textureCategoryLabels={textureCategoryLabels}
            loading={catalogLoading}
            error={catalogError}
            currentUser={currentUser}
            systemSettings={systemSettings}
            onRefreshCatalog={refreshCatalogAndScenes}
            onOpenParametricBuilder={() => {
              setEditingParametricObj(null);
              setParametricModalOpen(true);
            }}
            onSelectModel={handleSelectCatalogModel}
            onApplyTextureToSelected={(tex) =>
              handleApplyTextureFromCatalog('selected', tex)
            }
            onApplyFloorTexture={(tex) =>
              handleApplyTextureFromCatalog('floor', tex)
            }
            onApplyWallTexture={(tex) =>
              handleApplyTextureFromCatalog('walls', tex)
            }
          />
        )}

        <main className="canvas-stage">
          <Viewport3D
            room={room}
            viewMode={viewMode}
            overlaySettings={overlaySettings}
            models={models}
            textures={textures}
            sceneObjects={sceneObjects}
            selectedInstanceId={selectedInstanceId}
            selectedWallId={selectedWallId}
            selectedOpeningId={selectedOpeningId}
            selectedStandaloneOpeningId={selectedStandaloneOpeningId}
            selectedFloorZoneId={selectedFloorZoneId}
            selectedSurfaces={selectedSurfaces}
            selectedWallVertex={selectedWallVertex}
            selectedFloorVertex={selectedFloorVertex}
            linkedVertexJoint={linkedVertexJoint}
            autoStraightenVertices={autoStraightenVertices}
            transformTool={transformTool}
            isDrawingWalls={isDrawingWalls}
            draftPoints={draftPoints}
            isDrawingFloorZone={isDrawingFloorZone}
            zoneDraftPoints={zoneDraftPoints}
            isCalibratingPlan={isCalibratingPlan}
            calibPoints={calibPoints}
            hoverPoint={hoverPoint}
            onHoverPointChange={setHoverPoint}
            onFloorDrawClick={handleFloorDrawClick}
            onFloorZoneDrawClick={handleFloorZoneDrawClick}
            onCalibFloorClick={handleCalibFloorClick}
            onSelectObject={(id) => {
              setSelectedInstanceId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedFloorZoneId(null);
                setSelectedStandaloneOpeningId(null);
                setSelectedSurfaces([]);
              }
            }}
            onSelectWall={(wallId) => {
              setSelectedWallId(wallId);
              if (wallId) {
                setSelectedInstanceId(null);
                setSelectedFloorZoneId(null);
                setSelectedStandaloneOpeningId(null);
              }
            }}
            onInlineUpdateWallLength={(wallId, nextLengthM) => {
              setSceneState(
                (curr) => ({
                  ...curr,
                  room: {
                    ...curr.room,
                    walls: curr.room.walls.map((w) => {
                      if (w.id !== wallId) return w;
                      const deg = getWallAngleDeg(w);
                      const rad = (deg * Math.PI) / 180;
                      return {
                        ...w,
                        end: [
                          Number(
                            (w.start[0] + Math.cos(rad) * nextLengthM).toFixed(3)
                          ),
                          Number(
                            (w.start[1] + Math.sin(rad) * nextLengthM).toFixed(3)
                          ),
                        ],
                      };
                    }),
                  },
                }),
                true
              );
            }}
            onSelectSurface={handleSelectSurface}
            onClearSurfaceSelection={() => setSelectedSurfaces([])}
            onDropTextureOnSurface={(target, textureId) => {
              handleSelectSurface(target, false);
              setTimeout(() => {
                handleApplySurfaceBatch({ textureId, color: '#ffffff' });
              }, 0);
            }}
            onMaterializeAutoFloorZone={handleMaterializeAutoFloorZone}
            onSelectOpening={(wallId, openingId) => {
              setSelectedWallId(wallId);
              setSelectedOpeningId(openingId);
              setSelectedInstanceId(null);
            }}
            onSelectStandaloneOpening={(openingId) => {
              setSelectedStandaloneOpeningId(openingId);
              if (openingId) {
                setSelectedInstanceId(null);
                setSelectedWallId(null);
                setSelectedFloorZoneId(null);
              }
            }}
            onSelectFloorZone={(zoneId) => {
              setSelectedFloorZoneId(zoneId);
              if (zoneId) {
                setSelectedInstanceId(null);
                setSelectedWallId(null);
                setSelectedStandaloneOpeningId(null);
              }
            }}
            onSelectWallVertex={setSelectedWallVertex}
            onSelectFloorVertex={setSelectedFloorVertex}
            onUpdateStandaloneOpening={(openingId, patch) => {
              setSceneState(
                (curr) => ({
                  ...curr,
                  room: {
                    ...curr.room,
                    openings: (curr.room.openings ?? []).map((o) =>
                      o.id === openingId ? { ...o, ...patch } : o
                    ),
                  },
                }),
                true
              );
            }}
            onCommitWallsFromVertex={(nextWalls) => {
              setSceneState(
                (curr) => ({
                  ...curr,
                  room: { ...curr.room, walls: nextWalls },
                }),
                true
              );
            }}
            onCommitFloorZonesFromVertex={(nextZones) => {
              setSceneState(
                (curr) => ({
                  ...curr,
                  room: { ...curr.room, floorZones: nextZones },
                }),
                true
              );
            }}
            onMaterialsDiscovered={(instanceId, slots) => {
              setDiscoveredMaterialsMap((prev) => ({
                ...prev,
                [instanceId]: slots,
              }));
            }}
            onTransformChange={(instanceId, position, rotation, scale) => {
              setSceneState((curr) => ({
                ...curr,
                objects: curr.objects.map((o) =>
                  o.instanceId === instanceId
                    ? { ...o, position, rotation, scale }
                    : o
                ),
              }));
            }}
          />
        </main>

        <RightInspector
          room={room}
          models={models}
          textures={textures}
          sceneObjects={sceneObjects}
          unit={unit}
          selectedSurfaces={selectedSurfaces}
          selectedWall={selectedWall}
          selectedOpeningId={selectedOpeningId}
          selectedStandaloneOpening={selectedStandaloneOpening}
          selectedFloorZone={selectedFloorZone}
          selectedObject={selectedObject}
          selectedModel={selectedModel}
          discoveredMaterialSlots={
            selectedObject
              ? discoveredMaterialsMap[selectedObject.instanceId] ?? []
              : []
          }
          selectedWallVertex={selectedWallVertex}
          selectedFloorVertex={selectedFloorVertex}
          linkedVertexJoint={linkedVertexJoint}
          autoStraightenVertices={autoStraightenVertices}
          wallLengthInput={wallLengthInput}
          wallAngleInput={wallAngleInput}
          wallThicknessInput={wallThicknessInput}
          onApplySurfaceBatch={handleApplySurfaceBatch}
          onClearSurfaceSelection={() => setSelectedSurfaces([])}
          onSelectWallVertex={setSelectedWallVertex}
          onToggleLinkedVertexJoint={() => setLinkedVertexJoint((p) => !p)}
          onToggleAutoStraightenVertices={() =>
            setAutoStraightenVertices((p) => !p)
          }
          onStraightenSelectedWall={() => {
            if (!selectedWall) return;
            const len = getWallLengthM(selectedWall);
            const curAngle = getWallAngleDeg(selectedWall);
            const snappedDeg = Math.round(curAngle / 90) * 90;
            const rad = (snappedDeg * Math.PI) / 180;
            const nextEnd: [number, number] = [
              Number((selectedWall.start[0] + Math.cos(rad) * len).toFixed(3)),
              Number((selectedWall.start[1] + Math.sin(rad) * len).toFixed(3)),
            ];
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === selectedWall.id ? { ...w, end: nextEnd } : w
                  ),
                },
              }),
              true
            );
          }}
          onWallLengthInputChange={setWallLengthInput}
          onWallAngleInputChange={setWallAngleInput}
          onWallThicknessInputChange={setWallThicknessInput}
          onCommitSelectedWallChanges={() => {
            if (!selectedWall) return;
            const len = Math.max(
              0.1,
              parseFloat(wallLengthInput) || getWallLengthM(selectedWall)
            );
            const deg =
              parseFloat(wallAngleInput) ?? getWallAngleDeg(selectedWall);
            const thick = Math.max(
              0.05,
              parseFloat(wallThicknessInput) || selectedWall.thicknessM
            );
            const rad = (deg * Math.PI) / 180;
            const nextEnd: [number, number] = [
              Number((selectedWall.start[0] + Math.cos(rad) * len).toFixed(3)),
              Number((selectedWall.start[1] + Math.sin(rad) * len).toFixed(3)),
            ];
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === selectedWall.id
                      ? { ...w, end: nextEnd, thicknessM: thick }
                      : w
                  ),
                },
              }),
              true
            );
          }}
          onUpdateWallSurface={(wallId, patch) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === wallId ? { ...w, ...patch } : w
                  ),
                },
              }),
              true
            );
          }}
          onDeleteSelectedWall={() => {
            if (!selectedWall) return;
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.filter(
                    (w) => w.id !== selectedWall.id
                  ),
                },
              }),
              true
            );
            setSelectedWallId(null);
            setSelectedSurfaces([]);
          }}
          onSelectOpening={setSelectedOpeningId}
          onAddOpeningToSelectedWall={(type: OpeningType) => {
            if (!selectedWall) return;
            const wLen = getWallLengthM(selectedWall);
            const opW = type === 'door' ? 0.9 : 1.2;
            const newOp: WallOpening = {
              id: `op-${Date.now()}`,
              type,
              offsetFromStartM: Math.max(
                0.1,
                Number(((wLen - opW) / 2).toFixed(2))
              ),
              widthM: opW,
              heightM: type === 'door' ? 2.05 : 1.35,
              sillHeightM: type === 'door' ? 0 : 0.9,
              swing: type === 'door' ? 'left-in' : undefined,
            };
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === selectedWall.id
                      ? { ...w, openings: [...(w.openings ?? []), newOp] }
                      : w
                  ),
                },
              }),
              true
            );
            setSelectedOpeningId(newOp.id);
          }}
          onUpdateOpening={(wallId, openingId, patch) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === wallId
                      ? {
                          ...w,
                          openings: (w.openings ?? []).map((op) =>
                            op.id === openingId ? { ...op, ...patch } : op
                          ),
                        }
                      : w
                  ),
                },
              }),
              true
            );
          }}
          onDeleteOpening={(wallId, openingId) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  walls: curr.room.walls.map((w) =>
                    w.id === wallId
                      ? {
                          ...w,
                          openings: (w.openings ?? []).filter(
                            (op) => op.id !== openingId
                          ),
                        }
                      : w
                  ),
                },
              }),
              true
            );
            if (selectedOpeningId === openingId) setSelectedOpeningId(null);
          }}
          onSelectStandaloneOpening={setSelectedStandaloneOpeningId}
          onUpdateStandaloneOpening={(openingId, patch) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  openings: (curr.room.openings ?? []).map((o) =>
                    o.id === openingId ? { ...o, ...patch } : o
                  ),
                },
              }),
              true
            );
          }}
          onDuplicateStandaloneOpening={(openingId) => {
            const orig = (room.openings ?? []).find((o) => o.id === openingId);
            if (!orig) return;
            const copy: StandaloneOpening = {
              ...orig,
              id: `sop-${Date.now()}`,
              position: [orig.position[0] + 0.4, orig.position[1] + 0.4],
            };
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  openings: [...(curr.room.openings ?? []), copy],
                },
              }),
              true
            );
            setSelectedStandaloneOpeningId(copy.id);
          }}
          onDeleteStandaloneOpening={(openingId) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  openings: (curr.room.openings ?? []).filter(
                    (o) => o.id !== openingId
                  ),
                },
              }),
              true
            );
            setSelectedStandaloneOpeningId(null);
          }}
          onSelectFloorZone={setSelectedFloorZoneId}
          onSelectFloorVertex={setSelectedFloorVertex}
          onUpdateFloorZoneVertex={(zoneId, pointIndex, nextPoint) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: (curr.room.floorZones ?? []).map((z) =>
                    z.id === zoneId
                      ? {
                          ...z,
                          points: z.points.map((pt, i) =>
                            i === pointIndex ? nextPoint : pt
                          ),
                        }
                      : z
                  ),
                },
              }),
              true
            );
          }}
          onInsertFloorZoneVertexAfter={(zoneId, pointIndex) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: (curr.room.floorZones ?? []).map((z) => {
                    if (z.id !== zoneId) return z;
                    const p1 = z.points[pointIndex];
                    const p2 = z.points[(pointIndex + 1) % z.points.length];
                    const mid: [number, number] = [
                      Number(((p1[0] + p2[0]) / 2).toFixed(3)),
                      Number(((p1[1] + p2[1]) / 2).toFixed(3)),
                    ];
                    const nextPts = [...z.points];
                    nextPts.splice(pointIndex + 1, 0, mid);
                    return { ...z, points: nextPts };
                  }),
                },
              }),
              true
            );
          }}
          onDeleteFloorZoneVertex={(zoneId, pointIndex) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: (curr.room.floorZones ?? []).map((z) =>
                    z.id === zoneId && z.points.length > 3
                      ? {
                          ...z,
                          points: z.points.filter((_, i) => i !== pointIndex),
                        }
                      : z
                  ),
                },
              }),
              true
            );
          }}
          onUpdateFloorZone={(zoneId, patch) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: (curr.room.floorZones ?? []).map((z) =>
                    z.id === zoneId ? { ...z, ...patch } : z
                  ),
                },
              }),
              true
            );
          }}
          onDuplicateFloorZone={(zoneId) => {
            const orig = (room.floorZones ?? []).find((z) => z.id === zoneId);
            if (!orig) return;
            const copy: FloorZone = {
              ...orig,
              id: `zone-${Date.now()}`,
              name: `${orig.name} (копие)`,
              points: orig.points.map(([x, z]) => [x + 0.3, z + 0.3]),
            };
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: [...(curr.room.floorZones ?? []), copy],
                },
              }),
              true
            );
            setSelectedFloorZoneId(copy.id);
          }}
          onDeleteFloorZone={(zoneId) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: {
                  ...curr.room,
                  floorZones: (curr.room.floorZones ?? []).filter(
                    (z) => z.id !== zoneId
                  ),
                },
              }),
              true
            );
            setSelectedFloorZoneId(null);
            setSelectedSurfaces([]);
          }}
          onUpdateRoomCeiling={(patch) => {
            setSceneState(
              (curr) => ({
                ...curr,
                room: { ...curr.room, ...patch },
              }),
              true
            );
          }}
          onSelectInstance={setSelectedInstanceId}
          onTransformChange={(instanceId, position, rotation, scale) => {
            setSceneState((curr) => ({
              ...curr,
              objects: curr.objects.map((o) =>
                o.instanceId === instanceId
                  ? { ...o, position, rotation, scale }
                  : o
              ),
            }));
          }}
          onRotateYBy={(deg) => {
            if (!selectedObject) return;
            const deltaRad = (deg * Math.PI) / 180;
            const nextRot: [number, number, number] = [
              selectedObject.rotation[0],
              selectedObject.rotation[1] + deltaRad,
              selectedObject.rotation[2],
            ];
            setSceneState(
              (curr) => ({
                ...curr,
                objects: curr.objects.map((o) =>
                  o.instanceId === selectedObject.instanceId
                    ? { ...o, rotation: nextRot }
                    : o
                ),
              }),
              true
            );
          }}
          onToggleMirrorSelected={() => {
            if (!selectedObject) return;
            setSceneState(
              (curr) => ({
                ...curr,
                objects: curr.objects.map((o) =>
                  o.instanceId === selectedObject.instanceId
                    ? { ...o, mirrored: !o.mirrored }
                    : o
                ),
              }),
              true
            );
          }}
          onDuplicateSelected={() => {
            if (!selectedObject) return;
            const copy: SceneObject = {
              ...selectedObject,
              instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              position: [
                selectedObject.position[0] + 0.4,
                selectedObject.position[1],
                selectedObject.position[2] + 0.4,
              ],
            };
            setSceneState(
              (curr) => ({
                ...curr,
                objects: [...curr.objects, copy],
              }),
              true
            );
            setSelectedInstanceId(copy.instanceId);
          }}
          onDeleteSelected={() => {
            if (!selectedObject) return;
            setSceneState(
              (curr) => ({
                ...curr,
                objects: curr.objects.filter(
                  (o) => o.instanceId !== selectedObject.instanceId
                ),
              }),
              true
            );
            setSelectedInstanceId(null);
          }}
          onUpdateObjectMaterial={(
            instanceId: string,
            slotKey: string,
            override: MaterialOverride | null
          ) => {
            setSceneState(
              (curr) => ({
                ...curr,
                objects: curr.objects.map((o) => {
                  if (o.instanceId !== instanceId) return o;
                  const nextOverrides = { ...(o.materialOverrides ?? {}) };
                  if (override === null) {
                    delete nextOverrides[slotKey];
                  } else {
                    nextOverrides[slotKey] = override;
                  }
                  return { ...o, materialOverrides: nextOverrides };
                }),
              }),
              true
            );
          }}
          onSaveObjectAsPreset={(obj) => {
            showStatus(`Запазен вариант за „${obj.name || 'мебел'}“.`);
          }}
          onEditParametricObject={(obj) => {
            if (!obj.parametric) return;
            setEditingParametricObj(obj);
            setParametricModalOpen(true);
          }}
        />
      </div>

      {/* МОДАЛ ЗА ПАРАМЕТРИЧНИ МЕБЕЛИ (ГАРДЕРОБ / КУХНЯ) */}
      {parametricModalOpen && (
        <ParametricBuilderModal
          textures={textures}
          initialConfig={editingParametricObj?.parametric}
          initialName={editingParametricObj?.name}
          isEditingExisting={Boolean(editingParametricObj)}
          onClose={() => {
            setParametricModalOpen(false);
            setEditingParametricObj(null);
          }}
          onConfirm={handleConfirmParametric}
        />
      )}

      {/* МОДАЛ ЗА СПЕЦИФИКАЦИЯ И РАЗКРОЙ (BOM) */}
      {bomModalOpen && (
        <ProjectBomModal
          projectTitle={sceneTitle}
          room={room}
          sceneObjects={sceneObjects}
          models={models}
          textures={textures}
          onClose={() => setBomModalOpen(false)}
        />
      )}

      {/* МОДАЛ ЗА ВХОД / РЕГИСТРАЦИЯ */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={async (user, settings) => {
          setCurrentUser(user);
          if (settings) setSystemSettings(settings);
          setAuthModalOpen(false);
          await refreshCatalogAndScenes();
        }}
      />
    </div>
  );
}

export default App;