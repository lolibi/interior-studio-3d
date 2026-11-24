import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { CATEGORY_LABELS } from '../types/editor';
import type {
  CatalogModel,
  CatalogTexture,
  DimensionsCm,
  DisplayUnit,
  MaterialOverride,
  ScaleMode,
  SceneObject,
} from '../types/editor';
import { getWallAngleDeg, getWallLengthM } from '../types/room';
import type {
  CustomUvwSettings,
  DoorSwing,
  FloorZone,
  OpeningType,
  RoomConfig,
  SelectedFloorVertex,
  SelectedWallVertex,
  StandaloneOpening,
  SurfaceTarget,
  WallOpening,
  WallSegment,
} from '../types/room';
import type { DiscoveredMaterialSlot } from './SceneItemMesh';

const SCALE_MODE_SHORT: Record<ScaleMode, string> = {
  fixed: 'Фиксиран',
  constrained: 'Ограничен',
  free: 'Свободен',
};

const FLOOR_COLOR_PRESETS = [
  { label: 'Паркет дъб', color: '#b08968', roughness: 0.55, metalness: 0.05 },
  { label: 'Светъл дървен под', color: '#d4b483', roughness: 0.5, metalness: 0.05 },
  { label: 'Тъмен орех', color: '#5c4033', roughness: 0.45, metalness: 0.08 },
  { label: 'Гранитогрес светъл', color: '#cbd5e1', roughness: 0.28, metalness: 0.12 },
  { label: 'Плочки / Бетон', color: '#94a3b8', roughness: 0.65, metalness: 0.08 },
];

const FRAME_COLOR_PRESETS = [
  { label: 'Бяла (PVC)', color: '#f1f5f9' },
  { label: 'Антрацит', color: '#334155' },
  { label: 'Черна (Алуминий)', color: '#1e293b' },
  { label: 'Златен дъб', color: '#a16207' },
  { label: 'Орех', color: '#5c4033' },
];

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

function BufferedNumberInput({
  value,
  onCommit,
  min,
  max,
  step = 1,
  style,
  className = 'input-control',
}: {
  value: number;
  onCommit: (nextVal: number) => void;
  min?: number;
  max?: number;
  step?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const [text, setText] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(String(value));
    }
  }, [value, isFocused]);

  const clampVal = (num: number): number => {
    let res = num;
    if (min !== undefined) res = Math.max(min, res);
    if (max !== undefined) res = Math.min(max, res);
    return res;
  };

  const commitCurrentText = () => {
    const normalized = text.trim().replace(',', '.');
    if (normalized === '' || normalized === '-' || normalized === '.') {
      setText(String(value));
      return;
    }
    const parsed = parseFloat(normalized);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = clampVal(parsed);
    setText(String(clamped));
    if (clamped !== value) {
      onCommit(clamped);
    }
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      className={className}
      style={style}
      value={text}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const normalized = raw.trim().replace(',', '.');
        if (normalized === '' || normalized === '-' || normalized === '.') {
          return;
        }
        const parsed = parseFloat(normalized);
        if (Number.isNaN(parsed)) return;
        if (min !== undefined && parsed < min) return;
        if (max !== undefined && parsed > max) return;
        onCommit(parsed);
      }}
      onBlur={() => {
        setIsFocused(false);
        commitCurrentText();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export interface SurfaceBatchPatch {
  color?: string;
  textureId?: string | null;
  tileHeightM?: number | null;
  uvwPatch?: Partial<CustomUvwSettings>;
  resetUvw?: boolean;
  roughness?: number;
  metalness?: number;
}

export interface RightInspectorProps {
  room: RoomConfig;
  models: CatalogModel[];
  textures: CatalogTexture[];
  sceneObjects: SceneObject[];
  unit: DisplayUnit;

  selectedSurfaces: SurfaceTarget[];
  selectedWall: WallSegment | null;
  selectedOpeningId: string | null;
  selectedStandaloneOpening: StandaloneOpening | null;
  selectedFloorZone: FloorZone | null;
  selectedObject: SceneObject | null;
  selectedModel: CatalogModel | null;
  discoveredMaterialSlots: DiscoveredMaterialSlot[];

  selectedWallVertex: SelectedWallVertex | null;
  selectedFloorVertex: SelectedFloorVertex | null;
  linkedVertexJoint: boolean;
  autoStraightenVertices: boolean;
  wallLengthInput: string;
  wallAngleInput: string;
  wallThicknessInput: string;

  onApplySurfaceBatch: (patch: SurfaceBatchPatch) => void;
  onClearSurfaceSelection: () => void;

  onSelectWallVertex: (v: SelectedWallVertex | null) => void;
  onToggleLinkedVertexJoint: () => void;
  onToggleAutoStraightenVertices: () => void;
  onStraightenSelectedWall: () => void;
  onWallLengthInputChange: (val: string) => void;
  onWallAngleInputChange: (val: string) => void;
  onWallThicknessInputChange: (val: string) => void;
  onCommitSelectedWallChanges: () => void;
  onUpdateWallSurface: (wallId: string, patch: Partial<WallSegment>) => void;
  onDeleteSelectedWall: () => void;

  onSelectOpening: (opId: string | null) => void;
  onAddOpeningToSelectedWall: (type: OpeningType) => void;
  onUpdateOpening: (wallId: string, opId: string, patch: Partial<WallOpening>) => void;
  onDeleteOpening: (wallId: string, opId: string) => void;

  onSelectStandaloneOpening: (id: string | null) => void;
  onUpdateStandaloneOpening: (id: string, patch: Partial<StandaloneOpening>) => void;
  onDuplicateStandaloneOpening: (id: string) => void;
  onDeleteStandaloneOpening: (id: string) => void;

  onSelectFloorZone: (id: string | null) => void;
  onSelectFloorVertex: (v: SelectedFloorVertex | null) => void;
  onUpdateFloorZoneVertex: (
    zoneId: string,
    pointIndex: number,
    nextPoint: [number, number]
  ) => void;
  onInsertFloorZoneVertexAfter: (zoneId: string, pointIndex: number) => void;
  onDeleteFloorZoneVertex: (zoneId: string, pointIndex: number) => void;
  onUpdateFloorZone: (id: string, patch: Partial<FloorZone>) => void;
  onDuplicateFloorZone: (id: string) => void;
  onDeleteFloorZone: (id: string) => void;

  onUpdateRoomCeiling: (patch: { showCeiling?: boolean; ceilingColor?: string }) => void;

  onSelectInstance: (id: string | null) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
  onRotateYBy: (deg: number) => void;
  onToggleMirrorSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onUpdateObjectMaterial: (
    instanceId: string,
    slotKey: string,
    override: MaterialOverride | null
  ) => void;
  onSaveObjectAsPreset: (obj: SceneObject, baseModel: CatalogModel) => void;
}

export function RightInspector({
  room,
  models,
  textures,
  sceneObjects,
  unit,
  selectedSurfaces,
  selectedWall,
  selectedOpeningId,
  selectedStandaloneOpening,
  selectedFloorZone,
  selectedObject,
  selectedModel,
  discoveredMaterialSlots,
  selectedWallVertex,
  selectedFloorVertex,
  linkedVertexJoint,
  autoStraightenVertices,
  wallLengthInput,
  wallAngleInput,
  wallThicknessInput,
  onApplySurfaceBatch,
  onClearSurfaceSelection,
  onSelectWallVertex,
  onToggleLinkedVertexJoint,
  onToggleAutoStraightenVertices,
  onStraightenSelectedWall,
  onWallLengthInputChange,
  onWallAngleInputChange,
  onWallThicknessInputChange,
  onCommitSelectedWallChanges,
  onDeleteSelectedWall,
  onSelectOpening,
  onAddOpeningToSelectedWall,
  onUpdateOpening,
  onDeleteOpening,
  onSelectStandaloneOpening,
  onUpdateStandaloneOpening,
  onDuplicateStandaloneOpening,
  onDeleteStandaloneOpening,
  onSelectFloorZone,
  onSelectFloorVertex,
  onUpdateFloorZoneVertex,
  onInsertFloorZoneVertexAfter,
  onDeleteFloorZoneVertex,
  onUpdateFloorZone,
  onDuplicateFloorZone,
  onDeleteFloorZone,
  onUpdateRoomCeiling,
  onSelectInstance,
  onTransformChange,
  onRotateYBy,
  onToggleMirrorSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onUpdateObjectMaterial,
  onSaveObjectAsPreset,
}: RightInspectorProps) {
  const unitLabel = unit === 'cm' ? 'см' : 'м';

  const glbCatalogModels = useMemo(
    () => models.filter((m) => m.isActive && Boolean(m.glbUrl)),
    [models]
  );

  const floorTextures = useMemo(
    () => textures.filter((t) => t.category === 'floor' || t.category === 'tiles'),
    [textures]
  );

  const wallTextures = useMemo(
    () => textures.filter((t) => t.category === 'wall' || t.category === 'tiles'),
    [textures]
  );

  const furnitureTextures = useMemo(
    () => textures.filter((t) => t.category === 'furniture'),
    [textures]
  );

  const primarySurfaceInfo = useMemo(() => {
    const first = selectedSurfaces[0];
    if (!first) return null;

    const hasWalls = selectedSurfaces.some((s) => s.kind === 'wall');
    const hasFloors = selectedSurfaces.some((s) => s.kind === 'floor');

    if (first.kind === 'wall') {
      const w = room.walls.find((item) => item.id === first.wallId);
      if (!w) return null;
      const isFront = first.side === 'front';
      const texId = isFront ? w.frontTextureId ?? '' : w.backTextureId ?? '';
      const texMeta = texId ? textures.find((t) => t.id === texId) ?? null : null;
      return {
        kind: 'wall' as const,
        side: first.side,
        hasWalls,
        hasFloors,
        color: isFront ? w.frontColor || '#f1f5f9' : w.backColor || '#f1f5f9',
        textureId: texId,
        textureMeta: texMeta,
        tileHeightM: isFront ? w.frontTileHeightM ?? null : w.backTileHeightM ?? null,
        uvw: (isFront ? w.frontUvw : w.backUvw) ?? {},
      };
    }

    const z = (room.floorZones ?? []).find((item) => item.id === first.zoneId);
    if (!z) return null;
    const texId = z.textureId ?? '';
    const texMeta = texId ? textures.find((t) => t.id === texId) ?? null : null;
    return {
      kind: 'floor' as const,
      hasWalls,
      hasFloors,
      color: z.color || '#b08968',
      textureId: texId,
      textureMeta: texMeta,
      tileHeightM: null,
      uvw: {
        ...z.uvw,
        rotationDeg: z.uvw?.rotationDeg ?? z.textureRotationDeg ?? 0,
      },
    };
  }, [selectedSurfaces, room.walls, room.floorZones, textures]);

  const applicableTextures = useMemo(() => {
    if (!primarySurfaceInfo) return textures;
    if (primarySurfaceInfo.hasWalls && !primarySurfaceInfo.hasFloors) {
      return wallTextures;
    }
    if (primarySurfaceInfo.hasFloors && !primarySurfaceInfo.hasWalls) {
      return floorTextures;
    }
    return textures.filter((t) => t.category !== 'furniture');
  }, [primarySurfaceInfo, textures, wallTextures, floorTextures]);

  function isAxisScalable(
    model: CatalogModel,
    axis: keyof DimensionsCm
  ): boolean {
    if (model.scaleMode === 'fixed') return false;
    if (model.scaleMode === 'free') return true;
    if (axis === 'width') return model.scaleConstraints.allowX;
    if (axis === 'height') return model.scaleConstraints.allowY;
    return model.scaleConstraints.allowZ;
  }

  function handlePositionInput(axisIndex: 0 | 1 | 2, rawValue: string) {
    if (!selectedObject) return;
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;

    let meters = unit === 'cm' ? parsed / 100 : parsed;
    if (axisIndex === 1) meters = Math.max(0, meters);

    const nextPos: [number, number, number] = [...selectedObject.position];
    nextPos[axisIndex] = meters;
    onTransformChange(
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
    onTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      nextRot,
      selectedObject.scale
    );
  }

  function handleDimensionInput(
    axis: keyof DimensionsCm,
    rawValue: string
  ) {
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

    onTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      selectedObject.rotation,
      nextScale
    );
  }

  const defaultTileWCm = primarySurfaceInfo?.textureMeta
    ? Math.round(primarySurfaceInfo.textureMeta.tileWidthM * 100)
    : 60;
  const defaultTileHCm = primarySurfaceInfo?.textureMeta
    ? Math.round(primarySurfaceInfo.textureMeta.tileHeightM * 100)
    : 60;

  const activeFloorVertexPoint =
    selectedFloorZone &&
    selectedFloorVertex?.zoneId === selectedFloorZone.id &&
    selectedFloorZone.points[selectedFloorVertex.pointIndex]
      ? {
          index: selectedFloorVertex.pointIndex,
          point: selectedFloorZone.points[selectedFloorVertex.pointIndex],
        }
      : null;

  return (
    <aside className="sidebar-right">
      <div className="panel-header">
        <span>
          {selectedSurfaces.length > 1
            ? `Избрани повърхности (${selectedSurfaces.length})`
            : selectedFloorZone
              ? 'Подова зона и настилка'
              : selectedStandaloneOpening
                ? selectedStandaloneOpening.type === 'door'
                  ? 'Врата (3D Пивот + Snap)'
                  : 'Прозорец (3D Пивот + Snap)'
                : selectedWall
                  ? 'Лице на стена и геометрия'
                  : 'Настройки на обект'}
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {selectedSurfaces.length > 0
            ? 'UVW / PBR'
            : selectedStandaloneOpening || selectedWall
              ? 'м / °'
              : `Единици: ${unitLabel}`}
        </span>
      </div>

      <div className="panel-body">
        {/* 1. ОБЩ ПАНЕЛ ЗА МАТЕРИАЛ + CUSTOM UVW НА СЕЛЕКТИРАНИТЕ ПОЛИГОНИ */}
        {primarySurfaceInfo && selectedSurfaces.length > 0 && (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '12px', color: '#38bdf8' }}>
                {selectedSurfaces.length === 1
                  ? primarySurfaceInfo.kind === 'wall'
                    ? `Лице на стена (${primarySurfaceInfo.side === 'front' ? 'Страна А' : 'Страна Б'})`
                    : `Подова зона: ${selectedFloorZone?.name ?? ''}`
                  : `Групова редакция: ${selectedSurfaces.length} лица`}
              </span>
              {selectedSurfaces.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={onClearSurfaceSelection}
                >
                  Изчисти
                </button>
              )}
            </div>

            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              Съвет: Задръж <strong>Shift + Click</strong> в 3D, за да добавиш още стени/подове, или плъзни материал от левия таб „Материали“.
            </div>

            {/* Цвят / Боя */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '6px 8px',
                borderRadius: '5px',
                border: '1px solid #334155',
              }}
            >
              <span style={{ fontSize: '11px', color: '#e2e8f0' }}>
                Основен цвят / боя
              </span>
              <input
                type="color"
                style={{
                  width: '36px',
                  height: '22px',
                  border: '1px solid #475569',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
                value={primarySurfaceInfo.color}
                onChange={(e) =>
                  onApplySurfaceBatch({
                    color: e.target.value,
                    textureId: null,
                  })
                }
              />
            </div>

            {/* Избор на текстура */}
            <div className="axis-field">
              <span>Текстура / Тапет / Плочки / Паркет</span>
              <select
                className="select-control"
                style={{ fontSize: '11px', padding: '5px 6px' }}
                value={primarySurfaceInfo.textureId}
                onChange={(e) =>
                  onApplySurfaceBatch({
                    textureId: e.target.value || null,
                  })
                }
              >
                <option value="">Без текстура (само боя)</option>
                {applicableTextures.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Math.round(t.tileWidthM * 100)}×
                    {Math.round(t.tileHeightM * 100)} см)
                  </option>
                ))}
              </select>
            </div>

            {/* Височина на плочките на стената */}
            {primarySurfaceInfo.hasWalls && primarySurfaceInfo.textureId && (
              <div className="axis-field">
                <span>Височина на облицовката (м) — празно = до тавана</span>
                <input
                  type="number"
                  step={0.05}
                  min={0.2}
                  max={room.ceilingHeightM}
                  placeholder={`До тавана (${room.ceilingHeightM} м)`}
                  className="input-control"
                  style={{ fontSize: '11px', padding: '4px 6px' }}
                  value={primarySurfaceInfo.tileHeightM ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onApplySurfaceBatch({
                      tileHeightM: raw ? parseFloat(raw) || null : null,
                    });
                  }}
                />
              </div>
            )}

            {/* CUSTOM UVW КАРТОГРАФИРАНЕ */}
            {primarySurfaceInfo.textureId && (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                    Custom UVW Мащаб и Позиция
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 6px', fontSize: '9px' }}
                    onClick={() => onApplySurfaceBatch({ resetUvw: true })}
                  >
                    Нулирай UVW
                  </button>
                </div>

                <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="axis-field">
                    <span>Ширина плочка (см)</span>
                    <BufferedNumberInput
                      step={5}
                      min={5}
                      max={1000}
                      value={primarySurfaceInfo.uvw.tileWidthCm ?? defaultTileWCm}
                      onCommit={(val) =>
                        onApplySurfaceBatch({
                          uvwPatch: { tileWidthCm: val },
                        })
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Височина плочка (см)</span>
                    <BufferedNumberInput
                      step={5}
                      min={5}
                      max={1000}
                      value={primarySurfaceInfo.uvw.tileHeightCm ?? defaultTileHCm}
                      onCommit={(val) =>
                        onApplySurfaceBatch({
                          uvwPatch: { tileHeightCm: val },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="axis-field">
                  <span>Завъртане на текстурата (°)</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 45, 90].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        className={`btn ${(primarySurfaceInfo.uvw.rotationDeg ?? 0) === deg ? 'btn-active' : ''}`}
                        style={{ flex: 1, fontSize: '10px', padding: '3px 4px' }}
                        onClick={() =>
                          onApplySurfaceBatch({ uvwPatch: { rotationDeg: deg } })
                        }
                      >
                        {deg}°
                      </button>
                    ))}
                    <BufferedNumberInput
                      step={15}
                      style={{ width: '58px', padding: '3px 5px', fontSize: '11px' }}
                      value={primarySurfaceInfo.uvw.rotationDeg ?? 0}
                      onCommit={(val) =>
                        onApplySurfaceBatch({
                          uvwPatch: { rotationDeg: val },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="axis-field">
                    <span>Отместване U (см)</span>
                    <BufferedNumberInput
                      step={5}
                      value={primarySurfaceInfo.uvw.offsetXCm ?? 0}
                      onCommit={(val) =>
                        onApplySurfaceBatch({
                          uvwPatch: { offsetXCm: val },
                        })
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Отместване V (см)</span>
                    <BufferedNumberInput
                      step={5}
                      value={primarySurfaceInfo.uvw.offsetYCm ?? 0}
                      onCommit={(val) =>
                        onApplySurfaceBatch({
                          uvwPatch: { offsetYCm: val },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Бързи едноцветни пресети за под */}
            {primarySurfaceInfo.hasFloors && !primarySurfaceInfo.hasWalls && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Бързи настилки
                </div>
                {FLOOR_COLOR_PRESETS.map((preset) => (
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
                      padding: '4px 8px',
                    }}
                    onClick={() =>
                      onApplySurfaceBatch({
                        textureId: null,
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
            )}
          </div>
        )}

        {/* 2. ДОПЪЛНИТЕЛНИ НАСТРОЙКИ И ВЪРТЕКСИ ЗА ЕДИНИЧНА ПОДОВА ЗОНА */}
        {selectedFloorZone && selectedSurfaces.length <= 1 && (
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
            <div className="axis-field">
              <span>Наименование на зоната</span>
              <input
                type="text"
                className="input-control"
                value={selectedFloorZone.name}
                onChange={(e) =>
                  onUpdateFloorZone(selectedFloorZone.id, { name: e.target.value })
                }
              />
            </div>

            {/* Въртекси (ъгли) на подовата зона */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div className="section-label" style={{ marginBottom: 0 }}>
                Въртекси (ъгли) на пода ({selectedFloorZone.points.length})
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                Избери ъгъл от списъка или кликни зеления маркер в 3D, за да го преместиш със Snap.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px',
                }}
              >
                {selectedFloorZone.points.map((pt, idx) => {
                  const isActiveV =
                    selectedFloorVertex?.zoneId === selectedFloorZone.id &&
                    selectedFloorVertex?.pointIndex === idx;
                  return (
                    <button
                      key={`fz-v-${idx}`}
                      type="button"
                      className={`btn ${isActiveV ? 'btn-active' : ''}`}
                      style={{ fontSize: '10px', padding: '4px 6px' }}
                      onClick={() =>
                        onSelectFloorVertex(
                          isActiveV
                            ? null
                            : { zoneId: selectedFloorZone.id, pointIndex: idx }
                        )
                      }
                    >
                      #{idx + 1} ({pt[0]}, {pt[1]})
                    </button>
                  );
                })}
              </div>

              {activeFloorVertexPoint && (
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '5px',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div className="axis-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="axis-field">
                      <span>Ъгъл #{activeFloorVertexPoint.index + 1} X (м)</span>
                      <BufferedNumberInput
                        step={0.05}
                        value={activeFloorVertexPoint.point[0]}
                        onCommit={(val) =>
                          onUpdateFloorZoneVertex(
                            selectedFloorZone.id,
                            activeFloorVertexPoint.index,
                            [
                              Number(val.toFixed(3)),
                              activeFloorVertexPoint.point[1],
                            ]
                          )
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Ъгъл #{activeFloorVertexPoint.index + 1} Z (м)</span>
                      <BufferedNumberInput
                        step={0.05}
                        value={activeFloorVertexPoint.point[1]}
                        onCommit={(val) =>
                          onUpdateFloorZoneVertex(
                            selectedFloorZone.id,
                            activeFloorVertexPoint.index,
                            [
                              activeFloorVertexPoint.point[0],
                              Number(val.toFixed(3)),
                            ]
                          )
                        }
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                      onClick={() =>
                        onInsertFloorZoneVertexAfter(
                          selectedFloorZone.id,
                          activeFloorVertexPoint.index
                        )
                      }
                    >
                      + Нов връх след #{activeFloorVertexPoint.index + 1}
                    </button>
                    {selectedFloorZone.points.length > 3 && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: '10px', padding: '4px 6px' }}
                        onClick={() =>
                          onDeleteFloorZoneVertex(
                            selectedFloorZone.id,
                            activeFloorVertexPoint.index
                          )
                        }
                      >
                        Изтрий връх
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => onDuplicateFloorZone(selectedFloorZone.id)}
              >
                Дублирай зона
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => onDeleteFloorZone(selectedFloorZone.id)}
              >
                Премахни
              </button>
            </div>
          </div>
        )}

        {/* 3. НАСТРОЙКИ ЗА ВРАТА / ПРОЗОРЕЦ НА ПЛАНА */}
        {selectedStandaloneOpening ? (
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                        thicknessM: Math.max(0.05, parseFloat(e.target.value) || 0.15),
                      })
                    }
                  />
                </div>
              </div>

              <div className="axis-field">
                <span>Цвят на дограмата / касата</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {FRAME_COLOR_PRESETS.map((fp) => (
                    <button
                      key={fp.label}
                      type="button"
                      className="btn"
                      style={{
                        padding: '3px 6px',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={() =>
                        onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                          frameColor: fp.color,
                        })
                      }
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '2px',
                          backgroundColor: fp.color,
                          border: '1px solid #64748b',
                        }}
                      />
                      <span>{fp.label}</span>
                    </button>
                  ))}
                  <input
                    type="color"
                    style={{
                      width: '28px',
                      height: '22px',
                      border: '1px solid #334155',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                    value={selectedStandaloneOpening.frameColor || '#e2e8f0'}
                    onChange={(e) =>
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                        frameColor: e.target.value,
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                      onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
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
                  onDuplicateStandaloneOpening(selectedStandaloneOpening.id)
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
                  onDeleteStandaloneOpening(selectedStandaloneOpening.id)
                }
              >
                Премахни от плана (Del)
              </button>
            </div>
          </>
        ) : selectedWall && selectedSurfaces.length <= 1 ? (
          <>
            {/* 4. ГЕОМЕТРИЯ И ОТВОРИ НА ЕДИНИЧНА СТЕНА */}
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

              <div
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Въртекс (ъгъл) и изправяне
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['start', 'end'] as const).map((endKey) => {
                    const isActiveV =
                      selectedWallVertex?.wallId === selectedWall.id &&
                      selectedWallVertex?.endKey === endKey;
                    const pt =
                      endKey === 'start'
                        ? selectedWall.start
                        : selectedWall.end;
                    return (
                      <button
                        key={endKey}
                        type="button"
                        className={`btn ${isActiveV ? 'btn-active' : ''}`}
                        style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                        onClick={() =>
                          onSelectWallVertex(
                            isActiveV ? null : { wallId: selectedWall.id, endKey }
                          )
                        }
                      >
                        {endKey === 'start' ? 'Начало' : 'Край'} ({pt[0]}, {pt[1]})
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className={`btn ${linkedVertexJoint ? 'btn-active' : ''}`}
                    style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                    onClick={onToggleLinkedVertexJoint}
                  >
                    {linkedVertexJoint ? 'Свързан ъгъл: ДА' : 'Свързан ъгъл: НЕ'}
                  </button>
                  <button
                    type="button"
                    className={`btn ${autoStraightenVertices ? 'btn-active' : ''}`}
                    style={{ flex: 1, fontSize: '10px', padding: '4px 6px' }}
                    onClick={onToggleAutoStraightenVertices}
                  >
                    {autoStraightenVertices
                      ? 'Авто-изправяне: ДА'
                      : 'Авто-изправяне: НЕ'}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '11px', padding: '5px 8px' }}
                  onClick={onStraightenSelectedWall}
                >
                  📐 Изправи стената (0° / 90° / 180° / 270°)
                </button>
              </div>

              <div className="axis-grid">
                <div className="axis-field">
                  <span>Дължина (м)</span>
                  <input
                    type="text"
                    className="input-control"
                    value={wallLengthInput}
                    onChange={(e) => onWallLengthInputChange(e.target.value)}
                  />
                </div>
                <div className="axis-field">
                  <span>Ъгъл (°)</span>
                  <input
                    type="text"
                    className="input-control"
                    value={wallAngleInput}
                    onChange={(e) => onWallAngleInputChange(e.target.value)}
                  />
                </div>
                <div className="axis-field">
                  <span>Дебелина (м)</span>
                  <input
                    type="text"
                    className="input-control"
                    value={wallThicknessInput}
                    onChange={(e) => onWallThicknessInputChange(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn btn-active"
                onClick={onCommitSelectedWallChanges}
              >
                Приложи размерите на стената
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
                  onClick={() => onAddOpeningToSelectedWall('door')}
                >
                  + Врата в стената
                </button>
                <button
                  type="button"
                  className="btn btn-active"
                  style={{ flex: 1, fontSize: '11px' }}
                  onClick={() => onAddOpeningToSelectedWall('window')}
                >
                  + Прозорец в стената
                </button>
              </div>

              {(selectedWall.openings ?? []).map((op, idx) => {
                const isOpSelected = selectedOpeningId === op.id;
                return (
                  <div
                    key={op.id}
                    onClick={() => onSelectOpening(op.id)}
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
                          onDeleteOpening(selectedWall.id, op.id);
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
                            onUpdateOpening(selectedWall.id, op.id, {
                              offsetFromStartM: parseFloat(e.target.value) || 0.05,
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
                            onUpdateOpening(selectedWall.id, op.id, {
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
                            onUpdateOpening(selectedWall.id, op.id, {
                              heightM: parseFloat(e.target.value) || 1.2,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="axis-field">
                      <span>Цвят на дограмата / касата</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {FRAME_COLOR_PRESETS.map((fp) => (
                          <button
                            key={fp.label}
                            type="button"
                            className="btn"
                            style={{ padding: '2px 5px', fontSize: '10px' }}
                            onClick={() =>
                              onUpdateOpening(selectedWall.id, op.id, {
                                frameColor: fp.color,
                              })
                            }
                          >
                            {fp.label}
                          </button>
                        ))}
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
                            onUpdateOpening(selectedWall.id, op.id, {
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
                          value={op.swing ?? 'left-in'}
                          onChange={(e) =>
                            onUpdateOpening(selectedWall.id, op.id, {
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
                            onUpdateOpening(selectedWall.id, op.id, {
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
              onClick={onDeleteSelectedWall}
            >
              Премахни стената
            </button>
          </>
        ) : selectedSurfaces.length === 0 && (!selectedObject || !selectedModel) ? (
          <>
            {/* 5. ОБЩИ НАСТРОЙКИ НА СЦЕНАТА */}
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
                Таван и изглед отвътре
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn ${room.showCeiling ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '11px' }}
                  onClick={() =>
                    onUpdateRoomCeiling({ showCeiling: !room.showCeiling })
                  }
                >
                  {room.showCeiling ? 'Таван: Видим' : 'Таван: Скрит (отворен отгоре)'}
                </button>
                <input
                  type="color"
                  title="Цвят на тавана"
                  style={{
                    width: '32px',
                    height: '28px',
                    border: '1px solid #334155',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                  value={room.ceilingColor || '#f8fafc'}
                  onChange={(e) =>
                    onUpdateRoomCeiling({ ceilingColor: e.target.value })
                  }
                />
              </div>
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
                        onClick={() => onSelectFloorZone(zone.id)}
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
                        onClick={() => onDuplicateFloorZone(zone.id)}
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
                        onClick={() => onSelectStandaloneOpening(op.id)}
                      >
                        <span>
                          {idx + 1}. {op.type === 'door' ? 'Врата' : 'Прозорец'} (
                          {op.widthM}×{op.heightM} м)
                        </span>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>Избери</span>
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '5px 8px', fontSize: '11px' }}
                        title="Дублирай"
                        onClick={() => onDuplicateStandaloneOpening(op.id)}
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
                        onClick={() => onSelectInstance(obj.instanceId)}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {idx + 1}. {obj.name || m?.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>Избери</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : selectedObject && selectedModel ? (
          <>
            {/* 6. НАСТРОЙКИ НА МЕБЕЛ */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                {selectedObject.name || selectedModel.name}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {CATEGORY_LABELS[selectedModel.category]} • Режим:{' '}
                {SCALE_MODE_SHORT[selectedModel.scaleMode]}
              </div>
            </div>

            {discoveredMaterialSlots.length > 0 && (
              <div
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Цветове и материали на мебелта ({discoveredMaterialSlots.length})
                </div>

                {discoveredMaterialSlots.map((slot) => {
                  const currentOv = selectedObject.materialOverrides?.[slot.key];
                  const activeColor = currentOv?.color || slot.defaultColorHex;
                  const activeTexId = currentOv?.textureId || '';

                  return (
                    <div
                      key={slot.key}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '5px',
                        padding: '7px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
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
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#e2e8f0',
                          }}
                        >
                          {slot.label}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="color"
                            style={{
                              width: '26px',
                              height: '20px',
                              border: '1px solid #475569',
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                            value={activeColor}
                            onChange={(e) =>
                              onUpdateObjectMaterial(
                                selectedObject.instanceId,
                                slot.key,
                                {
                                  color: e.target.value,
                                  textureId: activeTexId || null,
                                }
                              )
                            }
                          />
                          {currentOv && (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '2px 5px', fontSize: '9px' }}
                              onClick={() =>
                                onUpdateObjectMaterial(
                                  selectedObject.instanceId,
                                  slot.key,
                                  null
                                )
                              }
                            >
                              Нулирай
                            </button>
                          )}
                        </div>
                      </div>

                      {furnitureTextures.length > 0 && (
                        <select
                          className="select-control"
                          style={{ fontSize: '11px', padding: '3px 6px' }}
                          value={activeTexId}
                          onChange={(e) =>
                            onUpdateObjectMaterial(
                              selectedObject.instanceId,
                              slot.key,
                              {
                                color: e.target.value ? '#ffffff' : activeColor,
                                textureId: e.target.value || null,
                              }
                            )
                          }
                        >
                          <option value="">Оригинален / Едноцветен</option>
                          {furnitureTextures.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="btn btn-active"
                  style={{ fontSize: '11px' }}
                  onClick={() =>
                    onSaveObjectAsPreset(selectedObject, selectedModel)
                  }
                >
                  ★ Запази в „Мои варианти“ (Лична библиотека)
                </button>
              </div>
            )}

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
                      onTransformChange(
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
                    onClick={() => onRotateYBy(-90)}
                  >
                    -90°
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => onRotateYBy(90)}
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
                      onTransformChange(
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
                      (selectedModel.dimensionsCm.width * selectedObject.scale[0]) /
                        100,
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
                      (selectedModel.dimensionsCm.height * selectedObject.scale[1]) /
                        100,
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
                      (selectedModel.dimensionsCm.depth * selectedObject.scale[2]) /
                        100,
                      unit
                    )}
                    onChange={(e) => handleDimensionInput('depth', e.target.value)}
                  />
                </div>
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
                className={`btn ${selectedObject.mirrored ? 'btn-active' : ''}`}
                onClick={onToggleMirrorSelected}
              >
                {selectedObject.mirrored
                  ? 'Огледално: Включено (Mirror)'
                  : 'Огледално (Mirror)'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={onDuplicateSelected}
              >
                Дублирай обекта (Ctrl+D)
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDeleteSelected}
              >
                Изтрий от сцената (Del)
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}