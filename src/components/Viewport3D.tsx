import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { TestApartment } from './TestApartment';

export function Viewport3D() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#111827' }}>
      <Canvas
        shadows
        camera={{ position: [6.5, 6.0, 7.5], fov: 45, near: 0.05, far: 100 }}
      >
        <color attach="background" args={['#111827']} />

        {/* Базово студийно осветление (Dome + Key Light) */}
        <hemisphereLight args={['#ffffff', '#334155', 0.95]} />
        <directionalLight
          position={[6, 12, 8]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.0005}
        />

        {/* Тестов многостаен апартамент */}
        <TestApartment />

        {/* Координатна мрежа: 1 голям квадрат = 1 метър, 1 малко квадратче = 10 см */}
        <Grid
          args={[20, 20]}
          position={[0, -0.001, 0]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={25}
          infiniteGrid
        />

        {/* Оси в началото на координатната система (0,0,0): X=червено, Y=зелено, Z=синьо */}
        <axesHelper args={[1]} />

        {/* Навигация на камерата (Orbit / Pan / Zoom) */}
        <OrbitControls
          makeDefault
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2 - 0.02}
          target={[0, 0.5, 0]}
        />
      </Canvas>
    </div>
  );
}