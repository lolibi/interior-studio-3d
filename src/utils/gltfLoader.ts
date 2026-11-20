import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { DimensionsCm } from '../types/editor';

let sharedLoader: GLTFLoader | null = null;
const gltfUrlCache = new Map<string, Promise<GLTF>>();

function getConfiguredLoader(): GLTFLoader {
  if (sharedLoader) return sharedLoader;

  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
  );
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);

  sharedLoader = loader;
  return loader;
}

export async function loadGlbFromUrl(url: string): Promise<THREE.Group> {
  let pending = gltfUrlCache.get(url);
  if (!pending) {
    const loader = getConfiguredLoader();
    pending = new Promise<GLTF>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (err) => {
          gltfUrlCache.delete(url);
          reject(err);
        }
      );
    });
    gltfUrlCache.set(url, pending);
  }

  const gltf = await pending;
  return gltf.scene.clone(true);
}

export async function loadGlbFromFile(file: File): Promise<THREE.Group> {
  const arrayBuffer = await file.arrayBuffer();
  const loader = getConfiguredLoader();

  return new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => resolve(gltf.scene),
      (err) => reject(err)
    );
  });
}

export interface GlbInspectionResult {
  dimensionsCm: DimensionsCm;
  triangles: number;
}

export function inspectGlbObject(root: THREE.Object3D): GlbInspectionResult {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  let triangles = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry;
      if (geo) {
        if (geo.index) {
          triangles += Math.round(geo.index.count / 3);
        } else if (geo.attributes.position) {
          triangles += Math.round(geo.attributes.position.count / 3);
        }
      }
    }
  });

  const maxRaw = Math.max(size.x, size.y, size.z);
  let toCmFactor = 100;
  if (maxRaw > 1500) {
    toCmFactor = 0.1;
  } else if (maxRaw > 15) {
    toCmFactor = 1;
  }

  return {
    dimensionsCm: {
      width: Math.max(1, Math.round(size.x * toCmFactor)),
      height: Math.max(1, Math.round(size.y * toCmFactor)),
      depth: Math.max(1, Math.round(size.z * toCmFactor)),
    },
    triangles,
  };
}