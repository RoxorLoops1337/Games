// Flat3D interior (Interior Artist). STUB: replaced by the real flat. See FLAT_PLAN.md for the contract.
import { THREE } from './kit.js';
export function buildFlat(ctx) {
  const group = new THREE.Group(); const A = (x, z, rot) => ({ x, z, rot: rot || 0 });
  const mk = (id, anchor, label, icon, color, color2, clip) => ({ id, anchor, label, icon, color, color2, cine: { snap: true, face: 'rot', clip, zoom: 0.2 } });
  return { group, interior: true, bounds: { minX: -7.5, maxX: 7.5, minZ: -5.5, maxZ: 5.5 }, blocked: () => false, heightAt: () => 0, pathDist: () => 0, keepout: () => false, paths: [],
    anchors: { start: A(4, 3, Math.PI), door: A(5.5, 5), boothSpot: A(5, -3), couchSpot: A(-4, 0), bedSpot: A(-5, 3.5), deskSpot: A(0, -4), kitchenSpot: A(3, -4), wardrobeSpot: A(-6.5, -2), foxy: A(-4, -0.5) },
    spotDefs: [mk('booth', 'boothSpot', 'TRAIN', 'booth', '#ff3ea5', '#ffe14d', 'beatbox'), mk('couch', 'couchSpot', 'TAPES', 'couch', '#a86bff', '#2ee6ff', 'sit'), mk('bed', 'bedSpot', 'SLEEP', 'bed', '#2ee6ff', '#a86bff', 'sit'), mk('desk', 'deskSpot', 'STREAM', 'desk', '#ff3ea5', '#2ee6ff', 'talk'), mk('kitchen', 'kitchenSpot', 'EAT', 'kitchen', '#9dff4a', '#ffe14d', 'cheer'), mk('wardrobe', 'wardrobeSpot', 'STYLE', 'wardrobe', '#ffe14d', '#ff3ea5', 'wave'), mk('door', 'doorSpot', 'LEAVE', 'door', '#9dff4a', '#2ee6ff', 'wave')],
    camera: { dist: 11, pitch: 50, yaw: 35, fov: 34, minDist: 7, maxDist: 15, focusY: 0.8 }, lights: [], windows: [] };
}
