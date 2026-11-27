import type {
  CatalogModel,
  CatalogTexture,
  KitchenSpec,
  SceneObject,
  WardrobeSpec,
} from '../types/editor';
import {
  findClosedRoomPolygons,
  getWallLengthM,
} from '../types/room';
import type { RoomConfig } from '../types/room';

export type BomSection = 'room' | 'parametric' | 'catalog';

export interface BomLineItem {
  id: string;
  section: BomSection;
  groupTitle: string;
  itemName: string;
  materialOrSpec: string;
  quantity: number;
  unit: 'м²' | 'л.м.' | 'бр.';
  notes?: string;
}

export interface ProjectBomReport {
  items: BomLineItem[];
  summary: {
    floorAreaM2: number;
    netWallAreaM2: number;
    boardAreaM2: number;
    countertopLm: number;
    hardwareCount: number;
    catalogFurnitureCount: number;
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function polygonAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) * 0.5;
}

function resolveFinishLabel(
  colorHex: string | undefined,
  textureId: string | null | undefined,
  textures: CatalogTexture[]
): string {
  if (textureId) {
    const found = textures.find((t) => t.id === textureId);
    if (found) return `Текстура: ${found.name}`;
  }
  return colorHex ? `Цвят ${colorHex.toUpperCase()}` : 'Стандартен декор';
}

function buildWardrobeBom(
  obj: SceneObject,
  spec: WardrobeSpec,
  textures: CatalogTexture[]
): BomLineItem[] {
  const title = obj.name || `Гардероб ${spec.widthCm}×${spec.heightCm} см`;
  const W = spec.widthCm / 100;
  const H = spec.heightCm / 100;
  const D = spec.depthCm / 100;
  const plinthH = spec.plinthHeightCm / 100;
  const bridgeH = spec.hasTopBridge ? spec.topBridgeHeightCm / 100 : 0;
  const mainH = Math.max(0.5, H - plinthH - bridgeH);

  const doors = Math.max(1, Math.round(spec.doorCount));
  const doorW = W / doors;
  const mirrorIndices = new Set(spec.mirrorDoorIndices ?? []);
  const mirrorDoors = Array.from(mirrorIndices).filter((i) => i < doors).length;
  const regularDoors = Math.max(0, doors - mirrorDoors);

  const drawerRows =
    spec.doorType === 'hinged' ? Math.max(0, spec.bottomDrawersCount) : 0;
  const drawerZoneH = drawerRows * 0.19;
  const upperDoorH = Math.max(0.3, mainH - drawerZoneH);

  const corpusLabel = resolveFinishLabel(
    spec.corpusColor,
    spec.corpusTextureId,
    textures
  );
  const frontLabel = resolveFinishLabel(
    spec.frontColor,
    spec.frontTextureId,
    textures
  );

  // Корпус: 2 външни страници + (doors - 1) вътрешни делители + дъно и таван + рафтове
  const verticalPanelsArea = (doors + 1) * mainH * D;
  const horizontalPanelsArea = 2 * W * D;
  const interiorMode = spec.interiorLayout ?? 'mixed';
  const shelfCount =
    interiorMode === 'shelves-only'
      ? doors * 4
      : interiorMode === 'rail-and-shelves'
        ? doors * 1
        : Math.ceil(doors / 2) * 1 + Math.floor(doors / 2) * 4;
  const shelvesArea = shelfCount * doorW * Math.max(0.25, D - 0.04);
  const bridgeCorpusArea = spec.hasTopBridge
    ? 2 * W * D + (doors + 1) * bridgeH * D
    : 0;
  const drawerBoxesArea =
    drawerRows * doors * (2 * 0.14 * (D - 0.08) + doorW * (D - 0.08));

  const totalCorpusM2 = round2(
    verticalPanelsArea +
      horizontalPanelsArea +
      shelvesArea +
      bridgeCorpusArea +
      drawerBoxesArea
  );

  // Лице (вратички + чела на чекмеджета + надстройка)
  const mainFrontM2 =
    regularDoors * doorW * upperDoorH +
    mirrorDoors * doorW * upperDoorH * 0.35;
  const drawersFrontM2 = drawerRows * doors * doorW * 0.188;
  const bridgeFrontM2 = spec.hasTopBridge ? regularDoors * doorW * bridgeH : 0;
  const totalFrontM2 = round2(mainFrontM2 + drawersFrontM2 + bridgeFrontM2);

  const hdfBackM2 = round2(W * (mainH + bridgeH));

  const items: BomLineItem[] = [
    {
      id: `${obj.instanceId}-corpus`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Плочи корпус (ПДЧ 18 мм)',
      materialOrSpec: corpusLabel,
      quantity: totalCorpusM2,
      unit: 'м²',
      notes: `${doors} секции, ${shelfCount} рафта`,
    },
    {
      id: `${obj.instanceId}-front`,
      section: 'parametric',
      groupTitle: title,
      itemName: `Лице / Вратички (${
        spec.frontStyle === 'shaker'
          ? 'фрезована рамка'
          : spec.frontStyle === 'gola'
            ? 'Gola'
            : 'гладък МДФ'
      })`,
      materialOrSpec: frontLabel,
      quantity: totalFrontM2,
      unit: 'м²',
    },
    {
      id: `${obj.instanceId}-hdf`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Гръб HDF (4 мм)',
      materialOrSpec: corpusLabel,
      quantity: hdfBackM2,
      unit: 'м²',
    },
  ];

  if (mirrorDoors > 0) {
    const mirrorM2 = round2(mirrorDoors * doorW * (upperDoorH + bridgeH));
    items.push({
      id: `${obj.instanceId}-mirror`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Огледало с фасет за врата',
      materialOrSpec: `${mirrorDoors} бр. огледални крила`,
      quantity: mirrorM2,
      unit: 'м²',
    });
  }

  if (spec.plinthHeightCm > 0) {
    items.push({
      id: `${obj.instanceId}-plinth`,
      section: 'parametric',
      groupTitle: title,
      itemName: `Цокъл (${spec.plinthHeightCm} см)`,
      materialOrSpec: `Цвят ${spec.plinthColor.toUpperCase()}`,
      quantity: round2(W),
      unit: 'л.м.',
    });
  }

  if (spec.doorType === 'hinged') {
    const hingesPerDoor = upperDoorH > 1.6 ? 4 : 3;
    const bridgeHinges = spec.hasTopBridge ? doors * 2 : 0;
    items.push({
      id: `${obj.instanceId}-hinges`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Панти с плавно прибиране',
      materialOrSpec: 'Мебелен обков',
      quantity: doors * hingesPerDoor + bridgeHinges,
      unit: 'бр.',
    });
  } else {
    items.push({
      id: `${obj.instanceId}-sliding-sys`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Система за плъзгащи врати (релси + ролки)',
      materialOrSpec: `Дължина ${spec.widthCm} см, ${doors} крила`,
      quantity: 1,
      unit: 'бр.',
    });
  }

  const totalDrawers = drawerRows * doors;
  if (totalDrawers > 0) {
    items.push({
      id: `${obj.instanceId}-drawers`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Комплект водачи за чекмеджета (тандем)',
      materialOrSpec: `Дълбочина ${Math.max(30, spec.depthCm - 5)} см`,
      quantity: totalDrawers,
      unit: 'бр.',
    });
  }

  const railCount =
    interiorMode === 'rail-and-shelves'
      ? doors
      : interiorMode === 'mixed'
        ? Math.ceil(doors / 2)
        : 0;
  if (railCount > 0) {
    items.push({
      id: `${obj.instanceId}-rails`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Алуминиев лост за дрехи + държачи',
      materialOrSpec: `Ширина секция ~${Math.round(spec.widthCm / doors)} см`,
      quantity: railCount,
      unit: 'бр.',
    });
  }

  if (spec.frontStyle !== 'gola' && spec.handleStyle !== 'none') {
    const handleCount =
      doors + (spec.hasTopBridge ? doors : 0) + totalDrawers;
    items.push({
      id: `${obj.instanceId}-handles`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Мебелни дръжки',
      materialOrSpec: `Цвят ${spec.handleColor.toUpperCase()}`,
      quantity: handleCount,
      unit: 'бр.',
    });
  }

  return items;
}

function buildKitchenBom(
  obj: SceneObject,
  spec: KitchenSpec,
  textures: CatalogTexture[]
): BomLineItem[] {
  const title = obj.name || `Кухня ${spec.widthCm} см`;
  const W = spec.widthCm / 100;
  const baseD = spec.depthCm / 100;
  const plinthH = spec.plinthHeightCm / 100;
  const topT = spec.countertopThicknessCm / 100;
  const baseTotalH = spec.baseHeightCm / 100;
  const baseBoxH = Math.max(0.45, baseTotalH - plinthH - topT);
  const wallCabH = spec.wallCabinetHeightCm / 100;
  const wallCabD = spec.wallCabinetDepthCm / 100;
  const backsplashH = spec.backsplashHeightCm / 100;

  const isLShape = spec.shape === 'l-left' || spec.shape === 'l-right';
  const wingW = isLShape ? (spec.wingWidthCm ?? 160) / 100 : 0;
  const netWingW = isLShape ? Math.max(0.4, wingW - baseD) : 0;
  const totalRunW = W + netWingW;

  const modCount = Math.max(1, Math.round(spec.moduleCount));
  const wingModCount = isLShape
    ? Math.max(1, Math.round(spec.wingModuleCount ?? 2))
    : 0;
  const totalModules = modCount + wingModCount;

  const corpusLabel = resolveFinishLabel(
    spec.corpusColor,
    spec.corpusTextureId,
    textures
  );
  const frontLabel = resolveFinishLabel(
    spec.frontColor,
    spec.frontTextureId,
    textures
  );
  const topLabel = resolveFinishLabel(
    spec.countertopColor,
    spec.countertopTextureId,
    textures
  );
  const backLabel = resolveFinishLabel(
    spec.backsplashColor,
    spec.backsplashTextureId,
    textures
  );

  const items: BomLineItem[] = [];

  if (spec.layoutMode === 'tall-column') {
    const tallH = spec.tallCabinetHeightCm / 100;
    const colBodyH = Math.max(1.2, tallH - plinthH);
    const corpusM2 = round2(
      (modCount + 1) * colBodyH * baseD + modCount * 5 * (W / modCount) * baseD
    );
    const frontM2 = round2(W * colBodyH * 0.85);
    const hdfM2 = round2(W * colBodyH);

    items.push(
      {
        id: `${obj.instanceId}-kcol-corpus`,
        section: 'parametric',
        groupTitle: title,
        itemName: 'Плочи корпус колонен шкаф (ПДЧ 18 мм)',
        materialOrSpec: corpusLabel,
        quantity: corpusM2,
        unit: 'м²',
      },
      {
        id: `${obj.instanceId}-kcol-front`,
        section: 'parametric',
        groupTitle: title,
        itemName: 'Лице / Вратички колонен шкаф',
        materialOrSpec: frontLabel,
        quantity: frontM2,
        unit: 'м²',
      },
      {
        id: `${obj.instanceId}-kcol-hdf`,
        section: 'parametric',
        groupTitle: title,
        itemName: 'Гръб HDF (4 мм)',
        materialOrSpec: corpusLabel,
        quantity: hdfM2,
        unit: 'м²',
      }
    );

    if (spec.plinthHeightCm > 0) {
      items.push({
        id: `${obj.instanceId}-kcol-plinth`,
        section: 'parametric',
        groupTitle: title,
        itemName: `Цокъл (${spec.plinthHeightCm} см)`,
        materialOrSpec: `Цвят ${spec.plinthColor.toUpperCase()}`,
        quantity: round2(W),
        unit: 'л.м.',
      });
    }

    items.push({
      id: `${obj.instanceId}-kcol-hinges`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Панти с плавно прибиране',
      materialOrSpec: 'Мебелен обков',
      quantity: modCount * 4,
      unit: 'бр.',
    });

    return items;
  }

  const showBase =
    spec.layoutMode === 'base-only' || spec.layoutMode === 'base-and-wall';
  const showWall =
    spec.layoutMode === 'wall-only' || spec.layoutMode === 'base-and-wall';

  let baseCorpusM2 = 0;
  let wallCorpusM2 = 0;
  let baseFrontM2 = 0;
  let wallFrontM2 = 0;
  let hdfM2 = 0;
  let drawerSets = 0;
  let hingeCount = 0;
  let handleCount = 0;
  let hasOven = false;
  let hasSink = false;

  if (showBase) {
    baseCorpusM2 =
      totalModules * 2 * baseBoxH * baseD +
      totalRunW * baseD +
      totalRunW * 0.25 +
      totalModules * 0.5 * (totalRunW / totalModules) * (baseD - 0.05);
    hdfM2 += totalRunW * baseBoxH;

    for (let i = 0; i < modCount; i++) {
      const mType = spec.modulePattern[i % spec.modulePattern.length] ?? 'doors';
      const modW = W / modCount;
      if (mType === 'drawers') {
        baseFrontM2 += modW * baseBoxH;
        drawerSets += 3;
        handleCount += 3;
      } else if (mType === 'oven') {
        hasOven = true;
        baseFrontM2 += modW * 0.14;
        drawerSets += 1;
        handleCount += 1;
      } else if (mType === 'sink') {
        hasSink = true;
        baseFrontM2 += modW * baseBoxH;
        hingeCount += modW >= 0.78 ? 4 : 2;
        handleCount += modW >= 0.78 ? 2 : 1;
      } else {
        baseFrontM2 += modW * baseBoxH;
        hingeCount += modW >= 0.78 ? 4 : 2;
        handleCount += modW >= 0.78 ? 2 : 1;
      }
    }

    if (isLShape) {
      const wingModW = netWingW / wingModCount;
      for (let i = 0; i < wingModCount; i++) {
        baseFrontM2 += wingModW * baseBoxH;
        if (i % 2 === 1) {
          drawerSets += 3;
          handleCount += 3;
        } else {
          hingeCount += 2;
          handleCount += 1;
        }
      }
    }
  }

  const wallTotalW = isLShape ? W + wingW - wallCabD : W;
  const hoodType = spec.hoodType ?? 'chimney';

  if (showWall) {
    const wallMods = isLShape
      ? modCount + Math.max(1, Math.round(wingW / Math.max(0.35, W / modCount)))
      : modCount;
    const chimneySlots = hasOven && hoodType === 'chimney' ? 1 : 0;
    const activeWallCabinets = Math.max(0, wallMods - chimneySlots);

    wallCorpusM2 =
      activeWallCabinets * 2 * wallCabH * wallCabD +
      2 * wallTotalW * wallCabD +
      activeWallCabinets *
        (wallTotalW / Math.max(1, wallMods)) *
        (wallCabD - 0.03);
    wallFrontM2 =
      activeWallCabinets * (wallTotalW / Math.max(1, wallMods)) * wallCabH;
    hdfM2 += wallTotalW * wallCabH;
    hingeCount += activeWallCabinets * 2;
    handleCount += activeWallCabinets;
  }

  const totalCorpusM2 = round2(baseCorpusM2 + wallCorpusM2);
  const totalFrontM2 = round2(baseFrontM2 + wallFrontM2);

  if (totalCorpusM2 > 0) {
    items.push({
      id: `${obj.instanceId}-k-corpus`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Плочи корпус (ПДЧ 18 мм)',
      materialOrSpec: corpusLabel,
      quantity: totalCorpusM2,
      unit: 'м²',
    });
  }

  if (totalFrontM2 > 0) {
    items.push({
      id: `${obj.instanceId}-k-front`,
      section: 'parametric',
      groupTitle: title,
      itemName: `Лице / Вратички (${
        spec.frontStyle === 'shaker'
          ? 'фрезована рамка'
          : spec.frontStyle === 'gola'
            ? 'Gola'
            : 'гладък МДФ'
      })`,
      materialOrSpec: frontLabel,
      quantity: totalFrontM2,
      unit: 'м²',
    });
  }

  if (hdfM2 > 0) {
    items.push({
      id: `${obj.instanceId}-k-hdf`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Гръб HDF (4 мм)',
      materialOrSpec: corpusLabel,
      quantity: round2(hdfM2),
      unit: 'м²',
    });
  }

  if (showBase) {
    const countertopLm = round2(isLShape ? W + wingW : W);
    items.push({
      id: `${obj.instanceId}-k-top`,
      section: 'parametric',
      groupTitle: title,
      itemName: `Термоплот (${spec.depthCm} см × ${spec.countertopThicknessCm} см)`,
      materialOrSpec: topLabel,
      quantity: countertopLm,
      unit: 'л.м.',
      notes: isLShape ? 'С включена ъглова снадка' : undefined,
    });

    if (spec.plinthHeightCm > 0) {
      items.push({
        id: `${obj.instanceId}-k-plinth`,
        section: 'parametric',
        groupTitle: title,
        itemName: `Водоустойчив PVC цокъл (${spec.plinthHeightCm} см)`,
        materialOrSpec: `Цвят ${spec.plinthColor.toUpperCase()}`,
        quantity: round2(totalRunW),
        unit: 'л.м.',
      });
    }
  }

  if (spec.layoutMode === 'base-and-wall' && backsplashH > 0) {
    const backArea = round2((isLShape ? W + wingW : W) * backsplashH);
    items.push({
      id: `${obj.instanceId}-k-backsplash`,
      section: 'parametric',
      groupTitle: title,
      itemName: `Термогръб / Стенна облицовка (H=${spec.backsplashHeightCm} см)`,
      materialOrSpec: backLabel,
      quantity: backArea,
      unit: 'м²',
    });
  }

  if (spec.frontStyle === 'gola') {
    const golaLm = round2(
      (showBase ? totalRunW * 2 : 0) + (showWall ? wallTotalW : 0)
    );
    items.push({
      id: `${obj.instanceId}-k-gola`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Алуминиев Gola профил (без дръжки)',
      materialOrSpec: 'Профил C / L за вграждане',
      quantity: golaLm,
      unit: 'л.м.',
    });
  } else if (spec.handleStyle !== 'none' && handleCount > 0) {
    items.push({
      id: `${obj.instanceId}-k-handles`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Мебелни дръжки',
      materialOrSpec: `Цвят ${spec.handleColor.toUpperCase()}`,
      quantity: handleCount,
      unit: 'бр.',
    });
  }

  if (hingeCount > 0) {
    items.push({
      id: `${obj.instanceId}-k-hinges`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Панти с плавно прибиране',
      materialOrSpec: 'Мебелен обков',
      quantity: hingeCount,
      unit: 'бр.',
    });
  }

  if (drawerSets > 0) {
    items.push({
      id: `${obj.instanceId}-k-drawers`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Водачи за чекмеджета (тандем)',
      materialOrSpec: `Дълбочина ${Math.max(40, spec.depthCm - 5)} см`,
      quantity: drawerSets,
      unit: 'бр.',
    });
  }

  if (showWall && spec.hasUnderCabinetLed) {
    items.push({
      id: `${obj.instanceId}-k-led`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'LED профил + лента и захранване под горен ред',
      materialOrSpec: `Яркост ${spec.ledIntensity ?? 100}%`,
      quantity: round2(wallTotalW),
      unit: 'л.м.',
    });
  }

  if (hasOven) {
    items.push({
      id: `${obj.instanceId}-k-oven`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Фурна за вграждане + стъклокерамичен плот',
      materialOrSpec: 'Модул 60 см',
      quantity: 1,
      unit: 'бр.',
    });

    if (hoodType !== 'none') {
      items.push({
        id: `${obj.instanceId}-k-hood`,
        section: 'parametric',
        groupTitle: title,
        itemName:
          hoodType === 'integrated'
            ? 'Телескопичен / вграден аспиратор'
            : 'Декоративен коминeн аспиратор',
        materialOrSpec: 'Ширина 60 см',
        quantity: 1,
        unit: 'бр.',
      });
    }
  }

  if (hasSink) {
    items.push({
      id: `${obj.instanceId}-k-sink`,
      section: 'parametric',
      groupTitle: title,
      itemName: 'Кухненска мивка + стоящ смесител + сифон',
      materialOrSpec: 'Комплект за вграждане в плот',
      quantity: 1,
      unit: 'бр.',
    });
  }

  return items;
}

export function buildProjectBomReport(
  room: RoomConfig,
  sceneObjects: SceneObject[],
  models: CatalogModel[],
  textures: CatalogTexture[]
): ProjectBomReport {
  const items: BomLineItem[] = [];

  // 1. ПОМЕЩЕНИЕ: ПОДОВИ НАСТИЛКИ И ЗОНИ
  const closedRooms = findClosedRoomPolygons(room.walls);
  const baseFloorArea = round2(
    closedRooms.reduce((acc, poly) => acc + polygonAreaM2(poly), 0)
  );
  const floorZones = room.floorZones ?? [];
  const zonesArea = round2(
    floorZones.reduce((acc, z) => acc + polygonAreaM2(z.points), 0)
  );

  for (const z of floorZones) {
    const area = round2(polygonAreaM2(z.points));
    if (area <= 0) continue;
    items.push({
      id: `room-zone-${z.id}`,
      section: 'room',
      groupTitle: 'Помещение и настилки',
      itemName: `Подова настилка — ${z.name}`,
      materialOrSpec: resolveFinishLabel(z.color, z.textureId, textures),
      quantity: area,
      unit: 'м²',
    });
  }

  const remainingFloorArea = round2(Math.max(0, baseFloorArea - zonesArea));
  if (remainingFloorArea > 0) {
    items.push({
      id: 'room-base-floor',
      section: 'room',
      groupTitle: 'Помещение и настилки',
      itemName:
        floorZones.length > 0
          ? 'Основна подова настилка (извън зоните)'
          : 'Подова настилка (паркет / гранитогрес)',
      materialOrSpec: `${closedRooms.length} затворени помещения`,
      quantity: remainingFloorArea,
      unit: 'м²',
    });
  }

  const totalFloorAreaM2 =
    baseFloorArea > 0 ? Math.max(baseFloorArea, zonesArea) : zonesArea;

  // 2. ПОМЕЩЕНИЕ: СТЕНИ И ПЕРВАЗИ
  let totalWallLengthM = 0;
  let openingsAreaM2 = 0;
  for (const w of room.walls) {
    totalWallLengthM += getWallLengthM(w);
    for (const op of w.openings ?? []) {
      openingsAreaM2 += op.widthM * op.heightM;
    }
  }
  for (const op of room.openings ?? []) {
    openingsAreaM2 += op.widthM * op.heightM;
  }

  const grossSingleSideWallM2 = totalWallLengthM * room.ceilingHeightM;
  const netWallAreaM2 = round2(
    Math.max(0, grossSingleSideWallM2 - openingsAreaM2)
  );

  if (netWallAreaM2 > 0) {
    items.push({
      id: 'room-walls-paint',
      section: 'room',
      groupTitle: 'Помещение и настилки',
      itemName: 'Стенно покритие (боя / мазилка / тапет, 1 страна)',
      materialOrSpec: `Височина ${room.ceilingHeightM.toFixed(2)} м (приспаднати отвори)`,
      quantity: netWallAreaM2,
      unit: 'м²',
    });
  }

  if (totalWallLengthM > 0) {
    items.push({
      id: 'room-skirting',
      section: 'room',
      groupTitle: 'Помещение и настилки',
      itemName: 'Подов перваз (ориентировъчно по периметър)',
      materialOrSpec: `${room.walls.length} стени`,
      quantity: round2(totalWallLengthM),
      unit: 'л.м.',
    });
  }

  // 3. ПАРАМЕТРИЧНИ МЕБЕЛИ (КУХНИ И ГАРДЕРОБИ)
  for (const obj of sceneObjects) {
    if (!obj.parametric) continue;
    if (obj.parametric.kind === 'wardrobe' && obj.parametric.wardrobe) {
      items.push(...buildWardrobeBom(obj, obj.parametric.wardrobe, textures));
    } else if (obj.parametric.kind === 'kitchen' && obj.parametric.kitchen) {
      items.push(...buildKitchenBom(obj, obj.parametric.kitchen, textures));
    }
  }

  // 4. ГОТОВИ 3D МОДЕЛИ ОТ КАТАЛОГА (ГРУПИРАНИ ПО МОДЕЛ И МАЩАБ)
  const catalogGroups = new Map<
    string,
    {
      name: string;
      spec: string;
      count: number;
    }
  >();

  let catalogFurnitureCount = 0;
  for (const obj of sceneObjects) {
    if (obj.parametric) continue;
    catalogFurnitureCount++;
    const model = models.find((m) => m.id === obj.modelId);
    const wCm = Math.round((model?.dimensionsCm.width ?? 100) * obj.scale[0]);
    const hCm = Math.round((model?.dimensionsCm.height ?? 100) * obj.scale[1]);
    const dCm = Math.round((model?.dimensionsCm.depth ?? 100) * obj.scale[2]);
    const displayName = obj.name || model?.name || 'Мебел от каталога';
    const dimSpec = `${wCm} × ${dCm} × ${hCm} см`;
    const key = `${obj.modelId}::${displayName}::${dimSpec}`;

    const existing = catalogGroups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      catalogGroups.set(key, {
        name: displayName,
        spec: dimSpec,
        count: 1,
      });
    }
  }

  let catIdx = 0;
  for (const [, entry] of catalogGroups) {
    catIdx++;
    items.push({
      id: `catalog-item-${catIdx}`,
      section: 'catalog',
      groupTitle: 'Готови мебели от каталога',
      itemName: entry.name,
      materialOrSpec: `Габарит ${entry.spec}`,
      quantity: entry.count,
      unit: 'бр.',
    });
  }

  // ОБОБЩЕНИ МЕТРИКИ
  let boardAreaM2 = 0;
  let countertopLm = 0;
  let hardwareCount = 0;

  for (const item of items) {
    if (item.section === 'parametric') {
      if (item.unit === 'м²' && item.itemName.includes('Плочи')) {
        boardAreaM2 += item.quantity;
      }
      if (item.unit === 'л.м.' && item.itemName.includes('Термоплот')) {
        countertopLm += item.quantity;
      }
      if (
        item.unit === 'бр.' &&
        (item.itemName.includes('Панти') ||
          item.itemName.includes('водачи') ||
          item.itemName.includes('дръжки'))
      ) {
        hardwareCount += item.quantity;
      }
    }
  }

  return {
    items,
    summary: {
      floorAreaM2: round2(totalFloorAreaM2),
      netWallAreaM2,
      boardAreaM2: round2(boardAreaM2),
      countertopLm: round2(countertopLm),
      hardwareCount: Math.round(hardwareCount),
      catalogFurnitureCount,
    },
  };
}

export function exportBomToCsv(
  projectTitle: string,
  report: ProjectBomReport
): void {
  const sectionNames: Record<BomSection, string> = {
    room: 'Помещение',
    parametric: 'Мебели по поръчка',
    catalog: 'Каталожни мебели',
  };

  const escapeCsv = (val: string | number | undefined) => {
    const s = String(val ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = [
    'Раздел',
    'Група / Изделие',
    'Позиция / Материал',
    'Спецификация / Декор',
    'Количество',
    'Мярка',
    'Бележка',
  ].join(';');

  const rows = report.items.map((item) =>
    [
      escapeCsv(sectionNames[item.section]),
      escapeCsv(item.groupTitle),
      escapeCsv(item.itemName),
      escapeCsv(item.materialOrSpec),
      escapeCsv(String(item.quantity).replace('.', ',')),
      escapeCsv(item.unit),
      escapeCsv(item.notes ?? ''),
    ].join(';')
  );

  const csvContent = `\uFEFF${header}\n${rows.join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug =
    projectTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '-')
      .replace(/^-|-$/g, '') || 'project';
  a.href = url;
  a.download = `specifikacia-${safeSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}