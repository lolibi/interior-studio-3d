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
  KitchenLayoutMode,
  KitchenModuleType,
  KitchenSpec,
  ParametricFurnitureConfig,
  ParametricFurnitureKind,
  SceneObject,
  WardrobeDoorOpeningType,
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
      setCustomName(
        `Кухня ${kitchen.widthCm} см (${kitchen.moduleCount} модула)`
      );
    }
  }, [
    kind,
    wardrobe.widthCm,
    wardrobe.heightCm,
    wardrobe.doorCount,
    kitchen.widthCm,
    kitchen.moduleCount,
    nameTouched,
  ]);

  const activeConfig: ParametricFurnitureConfig =
    kind === 'wardrobe'
      ? { kind: 'wardrobe', wardrobe }
      : { kind: 'kitchen', kitchen };

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
            {/* Име на изделието */}
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
                {/* Бързи шаблони гардероб */}
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
                          hasTopBridge: false,
                          bottomDrawersCount: 2,
                        }))
                      }
                    >
                      Трикрилен + чекмеджета 180 см
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

                {/* Габаритни размери */}
                <div>
                  <div className="section-label">Размери (см)</div>
                  <div
                    className="axis-grid"
                    style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
                  >
                    <div className="axis-field">
                      <span>Ширина</span>
                      <input
                        type="number"
                        min={50}
                        max={450}
                        step={5}
                        className="input-control"
                        value={wardrobe.widthCm}
                        onChange={(e) =>
                          setWardrobe((p) => ({
                            ...p,
                            widthCm: Math.max(45, Number(e.target.value) || 120),
                          }))
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Височина</span>
                      <input
                        type="number"
                        min={120}
                        max={320}
                        step={5}
                        className="input-control"
                        value={wardrobe.heightCm}
                        onChange={(e) =>
                          setWardrobe((p) => ({
                            ...p,
                            heightCm: Math.max(100, Number(e.target.value) || 220),
                          }))
                        }
                      />
                    </div>
                    <div className="axis-field">
                      <span>Дълбочина</span>
                      <input
                        type="number"
                        min={35}
                        max={80}
                        step={2}
                        className="input-control"
                        value={wardrobe.depthCm}
                        onChange={(e) =>
                          setWardrobe((p) => ({
                            ...p,
                            depthCm: Math.max(35, Number(e.target.value) || 60),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Крила, врати и секции */}
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
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          doorCount: Number(e.target.value),
                        }))
                      }
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

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Външни чекмеджета долу (0–4)</span>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      disabled={wardrobe.doorType === 'sliding'}
                      className="input-control"
                      value={wardrobe.bottomDrawersCount}
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          bottomDrawersCount: Math.max(
                            0,
                            Math.min(4, Number(e.target.value) || 0)
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Цокъл (см)</span>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="input-control"
                      value={wardrobe.plinthHeightCm}
                      onChange={(e) =>
                        setWardrobe((p) => ({
                          ...p,
                          plinthHeightCm: Math.max(0, Number(e.target.value) || 0),
                        }))
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

                {/* Стил на фронтовете и дръжките */}
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

                {/* Цветове и текстури */}
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

                  {/* Врати */}
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

                  {/* Корпус */}
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

                  {/* Дръжки */}
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
                {/* КУХНЕНСКИ КОНФИГУРАТОР */}
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
                          layoutMode: 'base-and-wall',
                          widthCm: 300,
                          moduleCount: 5,
                          modulePattern: [
                            'drawers',
                            'oven',
                            'doors',
                            'sink',
                            'doors',
                          ],
                        }))
                      }
                    >
                      Голяма кухня 300 см
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
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
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() =>
                        setKitchen((p) => ({
                          ...p,
                          layoutMode: 'tall-column',
                          widthCm: 120,
                          moduleCount: 2,
                        }))
                      }
                    >
                      Колонни шкафове 120 см
                    </button>
                  </div>
                </div>

                {/* Тип ред и размери */}
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
                    <span>Брой модули ({kitchen.moduleCount})</span>
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

                <div
                  className="axis-grid"
                  style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
                >
                  <div className="axis-field">
                    <span>Обща ширина (см)</span>
                    <input
                      type="number"
                      min={40}
                      max={600}
                      step={5}
                      className="input-control"
                      value={kitchen.widthCm}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          widthCm: Math.max(40, Number(e.target.value) || 240),
                        }))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Височина плот (см)</span>
                    <input
                      type="number"
                      min={70}
                      max={105}
                      step={1}
                      className="input-control"
                      value={kitchen.baseHeightCm}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          baseHeightCm: Math.max(70, Number(e.target.value) || 86),
                        }))
                      }
                    />
                  </div>
                  <div className="axis-field">
                    <span>Дълбочина (см)</span>
                    <input
                      type="number"
                      min={45}
                      max={120}
                      step={2}
                      className="input-control"
                      value={kitchen.depthCm}
                      onChange={(e) =>
                        setKitchen((p) => ({
                          ...p,
                          depthCm: Math.max(45, Number(e.target.value) || 60),
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Разпределение по модули */}
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

                {/* Стил на фронтове и дръжки */}
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

                {/* Цветове на кухнята: Вратички, Плот, Термогръб, Дръжки */}
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

                  {/* Вратички */}
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

                  {/* Термоплот */}
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

                  {/* Термогръб */}
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

                  {/* Дръжки / Gola профил */}
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

        {/* ДОЛНА ЛЕНТА С БУТОН ЗА ДОБАВЯНЕ */}
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