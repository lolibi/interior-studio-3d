import React from 'react';
import type {
  CatalogTexture,
  PlacedObject,
  RoomConfig,
} from '../types/editor';

export interface ControlsPanelProps {
  selectedObject: PlacedObject | null;
  room: RoomConfig;
  textures: CatalogTexture[];
  categoryLabels: Record<string, string>;
  onUpdateObject: (id: string, patch: Partial<PlacedObject>) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onUpdateRoom: (patch: Partial<RoomConfig>) => void;
}

const panelStyle: React.CSSProperties = {
  width: '280px',
  minWidth: '280px',
  backgroundColor: '#0b1120',
  borderLeft: '1px solid #1e293b',
  padding: '14px',
  color: '#e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#94a3b8',
  display: 'block',
  marginBottom: '4px',
};

const grid3Style: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '6px',
};

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  selectedObject,
  room,
  textures,
  categoryLabels,
  onUpdateObject,
  onDeleteObject,
  onDuplicateObject,
  onUpdateRoom,
}) => {
  const radToDeg = (rad: number) => Math.round((rad * 180) / Math.PI);
  const degToRad = (deg: number) => (deg * Math.PI) / 180;

  return (
    <aside style={panelStyle}>
      {/* ИНСПЕКТОР НА ИЗБРАН ОБЕКТ */}
      {selectedObject ? (
        <div style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                {selectedObject.name}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {categoryLabels[selectedObject.category] || selectedObject.category}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 7px', fontSize: '11px' }}
                title="Дублирай (Ctrl+D)"
                onClick={() => onDuplicateObject(selectedObject.id)}
              >
                ⧉
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 7px', fontSize: '11px', color: '#fda4af' }}
                title="Изтрий (Del)"
                onClick={() => onDeleteObject(selectedObject.id)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Наименование */}
          <div>
            <label style={labelStyle}>Име в проекта</label>
            <input
              type="text"
              className="input-control"
              value={selectedObject.name}
              onChange={(e) =>
                onUpdateObject(selectedObject.id, { name: e.target.value })
              }
            />
          </div>

          {/* Позиция X, Y, Z (м) */}
          <div>
            <label style={labelStyle}>Позиция X / Y / Z (м)</label>
            <div style={grid3Style}>
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <div key={axis}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{axis}</span>
                  <input
                    type="number"
                    step="0.05"
                    className="input-control"
                    value={Number(selectedObject.position[idx].toFixed(2))}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      const nextPos: [number, number, number] = [
                        ...selectedObject.position,
                      ];
                      nextPos[idx] = val;
                      onUpdateObject(selectedObject.id, { position: nextPos });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Завъртане (градуси) */}
          <div>
            <label style={labelStyle}>Завъртане Y (градуси)</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="number"
                step="15"
                className="input-control"
                value={radToDeg(selectedObject.rotation[1])}
                onChange={(e) => {
                  const deg = Number(e.target.value) || 0;
                  onUpdateObject(selectedObject.id, {
                    rotation: [
                      selectedObject.rotation[0],
                      degToRad(deg),
                      selectedObject.rotation[2],
                    ],
                  });
                }}
              />
              <button
                type="button"
                className="btn"
                style={{ padding: '5px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                onClick={() =>
                  onUpdateObject(selectedObject.id, {
                    rotation: [
                      selectedObject.rotation[0],
                      selectedObject.rotation[1] + Math.PI / 2,
                      selectedObject.rotation[2],
                    ],
                  })
                }
              >
                +90°
              </button>
            </div>
          </div>

          {/* Реални габарити (см) чрез мащабиране */}
          <div>
            <label style={labelStyle}>
              Габарити Ш × В × Д (см) ·{' '}
              <span style={{ color: '#64748b' }}>{selectedObject.scaleMode}</span>
            </label>
            <div style={grid3Style}>
              {(
                [
                  { label: 'Ш', key: 'width', idx: 0 },
                  { label: 'В', key: 'height', idx: 1 },
                  { label: 'Д', key: 'depth', idx: 2 },
                ] as const
              ).map(({ label, key, idx }) => {
                const baseCm = selectedObject.dimensionsCm[key] || 100;
                const currentCm = Math.round(baseCm * selectedObject.scale[idx]);
                const disabled = selectedObject.scaleMode === 'fixed';
                return (
                  <div key={key}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>{label}</span>
                    <input
                      type="number"
                      min={5}
                      disabled={disabled}
                      className="input-control"
                      value={currentCm}
                      onChange={(e) => {
                        const targetCm = Math.max(5, Number(e.target.value) || baseCm);
                        const ratio = targetCm / baseCm;
                        const nextScale: [number, number, number] = [
                          ...selectedObject.scale,
                        ];
                        nextScale[idx] = Number(ratio.toFixed(4));
                        onUpdateObject(selectedObject.id, { scale: nextScale });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Цвят / Текстура на обекта */}
          <div>
            <label style={labelStyle}>Цвят или текстура на обекта</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="color"
                value={selectedObject.colorOverride || '#94a3b8'}
                onChange={(e) =>
                  onUpdateObject(selectedObject.id, {
                    colorOverride: e.target.value,
                    textureOverrideId: undefined,
                  })
                }
                style={{
                  width: '34px',
                  height: '30px',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <select
                className="input-control"
                style={{ flex: 1 }}
                value={selectedObject.textureOverrideId || ''}
                onChange={(e) =>
                  onUpdateObject(selectedObject.id, {
                    textureOverrideId: e.target.value || undefined,
                    colorOverride: e.target.value
                      ? undefined
                      : selectedObject.colorOverride,
                  })
                }
              >
                <option value="">Оригинален материал</option>
                {textures.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, color: '#94a3b8', fontSize: '12px' }}>
          <strong style={{ color: '#e2e8f0', fontSize: '13px' }}>
            Свойства на обект
          </strong>
          <span>
            Кликнете върху 3D модел в сцената, за да промените позиция, завъртане,
            размери или материал.
          </span>
        </div>
      )}

      {/* НАСТРОЙКИ НА ПОМЕЩЕНИЕТО */}
      <div style={cardStyle}>
        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
          Помещение (Стая)
        </div>

        <div style={grid3Style}>
          <div>
            <label style={labelStyle}>Ширина (м)</label>
            <input
              type="number"
              step="0.1"
              min="1.5"
              max="30"
              className="input-control"
              value={room.widthM}
              onChange={(e) =>
                onUpdateRoom({ widthM: Math.max(1.5, Number(e.target.value) || 4) })
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Дълбочина (м)</label>
            <input
              type="number"
              step="0.1"
              min="1.5"
              max="30"
              className="input-control"
              value={room.depthM}
              onChange={(e) =>
                onUpdateRoom({ depthM: Math.max(1.5, Number(e.target.value) || 4) })
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Височина (м)</label>
            <input
              type="number"
              step="0.1"
              min="2.0"
              max="6.0"
              className="input-control"
              value={room.heightM}
              onChange={(e) =>
                onUpdateRoom({
                  heightM: Math.max(2.0, Number(e.target.value) || 2.7),
                })
              }
            />
          </div>
        </div>

        {/* Под: цвят и текстура */}
        <div>
          <label style={labelStyle}>Под — цвят / текстура</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="color"
              value={room.floorColor}
              onChange={(e) =>
                onUpdateRoom({
                  floorColor: e.target.value,
                  floorTextureId: undefined,
                  floorTextureUrl: undefined,
                })
              }
              style={{
                width: '34px',
                height: '30px',
                border: '1px solid #334155',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <select
              className="input-control"
              style={{ flex: 1 }}
              value={room.floorTextureId || ''}
              onChange={(e) => {
                const tex = textures.find((t) => t.id === e.target.value);
                onUpdateRoom({
                  floorTextureId: tex?.id,
                  floorTextureUrl: tex?.mapUrl,
                  floorTileWidthM: tex?.tileWidthM,
                  floorTileHeightM: tex?.tileHeightM,
                });
              }}
            >
              <option value="">Без текстура (само цвят)</option>
              {textures.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Стени: цвят и текстура */}
        <div>
          <label style={labelStyle}>Стени — цвят / текстура</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="color"
              value={room.wallColor}
              onChange={(e) =>
                onUpdateRoom({
                  wallColor: e.target.value,
                  wallTextureId: undefined,
                  wallTextureUrl: undefined,
                })
              }
              style={{
                width: '34px',
                height: '30px',
                border: '1px solid #334155',
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <select
              className="input-control"
              style={{ flex: 1 }}
              value={room.wallTextureId || ''}
              onChange={(e) => {
                const tex = textures.find((t) => t.id === e.target.value);
                onUpdateRoom({
                  wallTextureId: tex?.id,
                  wallTextureUrl: tex?.mapUrl,
                  wallTileWidthM: tex?.tileWidthM,
                  wallTileHeightM: tex?.tileHeightM,
                });
              }}
            >
              <option value="">Без текстура (само цвят)</option>
              {textures.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </aside>
  );
};