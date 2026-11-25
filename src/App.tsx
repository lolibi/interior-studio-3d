import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS } from './types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  DisplayUnit,
  MaterialOverride,
  ModelCategory,
  SavedSceneSummary,
  SceneObject,
  TransformTool,
} from './types/editor';
import {
  DEFAULT_OVERLAY_SETTINGS,
  calibrateFloorplanByTwoPoints,
  computeEndpointFromAngleAndLength,
  createDefaultRoomConfig,
  getWallAngleDeg,
  getWallLengthM,
  isSameSurface,
  straightenWallOrthogonal,
  toggleSurfaceInList,
  updateWallGeometry,
} from './types/room';
import type {
  ApartmentTemplate,
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
import { Viewport3D } from './components/Viewport3D';
import type { ViewportCameraMode } from './components/Viewport3D';
import { RightInspector } from './components/RightInspector';
import type { SurfaceBatchPatch } from './components/RightInspector';
import type { DiscoveredMaterialSlot } from './components/SceneItemMesh';
import { AdminPanel } from './components/AdminPanel';
import {
  DEFAULT_CATALOG_MODELS,
  loadCatalog,
  saveCatalog,
} from './utils/modelStorage';
import {
  deleteUserFurniturePreset,
  loadUserFurniturePresets,
  saveUserFurniturePreset,
} from './utils/userPresetsStorage';
import type { UserFurniturePreset } from './utils/userPresetsStorage';
import {
  fetchApartmentTemplates,
  fetchModels,
  fetchSceneById,
  fetchScenes,
  fetchTextures,
  saveSceneToServer,
  uploadFloorplanImage,
} from './utils/apiClient';

type LeftTab = 'catalog' | 'materials' | 'room';
type TopPopover = 'settings' | 'project' | null;

interface ProjectSnapshot {
  room: RoomConfig;
  sceneObjects: SceneObject[];
}

const STORAGE_KEY_PROJECT = 'interior_configurator_project_v1';
const STORAGE_KEY_OVERLAYS = 'interior_configurator_overlays_v1';

export function App() {
  const [models, setModels] = useState<CatalogModel[]>(() => loadCatalog());
  const [textures, setTextures] = useState<CatalogTexture[]>([]);
  const [templates, setTemplates] = useState<ApartmentTemplate[]>([]);
  const [savedScenes, setSavedScenes] = useState<SavedSceneSummary[]>([]);
  const [userPresets, setUserPresets] = useState<UserFurniturePreset[]>(() =>
    loadUserFurniturePresets()
  );
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSyncingServer, setIsSyncingServer] = useState(false);

  // Падащи менюта в горната лента („Настройки“ и „Проект“)
  const [openTopPopover, setOpenTopPopover] = useState<TopPopover>(null);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const projectPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openTopPopover) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        openTopPopover === 'settings' &&
        settingsPopoverRef.current &&
        !settingsPopoverRef.current.contains(target)
      ) {
        setOpenTopPopover(null);
      }
      if (
        openTopPopover === 'project' &&
        projectPopoverRef.current &&
        !projectPopoverRef.current.contains(target)
      ) {
        setOpenTopPopover(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [openTopPopover]);

  const [overlaySettings, setOverlaySettings] =
    useState<ViewportOverlaySettings>(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_OVERLAYS);
        if (raw) {
          return { ...DEFAULT_OVERLAY_SETTINGS, ...JSON.parse(raw) };
        }
      } catch {
        // ignore
      }
      return DEFAULT_OVERLAY_SETTINGS;
    });

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_OVERLAYS,
        JSON.stringify(overlaySettings)
      );
    } catch {
      // ignore
    }
  }, [overlaySettings]);

  const toggleOverlay = (key: keyof ViewportOverlaySettings) => {
    setOverlaySettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const refreshServerCatalogs = useCallback(async () => {
    setIsSyncingServer(true);
    try {
      const [srvModels, srvTextures, srvTemplates, srvScenes] =
        await Promise.allSettled([
          fetchModels(),
          fetchTextures(),
          fetchApartmentTemplates(),
          fetchScenes(),
        ]);

      if (srvModels.status === 'fulfilled' && srvModels.value.length > 0) {
        setModels(srvModels.value);
        saveCatalog(srvModels.value);
      } else if (models.length === 0) {
        setModels(DEFAULT_CATALOG_MODELS);
      }

      if (srvTextures.status === 'fulfilled') {
        setTextures(srvTextures.value.filter((t) => t.isActive !== false));
      }

      if (srvTemplates.status === 'fulfilled') {
        setTemplates(srvTemplates.value);
      }

      if (srvScenes.status === 'fulfilled') {
        setSavedScenes(srvScenes.value);
      }
    } finally {
      setIsSyncingServer(false);
    }
  }, [models.length]);

  useEffect(() => {
    void refreshServerCatalogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const syncNow = () => {
      if (document.visibilityState === 'visible') {
        void refreshServerCatalogs();
      }
    };

    const intervalId = window.setInterval(syncNow, 30000);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', syncNow);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, [refreshServerCatalogs]);

  const [currentSceneId, setCurrentSceneId] = useState<string | undefined>(
    undefined
  );
  const [currentSceneTitle, setCurrentSceneTitle] = useState(
    'Нов интериорен проект'
  );

  const [room, setRoom] = useState<RoomConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROJECT);
      if (raw) {
        const parsed = JSON.parse(raw) as ProjectSnapshot;
        if (parsed?.room?.walls) return parsed.room;
      }
    } catch {
      // ignore
    }
    return createDefaultRoomConfig();
  });

  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROJECT);
      if (raw) {
        const parsed = JSON.parse(raw) as ProjectSnapshot;
        if (Array.isArray(parsed?.sceneObjects)) return parsed.sceneObjects;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [undoStack, setUndoStack] = useState<ProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectSnapshot[]>([]);

  const pushHistory = useCallback(
    (nextRoom: RoomConfig, nextObjects: SceneObject[]) => {
      setUndoStack((prev) => [...prev.slice(-29), { room, sceneObjects }]);
      setRedoStack([]);
      setRoom(nextRoom);
      setSceneObjects(nextObjects);
    },
    [room, sceneObjects]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, { room, sceneObjects }]);
      setRoom(last.room);
      setSceneObjects(last.sceneObjects);
      return prev.slice(0, -1);
    });
  }, [room, sceneObjects]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, { room, sceneObjects }]);
      setRoom(next.room);
      setSceneObjects(next.sceneObjects);
      return prev.slice(0, -1);
    });
  }, [room, sceneObjects]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_PROJECT,
        JSON.stringify({ room, sceneObjects })
      );
    } catch {
      // ignore
    }
  }, [room, sceneObjects]);

  const [leftTab, setLeftTab] = useState<LeftTab>('catalog');
  const [categoryFilter, setCategoryFilter] = useState<
    ModelCategory | 'all' | 'presets'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState<
    'all' | 'wall' | 'floor' | 'tiles'
  >('all');

  const [viewMode, setViewMode] = useState<ViewportCameraMode>('3d');
  const [transformTool, setTransformTool] = useState<TransformTool>('translate');
  const [unit, setUnit] = useState<DisplayUnit>('cm');

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null
  );
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    null
  );
  const [selectedStandaloneOpeningId, setSelectedStandaloneOpeningId] = useState<
    string | null
  >(null);
  const [selectedFloorZoneId, setSelectedFloorZoneId] = useState<string | null>(
    null
  );
  const [selectedSurfaces, setSelectedSurfaces] = useState<SurfaceTarget[]>([]);
  const [selectedWallVertex, setSelectedWallVertex] =
    useState<SelectedWallVertex | null>(null);
  const [selectedFloorVertex, setSelectedFloorVertex] =
    useState<SelectedFloorVertex | null>(null);

  const [draggedTextureId, setDraggedTextureId] = useState<string | null>(null);

  useEffect(() => {
    if (!draggedTextureId) return;
    const clearDrag = () => setDraggedTextureId(null);
    window.addEventListener('pointerup', clearDrag);
    return () => window.removeEventListener('pointerup', clearDrag);
  }, [draggedTextureId]);

  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [typedWallLength, setTypedWallLength] = useState('');

  const [isDrawingFloorZone, setIsDrawingFloorZone] = useState(false);
  const [zoneDraftPoints, setZoneDraftPoints] = useState<[number, number][]>([]);

  const [isCalibratingPlan, setIsCalibratingPlan] = useState(false);
  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);

  const [linkedVertexJoint, setLinkedVertexJoint] = useState(true);
  const [autoStraightenVertices, setAutoStraightenVertices] = useState(true);

  const [wallLengthInput, setWallLengthInput] = useState('');
  const [wallAngleInput, setWallAngleInput] = useState('');
  const [wallThicknessInput, setWallThicknessInput] = useState('');

  const [discoveredSlotsByInstance, setDiscoveredSlotsByInstance] = useState<
    Record<string, DiscoveredMaterialSlot[]>
  >({});

  const fileInputPlanRef = useRef<HTMLInputElement | null>(null);
  const fileInputImportRef = useRef<HTMLInputElement | null>(null);

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
    () => sceneObjects.find((o) => o.instanceId === selectedInstanceId) ?? null,
    [sceneObjects, selectedInstanceId]
  );

  const selectedModel = useMemo(
    () =>
      selectedObject
        ? models.find((m) => m.id === selectedObject.modelId) ?? null
        : null,
    [selectedObject, models]
  );

  useEffect(() => {
    if (!selectedWall) return;
    setWallLengthInput(String(getWallLengthM(selectedWall)));
    setWallAngleInput(String(getWallAngleDeg(selectedWall)));
    setWallThicknessInput(String(selectedWall.thicknessM));
  }, [selectedWall]);

  const clearAllSelections = useCallback(() => {
    setSelectedInstanceId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setSelectedSurfaces([]);
    setSelectedWallVertex(null);
    setSelectedFloorVertex(null);
  }, []);

  const handleStartNewProject = useCallback(() => {
    const hasChanges =
      sceneObjects.length > 0 ||
      room.walls.length !== 4 ||
      (room.openings?.length ?? 0) > 0 ||
      (room.floorZones?.length ?? 0) > 0 ||
      Boolean(currentSceneId);

    if (
      hasChanges &&
      !window.confirm(
        'Създаване на нов проект? Незапазените промени по текущата сцена ще бъдат изчистени.'
      )
    ) {
      return;
    }

    setOpenTopPopover(null);
    setIsDrawingWalls(false);
    setDraftPoints([]);
    setTypedWallLength('');
    setIsDrawingFloorZone(false);
    setZoneDraftPoints([]);
    setIsCalibratingPlan(false);
    setCalibPoints([]);
    setCurrentSceneId(undefined);
    setCurrentSceneTitle('Нов интериорен проект');
    pushHistory(createDefaultRoomConfig(), []);
    clearAllSelections();
  }, [
    sceneObjects.length,
    room.walls.length,
    room.openings?.length,
    room.floorZones?.length,
    currentSceneId,
    pushHistory,
    clearAllSelections,
  ]);

  const handleInlineUpdateWallLength = useCallback(
    (wallId: string, nextLengthM: number) => {
      if (Number.isNaN(nextLengthM) || nextLengthM < 0.05 || nextLengthM > 50) {
        return;
      }
      const nextWalls = room.walls.map((w) => {
        if (w.id !== wallId) return w;
        const ang = getWallAngleDeg(w);
        return updateWallGeometry(w, nextLengthM, ang);
      });
      pushHistory({ ...room, walls: nextWalls }, sceneObjects);
    },
    [room, sceneObjects, pushHistory]
  );

  const handleSelectSurface = useCallback(
    (target: SurfaceTarget, additive: boolean) => {
      setSelectedInstanceId(null);
      setSelectedStandaloneOpeningId(null);
      setSelectedOpeningId(null);

      if (additive) {
        setSelectedSurfaces((prev) => {
          const next = toggleSurfaceInList(prev, target);
          if (next.length === 1) {
            const only = next[0];
            setSelectedWallId(only.kind === 'wall' ? only.wallId : null);
            setSelectedFloorZoneId(only.kind === 'floor' ? only.zoneId : null);
          } else {
            setSelectedWallId(null);
            setSelectedFloorZoneId(null);
          }
          return next;
        });
      } else {
        setSelectedSurfaces([target]);
        if (target.kind === 'wall') {
          setSelectedWallId(target.wallId);
          setSelectedFloorZoneId(null);
          setSelectedFloorVertex(null);
        } else {
          setSelectedWallId(null);
          setSelectedFloorZoneId(target.zoneId);
        }
      }
    },
    []
  );

  const handleClearSurfaceSelection = useCallback(() => {
    setSelectedSurfaces([]);
  }, []);

  const applyPatchToTargets = useCallback(
    (targets: SurfaceTarget[], patch: SurfaceBatchPatch) => {
      if (targets.length === 0) return;

      const nextWalls = room.walls.map((w) => {
        const matchFront = targets.some((t) =>
          isSameSurface(t, { kind: 'wall', wallId: w.id, side: 'front' })
        );
        const matchBack = targets.some((t) =>
          isSameSurface(t, { kind: 'wall', wallId: w.id, side: 'back' })
        );
        const matchStart = targets.some((t) =>
          isSameSurface(t, { kind: 'wall', wallId: w.id, side: 'start' })
        );
        const matchEnd = targets.some((t) =>
          isSameSurface(t, { kind: 'wall', wallId: w.id, side: 'end' })
        );
        if (!matchFront && !matchBack && !matchStart && !matchEnd) return w;

        const updated = { ...w };

        if (matchFront) {
          if (patch.color !== undefined) updated.frontColor = patch.color;
          if ('textureId' in patch)
            updated.frontTextureId = patch.textureId || undefined;
          if (patch.tileHeightM !== undefined)
            updated.frontTileHeightM = patch.tileHeightM;
          if (patch.resetUvw) {
            updated.frontUvw = undefined;
          } else if (patch.uvwPatch) {
            updated.frontUvw = { ...(updated.frontUvw ?? {}), ...patch.uvwPatch };
          }
        }

        if (matchBack) {
          if (patch.color !== undefined) updated.backColor = patch.color;
          if ('textureId' in patch)
            updated.backTextureId = patch.textureId || undefined;
          if (patch.tileHeightM !== undefined)
            updated.backTileHeightM = patch.tileHeightM;
          if (patch.resetUvw) {
            updated.backUvw = undefined;
          } else if (patch.uvwPatch) {
            updated.backUvw = { ...(updated.backUvw ?? {}), ...patch.uvwPatch };
          }
        }

        if (matchStart) {
          if (patch.color !== undefined) updated.startColor = patch.color;
          if ('textureId' in patch)
            updated.startTextureId = patch.textureId || undefined;
          if (patch.tileHeightM !== undefined)
            updated.startTileHeightM = patch.tileHeightM;
          if (patch.resetUvw) {
            updated.startUvw = undefined;
          } else if (patch.uvwPatch) {
            updated.startUvw = { ...(updated.startUvw ?? {}), ...patch.uvwPatch };
          }
        }

        if (matchEnd) {
          if (patch.color !== undefined) updated.endColor = patch.color;
          if ('textureId' in patch)
            updated.endTextureId = patch.textureId || undefined;
          if (patch.tileHeightM !== undefined)
            updated.endTileHeightM = patch.tileHeightM;
          if (patch.resetUvw) {
            updated.endUvw = undefined;
          } else if (patch.uvwPatch) {
            updated.endUvw = { ...(updated.endUvw ?? {}), ...patch.uvwPatch };
          }
        }

        return updated;
      });

      const nextZones = (room.floorZones ?? []).map((z) => {
        const matchZone = targets.some((t) =>
          isSameSurface(t, { kind: 'floor', zoneId: z.id })
        );
        if (!matchZone) return z;

        const updated: FloorZone = { ...z };
        if (patch.color !== undefined) updated.color = patch.color;
        if ('textureId' in patch)
          updated.textureId = patch.textureId || undefined;
        if (patch.roughness !== undefined) updated.roughness = patch.roughness;
        if (patch.metalness !== undefined) updated.metalness = patch.metalness;
        if (patch.resetUvw) {
          updated.uvw = undefined;
          updated.textureRotationDeg = 0;
        } else if (patch.uvwPatch) {
          updated.uvw = { ...(updated.uvw ?? {}), ...patch.uvwPatch };
          if (patch.uvwPatch.rotationDeg !== undefined) {
            updated.textureRotationDeg = patch.uvwPatch.rotationDeg;
          }
        }
        return updated;
      });

      pushHistory({ ...room, walls: nextWalls, floorZones: nextZones }, sceneObjects);
    },
    [room, sceneObjects, pushHistory]
  );

  const handleDropTextureOnSurface = useCallback(
    (target: SurfaceTarget, textureId: string) => {
      const targetIsInSelection = selectedSurfaces.some((s) =>
        isSameSurface(s, target)
      );
      const targetsToPaint =
        targetIsInSelection && selectedSurfaces.length > 1
          ? selectedSurfaces
          : [target];

      applyPatchToTargets(targetsToPaint, { textureId });

      if (!targetIsInSelection) {
        setSelectedSurfaces([target]);
        if (target.kind === 'wall') {
          setSelectedWallId(target.wallId);
          setSelectedFloorZoneId(null);
        } else {
          setSelectedWallId(null);
          setSelectedFloorZoneId(target.zoneId);
        }
      }
      setDraggedTextureId(null);
    },
    [selectedSurfaces, applyPatchToTargets]
  );

  const handleUpdateFloorZoneVertex = useCallback(
    (zoneId: string, pointIndex: number, nextPoint: [number, number]) => {
      const nextZones = (room.floorZones ?? []).map((z) => {
        if (z.id !== zoneId) return z;
        const pts = z.points.map((pt, idx) =>
          idx === pointIndex ? nextPoint : pt
        );
        return { ...z, points: pts };
      });
      pushHistory({ ...room, floorZones: nextZones }, sceneObjects);
    },
    [room, sceneObjects, pushHistory]
  );

  const handleInsertFloorZoneVertexAfter = useCallback(
    (zoneId: string, pointIndex: number) => {
      const nextZones = (room.floorZones ?? []).map((z) => {
        if (z.id !== zoneId || z.points.length < 2) return z;
        const curr = z.points[pointIndex];
        const next = z.points[(pointIndex + 1) % z.points.length];
        if (!curr || !next) return z;

        const mid: [number, number] = [
          Number(((curr[0] + next[0]) / 2).toFixed(3)),
          Number(((curr[1] + next[1]) / 2).toFixed(3)),
        ];
        const pts = [...z.points];
        pts.splice(pointIndex + 1, 0, mid);
        return { ...z, points: pts };
      });
      pushHistory({ ...room, floorZones: nextZones }, sceneObjects);
      setSelectedFloorVertex({ zoneId, pointIndex: pointIndex + 1 });
    },
    [room, sceneObjects, pushHistory]
  );

  const handleDeleteFloorZoneVertex = useCallback(
    (zoneId: string, pointIndex: number) => {
      const nextZones = (room.floorZones ?? []).map((z) => {
        if (z.id !== zoneId || z.points.length <= 3) return z;
        return {
          ...z,
          points: z.points.filter((_, idx) => idx !== pointIndex),
        };
      });
      pushHistory({ ...room, floorZones: nextZones }, sceneObjects);
      setSelectedFloorVertex(null);
    },
    [room, sceneObjects, pushHistory]
  );

  const handleFloorDrawClick = useCallback(
    (pt: [number, number]) => {
      setTypedWallLength('');
      if (draftPoints.length === 0) {
        setDraftPoints([pt]);
        return;
      }

      const prevPt = draftPoints[draftPoints.length - 1];
      if (Math.hypot(pt[0] - prevPt[0], pt[1] - prevPt[1]) < 0.05) {
        return;
      }

      const newWall: WallSegment = {
        id: `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        start: prevPt,
        end: pt,
        thicknessM: room.defaultThicknessM,
        openings: [],
      };

      pushHistory({ ...room, walls: [...room.walls, newWall] }, sceneObjects);

      const firstPt = draftPoints[0];
      if (
        draftPoints.length >= 3 &&
        Math.hypot(pt[0] - firstPt[0], pt[1] - firstPt[1]) < 0.05
      ) {
        setDraftPoints([]);
        setIsDrawingWalls(false);
      } else {
        setDraftPoints([...draftPoints, pt]);
      }
    },
    [draftPoints, room, sceneObjects, pushHistory]
  );

  const handleFloorZoneDrawClick = useCallback(
    (pt: [number, number]) => {
      if (zoneDraftPoints.length >= 3) {
        const first = zoneDraftPoints[0];
        if (Math.hypot(pt[0] - first[0], pt[1] - first[1]) < 0.08) {
          const newZone: FloorZone = {
            id: `zone-${Date.now()}`,
            name: `Подова зона ${(room.floorZones ?? []).length + 1}`,
            points: [...zoneDraftPoints],
            color: '#b08968',
            roughness: 0.55,
            metalness: 0.05,
          };
          pushHistory(
            { ...room, floorZones: [...(room.floorZones ?? []), newZone] },
            sceneObjects
          );
          setZoneDraftPoints([]);
          setIsDrawingFloorZone(false);
          setSelectedFloorZoneId(newZone.id);
          setSelectedSurfaces([{ kind: 'floor', zoneId: newZone.id }]);
          return;
        }
      }
      setZoneDraftPoints((prev) => [...prev, pt]);
    },
    [zoneDraftPoints, room, sceneObjects, pushHistory]
  );

  const handleCalibFloorClick = useCallback(
    (pt: [number, number]) => {
      if (!room.floorplan) return;
      if (calibPoints.length === 0) {
        setCalibPoints([pt]);
        return;
      }

      const p1 = calibPoints[0];
      const distNow = Math.hypot(pt[0] - p1[0], pt[1] - p1[1]);
      if (distNow < 0.05) return;

      const rawStr = window.prompt(
        `Реално разстояние между двете точки в метри (сега е ${distNow.toFixed(2)} м):`,
        distNow.toFixed(2)
      );
      if (rawStr) {
        const realM = parseFloat(rawStr.replace(',', '.'));
        if (!Number.isNaN(realM) && realM > 0.05) {
          const calibrated = calibrateFloorplanByTwoPoints(
            room.floorplan,
            p1,
            pt,
            realM
          );
          pushHistory({ ...room, floorplan: calibrated }, sceneObjects);
        }
      }
      setCalibPoints([]);
      setIsCalibratingPlan(false);
    },
    [calibPoints, room, sceneObjects, pushHistory]
  );

  const handleAddModelToScene = useCallback(
    (model: CatalogModel) => {
      const id = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const offset = (sceneObjects.length % 5) * 0.25;
      const newObj: SceneObject = {
        instanceId: id,
        modelId: model.id,
        name: model.name,
        position: [offset, 0, offset],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        mirrored: false,
        materialOverrides: model.defaultMaterialOverrides
          ? { ...model.defaultMaterialOverrides }
          : {},
      };
      pushHistory(room, [...sceneObjects, newObj]);
      clearAllSelections();
      setSelectedInstanceId(id);
    },
    [room, sceneObjects, pushHistory, clearAllSelections]
  );

  const handleAddPresetToScene = useCallback(
    (preset: UserFurniturePreset) => {
      const baseModel = models.find((m) => m.id === preset.baseModelId);
      if (!baseModel) {
        window.alert('Базовият 3D модел за този вариант вече не е в каталога.');
        return;
      }
      const id = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newObj: SceneObject = {
        instanceId: id,
        modelId: baseModel.id,
        name: preset.name,
        position: [0.2, 0, 0.2],
        rotation: [0, 0, 0],
        scale: [...preset.scale],
        mirrored: preset.mirrored,
        materialOverrides: { ...preset.materialOverrides },
      };
      pushHistory(room, [...sceneObjects, newObj]);
      clearAllSelections();
      setSelectedInstanceId(id);
    },
    [models, room, sceneObjects, pushHistory, clearAllSelections]
  );

  const handleSaveObjectAsPreset = useCallback(
    (obj: SceneObject, baseModel: CatalogModel) => {
      const customName = window.prompt(
        'Име на запазения вариант в „Мои варианти“:',
        `${obj.name || baseModel.name} (Вариант)`
      );
      if (!customName || !customName.trim()) return;

      const updated = saveUserFurniturePreset({
        name: customName.trim(),
        baseModelId: baseModel.id,
        scale: [...obj.scale],
        mirrored: Boolean(obj.mirrored),
        materialOverrides: obj.materialOverrides ? { ...obj.materialOverrides } : {},
      });
      setUserPresets(updated);
    },
    []
  );

  const handleAddStandaloneOpening = useCallback(
    (type: OpeningType) => {
      const newOp: StandaloneOpening = {
        id: `op-${Date.now()}`,
        type,
        position: [0, 0],
        rotationDeg: 0,
        widthM: type === 'door' ? 0.9 : 1.4,
        heightM: type === 'door' ? 2.05 : 1.35,
        sillHeightM: type === 'door' ? 0 : 0.9,
        thicknessM: room.defaultThicknessM,
        swing: type === 'door' ? 'left-in' : undefined,
        frameColor: '#f1f5f9',
      };
      pushHistory(
        { ...room, openings: [...(room.openings ?? []), newOp] },
        sceneObjects
      );
      clearAllSelections();
      setSelectedStandaloneOpeningId(newOp.id);
    },
    [room, sceneObjects, pushHistory, clearAllSelections]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (isDrawingWalls && draftPoints.length > 0) {
        if (/^[0-9.,]$/.test(e.key)) {
          e.preventDefault();
          setTypedWallLength((prev) => prev + e.key.replace(',', '.'));
          return;
        }
        if (e.key === 'Backspace' && typedWallLength.length > 0) {
          e.preventDefault();
          setTypedWallLength((prev) => prev.slice(0, -1));
          return;
        }
        if (e.key === 'Enter' && typedWallLength.length > 0 && hoverPoint) {
          e.preventDefault();
          const parsedVal = parseFloat(typedWallLength);
          if (!Number.isNaN(parsedVal) && parsedVal > 0.02) {
            const lenM =
              overlaySettings.dimensionUnit === 'cm'
                ? parsedVal / 100
                : parsedVal;
            const lastPt = draftPoints[draftPoints.length - 1];
            const dx = hoverPoint[0] - lastPt[0];
            const dz = hoverPoint[1] - lastPt[1];
            const angDeg =
              Math.hypot(dx, dz) > 0.005
                ? (Math.atan2(dz, dx) * 180) / Math.PI
                : 0;
            const exactEnd = computeEndpointFromAngleAndLength(
              lastPt,
              lenM,
              angDeg
            );
            handleFloorDrawClick(exactEnd);
          }
          setTypedWallLength('');
          return;
        }
      }

      if (e.key === 'Escape') {
        setOpenTopPopover(null);
        setIsDrawingWalls(false);
        setDraftPoints([]);
        setTypedWallLength('');
        setIsDrawingFloorZone(false);
        setZoneDraftPoints([]);
        setIsCalibratingPlan(false);
        setCalibPoints([]);
        clearAllSelections();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedObject) {
          e.preventDefault();
          const copy: SceneObject = {
            ...selectedObject,
            instanceId: `obj-${Date.now()}`,
            position: [
              selectedObject.position[0] + 0.35,
              selectedObject.position[1],
              selectedObject.position[2] + 0.35,
            ],
          };
          pushHistory(room, [...sceneObjects, copy]);
          setSelectedInstanceId(copy.instanceId);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObject) {
          pushHistory(
            room,
            sceneObjects.filter((o) => o.instanceId !== selectedObject.instanceId)
          );
          setSelectedInstanceId(null);
        } else if (selectedStandaloneOpening) {
          pushHistory(
            {
              ...room,
              openings: (room.openings ?? []).filter(
                (o) => o.id !== selectedStandaloneOpening.id
              ),
            },
            sceneObjects
          );
          setSelectedStandaloneOpeningId(null);
        } else if (selectedWall) {
          pushHistory(
            {
              ...room,
              walls: room.walls.filter((w) => w.id !== selectedWall.id),
            },
            sceneObjects
          );
          setSelectedWallId(null);
          setSelectedSurfaces([]);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isDrawingWalls,
    draftPoints,
    typedWallLength,
    hoverPoint,
    overlaySettings.dimensionUnit,
    handleFloorDrawClick,
    selectedObject,
    selectedStandaloneOpening,
    selectedWall,
    room,
    sceneObjects,
    pushHistory,
    handleUndo,
    handleRedo,
    clearAllSelections,
  ]);

  const handleUploadFloorplanImage = async (file: File) => {
    let finalUrl = '';
    try {
      const uploaded = await uploadFloorplanImage(file);
      finalUrl = uploaded.url;
    } catch {
      finalUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.readAsDataURL(file);
      });
    }

    if (!finalUrl) return;
    const img = new Image();
    img.onload = () => {
      const aspect =
        img.width > 0 && img.height > 0 ? img.width / img.height : 1.4;
      const depthM = 10;
      const widthM = Number((depthM * aspect).toFixed(2));
      pushHistory(
        {
          ...room,
          floorplan: {
            imageUrl: finalUrl,
            widthM,
            depthM,
            aspectRatio: aspect,
            offsetX: 0,
            offsetZ: 0,
            rotationDeg: 0,
            opacity: 0.65,
            visible: true,
          },
        },
        sceneObjects
      );
    };
    img.src = finalUrl;
  };

  const handleSaveCloudProject = async () => {
    const title = window.prompt('Име на проекта за запис:', currentSceneTitle);
    if (!title || !title.trim()) return;
    try {
      const res = await saveSceneToServer({
        id: currentSceneId,
        title: title.trim(),
        objects: sceneObjects,
        room,
      });
      setCurrentSceneId(res.id || currentSceneId);
      setCurrentSceneTitle(res.title || title.trim());
      setOpenTopPopover(null);
      await refreshServerCatalogs();
      window.alert('Проектът е запазен успешно!');
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Грешка при запис на проекта.'
      );
    }
  };

  const handleLoadCloudProject = async (id: string) => {
    try {
      const loaded = await fetchSceneById(id);
      setCurrentSceneId(loaded.id);
      setCurrentSceneTitle(loaded.title);
      setOpenTopPopover(null);
      pushHistory(loaded.room ?? createDefaultRoomConfig(), loaded.objects ?? []);
      clearAllSelections();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Грешка при зареждане на проекта.'
      );
    }
  };

  const handleApplyApartmentTemplate = (tpl: ApartmentTemplate) => {
    if (
      !window.confirm(
        `Зареждане на шаблон „${tpl.name}“? Текущите стени ще бъдат заменени.`
      )
    ) {
      return;
    }
    setOpenTopPopover(null);
    pushHistory(
      {
        templateId: tpl.id,
        templateName: tpl.name,
        ceilingHeightM: tpl.ceilingHeightM,
        defaultThicknessM: tpl.defaultThicknessM,
        ceilingColor: '#f8fafc',
        showCeiling: false,
        walls: tpl.walls ?? [],
        openings: tpl.openings ?? [],
        floorZones: tpl.floorZones ?? [],
        savedCameras: [],
        floorplan: null,
      },
      sceneObjects
    );
    clearAllSelections();
  };

  const handleExportProject = () => {
    const data = JSON.stringify({ room, sceneObjects }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interior-project-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpenTopPopover(null);
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as ProjectSnapshot;
        if (parsed?.room?.walls) {
          pushHistory(parsed.room, parsed.sceneObjects ?? []);
          clearAllSelections();
          setOpenTopPopover(null);
        }
      } catch {
        window.alert('Невалиден JSON файл на проект.');
      }
    };
    reader.readAsText(file);
  };

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (!m.isActive) return false;
      if (categoryFilter === 'presets') return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }
      if (
        searchQuery.trim() &&
        !m.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [models, categoryFilter, searchQuery]);

  const filteredSurfaceTextures = useMemo(() => {
    return textures.filter((t) => {
      if (t.category === 'furniture') return false;
      if (
        materialCategoryFilter !== 'all' &&
        t.category !== materialCategoryFilter
      ) {
        return false;
      }
      if (
        searchQuery.trim() &&
        !t.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [textures, materialCategoryFilter, searchQuery]);

  const discoveredSlotsForSelected = selectedObject
    ? discoveredSlotsByInstance[selectedObject.instanceId] ?? []
    : [];

  return (
    <div className="app-shell">
      {/* ГОРНА ЛЕНТА */}
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            3D Интериорно Студио
            <span className="brand-badge">AUTO</span>
          </div>

          <button
            type="button"
            className={`btn ${viewMode === '3d' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('3d')}
          >
            3D Изглед
          </button>
          <button
            type="button"
            className={`btn ${viewMode === 'top' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('top')}
          >
            2D План
          </button>

          <button
            type="button"
            className={`btn ${transformTool === 'translate' ? 'btn-active' : ''}`}
            onClick={() => setTransformTool('translate')}
          >
            Премести
          </button>
          <button
            type="button"
            className={`btn ${transformTool === 'rotate' ? 'btn-active' : ''}`}
            onClick={() => setTransformTool('rotate')}
          >
            Завърти
          </button>
          <button
            type="button"
            className={`btn ${transformTool === 'scale' ? 'btn-active' : ''}`}
            onClick={() => setTransformTool('scale')}
          >
            Мащаб
          </button>

          {/* ПАДАЩО МЕНЮ: НАСТРОЙКИ */}
          <div ref={settingsPopoverRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`btn ${openTopPopover === 'settings' ? 'btn-active' : ''}`}
              onClick={() =>
                setOpenTopPopover((prev) =>
                  prev === 'settings' ? null : 'settings'
                )
              }
            >
              ⚙ Настройки ▾
            </button>

            {openTopPopover === 'settings' && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: '300px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '12px',
                  zIndex: 100,
                  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.65)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Котиране и визуални слоеве
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Размерни линии (коти) на стените</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.showWallDimensions}
                    onChange={() => toggleOverlay('showWallDimensions')}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Квадратура на стаите (м²)</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.showRoomAreas}
                    onChange={() => toggleOverlay('showRoomAreas')}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>2D дъги на отваряне на вратите</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.show2DDoorSwings}
                    onChange={() => toggleOverlay('show2DDoorSwings')}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Дебелина на стената в котите</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.showWallThicknessLabels}
                    onChange={() => toggleOverlay('showWallThicknessLabels')}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Подова координатна мрежа (Grid)</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.showGrid}
                    onChange={() => toggleOverlay('showGrid')}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Ъглови маркери (въртекси)</span>
                  <input
                    type="checkbox"
                    checked={overlaySettings.showVertexHandles}
                    onChange={() => toggleOverlay('showVertexHandles')}
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid #1e293b',
                    fontSize: '12px',
                    color: '#e2e8f0',
                  }}
                >
                  <span>Единица на котите</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className={`btn ${overlaySettings.dimensionUnit === 'm' ? 'btn-active' : ''}`}
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                      onClick={() =>
                        setOverlaySettings((p) => ({ ...p, dimensionUnit: 'm' }))
                      }
                    >
                      Метри (м)
                    </button>
                    <button
                      type="button"
                      className={`btn ${overlaySettings.dimensionUnit === 'cm' ? 'btn-active' : ''}`}
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                      onClick={() =>
                        setOverlaySettings((p) => ({
                          ...p,
                          dimensionUnit: 'cm',
                        }))
                      }
                    >
                      СМ
                    </button>
                  </div>
                </div>

                <div
                  className="section-label"
                  style={{
                    marginBottom: 0,
                    paddingTop: '8px',
                    borderTop: '1px solid #1e293b',
                  }}
                >
                  Поведение при редакция на ъгли
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Свързани ъгли (движи съседните стени)</span>
                  <input
                    type="checkbox"
                    checked={linkedVertexJoint}
                    onChange={() => setLinkedVertexJoint((p) => !p)}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <span>Магнитно изправяне (90° / 180°)</span>
                  <input
                    type="checkbox"
                    checked={autoStraightenVertices}
                    onChange={() => setAutoStraightenVertices((p) => !p)}
                  />
                </label>

                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '11px', marginTop: '2px' }}
                  onClick={() => setOverlaySettings(DEFAULT_OVERLAY_SETTINGS)}
                >
                  Възстанови стандартните настройки
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="topbar-group">
          <button
            type="button"
            className="btn"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            title="Назад (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="btn"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            title="Напред (Ctrl+Y)"
          >
            ↷ Redo
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => setUnit((u) => (u === 'cm' ? 'm' : 'cm'))}
          >
            {unit === 'cm' ? 'СМ' : 'М'}
          </button>

          {/* ПАДАЩО МЕНЮ: ПРОЕКТ (всички контроли за проекта събрани тук) */}
          <div ref={projectPopoverRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`btn ${openTopPopover === 'project' ? 'btn-active' : ''}`}
              onClick={() =>
                setOpenTopPopover((prev) =>
                  prev === 'project' ? null : 'project'
                )
              }
              title={`Текущ проект: ${currentSceneTitle}`}
            >
              📁 Проект: {currentSceneTitle} ▾
            </button>

            {openTopPopover === 'project' && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '310px',
                  maxHeight: '78vh',
                  overflowY: 'auto',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '12px',
                  zIndex: 100,
                  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.65)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Управление на проекта
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ flex: 1, fontSize: '11.5px' }}
                    onClick={handleStartNewProject}
                  >
                    + Нов проект
                  </button>
                  <button
                    type="button"
                    className="btn btn-active"
                    style={{ flex: 1, fontSize: '11.5px' }}
                    onClick={() => void handleSaveCloudProject()}
                  >
                    ☁ Запази в облака
                  </button>
                </div>

                {savedScenes.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      paddingTop: '8px',
                      borderTop: '1px solid #1e293b',
                    }}
                  >
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Запазени проекти ({savedScenes.length})
                    </div>
                    {savedScenes.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`btn ${currentSceneId === sc.id ? 'btn-active' : ''}`}
                        style={{
                          textAlign: 'left',
                          fontSize: '11.5px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => void handleLoadCloudProject(sc.id)}
                      >
                        📂 {sc.title}
                      </button>
                    ))}
                  </div>
                )}

                {templates.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      paddingTop: '8px',
                      borderTop: '1px solid #1e293b',
                    }}
                  >
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Готови шаблони апартаменти ({templates.length})
                    </div>
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="btn"
                        style={{ textAlign: 'left', fontSize: '11.5px' }}
                        onClick={() => handleApplyApartmentTemplate(tpl)}
                      >
                        🏢 {tpl.name}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    paddingTop: '8px',
                    borderTop: '1px solid #1e293b',
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Локален файл (JSON)
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={handleExportProject}
                    >
                      ⬇ Експорт JSON
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => fileInputImportRef.current?.click()}
                    >
                      ⬆ Импорт JSON
                    </button>
                  </div>
                  <input
                    ref={fileInputImportRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportProject(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => setIsAdminOpen(true)}
          >
            ⚙ Админ каталог
          </button>
        </div>
      </header>

      {/* РАБОТНА ЗОНА */}
      <div className="workspace">
        {/* ЛЯВ ПАНЕЛ — САМО МЕБЕЛИ, МАТЕРИАЛИ И СТЕНИ */}
        <aside className="sidebar-left">
          <div className="panel-header" style={{ padding: '6px', gap: '4px' }}>
            <button
              type="button"
              className={`btn ${leftTab === 'catalog' ? 'btn-active' : ''}`}
              style={{ flex: 1, padding: '6px 4px', fontSize: '11px' }}
              onClick={() => setLeftTab('catalog')}
            >
              Мебели
            </button>
            <button
              type="button"
              className={`btn ${leftTab === 'materials' ? 'btn-active' : ''}`}
              style={{ flex: 1, padding: '6px 4px', fontSize: '11px' }}
              onClick={() => setLeftTab('materials')}
            >
              Материали
            </button>
            <button
              type="button"
              className={`btn ${leftTab === 'room' ? 'btn-active' : ''}`}
              style={{ flex: 1, padding: '6px 4px', fontSize: '11px' }}
              onClick={() => setLeftTab('room')}
            >
              Стени
            </button>
          </div>

          <div className="panel-body">
            {leftTab === 'catalog' && (
              <>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Търси мебел..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  <button
                    type="button"
                    className={`btn ${categoryFilter === 'all' ? 'btn-active' : ''}`}
                    style={{ fontSize: '10px', padding: '3px 6px' }}
                    onClick={() => setCategoryFilter('all')}
                  >
                    Всички
                  </button>
                  <button
                    type="button"
                    className={`btn ${categoryFilter === 'presets' ? 'btn-active' : ''}`}
                    style={{ fontSize: '10px', padding: '3px 6px' }}
                    onClick={() => setCategoryFilter('presets')}
                  >
                    ★ Мои варианти ({userPresets.length})
                  </button>
                  {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`btn ${categoryFilter === cat ? 'btn-active' : ''}`}
                      style={{ fontSize: '10px', padding: '3px 6px' }}
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>

                {categoryFilter === 'presets' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {userPresets.length === 0 ? (
                      <div className="empty-state-box">
                        Нямате запазени варианти. Променете цветовете на мебел и натиснете „★ Запази в Мои варианти“.
                      </div>
                    ) : (
                      userPresets.map((preset) => (
                        <div
                          key={preset.id}
                          style={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #38bdf8',
                            borderRadius: '6px',
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '12px', color: '#f8fafc' }}>
                            {preset.name}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-active"
                              style={{ flex: 1, fontSize: '11px' }}
                              onClick={() => handleAddPresetToScene(preset)}
                            >
                              + Добави
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                              onClick={() =>
                                setUserPresets(deleteUserFurniturePreset(preset.id))
                              }
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredModels.map((model) => (
                      <div
                        key={model.id}
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {model.previewUrl && (
                          <img
                            src={model.previewUrl}
                            alt={model.name}
                            style={{
                              width: '100%',
                              height: '72px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                            }}
                          />
                        )}
                        <div style={{ fontWeight: 600, fontSize: '12px', color: '#f8fafc' }}>
                          {model.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {model.dimensionsCm.width} × {model.dimensionsCm.depth} ×{' '}
                          {model.dimensionsCm.height} см
                        </div>
                        <button
                          type="button"
                          className="btn btn-active"
                          style={{ fontSize: '11px' }}
                          onClick={() => handleAddModelToScene(model)}
                        >
                          + Добави в сцената
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {leftTab === 'materials' && (
              <>
                <div className="empty-state-box" style={{ textAlign: 'left', padding: '10px' }}>
                  <strong style={{ color: '#38bdf8' }}>Drag & Drop в 3D:</strong> Натисни и задръж върху текстура по-долу, след което пусни директно върху стена или под в 3D.
                </div>

                <input
                  type="text"
                  className="input-control"
                  placeholder="Търси тапет, паркет, плочки..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'all', label: 'Всички' },
                      { id: 'wall', label: 'Стени / Тапети' },
                      { id: 'floor', label: 'Паркет / Под' },
                      { id: 'tiles', label: 'Плочки' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`btn ${materialCategoryFilter === f.id ? 'btn-active' : ''}`}
                      style={{ fontSize: '10px', padding: '3px 6px' }}
                      onClick={() => setMaterialCategoryFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {filteredSurfaceTextures.length === 0 ? (
                  <div className="empty-state-box">
                    {isSyncingServer
                      ? 'Зареждане на PBR текстури от сървъра...'
                      : 'Няма намерени текстури. Можете да качите нови през „⚙ Админ каталог“.'}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      userSelect: 'none',
                    }}
                  >
                    {filteredSurfaceTextures.map((tex) => {
                      const isDraggingThis = draggedTextureId === tex.id;
                      return (
                        <div
                          key={tex.id}
                          onPointerDown={() => setDraggedTextureId(tex.id)}
                          style={{
                            backgroundColor: '#0f172a',
                            border: `1.5px solid ${isDraggingThis ? '#34d399' : '#334155'}`,
                            borderRadius: '6px',
                            padding: '6px',
                            cursor: 'grab',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <img
                            src={tex.mapUrl}
                            alt={tex.name}
                            draggable={false}
                            style={{
                              width: '100%',
                              height: '54px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              pointerEvents: 'none',
                            }}
                          />
                          <div
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#f8fafc',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tex.name}
                          </div>
                          <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                            {Math.round(tex.tileWidthM * 100)}×
                            {Math.round(tex.tileHeightM * 100)} см
                          </div>
                          {selectedSurfaces.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-active"
                              style={{ fontSize: '10px', padding: '2px 4px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                applyPatchToTargets(selectedSurfaces, {
                                  textureId: tex.id,
                                });
                              }}
                            >
                              Приложи ({selectedSurfaces.length})
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {leftTab === 'room' && (
              <>
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
                    Чертане на стени и зони
                  </div>

                  <button
                    type="button"
                    className={`btn ${isDrawingWalls ? 'btn-active' : ''}`}
                    onClick={() => {
                      setIsDrawingFloorZone(false);
                      setZoneDraftPoints([]);
                      setIsCalibratingPlan(false);
                      setCalibPoints([]);
                      setTypedWallLength('');
                      setIsDrawingWalls((prev) => {
                        if (prev) setDraftPoints([]);
                        return !prev;
                      });
                    }}
                  >
                    {isDrawingWalls
                      ? '■ Спри чертането на стени (Esc)'
                      : '✎ Чертай стени по пода'}
                  </button>

                  {isDrawingWalls && (
                    <div
                      style={{
                        fontSize: '10.5px',
                        color: '#94a3b8',
                        backgroundColor: '#1e293b',
                        padding: '6px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      Съвет: Докато чертаеш, можеш да въведеш точна дължина от клавиатурата (напр. <b>3.6</b> + <b>Enter</b>).
                    </div>
                  )}

                  {isDrawingWalls && draftPoints.length > 0 && (
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px' }}
                      onClick={() => {
                        setDraftPoints([]);
                        setTypedWallLength('');
                      }}
                    >
                      Прекъсни веригата (нова стена)
                    </button>
                  )}

                  <button
                    type="button"
                    className={`btn ${isDrawingFloorZone ? 'btn-active' : ''}`}
                    onClick={() => {
                      setIsDrawingWalls(false);
                      setDraftPoints([]);
                      setIsCalibratingPlan(false);
                      setCalibPoints([]);
                      setIsDrawingFloorZone((prev) => {
                        if (prev) setZoneDraftPoints([]);
                        return !prev;
                      });
                    }}
                  >
                    {isDrawingFloorZone
                      ? '■ Спри подовата зона (Esc)'
                      : '⬡ Очертай подова зона (паркет/плочки)'}
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => handleAddStandaloneOpening('door')}
                    >
                      + Врата
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => handleAddStandaloneOpening('window')}
                    >
                      + Прозорец
                    </button>
                  </div>
                </div>

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
                    Размери на помещението
                  </div>
                  <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="axis-field">
                      <span>Височина таван (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        min={1.8}
                        max={6}
                        className="input-control"
                        value={room.ceilingHeightM}
                        onChange={(e) =>
                          pushHistory(
                            {
                              ...room,
                              ceilingHeightM: Math.max(
                                1.8,
                                parseFloat(e.target.value) || 2.65
                              ),
                            },
                            sceneObjects
                          )
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Дебелина стена (м)</span>
                      <input
                        type="number"
                        step={0.01}
                        min={0.05}
                        max={0.8}
                        className="input-control"
                        value={room.defaultThicknessM}
                        onChange={(e) =>
                          pushHistory(
                            {
                              ...room,
                              defaultThicknessM: Math.max(
                                0.05,
                                parseFloat(e.target.value) || 0.15
                              ),
                            },
                            sceneObjects
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

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
                    2D Архитектурна подложка
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => fileInputPlanRef.current?.click()}
                  >
                    Качи снимка на план (PNG / JPG)
                  </button>
                  <input
                    ref={fileInputPlanRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadFloorplanImage(f);
                      e.target.value = '';
                    }}
                  />

                  {room.floorplan && (
                    <>
                      <button
                        type="button"
                        className={`btn ${isCalibratingPlan ? 'btn-active' : ''}`}
                        style={{ fontSize: '11px' }}
                        onClick={() => {
                          setIsDrawingWalls(false);
                          setIsDrawingFloorZone(false);
                          setCalibPoints([]);
                          setIsCalibratingPlan((prev) => !prev);
                        }}
                      >
                        {isCalibratingPlan
                          ? 'Кликни 2 точки с известен размер...'
                          : '📏 Калибрирай мащаб по 2 точки'}
                      </button>

                      <div className="axis-field">
                        <span>
                          Прозрачност ({Math.round(room.floorplan.opacity * 100)}%)
                        </span>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={room.floorplan.opacity}
                          onChange={(e) =>
                            pushHistory(
                              {
                                ...room,
                                floorplan: room.floorplan
                                  ? {
                                      ...room.floorplan,
                                      opacity: parseFloat(e.target.value),
                                    }
                                  : null,
                              },
                              sceneObjects
                            )
                          }
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ flex: 1, fontSize: '11px' }}
                          onClick={() =>
                            pushHistory(
                              {
                                ...room,
                                floorplan: room.floorplan
                                  ? {
                                      ...room.floorplan,
                                      visible: !room.floorplan.visible,
                                    }
                                  : null,
                              },
                              sceneObjects
                            )
                          }
                        >
                          {room.floorplan.visible ? 'Скрий плана' : 'Покажи плана'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ flex: 1, fontSize: '11px' }}
                          onClick={() =>
                            pushHistory({ ...room, floorplan: null }, sceneObjects)
                          }
                        >
                          Премахни
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ЦЕНТРАЛЕН 3D VIEWPORT */}
        <main
          className="viewport-container"
          style={{
            cursor: draggedTextureId ? 'copy' : undefined,
          }}
        >
          {isDrawingWalls && typedWallLength.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 35,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1.5px solid #38bdf8',
                color: '#f8fafc',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                pointerEvents: 'none',
                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
              }}
            >
              Дължина на стената: <span style={{ color: '#38bdf8' }}>{typedWallLength}</span>{' '}
              {overlaySettings.dimensionUnit === 'cm' ? 'см' : 'м'} (натисни Enter)
            </div>
          )}

          {draggedTextureId && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                backgroundColor: 'rgba(6, 78, 59, 0.94)',
                border: '1.5px solid #34d399',
                color: '#ecfdf5',
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                pointerEvents: 'none',
                boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
              }}
            >
              Пусни върху стена или подова зона, за да приложиш материала
            </div>
          )}

          <Viewport3D
            room={room}
            viewMode={viewMode}
            overlaySettings={overlaySettings}
            selectedWallId={selectedWallId}
            selectedOpeningId={selectedOpeningId}
            selectedStandaloneOpeningId={selectedStandaloneOpeningId}
            selectedFloorZoneId={selectedFloorZoneId}
            selectedSurfaces={selectedSurfaces}
            draggedTextureId={draggedTextureId}
            selectedWallVertex={selectedWallVertex}
            selectedFloorVertex={selectedFloorVertex}
            linkedVertexJoint={linkedVertexJoint}
            autoStraightenVertices={autoStraightenVertices}
            onSelectWall={(wallId) => {
              setSelectedWallId(wallId);
              setSelectedOpeningId(null);
              if (!wallId) setSelectedSurfaces([]);
            }}
            onInlineUpdateWallLength={handleInlineUpdateWallLength}
            onSelectSurface={handleSelectSurface}
            onClearSurfaceSelection={handleClearSurfaceSelection}
            onDropTextureOnSurface={handleDropTextureOnSurface}
            onSelectOpening={(wallId, openingId) => {
              setSelectedWallId(wallId);
              setSelectedOpeningId(openingId);
              setSelectedInstanceId(null);
              setSelectedStandaloneOpeningId(null);
            }}
            onSelectStandaloneOpening={(openingId) => {
              setSelectedStandaloneOpeningId(openingId);
              if (openingId) {
                setSelectedInstanceId(null);
                setSelectedWallId(null);
                setSelectedFloorZoneId(null);
                setSelectedSurfaces([]);
              }
            }}
            onSelectFloorZone={(zoneId) => {
              setSelectedFloorZoneId(zoneId);
              if (zoneId) {
                setSelectedSurfaces([{ kind: 'floor', zoneId }]);
              } else {
                setSelectedFloorVertex(null);
              }
            }}
            onSelectWallVertex={setSelectedWallVertex}
            onSelectFloorVertex={setSelectedFloorVertex}
            onUpdateStandaloneOpening={(openingId, patch) => {
              const nextOpenings = (room.openings ?? []).map((o) =>
                o.id === openingId ? { ...o, ...patch } : o
              );
              pushHistory({ ...room, openings: nextOpenings }, sceneObjects);
            }}
            onCommitWallsFromVertex={(nextWalls) => {
              pushHistory({ ...room, walls: nextWalls }, sceneObjects);
            }}
            onCommitFloorZonesFromVertex={(nextZones) => {
              pushHistory({ ...room, floorZones: nextZones }, sceneObjects);
            }}
            isDrawingWalls={isDrawingWalls}
            draftPoints={draftPoints}
            hoverPoint={hoverPoint}
            onHoverPointChange={setHoverPoint}
            onFloorDrawClick={handleFloorDrawClick}
            isDrawingFloorZone={isDrawingFloorZone}
            zoneDraftPoints={zoneDraftPoints}
            onFloorZoneDrawClick={handleFloorZoneDrawClick}
            isCalibratingPlan={isCalibratingPlan}
            calibPoints={calibPoints}
            onCalibFloorClick={handleCalibFloorClick}
            sceneObjects={sceneObjects}
            models={models}
            textures={textures}
            selectedInstanceId={selectedInstanceId}
            transformTool={transformTool}
            onSelectObject={(id) => {
              setSelectedInstanceId(id);
              if (id) {
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedStandaloneOpeningId(null);
                setSelectedFloorZoneId(null);
                setSelectedFloorVertex(null);
                setSelectedSurfaces([]);
              }
            }}
            onMaterialsDiscovered={(instanceId, slots) => {
              setDiscoveredSlotsByInstance((prev) => ({
                ...prev,
                [instanceId]: slots,
              }));
            }}
            onTransformChange={(instanceId, position, rotation, scale) => {
              const nextObjects = sceneObjects.map((o) =>
                o.instanceId === instanceId
                  ? { ...o, position, rotation, scale }
                  : o
              );
              pushHistory(room, nextObjects);
            }}
          />
        </main>

        {/* ДЕСЕН ИНСПЕКТОР */}
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
          discoveredMaterialSlots={discoveredSlotsForSelected}
          selectedWallVertex={selectedWallVertex}
          selectedFloorVertex={selectedFloorVertex}
          linkedVertexJoint={linkedVertexJoint}
          autoStraightenVertices={autoStraightenVertices}
          wallLengthInput={wallLengthInput}
          wallAngleInput={wallAngleInput}
          wallThicknessInput={wallThicknessInput}
          onApplySurfaceBatch={(patch) =>
            applyPatchToTargets(selectedSurfaces, patch)
          }
          onClearSurfaceSelection={handleClearSurfaceSelection}
          onSelectWallVertex={setSelectedWallVertex}
          onToggleLinkedVertexJoint={() =>
            setLinkedVertexJoint((prev) => !prev)
          }
          onToggleAutoStraightenVertices={() =>
            setAutoStraightenVertices((prev) => !prev)
          }
          onStraightenSelectedWall={() => {
            if (!selectedWall) return;
            const nextWalls = room.walls.map((w) =>
              w.id === selectedWall.id ? straightenWallOrthogonal(w) : w
            );
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
          }}
          onWallLengthInputChange={setWallLengthInput}
          onWallAngleInputChange={setWallAngleInput}
          onWallThicknessInputChange={setWallThicknessInput}
          onCommitSelectedWallChanges={() => {
            if (!selectedWall) return;
            const len = parseFloat(wallLengthInput.replace(',', '.'));
            const ang = parseFloat(wallAngleInput.replace(',', '.'));
            const thk = parseFloat(wallThicknessInput.replace(',', '.'));
            if (Number.isNaN(len) || Number.isNaN(ang) || Number.isNaN(thk)) {
              return;
            }
            const nextWalls = room.walls.map((w) => {
              if (w.id !== selectedWall.id) return w;
              const geomUpdated = updateWallGeometry(w, len, ang);
              return {
                ...geomUpdated,
                thicknessM: Math.max(0.05, Math.min(1, thk)),
              };
            });
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
          }}
          onUpdateWallSurface={(wallId, patch) => {
            const nextWalls = room.walls.map((w) =>
              w.id === wallId ? { ...w, ...patch } : w
            );
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
          }}
          onDeleteSelectedWall={() => {
            if (!selectedWall) return;
            pushHistory(
              {
                ...room,
                walls: room.walls.filter((w) => w.id !== selectedWall.id),
              },
              sceneObjects
            );
            setSelectedWallId(null);
            setSelectedSurfaces([]);
          }}
          onSelectOpening={setSelectedOpeningId}
          onAddOpeningToSelectedWall={(type) => {
            if (!selectedWall) return;
            const newOp: WallOpening = {
              id: `wop-${Date.now()}`,
              type,
              offsetFromStartM: 0.4,
              widthM: type === 'door' ? 0.9 : 1.2,
              heightM: type === 'door' ? 2.05 : 1.3,
              sillHeightM: type === 'door' ? 0 : 0.9,
              swing: type === 'door' ? 'left-in' : undefined,
              frameColor: '#f1f5f9',
            };
            const nextWalls = room.walls.map((w) =>
              w.id === selectedWall.id
                ? { ...w, openings: [...(w.openings ?? []), newOp] }
                : w
            );
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
            setSelectedOpeningId(newOp.id);
          }}
          onUpdateOpening={(wallId, opId, patch) => {
            const nextWalls = room.walls.map((w) => {
              if (w.id !== wallId) return w;
              return {
                ...w,
                openings: (w.openings ?? []).map((op) =>
                  op.id === opId ? { ...op, ...patch } : op
                ),
              };
            });
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
          }}
          onDeleteOpening={(wallId, opId) => {
            const nextWalls = room.walls.map((w) => {
              if (w.id !== wallId) return w;
              return {
                ...w,
                openings: (w.openings ?? []).filter((op) => op.id !== opId),
              };
            });
            pushHistory({ ...room, walls: nextWalls }, sceneObjects);
            if (selectedOpeningId === opId) setSelectedOpeningId(null);
          }}
          onSelectStandaloneOpening={(id) => {
            setSelectedStandaloneOpeningId(id);
            if (id) {
              setSelectedWallId(null);
              setSelectedFloorZoneId(null);
              setSelectedFloorVertex(null);
              setSelectedInstanceId(null);
              setSelectedSurfaces([]);
            }
          }}
          onUpdateStandaloneOpening={(id, patch) => {
            const nextOpenings = (room.openings ?? []).map((o) =>
              o.id === id ? { ...o, ...patch } : o
            );
            pushHistory({ ...room, openings: nextOpenings }, sceneObjects);
          }}
          onDuplicateStandaloneOpening={(id) => {
            const orig = (room.openings ?? []).find((o) => o.id === id);
            if (!orig) return;
            const copy: StandaloneOpening = {
              ...orig,
              id: `op-${Date.now()}`,
              position: [orig.position[0] + 0.5, orig.position[1] + 0.5],
            };
            pushHistory(
              { ...room, openings: [...(room.openings ?? []), copy] },
              sceneObjects
            );
            setSelectedStandaloneOpeningId(copy.id);
          }}
          onDeleteStandaloneOpening={(id) => {
            pushHistory(
              {
                ...room,
                openings: (room.openings ?? []).filter((o) => o.id !== id),
              },
              sceneObjects
            );
            if (selectedStandaloneOpeningId === id) {
              setSelectedStandaloneOpeningId(null);
            }
          }}
          onSelectFloorZone={(id) => {
            setSelectedFloorZoneId(id);
            setSelectedFloorVertex(null);
            if (id) {
              setSelectedSurfaces([{ kind: 'floor', zoneId: id }]);
              setSelectedWallId(null);
              setSelectedInstanceId(null);
              setSelectedStandaloneOpeningId(null);
            }
          }}
          onSelectFloorVertex={setSelectedFloorVertex}
          onUpdateFloorZoneVertex={handleUpdateFloorZoneVertex}
          onInsertFloorZoneVertexAfter={handleInsertFloorZoneVertexAfter}
          onDeleteFloorZoneVertex={handleDeleteFloorZoneVertex}
          onUpdateFloorZone={(id, patch) => {
            const nextZones = (room.floorZones ?? []).map((z) =>
              z.id === id ? { ...z, ...patch } : z
            );
            pushHistory({ ...room, floorZones: nextZones }, sceneObjects);
          }}
          onDuplicateFloorZone={(id) => {
            const orig = (room.floorZones ?? []).find((z) => z.id === id);
            if (!orig) return;
            const copy: FloorZone = {
              ...orig,
              id: `zone-${Date.now()}`,
              name: `${orig.name} (копие)`,
              points: orig.points.map(([x, z]) => [x + 0.4, z + 0.4]),
            };
            pushHistory(
              { ...room, floorZones: [...(room.floorZones ?? []), copy] },
              sceneObjects
            );
            setSelectedFloorZoneId(copy.id);
            setSelectedSurfaces([{ kind: 'floor', zoneId: copy.id }]);
          }}
          onDeleteFloorZone={(id) => {
            pushHistory(
              {
                ...room,
                floorZones: (room.floorZones ?? []).filter((z) => z.id !== id),
              },
              sceneObjects
            );
            if (selectedFloorZoneId === id) {
              setSelectedFloorZoneId(null);
              setSelectedFloorVertex(null);
            }
            setSelectedSurfaces((prev) =>
              prev.filter((s) => !(s.kind === 'floor' && s.zoneId === id))
            );
          }}
          onUpdateRoomCeiling={(patch) => {
            pushHistory({ ...room, ...patch }, sceneObjects);
          }}
          onSelectInstance={(id) => {
            setSelectedInstanceId(id);
            if (id) {
              setSelectedWallId(null);
              setSelectedFloorZoneId(null);
              setSelectedFloorVertex(null);
              setSelectedStandaloneOpeningId(null);
              setSelectedSurfaces([]);
            }
          }}
          onTransformChange={(instanceId, position, rotation, scale) => {
            const nextObjects = sceneObjects.map((o) =>
              o.instanceId === instanceId
                ? { ...o, position, rotation, scale }
                : o
            );
            pushHistory(room, nextObjects);
          }}
          onRotateYBy={(deg) => {
            if (!selectedObject) return;
            const rad = (deg * Math.PI) / 180;
            const nextObjects = sceneObjects.map((o) =>
              o.instanceId === selectedObject.instanceId
                ? {
                    ...o,
                    rotation: [
                      o.rotation[0],
                      o.rotation[1] + rad,
                      o.rotation[2],
                    ] as [number, number, number],
                  }
                : o
            );
            pushHistory(room, nextObjects);
          }}
          onToggleMirrorSelected={() => {
            if (!selectedObject) return;
            const nextObjects = sceneObjects.map((o) =>
              o.instanceId === selectedObject.instanceId
                ? { ...o, mirrored: !o.mirrored }
                : o
            );
            pushHistory(room, nextObjects);
          }}
          onDuplicateSelected={() => {
            if (!selectedObject) return;
            const copy: SceneObject = {
              ...selectedObject,
              instanceId: `obj-${Date.now()}`,
              position: [
                selectedObject.position[0] + 0.35,
                selectedObject.position[1],
                selectedObject.position[2] + 0.35,
              ],
            };
            pushHistory(room, [...sceneObjects, copy]);
            setSelectedInstanceId(copy.instanceId);
          }}
          onDeleteSelected={() => {
            if (!selectedObject) return;
            pushHistory(
              room,
              sceneObjects.filter(
                (o) => o.instanceId !== selectedObject.instanceId
              )
            );
            setSelectedInstanceId(null);
          }}
          onUpdateObjectMaterial={(
            instanceId: string,
            slotKey: string,
            override: MaterialOverride | null
          ) => {
            const nextObjects = sceneObjects.map((o) => {
              if (o.instanceId !== instanceId) return o;
              const nextOverrides = { ...(o.materialOverrides ?? {}) };
              if (override === null) {
                delete nextOverrides[slotKey];
              } else {
                nextOverrides[slotKey] = override;
              }
              return { ...o, materialOverrides: nextOverrides };
            });
            pushHistory(room, nextObjects);
          }}
          onSaveObjectAsPreset={handleSaveObjectAsPreset}
        />
      </div>

      {/* АДМИН ПАНЕЛ ЗА КАТАЛОГА */}
      {isAdminOpen && (
        <AdminPanel
          models={models}
          currentRoom={room}
          onClose={() => setIsAdminOpen(false)}
          onModelsUpdated={() => {
            void refreshServerCatalogs();
          }}
        />
      )}
    </div>
  );
}

export default App;