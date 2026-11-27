import { Html, Line } from '@react-three/drei';
import type { WallDistanceGuide } from '../utils/furnitureSnap';

export function FurnitureWallGuides({
  guides,
}: {
  guides: WallDistanceGuide[];
}) {
  if (!guides || guides.length === 0) return null;

  return (
    <group>
      {guides.map((g, idx) => {
        const midX = (g.start[0] + g.end[0]) / 2;
        const midZ = (g.start[1] + g.end[1]) / 2;
        const cm = Math.round(g.distanceM * 100);
        const color = g.snapped ? '#22c55e' : '#38bdf8';

        return (
          <group key={`wall-guide-${idx}`}>
            {g.distanceM > 0.02 && (
              <Line
                points={[
                  [g.start[0], 0.03, g.start[1]],
                  [g.end[0], 0.03, g.end[1]],
                ]}
                color={color}
                lineWidth={2}
                dashed
                dashSize={0.08}
                gapSize={0.05}
              />
            )}

            {/* Маркер в точката на контакт със стената */}
            <mesh position={[g.end[0], 0.035, g.end[1]]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.025, 0.045, 20]} />
              <meshBasicMaterial color={color} />
            </mesh>

            <Html
              position={[midX, 0.14, midZ]}
              center
              zIndexRange={[30, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  backgroundColor: g.snapped
                    ? 'rgba(20, 83, 45, 0.92)'
                    : 'rgba(15, 23, 42, 0.92)',
                  border: `1px solid ${color}`,
                  color: '#f8fafc',
                  padding: '2px 7px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
                }}
              >
                {g.snapped ? '✓ 0 см (Стена)' : `${cm} см`}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}