import React, { useEffect, useState } from 'react';
import type { AuthUser, SystemSettings } from '../types/auth';
import type {
  CatalogModel,
  PlacedObject,
  RoomConfig,
} from '../types/editor';

export interface FloorplanModalProps {
  isOpen: boolean;
  currentRoom: RoomConfig;
  models: CatalogModel[];
  currentUser: AuthUser | null;
  systemSettings: SystemSettings | null;
  onClose: () => void;
  onApplyRoom: (nextRoom: RoomConfig, placedFromPlan?: PlacedObject[]) => void;
  onRefreshUser?: () => Promise<void>;
  onOpenAuth?: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 220,
  backgroundColor: 'rgba(2, 6, 23, 0.85)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '760px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '20px',
  color: '#f8fafc',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const presets = [
  { label: 'Спалня (3.6 × 3.2 м)', widthM: 3.6, depthM: 3.2, heightM: 2.65 },
  { label: 'Дневна (5.0 × 4.2 м)', widthM: 5.0, depthM: 4.2, heightM: 2.7 },
  { label: 'Кухня + Трапезария (4.5 × 3.8 м)', widthM: 4.5, depthM: 3.8, heightM: 2.7 },
  { label: 'Голям хол (6.8 × 5.0 м)', widthM: 6.8, depthM: 5.0, heightM: 2.8 },
];

export const FloorplanModal: React.FC<FloorplanModalProps> = ({
  isOpen,
  currentRoom,
  models,
  currentUser,
  onClose,
  onApplyRoom,
  onOpenAuth,
}) => {
  const [widthM, setWidthM] = useState<number>(currentRoom.widthM);
  const [depthM, setDepthM] = useState<number>(currentRoom.depthM);
  const [heightM, setHeightM] = useState<number>(currentRoom.heightM);
  const [autoPopulate, setAutoPopulate] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setWidthM(currentRoom.widthM);
      setDepthM(currentRoom.depthM);
      setHeightM(currentRoom.heightM);
    }
  }, [isOpen, currentRoom]);

  if (!isOpen) return null;

  const areaM2 = (widthM * depthM).toFixed(2);
  const perimeterM = (2 * (widthM + depthM)).toFixed(2);

  // Пропорции за 2D SVG прегледа
  const maxBox = 220;
  const scale = Math.min(maxBox / Math.max(1, widthM), maxBox / Math.max(1, depthM));
  const rectW = Math.round(widthM * scale);
  const rectH = Math.round(depthM * scale);

  const handleApply = () => {
    const nextRoom: RoomConfig = {
      ...currentRoom,
      widthM: Math.max(1.5, Number(widthM) || 4),
      depthM: Math.max(1.5, Number(depthM) || 4),
      heightM: Math.max(2.0, Number(heightM) || 2.7),
    };

    if (autoPopulate && models.length > 0) {
      const generated: PlacedObject[] = [];
      const firstModel = models[0];
      const id = `obj_${Date.now().toString(36)}_plan`;
      generated.push({
        id,
        instanceId: id,
        modelId: firstModel.id,
        name: firstModel.name,
        category: firstModel.category,
        position: [0, 0, -nextRoom.depthM / 2 + (firstModel.dimensionsCm.depth || 80) / 200 + 0.02],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensionsCm: { ...firstModel.dimensionsCm },
        scaleMode: firstModel.scaleMode,
        scaleConstraints: firstModel.scaleConstraints,
        glbUrl: firstModel.glbUrl,
      });
      onApplyRoom(nextRoom, generated);
    } else {
      onApplyRoom(nextRoom);
    }

    onClose();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #1e293b',
            paddingBottom: '12px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '17px' }}>
              📐 2D Чертеж и размери на помещението
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Задайте габарити на стаята или изберете готов шаблон
            </p>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: '4px 9px' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Бързи шаблони */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn"
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
              onClick={() => {
                setWidthM(p.widthM);
                setDepthM(p.depthM);
                setHeightM(p.heightM);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 260px',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          {/* Лява част: размери и параметри */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '10px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Ширина X (м)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1.5"
                  max="30"
                  className="input-control"
                  value={widthM}
                  onChange={(e) => setWidthM(Number(e.target.value) || 1.5)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Дълбочина Z (м)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1.5"
                  max="30"
                  className="input-control"
                  value={depthM}
                  onChange={(e) => setDepthM(Number(e.target.value) || 1.5)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Височина Y (м)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="2.0"
                  max="6.0"
                  className="input-control"
                  value={heightM}
                  onChange={(e) => setHeightM(Number(e.target.value) || 2.7)}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12.5px',
              }}
            >
              <span>
                Подова площ: <strong style={{ color: '#38bdf8' }}>{areaM2} м²</strong>
              </span>
              <span>
                Периметър: <strong>{perimeterM} л.м.</strong>
              </span>
            </div>

            {models.length > 0 && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoPopulate}
                  onChange={(e) => setAutoPopulate(e.target.checked)}
                />
                Постави стартова мебел от каталога до задната стена
              </label>
            )}

            {!currentUser && onOpenAuth && (
              <div
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '11.5px',
                  color: '#bae6fd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>Влезте в профил, за да запазвате планове в облака.</span>
                <button
                  type="button"
                  className="btn btn-active"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                >
                  Вход
                </button>
              </div>
            )}
          </div>

          {/* Дясна част: 2D архитектурен преглед */}
          <div
            style={{
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              height: '250px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="250" height="240" viewBox="0 0 250 240">
              <rect
                x={(250 - rectW) / 2}
                y={(240 - rectH) / 2}
                width={rectW}
                height={rectH}
                fill="rgba(56, 189, 248, 0.12)"
                stroke="#38bdf8"
                strokeWidth="2.5"
              />
              <text
                x="125"
                y={(240 - rectH) / 2 - 8}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
              >
                {widthM.toFixed(2)} м
              </text>
              <text
                x={(250 + rectW) / 2 + 8}
                y="124"
                textAnchor="start"
                fill="#94a3b8"
                fontSize="11"
              >
                {depthM.toFixed(2)} м
              </text>
              <text
                x="125"
                y="124"
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize="12"
                fontWeight="600"
              >
                {areaM2} м²
              </text>
            </svg>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            borderTop: '1px solid #1e293b',
            paddingTop: '12px',
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Отказ
          </button>
          <button type="button" className="btn btn-active" onClick={handleApply}>
            Приложи в 3D сцената
          </button>
        </div>
      </div>
    </div>
  );
};