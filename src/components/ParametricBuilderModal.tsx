import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import {
  DEFAULT_KITCHEN_SPEC,
  DEFAULT_WARDROBE_SPEC,
} from '../types/editor';
import type {
  CatalogTexture,
  FrontStyleType,
  HandleStyleType,
  KitchenHoodType,
  KitchenLayoutMode,
  KitchenModuleType,
  KitchenShapeType,
  KitchenSpec,
  ParametricFurnitureConfig,
  ParametricFurnitureKind,
  SceneObject,
  WardrobeDoorOpeningType,
  WardrobeInteriorLayout,
  WardrobeSpec,
} from '../types/editor';
import { ParametricFurnitureMesh } from './ParametricFurnitureMesh';

interface ParametricBuilderModalProps {
  textures: CatalogTexture[];
  initialConfig?: ParametricFurnitureConfig;
  initialName?: string;
  isEditingExisting?: boolean;
  onClose: () => void;
  onConfirm: (name: string, config: ParametricFurnitureConfig) => void;
}

function NumericInput({
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}) {
  const [raw, setRaw] = useState<string>(String(value));

  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = (text: string) => {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed) || text.trim() === '') {
      setRaw(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, Math.round(parsed)));
    setRaw(String(clamped));
    onChange(clamped);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className="input-control"
      value={raw}
      onChange={(e) => {
        const nextText = e.target.value;
        setRaw(nextText);
        const parsed = Number(nextText);
        if (nextText.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          onChange(Math.round(parsed));
        }
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const QUICK_COLORS = [
  '#f8fafc',
  '#e2e8f0',
  '#cbd5e1',
  '#d6c7b2',
  '#b08968',
  '#7f5539',
  '#334155',
  '#1e293b',
  '#0f172a',
  '#3f6212',
  '#1e3a8a',
];

const MODULE_TYPE_LABELS: Record<KitchenModuleType, string> = {
  doors: 'Врати',
  drawers: 'Чекмеджета',
  oven: 'Фурна + котлони',
  sink: 'Мивка',
};

export function ParametricBuilderModal({
  textures,
  initialConfig,
  initialName,
  isEditingExisting = false,
  onClose,
  onConfirm,
}: ParametricBuilderModalProps) {
  const [kind, setKind] = useState<ParametricFurnitureKind>(
    initialConfig?.kind ?? 'wardrobe'
  );
  const [customName, setCustomName] = useState<string>(
    initialName ??
      (initialConfig?.kind === 'kitchen'
        ? 'Кухненски ред 240 см'
        : 'Гардероб 180 см')
  );
  const [nameTouched, setNameTouched] = useState<boolean>(Boolean(initialName));

  const [wardrobe, setWardrobe] = useState<WardrobeSpec>(() => ({
    ...DEFAULT_WARDROBE_SPEC,
    ...(initialConfig?.wardrobe ?? {}),
  }));

  const [kitchen, setKitchen] = useState<KitchenSpec>(() => ({
    ...DEFAULT_KITCHEN_SPEC,
    ...(initialConfig?.kitchen ?? {}),
  }));

  useEffect(() => {
    if (nameTouched) return;
    if (kind === 'wardrobe') {
      setCustomName(
        `Гардероб ${wardrobe.widthCm}×${wardrobe.heightCm} см (${wardrobe.doorCount} крила)`
      );
    } else {
      const shapeSuffix =
        kitchen.shape === 'l-left' || kitchen.shape === 'l-right'
          ? ` Г-образна (${kitchen.widthCm}×${kitchen.wingWidthCm ?? 160} см)`
          : ` ${kitchen.widthCm} см`;
      setCustomName(`Кухня${shapeSuffix}`);
    }
  }, [
    kind,
    wardrobe.widthCm,
    wardrobe.heightCm,
    wardrobe.doorCount,
    kitchen.shape,
    kitchen.widthCm,
    kitchen.wingWidthCm,
    nameTouched,
  ]);

  const activeConfig: ParametricFurnitureConfig =
    kind === 'wardrobe'
      ? { kind: 'wardrobe', wardrobe }
      : { kind: 'kitchen', kitchen };

  const isDoorsOpen =
    kind === 'wardrobe'
      ? Boolean(wardrobe.doorsOpen)
      : Boolean(kitchen.doorsOpen);

  const toggleDoorsOpen = () => {
    if (kind === 'wardrobe') {
      setWardrobe((p) => ({ ...p, doorsOpen: !p.doorsOpen }));
    } else {
      setKitchen((p) => ({ ...p, doorsOpen: !p.doorsOpen }));
    }
  };

  const previewDummyObject: SceneObject = {
    instanceId: 'preview-parametric',
    modelId: 'parametric-custom',
    position: [0, -1.0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    parametric: activeConfig,
  };

  const updateKitchenModuleAt = (idx: number, nextType: KitchenModuleType) => {
    setKitchen((prev) => {
      const nextPattern = Array.from({ length: prev.moduleCount }).map(
        (_, i) => prev.modulePattern[i % prev.modulePattern.length] ?? 'doors'
      );
      nextPattern[idx] = nextType;
      return { ...prev, modulePattern: nextPattern };
    });
  };

  const toggleMirrorDoor = (doorIdx: number) => {
    setWardrobe((prev) => {
      const current = new Set(prev.mirrorDoorIndices ?? []);
      if (current.has(doorIdx)) {
        current.delete(doorIdx);
      } else {
        current.add(doorIdx);
      }
      return {
        ...prev,
        mirrorDoorIndices: Array.from(current).sort((a, b) => a - b),
      };
    });
  };

  const isLShape = kitchen.shape === 'l-left' || kitchen.shape === 'l-right';
  const minWingCm = Math.max(100, kitchen.depthCm + 40);
  const isLedOn =
    kitchen.hasUnderCabinetLed !== false && (kitchen.ledIntensity ?? 100) > 0;
  const currentLedPercent = Math.max(10, kitchen.ledIntensity ?? 100);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(1140px, 96vw)',
          height: 'min(780px, 92vh)',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* ЗАГЛАВНА ЛЕНТА */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
              ✨ Параметричен конфигуратор на мебели
            </span>

            {!isEditingExisting && (
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                <button
                  type="button"
                  className={`btn ${kind === 'wardrobe' ? 'btn-active' : ''}`}
                  onClick={() => setKind('wardrobe')}
                >
                  🚪 Гардероб
                </button>
                <button
                  type="button"
                  className={`btn ${kind === 'kitchen' ? 'btn-active' : ''}`}
                  onClick={() => setKind('kitchen')}
                >
                  🍳 Кухненски модули / Ред
                </button>
              </div>
            )}
          </div>

          <button type="button" className="btn" onClick={onClose}>
            ✕ Затвори
          </button>
        </div>

        {/* ТЯЛО: ЛЯВО 3D PREVIEW + ДЯСНО КОНТРОЛИ */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1.15fr 1fr',
            overflow: 'hidden',
          }}
        >
          {/* 3D LIVE PREVIEW */}
          <div
            style={{
              position: 'relative',
              backgroundColor: '#090d16',
              borderRight: '1px solid #1e293b',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
              }}
            >
              <button
                type="button"
                className={`btn ${isDoorsOpen ? 'btn-active' : ''}`}
                style={{ fontSize: '11.5px', padding: '5px 10px' }}
                onClick={toggleDoorsOpen}
              >
                {isDoorsOpen ? '🚪 Затвори вратите' : '🔓 Отвори вратите (вътрешност)'}
              </button>
            </div>

            <Canvas shadows dpr={[1, 2]} camera={{ position: [2.4, 1.4, 3.2], fov: 42 }}>
              <color attach="background" args={['#090d16']} />
              <ambientLight intensity={0.7} />
              <directionalLight position={[4, 6, 5]} intensity={1.3} castShadow />
              <Environment resolution={128}>
                <Lightformer
                  form="rect"
                  intensity={1.5}
                  position={[0, 5, 2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[8, 8, 1]}
                />
              </Environment>

              <ParametricFurnitureMesh
                item={previewDummyObject}
                config={activeConfig}
                textures={textures}
                isSelected={false}
                transformTool="translate"
                onSelect={() => {}}
                onTransformChange={() => {}}
                onDraggingChange={() => {}}
              />

              <OrbitControls enablePan enableZoom enableRotate />
            </Canvas>

            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pointerEvents: 'none',
                fontSize: '11px',
                color: '#94a3b8',
              }}
            >
              <span>Влачи с мишката за завъртане на 360° • Скрол за Zoom</span>
              <span
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid #334155',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  color: '#38bdf8',
                  fontWeight: 600,
                }}
              >
                {kind === 'wardrobe'
                  ? `${wardrobe.widthCm} × ${wardrobe.heightCm} × ${wardrobe.depthCm} см`
                  : isLShape
                    ? `${kitchen.widthCm} × ${kitchen.wingWidthCm ?? 160} см (Г-образна)`
                    : `${kitchen.widthCm} × ${
                        kitchen.layoutMode === 'tall-column'
                          ? kitchen.tallCabinetHeightCm
                          : kitchen.baseHeightCm
                      } × ${kitchen.depthCm} см`}
              </span>
            </div>
          </div>

          {/* ПАНЕЛ С НАСТРОЙКИ */}
          <div
            style={{
              padding: '14px 16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div className="axis-field">
              <span>Име в проекта</span>
              <input
                type="text"
                className="input-control"
                value={customName}
                onChange={(e) => {
                  setNameTouched(true);
                  setCustomName(e.target.value);
                }}
              />
            </div>

            {kind === 'wardrobe' ? (
              <>
                <div>
                  <div className="section-label">Бързи шаблони гардероб</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setWardrobe((p) => ({
                          ...p,
                          widthCm: 100,
                          heightCm: 210,
                          depthCm: 58,
                          doorCount: 2,
                          doorType: 'hinged',
                          mirrorDoorIndices: [],
                          hasTopBridge: false,
                          bottomDrawersCount: 0,
                        }))
                      }
                    >
                      Двукрилен 100 см
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setWardrobe((p) => ({
                          ...p,
                          widthCm: 180,
                          heightCm: 220,
                          depthCm: 60,
                          doorCount: 3,
                          doorType: 'hinged',
                          mirrorDoorIndices: [1],
                          hasTopBridge: false,
                          bottomDrawersCount: 2,
                        }))
                      }
                    >
                      Трикрилен с огледало 180 см
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setWardrobe((p) => ({
                          ...p,
                          widthCm: 240,
                          heightCm: 255,
                          depthCm: 62,
                          doorCount: 2,
                          doorType: 'sliding',
                          mirrorDoorIndices: [0],
                          hasTopBridge: true,
                          topBridgeHeightCm: 45,
                          bottomDrawersCount: 0,
                        }))
                      }
                    >
                      Плъзгащ с надстройка 240 см
                    </button>
                  </div>
                </div>

                <div>
                  <div className="section-label">Размери (см)</div>
                  <div
                    className="axis-grid"
                    style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
                  >
                    <div className="axis-field">
                      <span>Ширина</span>
                      <NumericInput
                        value={wardrobe.widthCm}
                        min={45}
                        max={450}
                        step={5}
                        onChange={(v) => setWardrobe((p) => ({ ...p, widthCm: v }))}
                      />
                    </div>
                    <div className="axis-field">
                      <span>Височина</span>
                      <NumericInput
                        value={wardrobe.heightCm}
                        min={100}
                        max={320}
                        step={5}
                        onChange={(v) => setWardrobe((p) => ({ ...p, heightCm: v }))}
                      />
                    </div>
                    <div className="axis-field">
                      <span>Дълбочина</span>
                      <NumericInput
                        value={wardrobe.depthCm}
                        min={35}
                        max={85}
                        step={2}
                        onChange={(v) => setWardrobe((p) => ({ ...p, depthCm: v }))}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Брой крила ({wardrobe.doorCount})</span>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={wardrobe.doorCount}
                      onChange={(e) => {
                        const count = Number(e.target.value);
                        setWardrobe((p) => ({
                          ...p,
                          doorCount: count,
                          mirrorDoorIndices: (p.mirrorDoorIndices ?? []).filter(
                            (idx) => idx < count
                          ),
                        }));
                      }}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Механизъм на вратите</span>
                    <select
                      className="select-control"
                      value={wardrobe.doorType}
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          doorType: e.target.value as WardrobeDoorOpeningType,
                        }))
                      }
                    >
                      <option value="hinged">Отваряеми на панти</option>
                      <option value="sliding">Плъзгащи се врати</option>
                    </select>
                  </div>
                </div>

                <div className="axis-field">
                  <span>Вътрешно разпределение (лостове и рафтове)</span>
                  <select
                    className="select-control"
                    value={wardrobe.interiorLayout ?? 'mixed'}
                    onChange={(e) =>
                      setWardrobe((p) => ({
                        ...p,
                        interiorLayout: e.target.value as WardrobeInteriorLayout,
                      }))
                    }
                  >
                    <option value="mixed">Комбинирано (лостове + рафтове)</option>
                    <option value="rail-and-shelves">Лост + горен рафт навсякъде</option>
                    <option value="shelves-only">Само рафтове (ракла / бельо)</option>
                  </select>
                </div>

                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '8px 10px',
                    borderRadius: '8px',
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
                    <span className="section-label" style={{ marginBottom: 0 }}>
                      🪞 Огледало на избрани врати
                    </span>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => {
                        const allSelected =
                          (wardrobe.mirrorDoorIndices ?? []).length ===
                          wardrobe.doorCount;
                        setWardrobe((p) => ({
                          ...p,
                          mirrorDoorIndices: allSelected
                            ? []
                            : Array.from({ length: p.doorCount }, (_, i) => i),
                        }));
                      }}
                    >
                      {(wardrobe.mirrorDoorIndices ?? []).length ===
                      wardrobe.doorCount
                        ? 'Премахни всички'
                        : 'Всички огледални'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Array.from({ length: wardrobe.doorCount }).map((_, idx) => {
                      const active = (wardrobe.mirrorDoorIndices ?? []).includes(
                        idx
                      );
                      return (
                        <button
                          key={`mir-door-${idx}`}
                          type="button"
                          className={`btn ${active ? 'btn-active' : ''}`}
                          style={{ fontSize: '11px', padding: '4px 9px' }}
                          onClick={() => toggleMirrorDoor(idx)}
                        >
                          {active ? '🪞' : '🚪'} Крило {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Външни чекмеджета долу (0–4)</span>
                    <NumericInput
                      value={wardrobe.bottomDrawersCount}
                      min={0}
                      max={4}
                      disabled={wardrobe.doorType === 'sliding'}
                      onChange={(v) =>
                        setWardrobe((p) => ({ ...p, bottomDrawersCount: v }))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Цокъл (см)</span>
                    <NumericInput
                      value={wardrobe.plinthHeightCm}
                      min={0}
                      max={15}
                      onChange={(v) =>
                        setWardrobe((p) => ({ ...p, plinthHeightCm: v }))
                      }
                    />
                  </div>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={wardrobe.hasTopBridge}
                    onChange={(e) =>
                      setWardrobe((p) => ({
                        ...p,
                        hasTopBridge: e.target.checked,
                      }))
                    }
                  />
                  <span>Горна надстройка (антресол {wardrobe.topBridgeHeightCm} см)</span>
                </label>

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Профил на вратичките</span>
                    <select
                      className="select-control"
                      value={wardrobe.frontStyle}
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          frontStyle: e.target.value as FrontStyleType,
                        }))
                      }
                    >
                      <option value="flat">Гладък МДФ / ПДЧ</option>
                      <option value="shaker">Фрезован кант (Рамка)</option>
                      <option value="gola">Без дръжки (Push / Gola)</option>
                    </select>
                  </div>
                  <div className="axis-field">
                    <span>Вид дръжки</span>
                    <select
                      className="select-control"
                      value={wardrobe.handleStyle}
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          handleStyle: e.target.value as HandleStyleType,
                        }))
                      }
                    >
                      <option value="vertical">Вертикални дръжки</option>
                      <option value="horizontal">Хоризонтални дръжки</option>
                      <option value="knob">Кръгли (копчета)</option>
                      <option value="none">Без дръжки</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '10px',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Цветове и материали
                  </div>

                  <div className="axis-field">
                    <span>Вратички / Чела</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {QUICK_COLORS.map((hex) => (
                        <button
                          key={`wf-${hex}`}
                          type="button"
                          onClick={() =>
                            setWardrobe((p) => ({
                              ...p,
                              frontColor: hex,
                              frontTextureId: null,
                            }))
                          }
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: hex,
                            border:
                              wardrobe.frontColor === hex && !wardrobe.frontTextureId
                                ? '2px solid #38bdf8'
                                : '1px solid #475569',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                    {textures.length > 0 && (
                      <select
                        className="select-control"
                        style={{ marginTop: '4px' }}
                        value={wardrobe.frontTextureId ?? ''}
                        onChange={(e) =>
                          setWardrobe((p) => ({
                            ...p,
                            frontTextureId: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">-- Само цвят (без текстура) --</option>
                        {textures.map((t) => (
                          <option key={t.id} value={t.id}>
                            Текстура: {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="axis-field">
                    <span>Корпус (страници и вътрешност)</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {QUICK_COLORS.map((hex) => (
                        <button
                          key={`wc-${hex}`}
                          type="button"
                          onClick={() =>
                            setWardrobe((p) => ({
                              ...p,
                              corpusColor: hex,
                              corpusTextureId: null,
                            }))
                          }
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: hex,
                            border:
                              wardrobe.corpusColor === hex &&
                              !wardrobe.corpusTextureId
                                ? '2px solid #38bdf8'
                                : '1px solid #475569',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="axis-field">
                    <span>Цвят на дръжките</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { label: 'Черен мат', hex: '#0f172a' },
                        { label: 'Хром / Инокс', hex: '#cbd5e1' },
                        { label: 'Злато / Месинг', hex: '#d97706' },
                        { label: 'Бял', hex: '#f8fafc' },
                      ].map((h) => (
                        <button
                          key={h.hex}
                          type="button"
                          className={`btn ${wardrobe.handleColor === h.hex ? 'btn-active' : ''}`}
                          style={{ fontSize: '10.5px', padding: '3px 7px' }}
                          onClick={() =>
                            setWardrobe((p) => ({ ...p, handleColor: h.hex }))
                          }
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="section-label">Бързи конфигурации кухня</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
                          shape: 'straight',
                          layoutMode: 'base-and-wall',
                          widthCm: 240,
                          moduleCount: 4,
                          modulePattern: ['doors', 'drawers', 'oven', 'sink'],
                        }))
                      }
                    >
                      Права кухня 240 см
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
                          shape: 'l-left',
                          layoutMode: 'base-and-wall',
                          widthCm: 240,
                          wingWidthCm: 160,
                          wingModuleCount: 2,
                          moduleCount: 4,
                          modulePattern: ['doors', 'drawers', 'oven', 'sink'],
                        }))
                      }
                    >
                      Г-образна (ляво крило) 240×160
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
                          shape: 'l-right',
                          layoutMode: 'base-and-wall',
                          widthCm: 240,
                          wingWidthCm: 160,
                          wingModuleCount: 2,
                          moduleCount: 4,
                          modulePattern: ['sink', 'oven', 'drawers', 'doors'],
                        }))
                      }
                    >
                      Г-образна (дясно крило) 240×160
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
                          shape: 'straight',
                          layoutMode: 'base-only',
                          widthCm: 180,
                          depthCm: 80,
                          moduleCount: 3,
                          modulePattern: ['drawers', 'doors', 'drawers'],
                        }))
                      }
                    >
                      Кухненски остров 180 см
                    </button>
                  </div>
                </div>

                {kitchen.layoutMode !== 'tall-column' && (
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div className="axis-field">
                      <span>Форма на кухнята</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[
                          { id: 'straight', label: '▬ Права (I)' },
                          { id: 'l-left', label: '┗ Г-образна (Ляво крило)' },
                          { id: 'l-right', label: '┛ Г-образна (Дясно крило)' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`btn ${
                              (kitchen.shape ?? 'straight') === s.id
                                ? 'btn-active'
                                : ''
                            }`}
                            style={{ flex: 1, fontSize: '10.5px', padding: '5px 6px' }}
                            onClick={() =>
                              setKitchen((p) => ({
                                ...p,
                                shape: s.id as KitchenShapeType,
                              }))
                            }
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {isLShape && (
                      <div
                        className="axis-grid"
                        style={{ gridTemplateColumns: '1.2fr 0.8fr' }}
                      >
                        <div className="axis-field">
                          <span>Дължина Г-крило ({kitchen.wingWidthCm ?? 160} см)</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="range"
                              min={minWingCm}
                              max={450}
                              step={5}
                              style={{ flex: 1 }}
                              value={Math.max(minWingCm, kitchen.wingWidthCm ?? 160)}
                              onChange={(e) =>
                                setKitchen((p) => ({
                                  ...p,
                                  wingWidthCm: Number(e.target.value),
                                }))
                              }
                            />
                            <div style={{ width: '74px' }}>
                              <NumericInput
                                value={kitchen.wingWidthCm ?? 160}
                                min={minWingCm}
                                max={450}
                                step={5}
                                onChange={(v) =>
                                  setKitchen((p) => ({ ...p, wingWidthCm: v }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                        <div className="axis-field">
                          <span>Модули в Г-крилото</span>
                          <NumericInput
                            value={kitchen.wingModuleCount ?? 2}
                            min={1}
                            max={6}
                            onChange={(v) =>
                              setKitchen((p) => ({ ...p, wingModuleCount: v }))
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Конфигурация</span>
                    <select
                      className="select-control"
                      value={kitchen.layoutMode}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          layoutMode: e.target.value as KitchenLayoutMode,
                        }))
                      }
                    >
                      <option value="base-and-wall">Долен + Горен ред с гръб</option>
                      <option value="base-only">Само долен ред с плот / остров</option>
                      <option value="wall-only">Само горни шкафове</option>
                      <option value="tall-column">Колонен шкаф (висок)</option>
                    </select>
                  </div>
                  <div className="axis-field">
                    <span>Брой модули основен ред ({kitchen.moduleCount})</span>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={kitchen.moduleCount}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          moduleCount: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                {kitchen.layoutMode === 'tall-column' ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={kitchen.tallColumnAppliances ?? true}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          tallColumnAppliances: e.target.checked,
                        }))
                      }
                    />
                    <span>Вградена фурна и микровълнова на нивото на очите</span>
                  </label>
                ) : (
                  (kitchen.layoutMode === 'base-and-wall' ||
                    kitchen.layoutMode === 'wall-only') && (
                    <>
                      {/* 1. ОТДЕЛЕН DIV ЗА АСПИРАТОРА */}
                      <div
                        style={{
                          backgroundColor: '#1e293b',
                          padding: '8px 10px',
                          borderRadius: '8px',
                        }}
                      >
                        <div className="axis-field">
                          <span>Аспиратор над котлоните</span>
                          <select
                            className="select-control"
                            value={kitchen.hoodType ?? 'chimney'}
                            onChange={(e) =>
                              setKitchen((p) => ({
                                ...p,
                                hoodType: e.target.value as KitchenHoodType,
                              }))
                            }
                          >
                            <option value="chimney">Декоративен комин (светъл инокс)</option>
                            <option value="integrated">Вграден телескопичен (подравнен)</option>
                            <option value="none">Без аспиратор</option>
                          </select>
                        </div>
                      </div>

                      {/* 2. ОТДЕЛЕН DIV ЗА LED ЛЕНТАТА С ON/OFF И СИЛА */}
                      <div
                        style={{
                          backgroundColor: '#1e293b',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: '12px', color: '#e2e8f0' }}>
                            💡 LED лента под горните шкафове
                          </span>
                          <button
                            type="button"
                            className={`btn ${isLedOn ? 'btn-active' : ''}`}
                            style={{
                              minWidth: '58px',
                              padding: '3px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                            onClick={() =>
                              setKitchen((p) => ({
                                ...p,
                                hasUnderCabinetLed: !isLedOn,
                                ledIntensity: !isLedOn
                                  ? Math.max(10, p.ledIntensity ?? 100)
                                  : p.ledIntensity ?? 100,
                              }))
                            }
                          >
                            {isLedOn ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        {isLedOn && (
                          <div className="axis-field">
                            <span>
                              Сила на светене:{' '}
                              <strong style={{ color: '#fde68a' }}>
                                {currentLedPercent}%
                              </strong>
                            </span>
                            <input
                              type="range"
                              min={10}
                              max={200}
                              step={10}
                              value={currentLedPercent}
                              onChange={(e) =>
                                setKitchen((p) => ({
                                  ...p,
                                  hasUnderCabinetLed: true,
                                  ledIntensity: Number(e.target.value),
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )
                )}

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Ширина основен ред (см)</span>
                    <NumericInput
                      value={kitchen.widthCm}
                      min={40}
                      max={600}
                      step={5}
                      onChange={(v) => setKitchen((p) => ({ ...p, widthCm: v }))}
                    />
                  </div>
                  <div className="axis-field">
                    <span>Височина плот (см)</span>
                    <NumericInput
                      value={kitchen.baseHeightCm}
                      min={70}
                      max={105}
                      onChange={(v) =>
                        setKitchen((p) => ({ ...p, baseHeightCm: v }))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Дълбочина (см)</span>
                    <NumericInput
                      value={kitchen.depthCm}
                      min={45}
                      max={120}
                      step={2}
                      onChange={(v) => setKitchen((p) => ({ ...p, depthCm: v }))}
                    />
                  </div>
                </div>

                {(kitchen.layoutMode === 'base-and-wall' ||
                  kitchen.layoutMode === 'base-only') && (
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div className="section-label" style={{ marginBottom: 0 }}>
                      Подредба на долните модули (по ~
                      {Math.round(kitchen.widthCm / kitchen.moduleCount)} см)
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                      }}
                    >
                      {Array.from({ length: kitchen.moduleCount }).map((_, idx) => {
                        const val =
                          kitchen.modulePattern[
                            idx % kitchen.modulePattern.length
                          ] ?? 'doors';
                        return (
                          <div
                            key={`km-slot-${idx}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              color: '#cbd5e1',
                            }}
                          >
                            <span style={{ minWidth: '52px' }}>Модул {idx + 1}:</span>
                            <select
                              className="select-control"
                              style={{ padding: '3px 6px', fontSize: '11px' }}
                              value={val}
                              onChange={(e) =>
                                updateKitchenModuleAt(
                                  idx,
                                  e.target.value as KitchenModuleType
                                )
                              }
                            >
                              {(
                                Object.keys(
                                  MODULE_TYPE_LABELS
                                ) as KitchenModuleType[]
                              ).map((mt) => (
                                <option key={mt} value={mt}>
                                  {MODULE_TYPE_LABELS[mt]}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Стил на вратичките</span>
                    <select
                      className="select-control"
                      value={kitchen.frontStyle}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          frontStyle: e.target.value as FrontStyleType,
                        }))
                      }
                    >
                      <option value="flat">Гладък МДФ</option>
                      <option value="shaker">Фрезована рамка (Класик)</option>
                      <option value="gola">Gola профил (без дръжки)</option>
                    </select>
                  </div>
                  <div className="axis-field">
                    <span>Дръжки</span>
                    <select
                      className="select-control"
                      value={kitchen.handleStyle}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          handleStyle: e.target.value as HandleStyleType,
                        }))
                      }
                    >
                      <option value="horizontal">Хоризонтални</option>
                      <option value="vertical">Вертикални</option>
                      <option value="knob">Копчета</option>
                      <option value="none">Без дръжки</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '10px',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 0 }}>
                    Цветове и материали на кухнята
                  </div>

                  <div className="axis-field">
                    <span>Вратички / Чела</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {QUICK_COLORS.map((hex) => (
                        <button
                          key={`kf-${hex}`}
                          type="button"
                          onClick={() =>
                            setKitchen((p) => ({
                              ...p,
                              frontColor: hex,
                              frontTextureId: null,
                            }))
                          }
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: hex,
                            border:
                              kitchen.frontColor === hex && !kitchen.frontTextureId
                                ? '2px solid #38bdf8'
                                : '1px solid #475569',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                    {textures.length > 0 && (
                      <select
                        className="select-control"
                        style={{ marginTop: '4px' }}
                        value={kitchen.frontTextureId ?? ''}
                        onChange={(e) =>
                          setKitchen((p) => ({
                            ...p,
                            frontTextureId: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">-- Само цвят (без текстура) --</option>
                        {textures.map((t) => (
                          <option key={t.id} value={t.id}>
                            Текстура: {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="axis-field">
                    <span>Термоплот</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {QUICK_COLORS.map((hex) => (
                        <button
                          key={`kt-${hex}`}
                          type="button"
                          onClick={() =>
                            setKitchen((p) => ({
                              ...p,
                              countertopColor: hex,
                              countertopTextureId: null,
                            }))
                          }
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: hex,
                            border:
                              kitchen.countertopColor === hex &&
                              !kitchen.countertopTextureId
                                ? '2px solid #38bdf8'
                                : '1px solid #475569',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                    {textures.length > 0 && (
                      <select
                        className="select-control"
                        style={{ marginTop: '4px' }}
                        value={kitchen.countertopTextureId ?? ''}
                        onChange={(e) =>
                          setKitchen((p) => ({
                            ...p,
                            countertopTextureId: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">-- Само цвят на плота --</option>
                        {textures.map((t) => (
                          <option key={t.id} value={t.id}>
                            Текстура плот: {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="axis-field">
                    <span>Термогръб (между долни и горни шкафове)</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {QUICK_COLORS.map((hex) => (
                        <button
                          key={`kb-${hex}`}
                          type="button"
                          onClick={() =>
                            setKitchen((p) => ({
                              ...p,
                              backsplashColor: hex,
                              backsplashTextureId: null,
                            }))
                          }
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: hex,
                            border:
                              kitchen.backsplashColor === hex &&
                              !kitchen.backsplashTextureId
                                ? '2px solid #38bdf8'
                                : '1px solid #475569',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                    {textures.length > 0 && (
                      <select
                        className="select-control"
                        style={{ marginTop: '4px' }}
                        value={kitchen.backsplashTextureId ?? ''}
                        onChange={(e) =>
                          setKitchen((p) => ({
                            ...p,
                            backsplashTextureId: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">-- Само цвят на гърба --</option>
                        {textures.map((t) => (
                          <option key={t.id} value={t.id}>
                            Текстура гръб: {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="axis-field">
                    <span>Цвят на дръжки / Gola профил</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { label: 'Черен мат', hex: '#0f172a' },
                        { label: 'Инокс / Алуминий', hex: '#cbd5e1' },
                        { label: 'Злато', hex: '#d97706' },
                        { label: 'Бял', hex: '#f8fafc' },
                      ].map((h) => (
                        <button
                          key={h.hex}
                          type="button"
                          className={`btn ${kitchen.handleColor === h.hex ? 'btn-active' : ''}`}
                          style={{ fontSize: '10.5px', padding: '3px 7px' }}
                          onClick={() =>
                            setKitchen((p) => ({ ...p, handleColor: h.hex }))
                          }
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Отказ
          </button>
          <button
            type="button"
            className="btn btn-active"
            style={{ padding: '8px 18px', fontWeight: 700 }}
            onClick={() => onConfirm(customName.trim() || 'Мебел', activeConfig)}
          >
            {isEditingExisting
              ? '✓ Запази промените по мебела'
              : '✓ Постави в 3D стаята'}
          </button>
        </div>
      </div>
    </div>
  );
}