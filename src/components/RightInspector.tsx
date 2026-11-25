import { useState } from 'react';
import type {
  CatalogModel,
  CatalogTexture,
  DisplayUnit,
  MaterialOverride,
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

export interface SurfaceBatchPatch {
  color?: string;
  textureId?: string | null;
  tileHeightM?: number;
  roughness?: number;
  metalness?: number;
  uvwPatch?: Partial<CustomUvwSettings>;
  resetUvw?: boolean;
}

interface RightInspectorProps {
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

  onSelectWallVertex: (vertex: SelectedWallVertex | null) => void;
  onToggleLinkedVertexJoint: () => void;
  onToggleAutoStraightenVertices: () => void;
  onStraightenSelectedWall: () => void;

  onWallLengthInputChange: (val: string) => void;
  onWallAngleInputChange: (val: string) => void;
  onWallThicknessInputChange: (val: string) => void;
  onCommitSelectedWallChanges: () => void;
  onUpdateWallSurface: (wallId: string, patch: Partial<WallSegment>) => void;
  onDeleteSelectedWall: () => void;

  onSelectOpening: (openingId: string | null) => void;
  onAddOpeningToSelectedWall: (type: OpeningType) => void;
  onUpdateOpening: (
    wallId: string,
    openingId: string,
    patch: Partial<WallOpening>
  ) => void;
  onDeleteOpening: (wallId: string, openingId: string) => void;

  onSelectStandaloneOpening: (openingId: string | null) => void;
  onUpdateStandaloneOpening: (
    openingId: string,
    patch: Partial<StandaloneOpening>
  ) => void;
  onDuplicateStandaloneOpening: (openingId: string) => void;
  onDeleteStandaloneOpening: (openingId: string) => void;

  onSelectFloorZone: (zoneId: string | null) => void;
  onSelectFloorVertex: (vertex: SelectedFloorVertex | null) => void;
  onUpdateFloorZoneVertex: (
    zoneId: string,
    pointIndex: number,
    nextPoint: [number, number]
  ) => void;
  onInsertFloorZoneVertexAfter: (zoneId: string, pointIndex: number) => void;
  onDeleteFloorZoneVertex: (zoneId: string, pointIndex: number) => void;
  onUpdateFloorZone: (zoneId: string, patch: Partial<FloorZone>) => void;
  onDuplicateFloorZone: (zoneId: string) => void;
  onDeleteFloorZone: (zoneId: string) => void;

  onUpdateRoomCeiling: (patch: Partial<RoomConfig>) => void;

  onSelectInstance: (instanceId: string | null) => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ) => void;
  onRotateYBy: (degrees: number) => void;
  onToggleMirrorSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;

  onUpdateObjectMaterial: (
    instanceId: string,
    slotKey: string,
    override: MaterialOverride | null
  ) => void;
  onSaveObjectAsPreset: (obj: SceneObject, baseModel: CatalogModel) => void;
  onEditParametricObject: (obj: SceneObject) => void;
}

const DEFAULT_WALL_HEX = '#f1f5f9';

const SWING_OPTIONS: { value: DoorSwing; label: string }[] = [
  { value: 'left-in', label: 'Лява навътре' },
  { value: 'right-in', label: 'Дясна навътре' },
  { value: 'left-out', label: 'Лява навън' },
  { value: 'right-out', label: 'Дясна навън' },
];

const WALL_SIDE_LABELS: Record<'front' | 'back' | 'start' | 'end', string> = {
  front: 'Лице',
  back: 'Гръб',
  start: 'Челна (начало)',
  end: 'Челна (край)',
};

function describeSurface(room: RoomConfig, target: SurfaceTarget): string {
  if (target.kind === 'floor') {
    const zone = (room.floorZones ?? []).find((z) => z.id === target.zoneId);
    return zone ? `Под: ${zone.name}` : 'Подова зона';
  }
  const idx = room.walls.findIndex((w) => w.id === target.wallId);
  const label = idx >= 0 ? `Стена #${idx + 1}` : 'Стена';
  return `${label} (${WALL_SIDE_LABELS[target.side]})`;
}

function formatDimValue(meters: number, unit: DisplayUnit): string {
  if (unit === 'cm') {
    return String(Math.round(meters * 1000) / 10);
  }
  return String(Math.round(meters * 1000) / 1000);
}

function parseDimToMeters(rawValue: string, unit: DisplayUnit): number | null {
  const num = parseFloat(rawValue.replace(',', '.'));
  if (Number.isNaN(num)) return null;
  return unit === 'cm' ? num / 100 : num;
}

export function RightInspector({
  room,
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
  onUpdateWallSurface,
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
  onEditParametricObject,
}: RightInspectorProps) {
  const [batchColor, setBatchColor] = useState('#e2e8f0');
  const [batchTextureId, setBatchTextureId] = useState('');
  const [batchTileHeightCm, setBatchTileHeightCm] = useState('');
  const [batchRoughness, setBatchRoughness] = useState(0.55);
  const [batchMetalness, setBatchMetalness] = useState(0.05);

  const [uvwTileW, setUvwTileW] = useState(100);
  const [uvwTileH, setUvwTileH] = useState(100);
  const [uvwOffsetX, setUvwOffsetX] = useState(0);
  const [uvwOffsetY, setUvwOffsetY] = useState(0);
  const [uvwRotationDeg, setUvwRotationDeg] = useState(0);

  const [isSceneOverviewOpen, setIsSceneOverviewOpen] = useState(false);

  const hasFloorInSelection = selectedSurfaces.some((s) => s.kind === 'floor');
  const hasWallInSelection = selectedSurfaces.some((s) => s.kind === 'wall');

  const firstSurface = selectedSurfaces[0] ?? null;
  const firstSurfaceUvw: CustomUvwSettings | undefined = (() => {
    if (!firstSurface) return undefined;
    if (firstSurface.kind === 'wall') {
      const w = room.walls.find((item) => item.id === firstSurface.wallId);
      if (!w) return undefined;
      if (firstSurface.side === 'front') return w.frontUvw;
      if (firstSurface.side === 'back') return w.backUvw;
      if (firstSurface.side === 'start') return w.startUvw;
      return w.endUvw;
    }
    const z = (room.floorZones ?? []).find(
      (item) => item.id === firstSurface.zoneId
    );
    return z?.uvw;
  })();

  const activeTileW = firstSurfaceUvw?.tileWidthCm ?? uvwTileW;
  const activeTileH = firstSurfaceUvw?.tileHeightCm ?? uvwTileH;
  const activeOffsetX = firstSurfaceUvw?.offsetXCm ?? uvwOffsetX;
  const activeOffsetY = firstSurfaceUvw?.offsetYCm ?? uvwOffsetY;
  const activeRotationDeg = firstSurfaceUvw?.rotationDeg ?? uvwRotationDeg;

  const surfaceTextures = textures.filter((t) => t.category !== 'furniture');
  const allActiveTextures = textures;

  const updatePositionAxis = (axisIndex: 0 | 1 | 2, rawValue: string) => {
    if (!selectedObject) return;
    const meters = parseDimToMeters(rawValue, unit);
    if (meters === null) return;
    const nextPos: [number, number, number] = [...selectedObject.position];
    nextPos[axisIndex] = meters;
    onTransformChange(
      selectedObject.instanceId,
      nextPos,
      selectedObject.rotation,
      selectedObject.scale
    );
  };

  const updateRotationAxis = (axisIndex: 0 | 1 | 2, rawDeg: string) => {
    if (!selectedObject) return;
    const deg = parseFloat(rawDeg);
    if (Number.isNaN(deg)) return;
    const nextRot: [number, number, number] = [...selectedObject.rotation];
    nextRot[axisIndex] = (deg * Math.PI) / 180;
    onTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      nextRot,
      selectedObject.scale
    );
  };

  const updateDimensionCm = (
    axisIndex: 0 | 1 | 2,
    baseCm: number,
    rawCm: string
  ) => {
    if (!selectedObject || baseCm <= 0) return;
    const targetCm = parseFloat(rawCm);
    if (Number.isNaN(targetCm) || targetCm <= 1) return;
    const nextScale: [number, number, number] = [...selectedObject.scale];
    nextScale[axisIndex] = targetCm / baseCm;
    onTransformChange(
      selectedObject.instanceId,
      selectedObject.position,
      selectedObject.rotation,
      nextScale
    );
  };

  const selectedWallOpening =
    selectedWall?.openings?.find((o) => o.id === selectedOpeningId) ?? null;

  const effectiveMaterialSlots: DiscoveredMaterialSlot[] = (() => {
    if (!selectedObject) return [];
    const map = new Map<string, DiscoveredMaterialSlot>();

    for (const s of discoveredMaterialSlots) {
      map.set(s.key, s);
    }

    if (selectedObject.materialOverrides) {
      for (const [key, ov] of Object.entries(selectedObject.materialOverrides)) {
        if (!map.has(key)) {
          map.set(key, {
            key,
            label: key,
            defaultColorHex: ov.color || '#cbd5e1',
          });
        }
      }
    }

    return Array.from(map.values());
  })();

  const hasActiveSelection = Boolean(
    selectedSurfaces.length > 0 ||
      selectedWall ||
      selectedStandaloneOpening ||
      selectedFloorZone ||
      selectedObject
  );

  return (
    <aside className="sidebar-right">
      <div className="panel-header">
        <span>Свойства и инспектор</span>
        <span style={{ fontSize: '10px', color: '#64748b' }}>
          {unit.toUpperCase()}
        </span>
      </div>

      <div className="panel-body">
        {/* 1. ИЗБРАНИ ПОВЪРХНОСТИ (СТЕНИ / ПОДОВИ ЗОНИ) */}
        {selectedSurfaces.length > 0 && (
          <div
            style={{
              backgroundColor: '#0c2320',
              border: '1px solid #10b981',
              borderRadius: '6px',
              padding: '10px',
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
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#34d399',
                  textTransform: 'uppercase',
                }}
              >
                Избрани повърхности ({selectedSurfaces.length})
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 6px', fontSize: '10px' }}
                onClick={onClearSurfaceSelection}
              >
                Изчисти
              </button>
            </div>

            <div
              style={{
                fontSize: '10px',
                color: '#a7f3d0',
                lineHeight: 1.4,
                maxHeight: '54px',
                overflowY: 'auto',
              }}
            >
              {selectedSurfaces
                .map((s) => describeSurface(room, s))
                .join(' • ')}
            </div>

            <div className="axis-field">
              <span>Цвят на повърхността</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="color"
                  value={batchColor}
                  onChange={(e) => {
                    setBatchColor(e.target.value);
                    onApplySurfaceBatch({ color: e.target.value });
                  }}
                  style={{ width: '40px', height: '28px' }}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, fontSize: '11px' }}
                  onClick={() => onApplySurfaceBatch({ color: batchColor })}
                >
                  Приложи цвят
                </button>
              </div>
            </div>

            <div className="axis-field">
              <span>PBR Текстура / Материал</span>
              <select
                className="input-control"
                value={batchTextureId}
                onChange={(e) => {
                  const val = e.target.value;
                  setBatchTextureId(val);
                  onApplySurfaceBatch({ textureId: val || null });
                }}
              >
                <option value="">-- Без текстура (само цвят) --</option>
                {surfaceTextures.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Math.round(t.tileWidthM * 100)}×
                    {Math.round(t.tileHeightM * 100)} см)
                  </option>
                ))}
              </select>
            </div>

            {/* UVW КОНТРОЛЕР ЗА ТЕКСТУРИ */}
            <div
              style={{
                backgroundColor: '#061715',
                border: '1px solid #065f46',
                borderRadius: '5px',
                padding: '8px',
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
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#6ee7b7',
                    textTransform: 'uppercase',
                  }}
                >
                  UVW Мапинг (Размер / Позиция / Завъртане)
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '1px 5px', fontSize: '9px' }}
                  onClick={() => {
                    setUvwTileW(100);
                    setUvwTileH(100);
                    setUvwOffsetX(0);
                    setUvwOffsetY(0);
                    setUvwRotationDeg(0);
                    onApplySurfaceBatch({ resetUvw: true });
                  }}
                >
                  Нулирай UV
                </button>
              </div>

              <div
                className="axis-grid"
                style={{ gridTemplateColumns: '1fr 1fr' }}
              >
                <div className="axis-field">
                  <span>Шир. плочка (см)</span>
                  <input
                    type="number"
                    step={5}
                    min={5}
                    max={1000}
                    className="input-control"
                    value={activeTileW}
                    onChange={(e) => {
                      const v = Math.max(5, parseFloat(e.target.value) || 100);
                      setUvwTileW(v);
                      onApplySurfaceBatch({ uvwPatch: { tileWidthCm: v } });
                    }}
                  />
                </div>
                <div className="axis-field">
                  <span>Вис. плочка (см)</span>
                  <input
                    type="number"
                    step={5}
                    min={5}
                    max={1000}
                    className="input-control"
                    value={activeTileH}
                    onChange={(e) => {
                      const v = Math.max(5, parseFloat(e.target.value) || 100);
                      setUvwTileH(v);
                      onApplySurfaceBatch({ uvwPatch: { tileHeightCm: v } });
                    }}
                  />
                </div>
              </div>

              <div
                className="axis-grid"
                style={{ gridTemplateColumns: '1fr 1fr' }}
              >
                <div className="axis-field">
                  <span>Изместване X (см)</span>
                  <input
                    type="number"
                    step={5}
                    className="input-control"
                    value={activeOffsetX}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setUvwOffsetX(v);
                      onApplySurfaceBatch({ uvwPatch: { offsetXCm: v } });
                    }}
                  />
                </div>
                <div className="axis-field">
                  <span>Изместване Y (см)</span>
                  <input
                    type="number"
                    step={5}
                    className="input-control"
                    value={activeOffsetY}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setUvwOffsetY(v);
                      onApplySurfaceBatch({ uvwPatch: { offsetYCm: v } });
                    }}
                  />
                </div>
              </div>

              <div className="axis-field">
                <span>Завъртане на текстурата ({activeRotationDeg}°)</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={5}
                    style={{ flex: 1 }}
                    value={activeRotationDeg}
                    onChange={(e) => {
                      const deg = parseFloat(e.target.value) || 0;
                      setUvwRotationDeg(deg);
                      onApplySurfaceBatch({ uvwPatch: { rotationDeg: deg } });
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => {
                      const next = (activeRotationDeg + 90) % 360;
                      setUvwRotationDeg(next);
                      onApplySurfaceBatch({ uvwPatch: { rotationDeg: next } });
                    }}
                  >
                    +90°
                  </button>
                </div>
              </div>
            </div>

            {hasWallInSelection && (
              <div className="axis-field">
                <span>Височина на облицовката на стената (см)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    placeholder="Цялата стена"
                    className="input-control"
                    value={batchTileHeightCm}
                    onChange={(e) => setBatchTileHeightCm(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: '11px' }}
                    onClick={() => {
                      const cm = parseFloat(batchTileHeightCm);
                      onApplySurfaceBatch({
                        tileHeightM:
                          !Number.isNaN(cm) && cm > 0 ? cm / 100 : undefined,
                      });
                    }}
                  >
                    Задай
                  </button>
                </div>
              </div>
            )}

            {hasFloorInSelection && (
              <div
                className="axis-grid"
                style={{ gridTemplateColumns: '1fr 1fr' }}
              >
                <div className="axis-field">
                  <span>Гланц / Roughness ({batchRoughness.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={batchRoughness}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setBatchRoughness(val);
                      onApplySurfaceBatch({ roughness: val });
                    }}
                  />
                </div>
                <div className="axis-field">
                  <span>Металност ({batchMetalness.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={batchMetalness}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setBatchMetalness(val);
                      onApplySurfaceBatch({ metalness: val });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. ИЗБРАНА СТЕНА */}
        {selectedWall && (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                className="section-label"
                style={{ color: '#38bdf8', marginBottom: 0 }}
              >
                Стена ({getWallLengthM(selectedWall)} м /{' '}
                {getWallAngleDeg(selectedWall)}°)
              </span>
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '2px 6px', fontSize: '10px' }}
                onClick={onDeleteSelectedWall}
              >
                Изтрий
              </button>
            </div>

            <div className="axis-grid">
              <div className="axis-field">
                <span>Дължина (м)</span>
                <input
                  type="number"
                  step={0.05}
                  className="input-control"
                  value={wallLengthInput}
                  onChange={(e) => onWallLengthInputChange(e.target.value)}
                />
              </div>
              <div className="axis-field">
                <span>Ъгъл (°)</span>
                <input
                  type="number"
                  step={1}
                  className="input-control"
                  value={wallAngleInput}
                  onChange={(e) => onWallAngleInputChange(e.target.value)}
                />
              </div>
              <div className="axis-field">
                <span>Дебелина (м)</span>
                <input
                  type="number"
                  step={0.01}
                  className="input-control"
                  value={wallThicknessInput}
                  onChange={(e) => onWallThicknessInputChange(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-active"
                style={{ flex: 1, fontSize: '11px' }}
                onClick={onCommitSelectedWallChanges}
              >
                Приложи размери
              </button>
              <button
                type="button"
                className="btn"
                style={{ fontSize: '11px' }}
                onClick={onStraightenSelectedWall}
                title="Подравни на 0°, 90°, 180° или 270°"
              >
                Изправи 90°
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                borderTop: '1px solid #1e293b',
                paddingTop: '6px',
              }}
            >
              <div className="section-label" style={{ marginBottom: 0 }}>
                Върхове (ъгли) на стената
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`btn ${
                    selectedWallVertex?.wallId === selectedWall.id &&
                    selectedWallVertex.endKey === 'start'
                      ? 'btn-active'
                      : ''
                  }`}
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={() =>
                    onSelectWallVertex({
                      wallId: selectedWall.id,
                      endKey: 'start',
                    })
                  }
                >
                  Начало ({selectedWall.start[0].toFixed(2)},{' '}
                  {selectedWall.start[1].toFixed(2)})
                </button>
                <button
                  type="button"
                  className={`btn ${
                    selectedWallVertex?.wallId === selectedWall.id &&
                    selectedWallVertex.endKey === 'end'
                      ? 'btn-active'
                      : ''
                  }`}
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={() =>
                    onSelectWallVertex({
                      wallId: selectedWall.id,
                      endKey: 'end',
                    })
                  }
                >
                  Край ({selectedWall.end[0].toFixed(2)},{' '}
                  {selectedWall.end[1].toFixed(2)})
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                <button
                  type="button"
                  className={`btn ${linkedVertexJoint ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={onToggleLinkedVertexJoint}
                >
                  {linkedVertexJoint ? '🔗 Свързани ъгли' : '⛓️‍💥 Свободен край'}
                </button>
                <button
                  type="button"
                  className={`btn ${autoStraightenVertices ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={onToggleAutoStraightenVertices}
                >
                  {autoStraightenVertices ? '📐 Магнит 90°' : '📐 Свободен ъгъл'}
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                borderTop: '1px solid #1e293b',
                paddingTop: '6px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span className="section-label" style={{ marginBottom: 0 }}>
                  Отвори в стената ({selectedWall.openings?.length ?? 0})
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => onAddOpeningToSelectedWall('door')}
                  >
                    + Врата
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => onAddOpeningToSelectedWall('window')}
                  >
                    + Прозорец
                  </button>
                </div>
              </div>

              {(selectedWall.openings ?? []).map((op) => (
                <div
                  key={op.id}
                  onClick={() => onSelectOpening(op.id)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    backgroundColor:
                      selectedOpeningId === op.id ? '#1e293b' : '#020617',
                    border: `1px solid ${
                      selectedOpeningId === op.id ? '#38bdf8' : '#1e293b'
                    }`,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                  }}
                >
                  <span>
                    {op.type === 'door' ? '🚪 Врата' : '🪟 Прозорец'} (
                    {op.widthM}×{op.heightM} м)
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '0 5px', fontSize: '10px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteOpening(selectedWall.id, op.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {selectedWallOpening && (
                <div
                  style={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div className="axis-grid">
                    <div className="axis-field">
                      <span>От начало (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        className="input-control"
                        value={selectedWallOpening.offsetFromStartM}
                        onChange={(e) =>
                          onUpdateOpening(
                            selectedWall.id,
                            selectedWallOpening.id,
                            {
                              offsetFromStartM: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            }
                          )
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Ширина (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        className="input-control"
                        value={selectedWallOpening.widthM}
                        onChange={(e) =>
                          onUpdateOpening(
                            selectedWall.id,
                            selectedWallOpening.id,
                            {
                              widthM: Math.max(
                                0.3,
                                parseFloat(e.target.value) || 0.9
                              ),
                            }
                          )
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Височина (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        className="input-control"
                        value={selectedWallOpening.heightM}
                        onChange={(e) =>
                          onUpdateOpening(
                            selectedWall.id,
                            selectedWallOpening.id,
                            {
                              heightM: Math.max(
                                0.3,
                                parseFloat(e.target.value) || 2.05
                              ),
                            }
                          )
                        }
                      />
                    </div>
                  </div>

                  <div
                    className="axis-grid"
                    style={{ gridTemplateColumns: '1fr 1fr' }}
                  >
                    <div className="axis-field">
                      <span>Подпрозоречен праг (м)</span>
                      <input
                        type="number"
                        step={0.05}
                        className="input-control"
                        value={selectedWallOpening.sillHeightM}
                        onChange={(e) =>
                          onUpdateOpening(
                            selectedWall.id,
                            selectedWallOpening.id,
                            {
                              sillHeightM: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            }
                          )
                        }
                      />
                    </div>
                    {selectedWallOpening.type === 'door' && (
                      <div className="axis-field">
                        <span>Отваряне на крилото</span>
                        <select
                          className="input-control"
                          value={selectedWallOpening.swing ?? 'left-in'}
                          onChange={(e) =>
                            onUpdateOpening(
                              selectedWall.id,
                              selectedWallOpening.id,
                              { swing: e.target.value as DoorSwing }
                            )
                          }
                        >
                          {SWING_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '6px',
                borderTop: '1px solid #1e293b',
                paddingTop: '6px',
              }}
            >
              <button
                type="button"
                className="btn"
                style={{ flex: 1, fontSize: '10px' }}
                onClick={() =>
                  onUpdateWallSurface(selectedWall.id, {
                    frontColor: DEFAULT_WALL_HEX,
                    frontTextureId: undefined,
                    frontTileHeightM: undefined,
                    frontUvw: undefined,
                    backColor: DEFAULT_WALL_HEX,
                    backTextureId: undefined,
                    backTileHeightM: undefined,
                    backUvw: undefined,
                    startColor: DEFAULT_WALL_HEX,
                    startTextureId: undefined,
                    startTileHeightM: undefined,
                    startUvw: undefined,
                    endColor: DEFAULT_WALL_HEX,
                    endTextureId: undefined,
                    endTileHeightM: undefined,
                    endUvw: undefined,
                  })
                }
              >
                Нулирай облицовките на стената
              </button>
            </div>
          </div>
        )}

        {/* 3. САМОСТОЯТЕЛНА ВРАТА / ПРОЗОРЕЦ */}
        {selectedStandaloneOpening && (
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #a855f7',
              borderRadius: '6px',
              padding: '10px',
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
                className="section-label"
                style={{ color: '#c084fc', marginBottom: 0 }}
              >
                {selectedStandaloneOpening.type === 'door'
                  ? 'Самостоятелна врата'
                  : 'Самостоятелен прозорец'}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() =>
                    onDuplicateStandaloneOpening(selectedStandaloneOpening.id)
                  }
                >
                  Копие
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() =>
                    onDeleteStandaloneOpening(selectedStandaloneOpening.id)
                  }
                >
                  Изтрий
                </button>
              </div>
            </div>

            <div className="axis-grid">
              <div className="axis-field">
                <span>Ширина (м)</span>
                <input
                  type="number"
                  step={0.05}
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
                  className="input-control"
                  value={selectedStandaloneOpening.heightM}
                  onChange={(e) =>
                    onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                      heightM: Math.max(0.3, parseFloat(e.target.value) || 2.05),
                    })
                  }
                />
              </div>
              <div className="axis-field">
                <span>Завъртане (°)</span>
                <input
                  type="number"
                  step={5}
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

            {selectedStandaloneOpening.type === 'door' && (
              <div className="axis-field">
                <span>Посока на отваряне</span>
                <select
                  className="input-control"
                  value={selectedStandaloneOpening.swing ?? 'left-in'}
                  onChange={(e) =>
                    onUpdateStandaloneOpening(selectedStandaloneOpening.id, {
                      swing: e.target.value as DoorSwing,
                    })
                  }
                >
                  {SWING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* 4. ИЗБРАНА ПОДОВА ЗОНА И РЕДАКЦИЯ НА ЪГЛИ */}
        {selectedFloorZone && (
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              padding: '10px',
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
                className="section-label"
                style={{ color: '#fbbf24', marginBottom: 0 }}
              >
                Подова зона ({selectedFloorZone.points.length} ъгъла)
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() => onDuplicateFloorZone(selectedFloorZone.id)}
                >
                  Копие
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() => onDeleteFloorZone(selectedFloorZone.id)}
                >
                  Изтрий
                </button>
              </div>
            </div>

            <div className="axis-field">
              <span>Име на зоната (напр. Хол, Кухня, Коридор)</span>
              <input
                type="text"
                className="input-control"
                value={selectedFloorZone.name}
                onChange={(e) =>
                  onUpdateFloorZone(selectedFloorZone.id, {
                    name: e.target.value,
                  })
                }
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                borderTop: '1px solid #1e293b',
                paddingTop: '6px',
              }}
            >
              <div className="section-label" style={{ marginBottom: 0 }}>
                Ъгли на подовата зона (влачи в 3D/2D или редактирай)
              </div>

              {selectedFloorZone.points.map((pt, idx) => {
                const isSelectedPt =
                  selectedFloorVertex?.zoneId === selectedFloorZone.id &&
                  selectedFloorVertex.pointIndex === idx;

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: isSelectedPt ? '#1e293b' : '#020617',
                      border: `1px solid ${
                        isSelectedPt ? '#fbbf24' : '#1e293b'
                      }`,
                      borderRadius: '4px',
                      padding: '4px 6px',
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      style={{
                        padding: '1px 5px',
                        fontSize: '10px',
                        color: isSelectedPt ? '#fbbf24' : '#94a3b8',
                      }}
                      onClick={() =>
                        onSelectFloorVertex({
                          zoneId: selectedFloorZone.id,
                          pointIndex: idx,
                        })
                      }
                    >
                      #{idx + 1}
                    </button>

                    <input
                      type="number"
                      step={0.05}
                      className="input-control"
                      style={{ padding: '2px 4px', fontSize: '11px' }}
                      value={Number(pt[0].toFixed(3))}
                      onChange={(e) => {
                        const nx = parseFloat(e.target.value);
                        if (!Number.isNaN(nx)) {
                          onUpdateFloorZoneVertex(selectedFloorZone.id, idx, [
                            nx,
                            pt[1],
                          ]);
                        }
                      }}
                    />

                    <input
                      type="number"
                      step={0.05}
                      className="input-control"
                      style={{ padding: '2px 4px', fontSize: '11px' }}
                      value={Number(pt[1].toFixed(3))}
                      onChange={(e) => {
                        const nz = parseFloat(e.target.value);
                        if (!Number.isNaN(nz)) {
                          onUpdateFloorZoneVertex(selectedFloorZone.id, idx, [
                            pt[0],
                            nz,
                          ]);
                        }
                      }}
                    />

                    <button
                      type="button"
                      className="btn"
                      title="Добави нов ъгъл след този"
                      style={{ padding: '1px 5px', fontSize: '10px' }}
                      onClick={() =>
                        onInsertFloorZoneVertexAfter(selectedFloorZone.id, idx)
                      }
                    >
                      +
                    </button>

                    {selectedFloorZone.points.length > 3 && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        title="Премахни този ъгъл"
                        style={{ padding: '1px 5px', fontSize: '10px' }}
                        onClick={() =>
                          onDeleteFloorZoneVertex(selectedFloorZone.id, idx)
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. ИЗБРАНА МЕБЕЛ / 3D ОБЕКТ */}
        {selectedObject && (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                className="section-label"
                style={{
                  color: '#38bdf8',
                  marginBottom: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedObject.name || selectedModel?.name || 'Обект'}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={onDuplicateSelected}
                >
                  Копие
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={onDeleteSelected}
                >
                  Изтрий
                </button>
              </div>
            </div>

            {selectedObject.parametric && (
              <button
                type="button"
                className="btn btn-active"
                style={{ width: '100%', fontSize: '11px' }}
                onClick={() => onEditParametricObject(selectedObject)}
              >
                ✎ Редактирай модулите / размерите
              </button>
            )}

            <div className="axis-field">
              <span>Позиция ({unit})</span>
              <div className="axis-grid">
                {(['X', 'Y', 'Z'] as const).map((label, idx) => (
                  <div key={label} className="axis-field">
                    <span>{label}</span>
                    <input
                      type="number"
                      step={unit === 'cm' ? 1 : 0.01}
                      className="input-control"
                      value={formatDimValue(
                        selectedObject.position[idx as 0 | 1 | 2],
                        unit
                      )}
                      onChange={(e) =>
                        updatePositionAxis(idx as 0 | 1 | 2, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="axis-field">
              <span>Завъртане (°)</span>
              <div className="axis-grid">
                {(['X', 'Y', 'Z'] as const).map((label, idx) => (
                  <div key={label} className="axis-field">
                    <span>{label}</span>
                    <input
                      type="number"
                      step={5}
                      className="input-control"
                      value={Math.round(
                        (selectedObject.rotation[idx as 0 | 1 | 2] * 180) /
                          Math.PI
                      )}
                      onChange={(e) =>
                        updateRotationAxis(idx as 0 | 1 | 2, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={() => onRotateYBy(-90)}
                >
                  -90°
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={() => onRotateYBy(90)}
                >
                  +90°
                </button>
                <button
                  type="button"
                  className={`btn ${selectedObject.mirrored ? 'btn-active' : ''}`}
                  style={{ flex: 1, fontSize: '10px' }}
                  onClick={onToggleMirrorSelected}
                >
                  Огледало
                </button>
              </div>
            </div>

            {selectedModel && (
              <div className="axis-field">
                <span>Габаритни размери (см)</span>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Шир.</span>
                    <input
                      type="number"
                      className="input-control"
                      value={Math.round(
                        selectedModel.dimensionsCm.width *
                          selectedObject.scale[0]
                      )}
                      onChange={(e) =>
                        updateDimensionCm(
                          0,
                          selectedModel.dimensionsCm.width,
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Вис.</span>
                    <input
                      type="number"
                      className="input-control"
                      value={Math.round(
                        selectedModel.dimensionsCm.height *
                          selectedObject.scale[1]
                      )}
                      onChange={(e) =>
                        updateDimensionCm(
                          1,
                          selectedModel.dimensionsCm.height,
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Дълб.</span>
                    <input
                      type="number"
                      className="input-control"
                      value={Math.round(
                        selectedModel.dimensionsCm.depth *
                          selectedObject.scale[2]
                      )}
                      onChange={(e) =>
                        updateDimensionCm(
                          2,
                          selectedModel.dimensionsCm.depth,
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* МАТЕРИАЛИ ПО ЧАСТИ НА МЕБЕЛТА */}
            {effectiveMaterialSlots.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderTop: '1px solid #1e293b',
                  paddingTop: '8px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 0 }}>
                  Материали на мебелта ({effectiveMaterialSlots.length})
                </div>

                {effectiveMaterialSlots.map((slot) => {
                  const currentOverride =
                    selectedObject.materialOverrides?.[slot.key];
                  const fallbackHex = slot.defaultColorHex || '#cbd5e1';
                  const currentColor = currentOverride?.color ?? fallbackHex;
                  const currentTextureId = currentOverride?.textureId ?? '';

                  return (
                    <div
                      key={slot.key}
                      style={{
                        backgroundColor: '#020617',
                        border: '1px solid #1e293b',
                        borderRadius: '4px',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '11px',
                          color: '#e2e8f0',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{slot.label}</span>
                        {currentOverride && (
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '1px 5px', fontSize: '9px' }}
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

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) =>
                            onUpdateObjectMaterial(
                              selectedObject.instanceId,
                              slot.key,
                              {
                                ...(currentOverride ?? {}),
                                color: e.target.value,
                              }
                            )
                          }
                          style={{ width: '36px', height: '26px' }}
                        />
                        <select
                          className="input-control"
                          style={{ flex: 1, fontSize: '11px' }}
                          value={currentTextureId}
                          onChange={(e) => {
                            const tid = e.target.value;
                            onUpdateObjectMaterial(
                              selectedObject.instanceId,
                              slot.key,
                              {
                                ...(currentOverride ?? {}),
                                color: currentColor,
                                textureId: tid || undefined,
                              }
                            );
                          }}
                        >
                          <option value="">-- Без текстура --</option>
                          {allActiveTextures.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedModel && (
              <button
                type="button"
                className="btn"
                style={{ fontSize: '11px', marginTop: '2px' }}
                onClick={() =>
                  onSaveObjectAsPreset(selectedObject, selectedModel)
                }
              >
                ★ Запази в „Мои варианти“
              </button>
            )}
          </div>
        )}

        {/* ПРАЗЕН ИНСПЕКТОР + ПЪЛЕН СПИСЪК НА ЕЛЕМЕНТИТЕ В СЦЕНАТА (ПО ЖЕЛАНИЕ) */}
        {!hasActiveSelection && (
          <div className="empty-state-box">
            Кликни върху стена, под, врата или мебел в 3D/2D изгледа, за да видиш и редактираш свойствата му.
          </div>
        )}

        <div
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setIsSceneOverviewOpen((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              padding: 0,
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            <span>
              Списък на елементите в сцената ({sceneObjects.length} мебели,{' '}
              {(room.floorZones ?? []).length} зони)
            </span>
            <span>{isSceneOverviewOpen ? '▾' : '▸'}</span>
          </button>

          {isSceneOverviewOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingTop: '6px',
                borderTop: '1px solid #1e293b',
              }}
            >
              {/* Таван */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#cbd5e1',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(room.showCeiling)}
                    onChange={(e) =>
                      onUpdateRoomCeiling({ showCeiling: e.target.checked })
                    }
                  />
                  Покажи тавана
                </label>
                <input
                  type="color"
                  value={room.ceilingColor ?? '#f8fafc'}
                  onChange={(e) =>
                    onUpdateRoomCeiling({ ceilingColor: e.target.value })
                  }
                  style={{ width: '32px', height: '22px' }}
                />
              </div>

              {/* Подови зони */}
              {(room.floorZones ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Подови зони:
                  </span>
                  {(room.floorZones ?? []).map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      className={`btn ${selectedFloorZone?.id === z.id ? 'btn-active' : ''}`}
                      style={{ textAlign: 'left', fontSize: '11px', padding: '4px 6px' }}
                      onClick={() => onSelectFloorZone(z.id)}
                    >
                      ⬡ {z.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Самостоятелни врати/прозорци */}
              {(room.openings ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Самостоятелни отвори:
                  </span>
                  {(room.openings ?? []).map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      className={`btn ${selectedStandaloneOpening?.id === op.id ? 'btn-active' : ''}`}
                      style={{ textAlign: 'left', fontSize: '11px', padding: '4px 6px' }}
                      onClick={() => onSelectStandaloneOpening(op.id)}
                    >
                      {op.type === 'door' ? '🚪 Врата' : '🪟 Прозорец'} (
                      {op.widthM}×{op.heightM} м)
                    </button>
                  ))}
                </div>
              )}

              {/* Мебели */}
              {sceneObjects.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Мебели в сцената:
                  </span>
                  {sceneObjects.map((obj) => (
                    <button
                      key={obj.instanceId}
                      type="button"
                      className={`btn ${selectedObject?.instanceId === obj.instanceId ? 'btn-active' : ''}`}
                      style={{ textAlign: 'left', fontSize: '11px', padding: '4px 6px' }}
                      onClick={() => onSelectInstance(obj.instanceId)}
                    >
                      🪑 {obj.name || 'Обект'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}