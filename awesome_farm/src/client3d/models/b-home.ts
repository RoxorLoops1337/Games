// Every home and decor building kind and its model maker.
import type { BuildingMaker } from './kit';
import { barrelModel, benchModel, fenceModel, flowerbedModel, haybaleModel, hedgeModel, tableModel } from './b-home-decor';
import { bannerModel, scarecrowModel, signpostModel, statueModel } from './b-home-decor2';
import { floorModel } from './b-home-floors';
import { fountainModel } from './b-home-fountain';
import { roofModel } from './b-home-roofs';
import { doorwayModel, wallModel } from './b-home-walls';

export const HOME: Record<string, BuildingMaker> = {

    wall_wood: (o) => wallModel('wood', o),
    wall_stone: (o) => wallModel('stone', o),
    wall_brick: (o) => wallModel('brick', o),
    wall_window: (o) => wallModel('window', o),
    doorway: doorwayModel,
    roof_thatch: (o) => roofModel('thatch', o),
    roof_tile: (o) => roofModel('tile', o),
    roof_slate: (o) => roofModel('slate', o),
    path: (o) => floorModel('path', o),
    planks: (o) => floorModel('planks', o),
    brickfloor: (o) => floorModel('brickfloor', o),
    slatefloor: (o) => floorModel('slatefloor', o),
    carpet: (o) => floorModel('carpet', o),
    stonewall: (o) => wallModel('block', o),
    fence: fenceModel,
    hedge: hedgeModel,
    flowerbed: flowerbedModel,
    barrel: barrelModel,
    haybale: haybaleModel,
    bench: benchModel,
    table: tableModel,
    signpost: signpostModel,
    banner: bannerModel,
    scarecrow: scarecrowModel,
    statue: statueModel,
    fountain: fountainModel
};
