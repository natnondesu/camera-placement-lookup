// @ts-check

/**
 * The escalator pair as three.js scenery: balustrades, comb plates, steps, wells and slab. The geometry itself comes
 * from src/escalator.js (handed in as p.escalatorKit, because walk-sim.js is tested in node without page globals).
 *
 * Scene axes: x is mirrored against the layout's x (scene x = -x), z = distanceM + u, y is height above the landing.
 */

/** Steps are lifted a hair so the level ones do not fight the floor they sit on. */
const STEP_LIFT = 0.012;
const STEP_THICKNESS = 0.3;
/** Each tread is a little shallower than its pitch, so the gaps read as the grooves between steps. */
const STEP_GAP = 0.88;
const COMB_DEPTH = 0.25;
const COMB_HEIGHT = 0.03;
const WALL = 0.06;
/** How far the floor and grid reach: the same 90 m square the scene always drew. */
const GROUND = { minX: -45, maxX: 45, minZ: -15, maxZ: 75 };
const COLOURS = {
  panel: "#48505c",
  glass: "#8fa3b8",
  rail: "#222730",
  tread: "#626b79",
  hood: "#2b313b",
  deck: "#363d49",
  comb: "#8d95a1",
  slab: "#323944",
  pit: "#3a414c",
  pitFloor: "#343b47",
  floor: "#2a2f37",
  gridLine: "#323944",
  gridCentre: "#3d4552",
};

/**
 * @param {typeof import("three")} THREE
 * @param {any} p the placement: escalator (layout), escalatorKit, distanceM, faceLineDistanceM, faceLineVisible, colors
 * @param {(color: string) => any} material
 * @param {number} stripWidth how wide the counting and face line strips are
 * @returns {{
 *   group: any, replacesGround: boolean,
 *   setTravel: (travelM: number) => void,
 *   treadY: (role: string, u: number, travelM: number) => number,
 * }}
 */
export function buildEscalatorScene(THREE, p, material, stripWidth) {
  const kit = p.escalatorKit;
  const E = kit.ESCALATOR;
  const layout = p.escalator;
  const d = p.distanceM;
  const group = new THREE.Group();
  const bal = E.balustradeM;
  const bottom = layout.landing === "bottom";
  const pit = kit.pitDepthM(layout);
  const wells = kit.floorWells(layout);

  const cache = new Map();
  const shared = (key) => {
    if (!cache.has(key)) {
      const made = material(COLOURS[key]);
      // The same finish as the plain floor, so the pieces around a well do not show a seam against it.
      if (key === "floor") made.roughness = 0.95;
      // Glass lets riders and the step line show through; it does not write depth, so it never hides an avatar.
      if (key === "glass") Object.assign(made, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      cache.set(key, made);
    }
    return cache.get(key);
  };

  const box = (xa, xb, ya, yb, ua, ub, key) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, yb - ya, ub - ua), shared(key));
    mesh.position.set(-(xa + xb) / 2, (ya + yb) / 2, d + (ua + ub) / 2);
    return mesh;
  };

  // A side profile (u, y) pulled across x from xa to xb.
  const prism = (points, xa, xb, key) => {
    const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point.u, point.y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: xb - xa, bevelEnabled: false });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(-xa, 0, d);
    return new THREE.Mesh(geometry, shared(key));
  };

  const beltTravel = (role, travelM) => (role === "arrive" ? -travelM : travelM);
  const treadY = (role, u, travelM) => {
    const under = kit.stepUnder(layout, u, beltTravel(role, travelM));
    return under ? under.topY + STEP_LIFT : 0;
  };

  const base = bottom ? 0 : -pit;
  const innerHalf = layout.dividerM / 2 - bal;
  const sides = layout.lanes.flatMap((lane) => [[lane.minX - bal, lane.minX], [lane.maxX, lane.maxX + bal]]);
  sides.forEach(([xa, xb]) => {
    group.add(prism(kit.slopeBand(layout, E.handrailM, 0), xa, xb, "glass"));
    if (!bottom) group.add(prism(kit.slopeSkirt(layout, 0, base), xa, xb, "panel"));
    group.add(prism(kit.slopeBand(layout, E.handrailM + 0.04, E.handrailM - 0.05), xa - 0.02, xb + 0.02, "rail"));
  });
  if (innerHalf > 0.001) group.add(prism(bottom ? kit.slopeBand(layout, E.handrailM, 0) : kit.slopeSkirt(layout, E.handrailM, base), -innerHalf, innerHalf, "panel"));

  if (bottom) {
    // A truss band under the incline, open beneath it, instead of a wall filled down to the floor.
    const slope = (layout.riseM - 0.06) / (layout.endU - layout.inclineU);
    const outer = layout.widthM / 2 + bal;
    const truss = [
      { u: layout.inclineU, y: 0 }, { u: layout.endU, y: layout.riseM - 0.06 },
      { u: layout.endU, y: layout.riseM - 0.06 - E.trussM }, { u: layout.inclineU + E.trussM / slope, y: 0 },
    ];
    group.add(prism(truss, -outer, outer, "deck"));
  }

  const steps = [];
  const pitch = E.stepDepthM;
  const dummy = new THREE.Object3D();
  const stepGeometry = new THREE.BoxGeometry(1, STEP_THICKNESS, 1);
  layout.lanes.forEach((lane) => {
    if (!bottom) group.add(prism(kit.slopeBand(layout, -0.06, -E.trussM), lane.minX, lane.maxX, "deck"));
    group.add(box(lane.minX, lane.maxX, 0, COMB_HEIGHT, layout.combU - COMB_DEPTH, layout.combU, "comb"));
    const capacity = kit.stepCentres(layout, 0).length + 2;
    const mesh = new THREE.InstancedMesh(stepGeometry, shared("tread"), capacity);
    mesh.frustumCulled = false;
    group.add(mesh);
    steps.push({ role: lane.role, mesh, lane });
  });

  function setTravel(travelM) {
    steps.forEach(({ role, mesh, lane }) => {
      const centres = kit.stepCentres(layout, beltTravel(role, travelM));
      mesh.count = Math.min(centres.length, mesh.instanceMatrix.count);
      for (let i = 0; i < mesh.count; i += 1) {
        const top = kit.surfaceHeight(layout, centres[i]) + STEP_LIFT;
        dummy.position.set(-lane.centreX, top - STEP_THICKNESS / 2, d + centres[i]);
        dummy.scale.set(layout.stepWidthM - 0.04, 1, pitch * STEP_GAP);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    laneStrips.forEach(({ role, mesh, u }) => { mesh.position.y = treadY(role, u, travelM) + 0.004; });
  }

  // Riders appear and vanish inside a solid housing over the far end of each belt, so nobody pops in view.
  layout.lanes.forEach((lane) => {
    const a = layout.endU - 0.6;
    const heights = [kit.surfaceHeight(layout, a), kit.surfaceHeight(layout, layout.endU)];
    group.add(box(lane.minX - bal, lane.maxX + bal, Math.min(...heights) - 0.1, Math.max(...heights) + 2.4, a, layout.endU + 0.5, "hood"));
  });

  if (bottom) {
    const reach = layout.widthM / 2 + bal + 1;
    group.add(box(-reach, reach, 0, layout.riseM, layout.endU, layout.endU + E.slabM, "slab"));
  }

  const wellMeshes = wells.length > 0;
  if (wellMeshes) addWells();

  function addWells() {
    // The floor and grid are rebuilt around the wells, in the scene's own frame, so nothing is drawn across a well.
    const scene = (w) => ({ minX: -w.maxX, maxX: -w.minX, minU: w.minU + d, maxU: w.maxU + d });
    const holes = wells.map(scene);
    const ground = { minX: GROUND.minX, maxX: GROUND.maxX, minU: GROUND.minZ, maxU: GROUND.maxZ };
    kit.floorPieces(ground, holes).forEach((piece) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(piece.maxX - piece.minX, piece.maxU - piece.minU), shared("floor"));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((piece.minX + piece.maxX) / 2, 0, (piece.minU + piece.maxU) / 2);
      group.add(mesh);
    });
    const segments = kit.gridSegments(ground, 1, holes);
    const isCentre = (s) => (s.x0 === s.x1 && s.x0 === 0) || (s.u0 === s.u1 && s.u0 === (GROUND.minZ + GROUND.maxZ) / 2);
    [[true, "gridCentre"], [false, "gridLine"]].forEach(([centre, key]) => {
      const chosen = segments.filter((s) => isCentre(s) === centre);
      const positions = new Float32Array(chosen.flatMap((s) => [s.x0, 0.002, s.u0, s.x1, 0.002, s.u1]));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: COLOURS[key] })));
    });

    wells.forEach((well, i) => {
      const outerIsMin = layout.lanes[i].role === "leave";
      const [wa, wb] = [well.minX, well.maxX];
      const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(wb - wa, well.maxU - well.minU), shared("pitFloor"));
      pitFloor.rotation.x = -Math.PI / 2;
      pitFloor.position.set(-(wa + wb) / 2, -pit, d + (well.minU + well.maxU) / 2);
      group.add(pitFloor);
      const [oa, ob] = outerIsMin ? [wa - WALL, wa] : [wb, wb + WALL];
      group.add(box(oa, ob, -pit, 0, well.minU, well.maxU, "pit"));
      group.add(box(oa, ob, 0, E.guardM, well.minU, well.maxU, "panel"));
      group.add(box(wa - WALL, wb + WALL, -pit, 0, well.maxU, well.maxU + WALL, "pit"));
      group.add(box(wa - WALL, wb + WALL, -pit, 0, well.minU - WALL, well.minU, "pit"));
    });
  }

  // The face line: one strip on the floor while it is on the landing; across the pair it is cut into pieces beside
  // the pair and on each lane, at the height of the step it crosses, so it stays readable over the steps.
  const laneStrips = [];
  const faceApart = p.faceLineDistanceM !== null && Math.abs(p.faceLineDistanceM - d) > 0.02;
  if (faceApart) {
    const u = p.faceLineDistanceM - d;
    const strip = (width, x, y, role) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 0.09),
        new THREE.MeshBasicMaterial({ color: p.colors.face, transparent: true, opacity: p.faceLineVisible ? 0.9 : 0.35 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, p.faceLineDistanceM);
      group.add(mesh);
      if (role) laneStrips.push({ role, mesh, u });
    };
    if (u <= layout.combU) {
      strip(stripWidth, 0, 0.006, null);
    } else {
      const edge = layout.widthM / 2 + bal;
      const rest = stripWidth / 2 - edge;
      if (rest > 0.01) {
        strip(rest, -(edge + rest / 2), 0.006, null);
        strip(rest, edge + rest / 2, 0.006, null);
      }
      layout.lanes.forEach((lane) => strip(layout.stepWidthM, -lane.centreX, 0.006, lane.role));
    }
  }

  setTravel(0);
  return { group, replacesGround: wellMeshes, setTravel, treadY };
}
