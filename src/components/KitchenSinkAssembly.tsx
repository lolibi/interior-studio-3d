export function KitchenSinkAssembly({
  cx,
  topY,
  baseD,
  modW,
}: {
  cx: number;
  topY: number;
  baseD: number;
  modW: number;
}) {
  const outerW = Math.min(0.76, Math.max(0.42, modW - 0.05));
  const outerD = Math.min(0.48, baseD - 0.12);
  const rim = 0.024;
  const basinDepth = 0.18;
  const wallT = 0.01;
  const hasDrainboard = outerW >= 0.64;
  const bowlW = hasDrainboard ? outerW * 0.52 : outerW - rim * 2;
  const bowlD = outerD - rim * 2;
  const bowlCenterX = hasDrainboard ? -outerW / 2 + rim + bowlW / 2 : 0;

  return (
    <group position={[cx, topY, 0.015]}>
      {/* Външен метален борд по периметъра */}
      <mesh position={[0, 0.002, -outerD / 2 + rim]} castShadow receiveShadow>
        <boxGeometry args={[outerW, 0.004, rim * 2]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[0, 0.002, outerD / 2 - rim / 2]} castShadow receiveShadow>
        <boxGeometry args={[outerW, 0.004, rim]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[-outerW / 2 + rim / 2, 0.002, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, 0.004, outerD]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.22} metalness={0.88} />
      </mesh>
      <mesh position={[outerW / 2 - rim / 2, 0.002, 0]} castShadow receiveShadow>
        <boxGeometry args={[rim, 0.004, outerD]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.22} metalness={0.88} />
      </mesh>

      {/* Вдлъбнато корито (18 см дълбочина в отвора на плота) */}
      <group position={[bowlCenterX, 0, 0.008]}>
        <mesh position={[0, -basinDepth, 0]} receiveShadow>
          <boxGeometry args={[bowlW, wallT, bowlD - rim]} />
          <meshStandardMaterial color="#64748b" roughness={0.26} metalness={0.88} />
        </mesh>
        <mesh
          position={[0, -basinDepth / 2, -(bowlD - rim) / 2 + wallT / 2]}
          receiveShadow
        >
          <boxGeometry args={[bowlW, basinDepth, wallT]} />
          <meshStandardMaterial color="#78879b" roughness={0.24} metalness={0.88} />
        </mesh>
        <mesh
          position={[0, -basinDepth / 2, (bowlD - rim) / 2 - wallT / 2]}
          receiveShadow
        >
          <boxGeometry args={[bowlW, basinDepth, wallT]} />
          <meshStandardMaterial color="#78879b" roughness={0.24} metalness={0.88} />
        </mesh>
        <mesh
          position={[-bowlW / 2 + wallT / 2, -basinDepth / 2, 0]}
          receiveShadow
        >
          <boxGeometry args={[wallT, basinDepth, bowlD - rim]} />
          <meshStandardMaterial color="#78879b" roughness={0.24} metalness={0.88} />
        </mesh>
        <mesh
          position={[bowlW / 2 - wallT / 2, -basinDepth / 2, 0]}
          receiveShadow
        >
          <boxGeometry args={[wallT, basinDepth, bowlD - rim]} />
          <meshStandardMaterial color="#78879b" roughness={0.24} metalness={0.88} />
        </mesh>

        {/* Сифон / цедка */}
        <mesh position={[0, -basinDepth + wallT / 2 + 0.001, 0]}>
          <cylinderGeometry args={[0.036, 0.036, 0.002, 20]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.95} />
        </mesh>
        <mesh position={[0, -basinDepth + wallT / 2 + 0.002, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.002, 16]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.4} />
        </mesh>
      </group>

      {/* Отцедник отдясно с оребрени канали */}
      {hasDrainboard && (() => {
        const drainW = outerW - bowlW - rim * 2;
        const drainX = bowlCenterX + bowlW / 2 + drainW / 2;
        return (
          <group position={[drainX, 0.002, 0.008]}>
            <mesh receiveShadow>
              <boxGeometry args={[drainW, 0.003, bowlD - rim]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.24} metalness={0.88} />
            </mesh>
            {[-0.1, -0.05, 0, 0.05, 0.1].map((rz, i) => (
              <mesh key={`rib-${i}`} position={[0, 0.0022, rz]}>
                <boxGeometry args={[drainW - 0.04, 0.0015, 0.008]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.2} metalness={0.92} />
              </mesh>
            ))}
          </group>
        );
      })()}

      {/* Смесител (батерия) */}
      <group position={[bowlCenterX, 0.004, -outerD / 2 + rim]}>
        <mesh position={[0, 0.025, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.023, 0.05, 16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.92} />
        </mesh>
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.015, 0.22, 16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.92} />
        </mesh>
        <mesh
          position={[0, 0.25, 0.065]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
        >
          <torusGeometry args={[0.065, 0.01, 12, 24, Math.PI]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.92} />
        </mesh>
        <mesh position={[0, 0.238, 0.13]} castShadow>
          <cylinderGeometry args={[0.011, 0.012, 0.024, 14]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.2} metalness={0.95} />
        </mesh>
        <mesh
          position={[0.028, 0.075, 0.015]}
          rotation={[Math.PI / 3, 0, -Math.PI / 6]}
          castShadow
        >
          <cylinderGeometry args={[0.005, 0.006, 0.065, 12]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.92} />
        </mesh>
      </group>
    </group>
  );
}