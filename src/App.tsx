import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Viewport3D } from './components/Viewport3D';
import type { ViewportCameraMode } from './components/Viewport3D';
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
  calibrateFloorplanByTwoPoints,
  computeEndpointFromAngleAndLength,
  createDefaultRoomConfig,
  createStarterWalls,
  getWallAngleDeg,
  getWallLengthM,
  updateWallGeometry,
} from './types/room';
import type {
  ApartmentTemplate,
  DoorSwing,
  FloorplanUnderlay,
  FloorZone,
  OpeningType,
  RoomConfig,
  StandaloneOpening,
  WallOpening,
  WallSegment,
} from './types/room';
import {
  fetchApartmentTemplates,
  fetchModels,
  fetchSceneById,
  fetchScenes,
  saveSceneToServer,
  uploadFloorplanImage,
} from './utils/apiClient';

const SCALE_MODE_SHORT: Record<ScaleMode, string> = {
  fixed: 'Фиксиран',
  constrained: 'Ограничен',
  free: 'Свободен',
};

const FLOOR_PRESETS: {
  label: string;
  color: string;
  roughness: number;
  metalness: number;
}[] = [
  { label: 'Паркет дъб', color: '#b08968', roughness: 0.55, metalness: 0.05 },
  { label: 'Светъл дървен под', color: '#d4b483', roughness: 0.5, metalness: 0.05 },
  { label: 'Тъмен орех', color: '#5c4033', roughness: 0.45, metalness: 0.08 },
  { label: 'Гранитогрес светъл', color: '#cbd5e1', roughness: 0.28, metalness: 0.12 },
  { label: 'Плочки / Бетон', color: '#94a3b8', roughness: 0.65, metalness: 0.08 },
];

type LeftTab = 'furniture' | 'templates';

function normalizeLoadedRoomConfig(rawRoom: unknown): RoomConfig {
  const base = createDefaultRoomConfig();
  if (!rawRoom || typeof rawRoom !== 'object') {
    return base;
  }

  const obj = rawRoom as Partial<RoomConfig> & { defaultHeightM?: number };
  const ceilingHeightM =
    Number(obj.ceilingHeightM) || Number(obj.defaultHeightM) || 2.65;
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
          thicknessM: Number(w.thicknessM) || defaultThicknessM,
          openings: Array.isArray(w.openings)
            ? w.openings.map((op) => ({
                id: op.id || `op-${Math.random().toString(36).slice(2, 7)}`,
                type: op.type === 'window' ? 'window' : 'door',
                offsetFromStartM: Number(op.offsetFromStartM) || 0.3,
                widthM: Number(op.widthM) || (op.type === 'window' ? 1.4 : 0.9),
                heightM: Number(op.heightM) || (op.type === 'window' ? 1.4 : 2.1),
                sillHeightM:
                  op.type === 'window' ? Number(op.sillHeightM ?? 0.9) : 0,
                swing: op.swing || 'left-in',
                modelId: op.modelId ?? null,
              }))
            : [],
        }))
    : [];

  const openings: StandaloneOpening[] = Array.isArray(obj.openings)
    ? obj.openings.map((op) => ({
        id: op.id || `sop-${Math.random().toString(36).slice(2, 7)}`,
        type: op.type === 'window' ? 'window' : 'door',
        position: Array.isArray(op.position)
          ? [Number(op.position[0]) || 0, Number(op.position[1]) || 0]
          : [0, 0],
        rotationDeg: Number(op.rotationDeg) || 0,
        widthM: Number(op.widthM) || (op.type === 'window' ? 1.4 : 0.9),
        heightM: Number(op.heightM) || (op.type === 'window' ? 1.4 : 2.1),
        sillHeightM: op.type === 'window' ? Number(op.sillHeightM ?? 0.9) : 0,
        thicknessM: Number(op.thicknessM) || defaultThicknessM,
        swing: op.swing || 'left-in',
        modelId: op.modelId ?? null,
      }))
    : [];

  const floorZones: FloorZone[] = Array.isArray(obj.floorZones)
    ? obj.floorZones
        .filter((z) => z && Array.isArray(z.points) && z.points.length >= 3)
        .map((z, i) => ({
          id: z.id || `fz-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: typeof z.name === 'string' && z.name.trim() ? z.name : `Подова зона ${i + 1}`,
          points: z.points.map((pt) => [Number(pt[0]) || 0, Number(pt[1]) || 0]),
          color: typeof z.color === 'string' && z.color ? z.color : '#b08968',
          roughness: typeof z.roughness === 'number' ? z.roughness : 0.55,
          metalness: typeof z.metalness === 'number' ? z.metalness : 0.05,
        }))
    : [];

  let floorplan: FloorplanUnderlay | null = null;
  if (obj.floorplan && typeof obj.floorplan === 'object' && obj.floorplan.imageUrl) {
    const wM = Number(obj.floorplan.widthM) || 10;
    const dM = Number(obj.floorplan.depthM) || 8;
    const ar =
      Number(obj.floorplan.aspectRatio) || (dM > 0 ? wM / dM : 1);
    floorplan = {
      imageUrl: String(obj.floorplan.imageUrl),
      widthM: wM,
      depthM: dM,
      aspectRatio: ar,
      offsetX: Number(obj.floorplan.offsetX) || 0,
      offsetZ: Number(obj.floorplan.offsetZ) || 0,
      rotationDeg: Number(obj.floorplan.rotationDeg) || 0,
      opacity:
        typeof obj.floorplan.opacity === 'number' ? obj.floorplan.opacity : 0.7,
      visible: obj.floorplan.visible !== false,
    };
  }

  return {
    templateId: obj.templateId ?? null,
    templateName: obj.templateName ?? null,
    ceilingHeightM,
    defaultThicknessM,
    walls:
      walls.length > 0 || openings.length > 0 || floorZones.length > 0
        ? walls
        : createStarterWalls(defaultThicknessM),
    openings,
    floorZones,
    floorplan,
  };
}

function measureLocalFileAspectRatio(file: File): Promise<number> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ar =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : 1;
      URL.revokeObjectURL(objectUrl);
      resolve(ar);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(1);
    };
    img.src = objectUrl;
  });
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
  const [viewMode, setViewMode] = useState<ViewportCameraMode>('3d');
  const [room, setRoom] = useState<RoomConfig>(() => createDefaultRoomConfig());
  const [templates, setTemplates] = useState<ApartmentTemplate[]>([]);

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedStandaloneOpeningId, setSelectedStandaloneOpeningId] = useState<string | null>(null);
  const [selectedFloorZoneId, setSelectedFloorZoneId] = useState<string | null>(null);

  const [wallLengthInput, setWallLengthInput] = useState('');
  const [wallAngleInput, setWallAngleInput] = useState('');
  const [wallThicknessInput, setWallThicknessInput] = useState('');

  // Чертане на стени (CAD)
  const [isDrawingWalls, setIsDrawingWalls] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [exactDrawLengthInput, setExactDrawLengthInput] = useState('');

  // Чертане на отделна подова зона (работи и при преходни стаи)
  const [isDrawingFloorZone, setIsDrawingFloorZone] = useState(false);
  const [zoneDraftPoints, setZoneDraftPoints] = useState<[number, number][]>([]);

  // Подложка план от строителя + задължителна 2-точкова калибрация при качване
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);
  const [isCalibratingPlan, setIsCalibratingPlan] = useState(false);
  const [isCalibrationMandatory, setIsCalibrationMandatory] = useState(false);
  const [calibPoints, setCalibPoints] = useState<[number, number][]>([]);
  const [calibRealMetersInput, setCalibRealMetersInput] = useState('');

  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
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
      }, 4200);
    },
    []
  );

  const refreshServerData = useCallback(async () => {
    setIsLoadingModels(true);
    setApiError(null);
    try {
      const [serverModels, serverScenes] = await Promise.all([
        fetchModels(),
        fetchScenes(),
      ]);
      setModels(serverModels);
      setSavedScenes(serverScenes);

      try {
        const serverTemplates = await fetchApartmentTemplates();
        setTemplates(serverTemplates);
      } catch {
        setTemplates([]);
      }
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

  const selectedObject =
    sceneObjects.find((obj) => obj.instanceId === selectedInstanceId) ?? null;
  const selectedModel = selectedObject
    ? models.find((m) => m.id === selectedObject.modelId) ?? null
    : null;

  const selectedWall = useMemo(
    () => room.walls.find((w) => w.id === selectedWallId) ?? null,
    [room.walls, selectedWallId]
  );

  const selectedStandaloneOpening = useMemo(
    () =>
      (room.openings ?? []).find((op) => op.id === selectedStandaloneOpeningId) ??
      null,
    [room.openings, selectedStandaloneOpeningId]
  );

  const selectedFloorZone = useMemo(
    () =>
      (room.floorZones ?? []).find((z) => z.id === selectedFloorZoneId) ?? null,
    [room.floorZones, selectedFloorZoneId]
  );

  useEffect(() => {
    if (selectedWall) {
      setWallLengthInput(String(getWallLengthM(selectedWall)));
      setWallAngleInput(String(getWallAngleDeg(selectedWall)));
      setWallThicknessInput(String(selectedWall.thicknessM));
    }
  }, [selectedWall]);

  function handleCeilingHeightChange(rawValue: string) {
    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(1.5, Math.min(6.0, parsed));
    setRoom((prev) => ({
      ...prev,
      ceilingHeightM: clamped,
    }));
  }

  function commitSelectedWallChanges() {
    if (!selectedWall) return;
    const len = parseFloat(wallLengthInput.replace(',', '.'));
    const deg = parseFloat(wallAngleInput.replace(',', '.'));
    const t = parseFloat(wallThicknessInput.replace(',', '.'));

    const nextLen = Number.isNaN(len) ? getWallLengthM(selectedWall) : len;
    const nextDeg = Number.isNaN(deg) ? getWallAngleDeg(selectedWall) : deg;
    const nextT = Number.isNaN(t)
      ? selectedWall.thicknessM
      : Math.max(0.05, Math.min(0.8, t));

    const updatedGeometry = updateWallGeometry(selectedWall, nextLen, nextDeg);
    const updatedWall: WallSegment = {
      ...updatedGeometry,
      thicknessM: nextT,
    };

    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.map((w) => (w.id === selectedWall.id ? updatedWall : w)),
    }));
    showTemporaryNotice(
      `Стената е обновена: ${getWallLengthM(updatedWall)} м • ${getWallAngleDeg(updatedWall)}°`,
      'success'
    );
  }

  // --- Отделяеми подови зони (FloorZone) ---
  function toggleDrawFloorZoneMode() {
    if (isCalibrationMandatory) {
      showTemporaryNotice('Първо скалирай качения план по 2 точки!', 'error');
      return;
    }
    setIsCalibratingPlan(false);
    setCalibPoints([]);
    setIsDrawingWalls(false);
    setDraftPoints([]);

    setIsDrawingFloorZone((prev) => {
      const next = !prev;
      setZoneDraftPoints([]);
      setHoverPoint(null);
      if (next) {
        setSelectedInstanceId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedStandaloneOpeningId(null);
        setSelectedFloorZoneId(null);
        setViewMode('top');
        showTemporaryNotice(
          'Подова зона: кликни 3 или повече точки по контура (дори при преходна стая) и натисни „Затвори зона“',
          'success'
        );
      }
      return next;
    });
  }

  const commitFloorZonePolygon = useCallback(
    (pts: [number, number][]) => {
      if (pts.length < 3) {
        setIsDrawingFloorZone(false);
        setZoneDraftPoints([]);
        setHoverPoint(null);
        return;
      }

      const zoneIndex = (room.floorZones ?? []).length + 1;
      const newZone: FloorZone = {
        id: `fz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Зона ${zoneIndex}`,
        points: pts,
        color: '#b08968',
        roughness: 0.55,
        metalness: 0.05,
      };

      setRoom((prev) => ({
        ...prev,
        templateId: null,
        templateName: null,
        floorZones: [...(prev.floorZones ?? []), newZone],
      }));

      setIsDrawingFloorZone(false);
      setZoneDraftPoints([]);
      setHoverPoint(null);
      setSelectedFloorZoneId(newZone.id);
      showTemporaryNotice(
        `Създадена отделна подова зона „${newZone.name}“ — смени цвета или настилката отдясно ✓`,
        'success'
      );
    },
    [room.floorZones, showTemporaryNotice]
  );

  function handleFloorZoneDrawClick(pt: [number, number]) {
    if (!isDrawingFloorZone || isCalibrationMandatory) return;

    setZoneDraftPoints((prev) => {
      if (prev.length >= 3) {
        const first = prev[0];
        if (Math.hypot(pt[0] - first[0], pt[1] - first[1]) < 0.01) {
          setTimeout(() => commitFloorZonePolygon(prev), 0);
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

  function handleUpdateFloorZone(zoneId: string, patch: Partial<FloorZone>) {
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      floorZones: (prev.floorZones ?? []).map((z) =>
        z.id === zoneId ? { ...z, ...patch } : z
      ),
    }));
  }

  function handleDuplicateFloorZone(zoneId: string) {
    const src = (room.floorZones ?? []).find((z) => z.id === zoneId);
    if (!src) return;
    const dup: FloorZone = {
      ...src,
      id: `fz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} (копие)`,
      points: src.points.map(([x, z]) => [
        Number((x + 0.5).toFixed(3)),
        Number((z + 0.5).toFixed(3)),
      ]),
    };
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      floorZones: [...(prev.floorZones ?? []), dup],
    }));
    setSelectedFloorZoneId(dup.id);
    showTemporaryNotice('Подовата зона е дублирана ✓', 'success');
  }

  function handleDeleteFloorZone(zoneId: string) {
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      floorZones: (prev.floorZones ?? []).filter((z) => z.id !== zoneId),
    }));
    if (selectedFloorZoneId === zoneId) {
      setSelectedFloorZoneId(null);
    }
    showTemporaryNotice('Подовата зона е премахната', 'success');
  }

  // --- Самостоятелни врати и прозорци на плана (с 3D пивот, snap и дублиране) ---
  function handleCreateStandaloneOpening(type: OpeningType) {
    if (isCalibrationMandatory) {
      showTemporaryNotice('Първо скалирай качения план по 2 точки!', 'error');
      return;
    }

    const existingCount = (room.openings ?? []).length;
    const offset = (existingCount % 5) * 0.35;

    const created: StandaloneOpening = {
      id: `sop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      position: [Number((-0.5 + offset).toFixed(2)), Number((-0.5 + offset).toFixed(2))],
      rotationDeg: 0,
      widthM: type === 'door' ? 0.9 : 1.4,
      heightM: type === 'door' ? 2.1 : 1.4,
      sillHeightM: type === 'door' ? 0 : 0.9,
      thicknessM: room.defaultThicknessM,
      swing: 'left-in',
      modelId: null,
    };

    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      openings: [...(prev.openings ?? []), created],
    }));

    setIsDrawingWalls(false);
    setIsDrawingFloorZone(false);
    setDraftPoints([]);
    setZoneDraftPoints([]);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedFloorZoneId(null);
    setSelectedInstanceId(null);
    setActiveTool('translate');
    setSelectedStandaloneOpeningId(created.id);

    showTemporaryNotice(
      type === 'door'
        ? 'Влачи стрелките на пивота, за да наместиш вратата (снапва се автоматично по стените!)'
        : 'Влачи стрелките на пивота по X/Z или нагоре по Y за отстояние от земята!',
      'success'
    );
  }

  const handleUpdateStandaloneOpening = useCallback(
    (openingId: string, patch: Partial<StandaloneOpening>) => {
      setRoom((prev) => ({
        ...prev,
        templateId: null,
        templateName: null,
        openings: (prev.openings ?? []).map((op) =>
          op.id === openingId ? { ...op, ...patch } : op
        ),
      }));
    },
    []
  );

  const handleDuplicateStandaloneOpening = useCallback(
    (openingId: string) => {
      const source = (room.openings ?? []).find((op) => op.id === openingId);
      if (!source) return;

      const rad = (source.rotationDeg * Math.PI) / 180;
      const shift = Math.max(0.5, source.widthM + 0.25);
      const nextX = Number((source.position[0] + Math.cos(rad) * shift).toFixed(3));
      const nextZ = Number((source.position[1] + Math.sin(rad) * shift).toFixed(3));

      const duplicate: StandaloneOpening = {
        ...source,
        id: `sop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        position: [nextX, nextZ],
      };

      setRoom((prev) => ({
        ...prev,
        templateId: null,
        templateName: null,
        openings: [...(prev.openings ?? []), duplicate],
      }));

      setActiveTool('translate');
      setSelectedStandaloneOpeningId(duplicate.id);
      showTemporaryNotice(
        source.type === 'door'
          ? 'Вратата е дублирана с всичките ѝ настройки ✓'
          : 'Прозорецът е дублиран с всичките му настройки ✓',
        'success'
      );
    },
    [room.openings, showTemporaryNotice]
  );

  const handleDeleteStandaloneOpening = useCallback(
    (openingId: string) => {
      setRoom((prev) => ({
        ...prev,
        templateId: null,
        templateName: null,
        openings: (prev.openings ?? []).filter((op) => op.id !== openingId),
      }));
      setSelectedStandaloneOpeningId((curr) => (curr === openingId ? null : curr));
      showTemporaryNotice('Премахнато от плана', 'success');
    },
    [showTemporaryNotice]
  );

  // --- Вградени врати и прозорци към избрана стена ---
  function handleAddOpeningToSelectedWall(type: OpeningType) {
    if (!selectedWall) return;
    const wallLen = getWallLengthM(selectedWall);
    const defaultW =
      type === 'door'
        ? Math.min(0.9, Math.max(0.6, wallLen - 0.2))
        : Math.min(1.4, Math.max(0.6, wallLen - 0.2));
    const defaultH =
      type === 'door'
        ? Math.min(2.1, room.ceilingHeightM - 0.1)
        : Math.min(1.4, room.ceilingHeightM - 1.0);
    const defaultSill = type === 'door' ? 0 : 0.9;
    const defaultOffset = Number(Math.max(0.1, (wallLen - defaultW) / 2).toFixed(2));

    const newOpening: WallOpening = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      offsetFromStartM: defaultOffset,
      widthM: Number(defaultW.toFixed(2)),
      heightM: Number(defaultH.toFixed(2)),
      sillHeightM: defaultSill,
      swing: 'left-in',
      modelId: null,
    };

    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.map((w) =>
        w.id === selectedWall.id
          ? { ...w, openings: [...(w.openings ?? []), newOpening] }
          : w
      ),
    }));
    setSelectedOpeningId(newOpening.id);
    showTemporaryNotice(
      type === 'door' ? 'Добавена врата в стената ✓' : 'Добавен прозорец в стената ✓',
      'success'
    );
  }

  function handleUpdateOpening(
    wallId: string,
    openingId: string,
    patch: Partial<WallOpening>
  ) {
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.map((w) => {
        if (w.id !== wallId) return w;
        return {
          ...w,
          openings: (w.openings ?? []).map((op) =>
            op.id === openingId ? { ...op, ...patch } : op
          ),
        };
      }),
    }));
  }

  function handleDeleteOpening(wallId: string, openingId: string) {
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: prev.walls.map((w) =>
        w.id === wallId
          ? {
              ...w,
              openings: (w.openings ?? []).filter((op) => op.id !== openingId),
            }
          : w
      ),
    }));
    if (selectedOpeningId === openingId) {
      setSelectedOpeningId(null);
    }
    showTemporaryNotice('Отворът е премахнат от стената', 'success');
  }

  function handleApplyTemplate(tpl: ApartmentTemplate) {
    if (isCalibrationMandatory) {
      showTemporaryNotice('Първо завърши задължителното скалиране на качения план!', 'error');
      return;
    }
    const clonedWalls: WallSegment[] = tpl.walls.map((w, idx) => ({
      id: `wall-tpl-${Date.now()}-${idx}`,
      start: [w.start[0], w.start[1]],
      end: [w.end[0], w.end[1]],
      thicknessM: w.thicknessM || tpl.defaultThicknessM || room.defaultThicknessM,
      openings: (w.openings ?? []).map((op, opIdx) => ({
        ...op,
        id: `op-tpl-${Date.now()}-${idx}-${opIdx}`,
      })),
    }));

    const clonedOpenings: StandaloneOpening[] = (tpl.openings ?? []).map(
      (op, idx) => ({
        ...op,
        id: `sop-tpl-${Date.now()}-${idx}`,
      })
    );

    const clonedZones: FloorZone[] = (tpl.floorZones ?? []).map((z, idx) => ({
      ...z,
      id: `fz-tpl-${Date.now()}-${idx}`,
      points: z.points.map((pt) => [pt[0], pt[1]]),
    }));

    setRoom((prev) => ({
      ...prev,
      templateId: tpl.id,
      templateName: tpl.name,
      ceilingHeightM: tpl.ceilingHeightM || prev.ceilingHeightM,
      defaultThicknessM: tpl.defaultThicknessM || prev.defaultThicknessM,
      walls: clonedWalls,
      openings: clonedOpenings,
      floorZones: clonedZones,
    }));
    setSelectedWallId(clonedWalls[0]?.id ?? null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setIsDrawingWalls(false);
    setIsDrawingFloorZone(false);
    setDraftPoints([]);
    setZoneDraftPoints([]);
    setHoverPoint(null);
    showTemporaryNotice(`Зареден шаблон: „${tpl.name}“`, 'success');
  }

  function handleStartCustomEmptyPlan() {
    if (isCalibrationMandatory) {
      showTemporaryNotice('Първо завърши задължителното скалиране на качения план!', 'error');
      return;
    }
    setRoom((prev) => ({
      ...prev,
      templateId: null,
      templateName: null,
      walls: [],
      openings: [],
      floorZones: [],
    }));
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setIsCalibratingPlan(false);
    setCalibPoints([]);
    setDraftPoints([]);
    setZoneDraftPoints([]);
    setHoverPoint(null);
    setExactDrawLengthInput('');
    setIsDrawingFloorZone(false);
    setIsDrawingWalls(true);
    setViewMode('top');
    showTemporaryNotice(
      'Празен 2D чертеж: можеш първо да сложиш врати/прозорци или да чертаеш стени директно',
      'success'
    );
  }

  function toggleDrawMode() {
    if (isCalibrationMandatory) {
      showTemporaryNotice(
        'Първо скалирай качения план по 2 точки, след което ще можеш да чертаеш стените!',
        'error'
      );
      return;
    }
    setIsCalibratingPlan(false);
    setCalibPoints([]);
    setIsDrawingFloorZone(false);
    setZoneDraftPoints([]);

    setIsDrawingWalls((prev) => {
      const next = !prev;
      setDraftPoints([]);
      setHoverPoint(null);
      setExactDrawLengthInput('');
      if (next) {
        setSelectedInstanceId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedStandaloneOpeningId(null);
        setSelectedFloorZoneId(null);
        setViewMode('top');
        showTemporaryNotice(
          'CAD Чертане: снапва към краища на стени и каси на врати/прозорци • Space = нова верига • Esc = край',
          'success'
        );
      }
      return next;
    });
  }

  const commitCurrentChain = useCallback(
    (
      pointsToCommit: [number, number][],
      closeLoop: boolean,
      keepDrawingActive: boolean
    ) => {
      if (pointsToCommit.length >= 2) {
        const newSegments: WallSegment[] = [];
        const count =
          closeLoop && pointsToCommit.length >= 3
            ? pointsToCommit.length
            : pointsToCommit.length - 1;

        for (let i = 0; i < count; i++) {
          const p1 = pointsToCommit[i];
          const p2 = pointsToCommit[(i + 1) % pointsToCommit.length];
          if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 0.05) continue;
          newSegments.push({
            id: `wall-draw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${i}`,
            start: p1,
            end: p2,
            thicknessM: room.defaultThicknessM,
            openings: [],
          });
        }

        if (newSegments.length > 0) {
          setRoom((prev) => ({
            ...prev,
            templateId: null,
            templateName: null,
            walls: [...prev.walls, ...newSegments],
          }));
          if (!keepDrawingActive) {
            setSelectedWallId(newSegments[0].id);
          }
          showTemporaryNotice(
            keepDrawingActive
              ? `Записани ${newSegments.length} стени — кликни начална точка за нова верига (или Esc за изход)`
              : `Записани ${newSegments.length} стени ✓`,
            'success'
          );
        }
      }

      setDraftPoints([]);
      setExactDrawLengthInput('');
      if (!keepDrawingActive) {
        setHoverPoint(null);
        setIsDrawingWalls(false);
      }
    },
    [room.defaultThicknessM, showTemporaryNotice]
  );

  const handleBreakDrawChain = useCallback(() => {
    if (!isDrawingWalls) return;
    if (draftPoints.length >= 2) {
      commitCurrentChain(draftPoints, false, true);
    } else {
      setDraftPoints([]);
      setExactDrawLengthInput('');
      showTemporaryNotice('Нова верига: кликни начална точка за следващата стена', 'success');
    }
  }, [isDrawingWalls, draftPoints, commitCurrentChain, showTemporaryNotice]);

  function handleFloorDrawClick(pt: [number, number]) {
    if (!isDrawingWalls || isCalibrationMandatory) return;

    setDraftPoints((prev) => {
      if (prev.length >= 3) {
        const first = prev[0];
        if (Math.hypot(pt[0] - first[0], pt[1] - first[1]) < 0.01) {
          setTimeout(() => commitCurrentChain(prev, true, true), 0);
          return prev;
        }
      }
      const last = prev[prev.length - 1];
      if (last && last[0] === pt[0] && last[1] === pt[1]) {
        return prev;
      }
      return [...prev, pt];
    });
    setExactDrawLengthInput('');
  }

  function handleCommitExactDrawLength(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!isDrawingWalls || draftPoints.length === 0) return;

    const len = parseFloat(exactDrawLengthInput.replace(',', '.'));
    if (Number.isNaN(len) || len < 0.05) return;

    const anchor = draftPoints[draftPoints.length - 1];
    let angleDeg = 0;

    if (hoverPoint) {
      const dx = hoverPoint[0] - anchor[0];
      const dz = hoverPoint[1] - anchor[1];
      if (Math.hypot(dx, dz) > 0.01) {
        angleDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
      }
    }

    const nextPt = computeEndpointFromAngleAndLength(anchor, len, angleDeg);
    setExactDrawLengthInput('');

    if (
      draftPoints.length >= 3 &&
      Math.hypot(nextPt[0] - draftPoints[0][0], nextPt[1] - draftPoints[0][1]) < 0.05
    ) {
      commitCurrentChain(draftPoints, true, true);
      return;
    }

    setDraftPoints((prev) => [...prev, nextPt]);
    setHoverPoint(nextPt);
  }

  // --- Подложка план от строителя + ЗАДЪЛЖИТЕЛНА 2-точкова калибрация при качване ---
  async function handleFloorplanFileSelected(file: File | null) {
    if (!file) return;
    setIsUploadingPlan(true);
    try {
      const [aspectRatio, uploaded] = await Promise.all([
        measureLocalFileAspectRatio(file),
        uploadFloorplanImage(file),
      ]);

      const initialWidthM = 12;
      const initialDepthM = Number((initialWidthM / aspectRatio).toFixed(3));

      setRoom((prev) => ({
        ...prev,
        floorplan: {
          imageUrl: uploaded.url,
          widthM: initialWidthM,
          depthM: initialDepthM,
          aspectRatio,
          offsetX: 0,
          offsetZ: 0,
          rotationDeg: 0,
          opacity: 0.72,
          visible: true,
        },
      }));
      setViewMode('top');
      setIsDrawingWalls(false);
      setIsDrawingFloorZone(false);
      setDraftPoints([]);
      setZoneDraftPoints([]);
      setSelectedWallId(null);
      setSelectedOpeningId(null);
      setSelectedStandaloneOpeningId(null);
      setSelectedFloorZoneId(null);
      setSelectedInstanceId(null);
      setIsCalibratingPlan(true);
      setIsCalibrationMandatory(true);
      setCalibPoints([]);
      setCalibRealMetersInput('');
      setHoverPoint(null);
      showTemporaryNotice(
        'Задължителна стъпка: кликни двата края на стена с известен размер върху плана, за да го мащабираш!',
        'success'
      );
    } catch (err) {
      showTemporaryNotice(
        err instanceof Error ? err.message : 'Грешка при качване на плана.',
        'error'
      );
    } finally {
      setIsUploadingPlan(false);
    }
  }

  function startPlanCalibration(mandatory = false) {
    if (!room.floorplan) return;
    setIsDrawingWalls(false);
    setIsDrawingFloorZone(false);
    setDraftPoints([]);
    setZoneDraftPoints([]);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setSelectedInstanceId(null);
    setViewMode('top');
    setIsCalibratingPlan(true);
    setIsCalibrationMandatory(mandatory);
    setCalibPoints([]);
    setCalibRealMetersInput('');
    setHoverPoint(null);
    showTemporaryNotice(
      'Калибрация: кликни началото и края на стена с известен размер върху плана (десен бутон мести плана)',
      'success'
    );
  }

  function handleCalibFloorClick(pt: [number, number]) {
    if (!isCalibratingPlan || !room.floorplan) return;

    if (calibPoints.length === 0) {
      setCalibPoints([pt]);
      showTemporaryNotice('Кликни втория край на същата стена върху плана', 'success');
      return;
    }

    if (calibPoints.length === 1) {
      setCalibPoints([calibPoints[0], pt]);
      showTemporaryNotice(
        'Въведи реалната дължина в метри горе (напр. 6.04) и натисни „Мащабирай“',
        'success'
      );
    }
  }

  function handleApplyPlanCalibration(e: React.FormEvent) {
    e.preventDefault();
    if (!room.floorplan || calibPoints.length < 2) return;

    const realMeters = parseFloat(calibRealMetersInput.replace(',', '.'));
    if (Number.isNaN(realMeters) || realMeters <= 0.05) {
      showTemporaryNotice('Въведи валидна дължина в метри (напр. 6.04).', 'error');
      return;
    }

    const [p1, p2] = calibPoints;
    setRoom((prev) => {
      if (!prev.floorplan) return prev;
      return {
        ...prev,
        floorplan: calibrateFloorplanByTwoPoints(prev.floorplan, p1, p2, realMeters),
      };
    });

    setIsCalibratingPlan(false);
    setIsCalibrationMandatory(false);
    setCalibPoints([]);
    setCalibRealMetersInput('');
    setHoverPoint(null);
    showTemporaryNotice(
      `Планът е скалиран пропорционално по ${realMeters} м ✓ Вече можеш да поставяш врати/прозорци и да чертаеш стените!`,
      'success'
    );
  }

  function updateFloorplanProportionalSize(
    axis: 'widthM' | 'depthM',
    rawValue: string
  ) {
    const val = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(val) || val < 0.5) return;

    setRoom((prev) => {
      if (!prev.floorplan) return prev;
      const ar = prev.floorplan.aspectRatio || 1;
      if (axis === 'widthM') {
        return {
          ...prev,
          floorplan: {
            ...prev.floorplan,
            widthM: val,
            depthM: Number((val / ar).toFixed(3)),
          },
        };
      }
      return {
        ...prev,
        floorplan: {
          ...prev.floorplan,
          depthM: val,
          widthM: Number((val * ar).toFixed(3)),
        },
      };
    });
  }

  function updateFloorplanField(patch: Partial<FloorplanUnderlay>) {
    setRoom((prev) => {
      if (!prev.floorplan) return prev;
      return {
        ...prev,
        floorplan: {
          ...prev.floorplan,
          ...patch,
        },
      };
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
    setSelectedOpeningId(null);
    showTemporaryNotice('Стената е премахната', 'success');
  }

  const handleDuplicateSelected = useCallback(() => {
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
  }, [selectedObject, selectedModel]);

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
      showTemporaryNotice(`Проектът „${result.title}“ е запазен в базата данни ✓`, 'success');
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

      if (e.key === 'Escape') {
        if (isCalibratingPlan) {
          if (isCalibrationMandatory) {
            e.preventDefault();
            showTemporaryNotice(
              'Калибрацията след качване на план е задължителна — кликни 2 точки по стена или премахни плана.',
              'error'
            );
            return;
          }
          e.preventDefault();
          setIsCalibratingPlan(false);
          setCalibPoints([]);
          setCalibRealMetersInput('');
          setHoverPoint(null);
          return;
        }

        if (isDrawingFloorZone) {
          e.preventDefault();
          setIsDrawingFloorZone(false);
          setZoneDraftPoints([]);
          setHoverPoint(null);
          showTemporaryNotice('Изход от очертаване на подова зона', 'success');
          return;
        }

        if (isDrawingWalls) {
          e.preventDefault();
          if (draftPoints.length >= 2) {
            commitCurrentChain(draftPoints, false, true);
          } else if (draftPoints.length === 1) {
            setDraftPoints([]);
            setExactDrawLengthInput('');
            showTemporaryNotice('Текущата точка е отменена (натисни Esc пак за изход от чертане)', 'success');
          } else {
            setIsDrawingWalls(false);
            setDraftPoints([]);
            setHoverPoint(null);
            setExactDrawLengthInput('');
            showTemporaryNotice('Изход от режим чертане на стени', 'success');
          }
          return;
        }

        setSelectedInstanceId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedStandaloneOpeningId(null);
        setSelectedFloorZoneId(null);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveSceneToCloud();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        if (selectedStandaloneOpeningId) {
          e.preventDefault();
          handleDuplicateStandaloneOpening(selectedStandaloneOpeningId);
          return;
        }
        if (selectedInstanceId) {
          e.preventDefault();
          handleDuplicateSelected();
          return;
        }
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      if (isDrawingWalls && e.code === 'Space') {
        e.preventDefault();
        handleBreakDrawChain();
        return;
      }

      if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;

      const key = e.key.toLowerCase();
      if (key === 'w') {
        setActiveTool('translate');
      } else if (key === 'e') {
        setActiveTool('rotate');
      } else if (key === 'r') {
        setActiveTool('scale');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStandaloneOpeningId) {
        e.preventDefault();
        handleDeleteStandaloneOpening(selectedStandaloneOpeningId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedInstanceId) {
        e.preventDefault();
        setSceneObjects((prev) =>
          prev.filter((obj) => obj.instanceId !== selectedInstanceId)
        );
        setSelectedInstanceId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isAdminOpen,
    isCalibratingPlan,
    isCalibrationMandatory,
    isDrawingFloorZone,
    isDrawingWalls,
    draftPoints,
    selectedInstanceId,
    selectedStandaloneOpeningId,
    commitCurrentChain,
    handleBreakDrawChain,
    handleDuplicateStandaloneOpening,
    handleDeleteStandaloneOpening,
    handleDuplicateSelected,
    handleSaveSceneToCloud,
    showTemporaryNotice,
  ]);

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
      setSelectedOpeningId(null);
      setSelectedStandaloneOpeningId(null);
      setSelectedFloorZoneId(null);
      setCurrentSceneId(scene.id);
      setCurrentSceneTitle(scene.title);
      setSelectedInstanceId(null);
      setIsCalibratingPlan(false);
      setIsCalibrationMandatory(false);
      showTemporaryNotice(`Зареден проект: „${scene.title}“`, 'success');
    } catch (err) {
      showTemporaryNotice(
        err instanceof Error ? err.message : 'Грешка при зареждане на сцената.',
        'error'
      );
    }
  }

  function handleNewScene() {
    if (
      sceneObjects.length > 0 ||
      room.walls.length > 0 ||
      (room.openings ?? []).length > 0 ||
      (room.floorZones ?? []).length > 0 ||
      room.floorplan
    ) {
      const confirmed = window.confirm(
        'Сигурни ли сте, че искате да изчистите напълно сцената (стени, врати, прозорци, подове, подложка и мебели) и да започнете на чисто?'
      );
      if (!confirmed) return;
    }

    setSceneObjects([]);
    setRoom({
      templateId: null,
      templateName: null,
      ceilingHeightM: 2.65,
      defaultThicknessM: 0.15,
      walls: [],
      openings: [],
      floorZones: [],
      floorplan: null,
    });
    setSelectedInstanceId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
    setIsCalibratingPlan(false);
    setIsCalibrationMandatory(false);
    setCalibPoints([]);
    setIsDrawingWalls(false);
    setIsDrawingFloorZone(false);
    setDraftPoints([]);
    setZoneDraftPoints([]);
    setCurrentSceneId(null);
    setCurrentSceneTitle('Нов проект');
    setLeftTab('templates');
    showTemporaryNotice('Създадена е напълно празна сцена', 'success');
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
    setSelectedOpeningId(null);
    setSelectedStandaloneOpeningId(null);
    setSelectedFloorZoneId(null);
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

  function handleDeleteSelected() {
    if (!selectedObject) return;
    setSceneObjects((prev) =>
      prev.filter((obj) => obj.instanceId !== selectedObject.instanceId)
    );
    setSelectedInstanceId(null);
  }

  const glbCatalogModels = useMemo(
    () => models.filter((m) => m.isActive && Boolean(m.glbUrl)),
    [models]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <span>Interior Studio 3D</span>
            <span className="brand-badge">v2.8 CAD</span>
          </div>
        </div>

        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${viewMode === '3d' ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={() => setViewMode('3d')}
            title="Свободен 3D перспектива изглед"
          >
            3D Изглед
          </button>
          <button
            type="button"
            className={`btn ${viewMode === 'top' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('top')}
            title="Ортогонален 2D изглед отгоре (без перспектива)"
          >
            2D План (Ortho)
          </button>

          <span style={{ width: '1px', height: '18px', backgroundColor: '#334155', margin: '0 2px' }} />

          <button
            type="button"
            className={`btn ${activeTool === 'translate' && !isDrawingWalls && !isDrawingFloorZone && !isCalibratingPlan ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={() => {
              setIsDrawingWalls(false);
              setIsDrawingFloorZone(false);
              setActiveTool('translate');
            }}
          >
            Преместване (W)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'rotate' && !isDrawingWalls && !isDrawingFloorZone && !isCalibratingPlan ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={() => {
              setIsDrawingWalls(false);
              setIsDrawingFloorZone(false);
              setActiveTool('rotate');
            }}
          >
            Въртене (E)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'scale' && !isDrawingWalls && !isDrawingFloorZone && !isCalibratingPlan ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={() => {
              setIsDrawingWalls(false);
              setIsDrawingFloorZone(false);
              setActiveTool('scale');
            }}
          >
            Мащаб (R)
          </button>

          <span style={{ width: '1px', height: '18px', backgroundColor: '#334155', margin: '0 2px' }} />

          <button
            type="button"
            className={`btn ${isDrawingWalls ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={toggleDrawMode}
            title="Чертай стени по 45°/90° • Снапва се към краищата на вратите и прозорците"
          >
            {isDrawingWalls ? 'Чертаеш стени...' : 'Чертай стени'}
          </button>
          <button
            type="button"
            className={`btn ${isDrawingFloorZone ? 'btn-active' : ''}`}
            disabled={isCalibrationMandatory}
            onClick={toggleDrawFloorZoneMode}
            title="Очертай отделен под за стая или преходна зона"
          >
            {isDrawingFloorZone ? 'Чертаеш под...' : '+ Под / Зона'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={isCalibrationMandatory}
            onClick={() => handleCreateStandaloneOpening('door')}
            title="Постави врата и я плъзни с 3D пивота по стената"
          >
            + Врата
          </button>
          <button
            type="button"
            className="btn"
            disabled={isCalibrationMandatory}
            onClick={() => handleCreateStandaloneOpening('window')}
            title="Постави прозорец и го плъзни с 3D пивота по стената"
          >
            + Прозорец
          </button>
        </div>

        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${unit === 'cm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('cm')}
          >
            см
          </button>
          <button
            type="button"
            className={`btn ${unit === 'm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('m')}
          >
            м
          </button>

          {savedScenes.length > 0 && (
            <select
              className="select-control"
              style={{ width: '165px', padding: '5px 8px', fontSize: '12px' }}
              value={currentSceneId ?? ''}
              onChange={(e) => handleLoadCloudScene(e.target.value)}
            >
              <option value="">Зареди проект...</option>
              {savedScenes.map((scn) => (
                <option key={scn.id} value={scn.id}>
                  {scn.title}
                </option>
              ))}
            </select>
          )}

          <button type="button" className="btn" onClick={handleNewScene}>
            Нов
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleSaveSceneToCloud}
            disabled={isSavingCloud}
          >
            {isSavingCloud ? 'Запис...' : 'Запази в базата'}
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
          currentRoom={room}
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
                  План / Шаблони
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                      Параметри и елементи на плана
                    </div>

                    <div className="axis-field">
                      <span>Обща височина на стените / тавана (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        min={1.5}
                        max={6.0}
                        className="input-control"
                        value={room.ceilingHeightM}
                        onChange={(e) => handleCeilingHeightChange(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-active"
                        style={{ flex: 1, fontSize: '11px' }}
                        disabled={isCalibrationMandatory}
                        onClick={() => handleCreateStandaloneOpening('door')}
                      >
                        + Постави врата
                      </button>
                      <button
                        type="button"
                        className="btn btn-active"
                        style={{ flex: 1, fontSize: '11px' }}
                        disabled={isCalibrationMandatory}
                        onClick={() => handleCreateStandaloneOpening('window')}
                      >
                        + Постави прозорец
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`btn ${isDrawingWalls ? 'btn-active' : ''}`}
                        style={{ flex: 1, fontSize: '11px' }}
                        disabled={isCalibrationMandatory}
                        onClick={toggleDrawMode}
                      >
                        {isDrawingWalls ? 'Чертаеш...' : '+ Чертай стени'}
                      </button>
                      <button
                        type="button"
                        className={`btn ${isDrawingFloorZone ? 'btn-active' : ''}`}
                        style={{ flex: 1, fontSize: '11px' }}
                        disabled={isCalibrationMandatory}
                        onClick={toggleDrawFloorZoneMode}
                      >
                        {isDrawingFloorZone ? 'Чертаеш под...' : '+ Отделен под'}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px' }}
                      disabled={isCalibrationMandatory}
                      onClick={handleStartCustomEmptyPlan}
                    >
                      Изчисти стените и подовете
                    </button>
                  </div>

                  {/* Подложка: План от строителя */}
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      border: `1px solid ${isCalibrationMandatory ? '#f59e0b' : '#334155'}`,
                      borderRadius: '6px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Подложка: План от строителя
                    </div>

                    <label
                      className="btn"
                      style={{
                        textAlign: 'center',
                        cursor: isUploadingPlan ? 'wait' : 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      {isUploadingPlan
                        ? 'Качване на плана...'
                        : room.floorplan
                          ? 'Смени снимката на плана...'
                          : '+ Качи снимка на план от строителя'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={isUploadingPlan}
                        onChange={(e) =>
                          handleFloorplanFileSelected(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>

                    {room.floorplan && (
                      <>
                        <button
                          type="button"
                          className={`btn ${isCalibratingPlan ? 'btn-active' : ''}`}
                          style={{ fontSize: '11px' }}
                          onClick={() => startPlanCalibration(isCalibrationMandatory)}
                        >
                          {isCalibratingPlan
                            ? `Калибрация (${calibPoints.length}/2 точки)...`
                            : '📏 Калибрирай размер по стена (2 точки)'}
                        </button>

                        <div className="axis-grid">
                          <div className="axis-field">
                            <span>Ширина (м)</span>
                            <input
                              type="number"
                              step={0.1}
                              min={0.5}
                              className="input-control"
                              value={room.floorplan.widthM}
                              onChange={(e) =>
                                updateFloorplanProportionalSize('widthM', e.target.value)
                              }
                            />
                          </div>
                          <div className="axis-field">
                            <span>Дълбочина (м)</span>
                            <input
                              type="number"
                              step={0.1}
                              min={0.5}
                              className="input-control"
                              value={room.floorplan.depthM}
                              onChange={(e) =>
                                updateFloorplanProportionalSize('depthM', e.target.value)
                              }
                            />
                          </div>
                          <div className="axis-field">
                            <span>Завъртане (°)</span>
                            <input
                              type="number"
                              step={15}
                              className="input-control"
                              value={room.floorplan.rotationDeg}
                              onChange={(e) =>
                                updateFloorplanField({
                                  rotationDeg: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="axis-grid">
                          <div className="axis-field">
                            <span>Позиция X (м)</span>
                            <input
                              type="number"
                              step={0.1}
                              className="input-control"
                              value={room.floorplan.offsetX}
                              onChange={(e) =>
                                updateFloorplanField({
                                  offsetX: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="axis-field">
                            <span>Позиция Z (м)</span>
                            <input
                              type="number"
                              step={0.1}
                              className="input-control"
                              value={room.floorplan.offsetZ}
                              onChange={(e) =>
                                updateFloorplanField({
                                  offsetZ: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                          <div className="axis-field">
                            <span>Видимост</span>
                            <input
                              type="number"
                              step={0.1}
                              min={0.1}
                              max={1}
                              className="input-control"
                              value={room.floorplan.opacity}
                              onChange={(e) =>
                                updateFloorplanField({
                                  opacity: Math.min(
                                    1,
                                    Math.max(0.1, parseFloat(e.target.value) || 0.5)
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn"
                            style={{ flex: 1, fontSize: '10px' }}
                            onClick={() =>
                              updateFloorplanField({
                                visible: !room.floorplan?.visible,
                              })
                            }
                          >
                            {room.floorplan.visible ? 'Скрий подложка' : 'Покажи подложка'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: '10px' }}
                            onClick={() => {
                              setIsCalibratingPlan(false);
                              setIsCalibrationMandatory(false);
                              setCalibPoints([]);
                              setCalibRealMetersInput('');
                              setRoom((prev) => ({ ...prev, floorplan: null }));
                            }}
                          >
                            Премахни
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Готови шаблони от базата */}
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
                      Готови шаблони на апартаменти ({templates.length})
                    </div>

                    {templates.length === 0 ? (
                      <div className="empty-state-box">
                        Няма добавени шаблони в базата данни. Начертай разпределение тук и го
                        запази от „Админ панел“.
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
                                Стени: {tpl.walls.length} • Височина: {tpl.ceilingHeightM} м
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
              models={models}
              viewMode={viewMode}
              selectedWallId={selectedWallId}
              selectedOpeningId={selectedOpeningId}
              selectedStandaloneOpeningId={selectedStandaloneOpeningId}
              selectedFloorZoneId={selectedFloorZoneId}
              onSelectWall={(wallId) => {
                if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
                setSelectedWallId(wallId);
                setSelectedOpeningId(null);
                setSelectedStandaloneOpeningId(null);
                setSelectedFloorZoneId(null);
                if (wallId) setSelectedInstanceId(null);
              }}
              onSelectOpening={(wallId, openingId) => {
                if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
                setSelectedWallId(wallId);
                setSelectedOpeningId(openingId);
                setSelectedStandaloneOpeningId(null);
                setSelectedFloorZoneId(null);
                setSelectedInstanceId(null);
              }}
              onSelectStandaloneOpening={(openingId) => {
                if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
                setSelectedStandaloneOpeningId(openingId);
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedFloorZoneId(null);
                if (openingId) setSelectedInstanceId(null);
              }}
              onSelectFloorZone={(zoneId) => {
                if (isDrawingWalls || isDrawingFloorZone || isCalibratingPlan) return;
                setSelectedFloorZoneId(zoneId);
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                setSelectedStandaloneOpeningId(null);
                if (zoneId) setSelectedInstanceId(null);
              }}
              onUpdateStandaloneOpening={handleUpdateStandaloneOpening}
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
              selectedInstanceId={selectedInstanceId}
              transformTool={activeTool}
              onSelectObject={setSelectedInstanceId}
              onTransformChange={handleTransformChange}
            />

            {/* Лента за очертаване на отделен под / зона (дори при преходни стаи) */}
            {isDrawingFloorZone && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24' }}>
                  Отделен под ({zoneDraftPoints.length} т.)
                </span>

                <button
                  type="button"
                  className="btn btn-active"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  disabled={zoneDraftPoints.length < 3}
                  onClick={() => commitFloorZonePolygon(zoneDraftPoints)}
                >
                  Затвори зона
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => {
                    setIsDrawingFloorZone(false);
                    setZoneDraftPoints([]);
                    setHoverPoint(null);
                  }}
                >
                  Отказ (Esc)
                </button>
              </div>
            )}

            {/* Видима лента за калибрация на плана по 2 точки */}
            {isCalibratingPlan && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.96)',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>
                  📏 {isCalibrationMandatory ? 'Задължително скалиране' : 'Калибрация'} ({calibPoints.length}/2 точки):
                </span>

                {calibPoints.length < 2 ? (
                  <span style={{ fontSize: '12px', color: '#fef3c7' }}>
                    {calibPoints.length === 0
                      ? 'Кликни началото на котирана стена (десен бутон мести плана)'
                      : 'Кликни края на същата стена'}
                  </span>
                ) : (
                  <form
                    onSubmit={handleApplyPlanCalibration}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <input
                      type="text"
                      className="input-control"
                      style={{ width: '115px', padding: '4px 8px', fontSize: '12px' }}
                      placeholder="Размер (м)..."
                      value={calibRealMetersInput}
                      onChange={(e) => setCalibRealMetersInput(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="btn btn-active"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Мащабирай
                    </button>
                  </form>
                )}

                {calibPoints.length > 0 && (
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => {
                      setCalibPoints([]);
                      setCalibRealMetersInput('');
                    }}
                  >
                    Избери други 2 точки
                  </button>
                )}

                {!isCalibrationMandatory && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => {
                      setIsCalibratingPlan(false);
                      setCalibPoints([]);
                      setCalibRealMetersInput('');
                      setHoverPoint(null);
                    }}
                  >
                    Отказ (Esc)
                  </button>
                )}
              </div>
            )}

            {/* Плаваща CAD лента при чертане на стени */}
            {isDrawingWalls && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid #38bdf8',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
                  CAD Чертане ({draftPoints.length} т.)
                </span>

                {draftPoints.length > 0 && (
                  <form
                    onSubmit={handleCommitExactDrawLength}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <input
                      type="text"
                      className="input-control"
                      style={{ width: '95px', padding: '4px 8px', fontSize: '12px' }}
                      placeholder="Дължина (м)..."
                      value={exactDrawLengthInput}
                      onChange={(e) => setExactDrawLengthInput(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="btn btn-active"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                    >
                      Въведи
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  disabled={draftPoints.length === 0}
                  onClick={handleBreakDrawChain}
                >
                  Нова верига (Space)
                </button>

                <button
                  type="button"
                  className="btn btn-active"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  disabled={draftPoints.length < 3}
                  onClick={() => commitCurrentChain(draftPoints, true, true)}
                >
                  Затвори стая
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => commitCurrentChain(draftPoints, false, false)}
                >
                  Изход (Esc)
                </button>
              </div>
            )}

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
                  maxWidth: '380px',
                }}
              >
                {notice.text}
              </div>
            )}

            <div className="viewport-hint">
              {isCalibratingPlan
                ? 'Кликни 2 точки по стена с известен размер (Десен бутон: мести плана • Скрол: приближи)'
                : isDrawingFloorZone
                  ? 'Кликни точки около желания под (дори в преходна стая) и натисни „Затвори зона“'
                  : isDrawingWalls
                    ? 'Ляв клик: точка (снап към стени и каси на врати/прозорци) • Десен бутон: мести плана • Space: нова верига • Esc: край'
                    : `Проект: ${currentSceneTitle} • Стени: ${room.walls.length} • Подови зони: ${(room.floorZones ?? []).length} • Врати/Прозорци: ${(room.openings ?? []).length}`}
            </div>
          </section>

          <aside className="sidebar-right">
            <div className="panel-header">
              <span>
                {selectedFloorZone
                  ? 'Подова зона'
                  : selectedStandaloneOpening
                    ? selectedStandaloneOpening.type === 'door'
                      ? 'Врата (3D Пивот + Snap)'
                      : 'Прозорец (3D Пивот + Snap)'
                    : selectedWall
                      ? 'Стена, врати и прозорци'
                      : 'Настройки на обект'}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {selectedFloorZone
                  ? 'настилка'
                  : selectedStandaloneOpening || selectedWall
                    ? 'м / °'
                    : `Единици: ${unitLabel}`}
              </span>
            </div>

            <div className="panel-body">
              {selectedFloorZone ? (
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div className="axis-field">
                    <span>Наименование на зоната</span>
                    <input
                      type="text"
                      className="input-control"
                      value={selectedFloorZone.name}
                      onChange={(e) =>
                        handleUpdateFloorZone(selectedFloorZone.id, {
                          name: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Бързи настилки
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {FLOOR_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          justifyContent: 'flex-start',
                          fontSize: '11px',
                          padding: '5px 8px',
                        }}
                        onClick={() =>
                          handleUpdateFloorZone(selectedFloorZone.id, {
                            color: preset.color,
                            roughness: preset.roughness,
                            metalness: preset.metalness,
                          })
                        }
                      >
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            backgroundColor: preset.color,
                            border: '1px solid rgba(255,255,255,0.25)',
                            flexShrink: 0,
                          }}
                        />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="axis-field">
                    <span>Цвят (HEX)</span>
                    <input
                      type="color"
                      style={{
                        width: '100%',
                        height: '30px',
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                      value={selectedFloorZone.color}
                      onChange={(e) =>
                        handleUpdateFloorZone(selectedFloorZone.id, {
                          color: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => handleDuplicateFloorZone(selectedFloorZone.id)}
                    >
                      Дублирай зона
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => handleDeleteFloorZone(selectedFloorZone.id)}
                    >
                      Премахни
                    </button>
                  </div>
                </div>
              ) : selectedStandaloneOpening ? (
                <>
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #38bdf8',
                      borderRadius: '6px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      {selectedStandaloneOpening.type === 'door'
                        ? 'Врата на плана'
                        : 'Прозорец на плана'}
                    </div>

                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>Позиция X (м)</span>
                        <input
                          type="number"
                          step={0.05}
                          className="input-control"
                          value={selectedStandaloneOpening.position[0]}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              position: [
                                parseFloat(e.target.value) || 0,
                                selectedStandaloneOpening.position[1],
                              ],
                            })
                          }
                        />
                      </div>
                      <div className="axis-field">
                        <span>Позиция Z (м)</span>
                        <input
                          type="number"
                          step={0.05}
                          className="input-control"
                          value={selectedStandaloneOpening.position[1]}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              position: [
                                selectedStandaloneOpening.position[0],
                                parseFloat(e.target.value) || 0,
                              ],
                            })
                          }
                        />
                      </div>
                      <div className="axis-field">
                        <span>Завъртане (°)</span>
                        <input
                          type="number"
                          step={15}
                          className="input-control"
                          value={selectedStandaloneOpening.rotationDeg}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              rotationDeg: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[0, 90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          className={`btn ${selectedStandaloneOpening.rotationDeg === deg ? 'btn-active' : ''}`}
                          style={{ flex: 1, padding: '3px 4px', fontSize: '10px' }}
                          onClick={() =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              rotationDeg: deg,
                            })
                          }
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>

                    <div className="axis-grid">
                      <div className="axis-field">
                        <span>Ширина (м)</span>
                        <input
                          type="number"
                          step={0.05}
                          min={0.3}
                          className="input-control"
                          value={selectedStandaloneOpening.widthM}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              widthM: Math.max(0.3, parseFloat(e.target.value) || 0.9),
                            })
                          }
                        />
                      </div>
                      <div className="axis-field">
                        <span>Височина (м)</span>
                        <input
                          type="number"
                          step={0.05}
                          min={0.3}
                          className="input-control"
                          value={selectedStandaloneOpening.heightM}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              heightM: Math.max(0.3, parseFloat(e.target.value) || 1.4),
                            })
                          }
                        />
                      </div>
                      <div className="axis-field">
                        <span>Дебелина (м)</span>
                        <input
                          type="number"
                          step={0.02}
                          min={0.05}
                          className="input-control"
                          value={selectedStandaloneOpening.thicknessM}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              thicknessM: Math.max(0.05, parseFloat(e.target.value) || 0.15),
                            })
                          }
                        />
                      </div>
                    </div>

                    {selectedStandaloneOpening.type === 'window' ? (
                      <div className="axis-field">
                        <span>Отстояние от земята / парапет (м)</span>
                        <input
                          type="number"
                          step={0.05}
                          min={0}
                          max={Math.max(0, room.ceilingHeightM - 0.3)}
                          className="input-control"
                          value={selectedStandaloneOpening.sillHeightM}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              sillHeightM: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                    ) : (
                      <div className="axis-field">
                        <span>Отваряне на крилото</span>
                        <select
                          className="select-control"
                          value={selectedStandaloneOpening.swing ?? 'left-in'}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              swing: e.target.value as DoorSwing,
                            })
                          }
                        >
                          <option value="left-in">Ляво навътре</option>
                          <option value="right-in">Дясно навътре</option>
                          <option value="left-out">Ляво навън</option>
                          <option value="right-out">Дясно навън</option>
                        </select>
                      </div>
                    )}

                    {glbCatalogModels.length > 0 && (
                      <div className="axis-field">
                        <span>3D .glb модел (по избор)</span>
                        <select
                          className="select-control"
                          value={selectedStandaloneOpening.modelId ?? ''}
                          onChange={(e) =>
                            handleUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                              modelId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Стандартен 3D модул</option>
                          {glbCatalogModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Влачи червената/синята стрелка на пивота (W) за местене по стената или
                      използвай Въртене (E). При доближаване до стена се прихваща автоматично.
                    </div>
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
                      className="btn btn-active"
                      onClick={() =>
                        handleDuplicateStandaloneOpening(selectedStandaloneOpening.id)
                      }
                    >
                      {selectedStandaloneOpening.type === 'door'
                        ? 'Дублирай вратата (Ctrl+D)'
                        : 'Дублирай прозореца (Ctrl+D)'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() =>
                        handleDeleteStandaloneOpening(selectedStandaloneOpening.id)
                      }
                    >
                      Премахни от плана (Del)
                    </button>
                  </div>
                </>
              ) : selectedWall ? (
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
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Вградени отвори в стената ({(selectedWall.openings ?? []).length})
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-active"
                        style={{ flex: 1, fontSize: '11px' }}
                        onClick={() => handleAddOpeningToSelectedWall('door')}
                      >
                        + Врата в стената
                      </button>
                      <button
                        type="button"
                        className="btn btn-active"
                        style={{ flex: 1, fontSize: '11px' }}
                        onClick={() => handleAddOpeningToSelectedWall('window')}
                      >
                        + Прозорец в стената
                      </button>
                    </div>

                    {(selectedWall.openings ?? []).map((op, idx) => {
                      const isOpSelected = selectedOpeningId === op.id;
                      return (
                        <div
                          key={op.id}
                          onClick={() => setSelectedOpeningId(op.id)}
                          style={{
                            backgroundColor: '#1e293b',
                            border: `1px solid ${isOpSelected ? '#38bdf8' : '#334155'}`,
                            borderRadius: '6px',
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: '12px',
                                color: '#f8fafc',
                              }}
                            >
                              {idx + 1}. {op.type === 'door' ? 'Врата' : 'Прозорец'}
                            </span>
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOpening(selectedWall.id, op.id);
                              }}
                            >
                              Изтрий
                            </button>
                          </div>

                          <div className="axis-grid">
                            <div className="axis-field">
                              <span>Отстъп (м)</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0.05}
                                className="input-control"
                                value={op.offsetFromStartM}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    offsetFromStartM:
                                      parseFloat(e.target.value) || 0.05,
                                  })
                                }
                              />
                            </div>
                            <div className="axis-field">
                              <span>Ширина (м)</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0.3}
                                className="input-control"
                                value={op.widthM}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    widthM: parseFloat(e.target.value) || 0.6,
                                  })
                                }
                              />
                            </div>
                            <div className="axis-field">
                              <span>Височина (м)</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0.3}
                                className="input-control"
                                value={op.heightM}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    heightM: parseFloat(e.target.value) || 1.2,
                                  })
                                }
                              />
                            </div>
                          </div>

                          {op.type === 'window' ? (
                            <div className="axis-field">
                              <span>Отстояние от земята / парапет (м)</span>
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                className="input-control"
                                value={op.sillHeightM}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    sillHeightM: Math.max(
                                      0,
                                      parseFloat(e.target.value) || 0
                                    ),
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <div className="axis-field">
                              <span>Отваряне на крилото</span>
                              <select
                                className="select-control"
                                value={op.swing ?? 'left-in'}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    swing: e.target.value as DoorSwing,
                                  })
                                }
                              >
                                <option value="left-in">Ляво навътре</option>
                                <option value="right-in">Дясно навътре</option>
                                <option value="left-out">Ляво навън</option>
                                <option value="right-out">Дясно навън</option>
                              </select>
                            </div>
                          )}

                          {glbCatalogModels.length > 0 && (
                            <div className="axis-field">
                              <span>3D .glb модел (по избор)</span>
                              <select
                                className="select-control"
                                value={op.modelId ?? ''}
                                onChange={(e) =>
                                  handleUpdateOpening(selectedWall.id, op.id, {
                                    modelId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Стандартен 3D модул</option>
                                {glbCatalogModels.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    Няма избран обект, стена или под. Натиснете „+ Под / Зона“ за отделен под
                    (включително при преходни стаи) или „+ Врата“ / „+ Прозорец“.
                  </div>

                  {(room.floorZones ?? []).length > 0 && (
                    <div>
                      <div className="section-label">
                        Отделни подови зони ({(room.floorZones ?? []).length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(room.floorZones ?? []).map((zone) => (
                          <div
                            key={zone.id}
                            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                          >
                            <button
                              type="button"
                              className="btn"
                              style={{
                                flex: 1,
                                textAlign: 'left',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                              onClick={() => setSelectedFloorZoneId(zone.id)}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '2px',
                                    backgroundColor: zone.color,
                                  }}
                                />
                                <span>{zone.name}</span>
                              </span>
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>Настилка</span>
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '5px 8px', fontSize: '11px' }}
                              title="Дублирай"
                              onClick={() => handleDuplicateFloorZone(zone.id)}
                            >
                              ⧉
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(room.openings ?? []).length > 0 && (
                    <div>
                      <div className="section-label">
                        Врати и прозорци на плана ({(room.openings ?? []).length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(room.openings ?? []).map((op, idx) => (
                          <div
                            key={op.id}
                            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                          >
                            <button
                              type="button"
                              className="btn"
                              style={{
                                flex: 1,
                                textAlign: 'left',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                              onClick={() => setSelectedStandaloneOpeningId(op.id)}
                            >
                              <span>
                                {idx + 1}. {op.type === 'door' ? 'Врата' : 'Прозорец'} ({op.widthM}×{op.heightM} м)
                              </span>
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>Избери</span>
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '5px 8px', fontSize: '11px' }}
                              title="Дублирай"
                              onClick={() => handleDuplicateStandaloneOpening(op.id)}
                            >
                              ⧉
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                        >
                          -90°
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => handleRotateYBy(90)}
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
                      Дублирай обекта (Ctrl+D)
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