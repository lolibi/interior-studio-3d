import { Fragment } from 'react';

interface Opening {
  center: number;
  width: number;
  bottom: number;
  height: number;
  type: 'window' | 'door';
}

interface WallSpanProps {
  axis: 'x' | 'z';
  fixedCoord: number;
  start: number;
  end: number;
  thickness: number;
  wallHeight?: number;
  openings?: Opening[];
  color?: string;
}

const CEILING_HEIGHT = 2.65; // 265 см

function WallBox({
  axis,
  fixedCoord,
  from,
  to,
  bottom,
  top,
  thickness,
  color,
}: {
  axis: 'x' | 'z';
  fixedCoord: number;
  from: number;
  to: number;
  bottom: number;
  top: number;
  thickness: number;
  color: string;
}) {
  const length = to - from;
  const height = top - bottom;
  if (length <= 0.001 || height <= 0.001) return null;

  const midSpan = (from + to) / 2;
  const midY = (bottom + top) / 2;

  const position: [number, number, number] =
    axis === 'x' ? [midSpan, midY, fixedCoord] : [fixedCoord, midY, midSpan];

  const args: [number, number, number] =
    axis === 'x' ? [length, height, thickness] : [thickness, height, length];

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function OpeningDetail({
  axis,
  fixedCoord,
  opening,
  thickness,
}: {
  axis: 'x' | 'z';
  fixedCoord: number;
  opening: Opening;
  thickness: number;
}) {
  const midY = opening.bottom + opening.height / 2;
  const frameDepth = thickness + 0.02;
  const frameThickness = 0.04;

  const position: [number, number, number] =
    axis === 'x'
      ? [opening.center, midY, fixedCoord]
      : [fixedCoord, midY, opening.center];

  const rotation: [number, number, number] =
    axis === 'x' ? [0, 0, 0] : [0, Math.PI / 2, 0];

  return (
    <group position={position} rotation={rotation}>
      {/* Лява и дясна каса */}
      <mesh position={[-opening.width / 2 + frameThickness / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameThickness, opening.height, frameDepth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>
      <mesh position={[opening.width / 2 - frameThickness / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[frameThickness, opening.height, frameDepth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {/* Горна каса */}
      <mesh position={[0, opening.height / 2 - frameThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[opening.width, frameThickness, frameDepth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {/* Подпрозоречен перваз и стъкло при прозорците */}
      {opening.type === 'window' && (
        <>
          <mesh position={[0, -opening.height / 2 + 0.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[opening.width + 0.04, 0.04, frameDepth + 0.04]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[opening.width - frameThickness * 2, opening.height - frameThickness * 2, 0.015]} />
            <meshPhysicalMaterial
              color="#bae6fd"
              transparent
              opacity={0.28}
              roughness={0.1}
              metalness={0.1}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

function WallSpan({
  axis,
  fixedCoord,
  start,
  end,
  thickness,
  wallHeight = CEILING_HEIGHT,
  openings = [],
  color = '#e2e8f0',
}: WallSpanProps) {
  const sortedOpenings = [...openings].sort((a, b) => a.center - b.center);
  let cursor = start;

  return (
    <group>
      {sortedOpenings.map((op, index) => {
        const opStart = op.center - op.width / 2;
        const opEnd = op.center + op.width / 2;
        const prevCursor = cursor;
        cursor = opEnd;

        return (
          <Fragment key={index}>
            {/* Плътна стена преди отвора */}
            <WallBox
              axis={axis}
              fixedCoord={fixedCoord}
              from={prevCursor}
              to={opStart}
              bottom={0}
              top={wallHeight}
              thickness={thickness}
              color={color}
            />
            {/* Подпрозоречен зид */}
            <WallBox
              axis={axis}
              fixedCoord={fixedCoord}
              from={opStart}
              to={opEnd}
              bottom={0}
              top={op.bottom}
              thickness={thickness}
              color={color}
            />
            {/* Щурц над отвора */}
            <WallBox
              axis={axis}
              fixedCoord={fixedCoord}
              from={opStart}
              to={opEnd}
              bottom={op.bottom + op.height}
              top={wallHeight}
              thickness={thickness}
              color={color}
            />
            {/* Каса и стъкло */}
            <OpeningDetail
              axis={axis}
              fixedCoord={fixedCoord}
              opening={op}
              thickness={thickness}
            />
          </Fragment>
        );
      })}

      {/* Остатък от стената след последния отвор */}
      <WallBox
        axis={axis}
        fixedCoord={fixedCoord}
        from={cursor}
        to={end}
        bottom={0}
        top={wallHeight}
        thickness={thickness}
        color={color}
      />
    </group>
  );
}

function FloorZone({
  xMin,
  xMax,
  zMin,
  zMax,
  color,
}: {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  color: string;
}) {
  const width = xMax - xMin;
  const depth = zMax - zMin;
  const thickness = 0.02;

  return (
    <mesh
      position={[(xMin + xMax) / 2, -thickness / 2, (zMin + zMax) / 2]}
      receiveShadow
    >
      <boxGeometry args={[width, thickness, depth]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

export function TestApartment() {
  return (
    <group name="TestApartment">
      {/* ПОЛОВИ НАСТИЛКИ (горната повърхност е точно на Y = 0.00 м) */}
      {/* 1. Дневна — дъбов паркет */}
      <FloorZone xMin={-3.72} xMax={0.34} zMin={-1.30} zMax={3.02} color="#c49a6c" />
      {/* 2. Кухненски бокс — светъл гранитогрес */}
      <FloorZone xMin={-3.72} xMax={0.34} zMin={-3.02} zMax={-1.30} color="#cbd5e1" />
      {/* 3. Спалня — дъбов паркет */}
      <FloorZone xMin={0.46} xMax={3.72} zMin={-3.02} zMax={0.04} color="#c49a6c" />
      {/* 4. Баня — керамични плочки */}
      <FloorZone xMin={0.46} xMax={2.24} zMin={0.16} zMax={1.64} color="#94a3b8" />
      {/* 5. Коридор — гранитогрес (Г-образен) */}
      <FloorZone xMin={0.46} xMax={3.72} zMin={1.64} zMax={3.02} color="#cbd5e1" />
      <FloorZone xMin={2.36} xMax={3.72} zMin={0.04} zMax={1.64} color="#cbd5e1" />

      {/* ВЪНШНИ СТЕНИ (дебелина 16 см) */}
      {/* Северна външна стена */}
      <WallSpan axis="x" fixedCoord={-3.10} start={-3.88} end={3.88} thickness={0.16} />

      {/* Южна външна стена (прозорец в дневната + входна врата в коридора) */}
      <WallSpan
        axis="x"
        fixedCoord={3.10}
        start={-3.88}
        end={3.88}
        thickness={0.16}
        openings={[
          { center: -1.70, width: 1.80, bottom: 0.50, height: 1.75, type: 'window' },
          { center: 3.00, width: 0.95, bottom: 0, height: 2.10, type: 'door' },
        ]}
      />

      {/* Западна външна стена (голям прозорец в дневната) */}
      <WallSpan
        axis="z"
        fixedCoord={-3.80}
        start={-3.02}
        end={3.02}
        thickness={0.16}
        openings={[
          { center: 0.60, width: 2.00, bottom: 0.85, height: 1.40, type: 'window' },
        ]}
      />

      {/* Източна външна стена (прозорец в спалнята) */}
      <WallSpan
        axis="z"
        fixedCoord={3.80}
        start={-3.02}
        end={3.02}
        thickness={0.16}
        openings={[
          { center: -1.50, width: 1.50, bottom: 0.85, height: 1.40, type: 'window' },
        ]}
      />

      {/* ВЪТРЕШНИ ПРЕГРАДНИ СТЕНИ (дебелина 12 см) */}
      {/* Централна носеща/разделителна стена (врата от коридор към дневна) */}
      <WallSpan
        axis="z"
        fixedCoord={0.40}
        start={-3.02}
        end={3.02}
        thickness={0.12}
        color="#f1f5f9"
        openings={[
          { center: 2.40, width: 0.90, bottom: 0, height: 2.10, type: 'door' },
        ]}
      />

      {/* Южна стена на спалнята (врата от коридор към спалня) */}
      <WallSpan
        axis="x"
        fixedCoord={0.10}
        start={0.46}
        end={3.72}
        thickness={0.12}
        color="#f1f5f9"
        openings={[
          { center: 3.05, width: 0.85, bottom: 0, height: 2.10, type: 'door' },
        ]}
      />

      {/* Източна стена на банята */}
      <WallSpan
        axis="z"
        fixedCoord={2.30}
        start={0.16}
        end={1.70}
        thickness={0.12}
        color="#f1f5f9"
      />

      {/* Южна стена на банята (врата от коридор към баня) */}
      <WallSpan
        axis="x"
        fixedCoord={1.70}
        start={0.46}
        end={2.36}
        thickness={0.12}
        color="#f1f5f9"
        openings={[
          { center: 1.35, width: 0.75, bottom: 0, height: 2.10, type: 'door' },
        ]}
      />
    </group>
  );
}