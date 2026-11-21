import * as THREE from 'three';

export interface VertexStretchOptions {
  targetWidthM: number;
  targetHeightM: number;
  targetDepthM: number;
  /**
   * Дебелина на профила/касата в метри (напр. 0.08 = 8 см), която остава недеформирана по краищата.
   */
  frameMarginM?: number;
}

function mapAxisCoordinate(
  val: number,
  minVal: number,
  maxVal: number,
  targetSize: number,
  margin: number
): number {
  const origSize = maxVal - minVal;
  if (origSize < 0.001) return val;

  // Ако обектът е по-тесен от два пъти рамката или се свива под оригинала, ползваме пропорционално мащабиране
  if (origSize <= margin * 2.2 || targetSize <= origSize) {
    const ratio = targetSize / origSize;
    const center = (minVal + maxVal) * 0.5;
    return (val - center) * ratio;
  }

  const delta = targetSize - origSize;
  const halfDelta = delta * 0.5;
  const distFromMin = val - minVal;
  const distFromMax = maxVal - val;

  // Ляв / долен профил (запазва оригиналната си дебелина)
  if (distFromMin <= margin) {
    return val - halfDelta;
  }

  // Десен / горен профил (запазва оригиналната си дебелина)
  if (distFromMax <= margin) {
    return val + halfDelta;
  }

  // Вътрешна зона (стъклопакет / пълнеж) — разтяга се равномерно
  const innerOrigSpan = origSize - 2 * margin;
  const innerTargetSpan = targetSize - 2 * margin;
  const t = (distFromMin - margin) / innerOrigSpan;
  const newMin = minVal - halfDelta;
  return newMin + margin + t * innerTargetSpan;
}

/**
 * Клонира .glb сцена и разтяга вертексите по X и Y, като запазва периферните рамки/каси недеформирани.
 */
export function cloneAndStretchGlbByVertices(
  sourceScene: THREE.Object3D,
  options: VertexStretchOptions
): THREE.Group {
  const cloned = sourceScene.clone(true) as THREE.Group;
  cloned.updateMatrixWorld(true);

  const rootInverse = new THREE.Matrix4().copy(cloned.matrixWorld).invert();
  const overallBox = new THREE.Box3().setFromObject(cloned);

  // Преобразуваме bounding box в локалното пространство на root групата
  const minPt = overallBox.min.clone().applyMatrix4(rootInverse);
  const maxPt = overallBox.max.clone().applyMatrix4(rootInverse);

  const boxMinX = Math.min(minPt.x, maxPt.x);
  const boxMaxX = Math.max(minPt.x, maxPt.x);
  const boxMinY = Math.min(minPt.y, maxPt.y);
  const boxMaxY = Math.max(minPt.y, maxPt.y);
  const boxMinZ = Math.min(minPt.z, maxPt.z);
  const boxMaxZ = Math.max(minPt.z, maxPt.z);

  const margin = Math.max(0.01, options.frameMarginM ?? 0.08);
  const vertex = new THREE.Vector3();

  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;

    const geom = child.geometry.clone();
    child.geometry = geom;

    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;

    const meshToRoot = new THREE.Matrix4().multiplyMatrices(
      rootInverse,
      child.matrixWorld
    );
    const rootToMesh = new THREE.Matrix4().copy(meshToRoot).invert();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i).applyMatrix4(meshToRoot);

      const nextX = mapAxisCoordinate(
        vertex.x,
        boxMinX,
        boxMaxX,
        options.targetWidthM,
        margin
      );
      const nextY = mapAxisCoordinate(
        vertex.y,
        boxMinY,
        boxMaxY,
        options.targetHeightM,
        margin
      );
      const nextZ = mapAxisCoordinate(
        vertex.z,
        boxMinZ,
        boxMaxZ,
        options.targetDepthM,
        Math.min(margin, (boxMaxZ - boxMinZ) * 0.25)
      );

      vertex.set(nextX, nextY, nextZ).applyMatrix4(rootToMesh);
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    posAttr.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
  });

  return cloned;
}