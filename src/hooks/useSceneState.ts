import { useCallback, useMemo, useState } from 'react';
import type {
  CatalogModel,
  CatalogTexture,
  PlacementMode,
  PlacedObject,
  RoomConfig,
  SavedScene,
} from '../types/editor';

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  widthM: 5.0,
  depthM: 4.2,
  heightM: 2.7,
  floorColor: '#c8b396',
  wallColor: '#e2e8f0',
};

interface HistorySnapshot {
  objects: PlacedObject[];
  room: RoomConfig;
}

interface UseSceneStateOptions {
  models: CatalogModel[];
  textures: CatalogTexture[];
  wallSnapCategories: Set<string>;
}

function generateObjectId(): string {
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useSceneState({
  wallSnapCategories,
}: UseSceneStateOptions) {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [room, setRoomState] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);

  const pushHistory = useCallback(
    (nextObjects: PlacedObject[], nextRoom: RoomConfig) => {
      setPast((prev) => [
        ...prev.slice(-29),
        {
          objects: JSON.parse(JSON.stringify(objects)),
          room: JSON.parse(JSON.stringify(room)),
        },
      ]);
      setFuture([]);
      setObjects(nextObjects);
      setRoomState(nextRoom);
    },
    [objects, room]
  );

  const setRoom = useCallback(
    (updater: RoomConfig | ((prev: RoomConfig) => RoomConfig)) => {
      setRoomState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater
      );
    },
    []
  );

  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId]
  );

  const addObjectFromModel = useCallback(
    (model: CatalogModel, placementMode: PlacementMode) => {
      const id = generateObjectId();
      const depthM = (model.dimensionsCm.depth || 60) / 100;
      const snapToBackWall =
        placementMode === 'wall' || wallSnapCategories.has(model.category);

      const offsetIndex = objects.length % 5;
      const xPos = snapToBackWall ? (offsetIndex - 2) * 0.45 : (offsetIndex - 2) * 0.35;
      const zPos = snapToBackWall
        ? -room.depthM / 2 + depthM / 2 + 0.01
        : (offsetIndex - 2) * 0.25;

      const created: PlacedObject = {
        id,
        instanceId: id,
        modelId: model.id,
        name: model.name,
        category: model.category,
        position: [Number(xPos.toFixed(3)), 0, Number(zPos.toFixed(3))],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensionsCm: { ...model.dimensionsCm },
        scaleMode: model.scaleMode,
        scaleConstraints: model.scaleConstraints,
        glbUrl: model.glbUrl,
      };

      pushHistory([...objects, created], room);
      setSelectedId(id);
    },
    [objects, pushHistory, room, wallSnapCategories]
  );

  const updateObject = useCallback(
    (id: string, patch: Partial<PlacedObject>) => {
      setObjects((prev) =>
        prev.map((obj) => (obj.id === id ? { ...obj, ...patch } : obj))
      );
    },
    []
  );

  const deleteObject = useCallback(
    (id: string) => {
      const next = objects.filter((o) => o.id !== id);
      pushHistory(next, room);
      if (selectedId === id) {
        setSelectedId(null);
      }
    },
    [objects, pushHistory, room, selectedId]
  );

  const duplicateObject = useCallback(
    (id: string) => {
      const target = objects.find((o) => o.id === id);
      if (!target) return;
      const newId = generateObjectId();
      const copy: PlacedObject = {
        ...JSON.parse(JSON.stringify(target)),
        id: newId,
        instanceId: newId,
        name: `${target.name} (копие)`,
        position: [
          Number((target.position[0] + 0.35).toFixed(3)),
          target.position[1],
          Number((target.position[2] + 0.35).toFixed(3)),
        ],
      };
      pushHistory([...objects, copy], room);
      setSelectedId(newId);
    },
    [objects, pushHistory, room]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [
      {
        objects: JSON.parse(JSON.stringify(objects)),
        room: JSON.parse(JSON.stringify(room)),
      },
      ...prev,
    ]);
    setObjects(previous.objects);
    setRoomState(previous.room);
  }, [objects, past, room]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [
      ...prev,
      {
        objects: JSON.parse(JSON.stringify(objects)),
        room: JSON.parse(JSON.stringify(room)),
      },
    ]);
    setObjects(next.objects);
    setRoomState(next.room);
  }, [future, objects, room]);

  const resetScene = useCallback(() => {
    pushHistory([], DEFAULT_ROOM_CONFIG);
    setSelectedId(null);
  }, [pushHistory]);

  const loadSceneData = useCallback((scene: SavedScene) => {
    const loadedObjects = (scene.objects ?? []).map((o) => ({
      ...o,
      instanceId: o.instanceId || o.id,
    }));
    const loadedRoom: RoomConfig = {
      ...DEFAULT_ROOM_CONFIG,
      ...(scene.room ?? {}),
    };
    setPast([]);
    setFuture([]);
    setObjects(loadedObjects);
    setRoomState(loadedRoom);
    setSelectedId(null);
  }, []);

  return {
    objects,
    selectedId,
    selectedObject,
    room,
    setRoom,
    setSelectedId,
    addObjectFromModel,
    updateObject,
    deleteObject,
    duplicateObject,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    resetScene,
    loadSceneData,
  };
}