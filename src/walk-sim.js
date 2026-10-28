// Walk simulation seen through the placement camera. Three.js and the lens maths (pixel density,
// fisheye projection) are passed in, so this module loads without them; crossingDirection is unit-tested.

/**
 * @param {number} previousZ distance from the camera on the last frame (m)
 * @param {number} z distance now (m)
 * @param {number} lineZ distance of the line (m)
 * @returns {"in" | "out" | null} "in" when walking toward the camera across the line
 */
export function crossingDirection(previousZ, z, lineZ) {
  if (previousZ > lineZ && z <= lineZ) return "in";
  if (previousZ < lineZ && z >= lineZ) return "out";
  return null;
}

/**
 * Places one label per person without overlaps: above the box if free, else below, else left out.
 * Higher priority (a bigger, nearer person) claims its spot first.
 * @param {{ text: string, width: number, height: number, centreX: number, top: number, bottom: number, priority: number }[]} candidates
 * @param {{ x: number, y: number, w: number, h: number }[]} blocked areas already drawn, such as the readout box
 * @param {number} canvasWidth
 * @returns {{ text: string, x: number, y: number, w: number, h: number }[]} in placement order
 */
export function placeLabels(candidates, blocked, canvasWidth) {
  const taken = [...blocked];
  const overlaps = (a) => taken.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  const placed = [];
  [...candidates].sort((a, b) => b.priority - a.priority).forEach((c) => {
    const x = Math.max(0, Math.min(canvasWidth - c.width, c.centreX - c.width / 2));
    const spot = [c.top - 3 - c.height, c.bottom + 3]
      .map((y) => ({ text: c.text, x, y, w: c.width, h: c.height }))
      .find((rect) => rect.y >= 0 && !overlaps(rect));
    if (!spot) return;
    taken.push(spot);
    placed.push(spot);
  });
  return placed;
}

const MODEL_HEIGHT_M = 1.7;
// Matches the engine's 80% effective coverage: the outer 10% each side, or 20% of a fisheye's radius.
const EFFECTIVE_SHARE = 0.8;
const SKIN = ["#f1c7a5", "#d9a47c", "#b97b52", "#8d5a3b", "#5f3b26"];
const TOPS = ["#3d6fb6", "#7a8796", "#b5443c", "#2f7d5b", "#c9a227", "#e6e1d6", "#5a4a8c", "#26313d"];
const BOTTOMS = ["#2b3440", "#3c4f6b", "#5b5148", "#1f2329", "#6b6f75"];
const HAIR = ["#1b1612", "#3b2a1e", "#6b4a2b", "#8a8a8a"];

const FISHEYE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Equidistant fisheye: image radius is proportional to the angle from the downward axis.
const FISHEYE_FRAGMENT = `
uniform samplerCube tCube;
uniform float halfFov;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) {
    gl_FragColor = vec4(0.02, 0.025, 0.03, 1.0);
    return;
  }
  float theta = r * halfFov;
  float phi = atan(p.y, p.x);
  vec3 dir = vec3(-sin(theta) * cos(phi), -cos(theta), sin(theta) * sin(phi));
  gl_FragColor = textureCube(tCube, dir);
  #include <colorspace_fragment>
}`;

/**
 * @param {typeof import("three")} THREE
 * @param {{ canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, playButton: HTMLButtonElement,
 *           resetButton: HTMLButtonElement, crossButton: HTMLButtonElement, passersRow: HTMLElement,
 *           counts: { in: HTMLElement, out: HTMLElement, faces: HTMLElement, passers: HTMLElement } }} ui
 */
export function createWalkSim(THREE, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171b22");
  scene.fog = new THREE.Fog("#171b22", 22, 48);
  scene.add(new THREE.HemisphereLight("#dfe7ff", "#2a2e35", 1.15));
  const sun = new THREE.DirectionalLight("#ffffff", 0.9);
  sun.position.set(4, 9, 3);
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: "#2a2f37", roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 30;
  scene.add(floor);
  const grid = new THREE.GridHelper(90, 90, "#3d4552", "#323944");
  grid.position.set(0, 0.002, 30);
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 120);
  camera.rotation.order = "YXZ";

  // Fisheye: capture every direction from the camera, then reproject through the lens model.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(768);
  const cubeCamera = new THREE.CubeCamera(0.05, 120, cubeTarget);
  const fisheyeMaterial = new THREE.ShaderMaterial({
    uniforms: { tCube: { value: cubeTarget.texture }, halfFov: { value: Math.PI / 2 } },
    vertexShader: FISHEYE_VERTEX,
    fragmentShader: FISHEYE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const fisheyeScene = new THREE.Scene();
  fisheyeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fisheyeMaterial));
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let props = new THREE.Group();
  scene.add(props);
  // Layer 1 holds what only the orbit view shows: the camera itself, its view cone and its aim.
  const HELPER_LAYER = 1;
  let helpers = new THREE.Group();
  scene.add(helpers);
  let orbit = null;
  let orbitActive = false;
  let countingStrip = null;
  let input = null;
  let layoutKey = "";
  let agents = [];
  let active = false;
  // The view opens still, on one person standing at the counting line; the crowd walks only when asked.
  let walking = false;
  let crossTraffic = true;
  // The site sheet's snapshot draws lines, bands and boxes but no text, which would shrink to smudges on paper.
  let quiet = false;
  let lastTime = 0;
  let seed = 7;
  // Seeded so a reset replays a believable crowd rather than a new random one each time.
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const counts = { in: 0, out: 0, faces: 0, passers: 0 };
  const isFisheye = () => input !== null && input.lens === "fisheye";
  // The scene's x runs opposite to the engine's: looking along +z, the camera's right is -x. So it sits at -offset.
  const cameraX = () => (input ? -input.offsetM : 0);

  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

  function makePerson() {
    const skin = material(pick(SKIN));
    const top = material(pick(TOPS));
    const bottom = material(pick(BOTTOMS));
    const hair = material(pick(HAIR));
    const group = new THREE.Group();
    const hipY = 0.92;
    const legGeometry = new THREE.BoxGeometry(0.13, 0.88, 0.15);
    legGeometry.translate(0, -0.44, 0);
    const legL = new THREE.Mesh(legGeometry, bottom);
    const legR = new THREE.Mesh(legGeometry, bottom);
    legL.position.set(-0.09, hipY, 0);
    legR.position.set(0.09, hipY, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.22), top);
    torso.position.y = hipY + 0.29;
    const armGeometry = new THREE.BoxGeometry(0.09, 0.6, 0.11);
    armGeometry.translate(0, -0.3, 0);
    const armL = new THREE.Mesh(armGeometry, top);
    const armR = new THREE.Mesh(armGeometry, top);
    armL.position.set(-0.245, hipY + 0.55, 0);
    armR.position.set(0.245, hipY + 0.55, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), skin);
    head.position.y = 1.595;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 1.605;
    group.add(legL, legR, torso, armL, armR, head, cap);
    return { group, legL, legR, armL, armR };
  }

  const standing = { body: makePerson(), flash: 0, flashDirection: null, faceFlash: 0 };
  scene.add(standing.body.group);
  const shownAgents = () => (walking ? agents : [standing]);

  function poseStanding(p) {
    const g = standing.body.group;
    g.position.set(0, 0, p.distanceM);
    g.rotation.y = Math.PI;
    g.scale.setScalar(p.humanHeightM / MODEL_HEIGHT_M);
  }

  function syncWalking() {
    agents.forEach((agent) => { agent.body.group.visible = walking; });
    standing.body.group.visible = !walking;
    ui.walkButton.setAttribute("aria-pressed", String(walking));
    ui.walkOnly.forEach((el) => { el.hidden = !walking; });
    ui.stillOnly.forEach((el) => { el.hidden = walking; });
  }

  function lineStrip(z, width, color, opacity) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 0.09),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.006, z);
    return strip;
  }

  function wallBox(width, height, x, y, z, depth = 0.18) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material("#3a404b"));
    wall.position.set(x, y, z);
    return wall;
  }

  // Where people may walk, from the scene and the lines on the floor.
  function layout(p) {
    const doorZ = p.scene === "open_door" ? p.distanceM + 0.35 : null;
    const endZ = Math.max(p.distanceM, p.faceLineDistanceM || 0) + 5;
    // The doorway or corridor is as wide as the entered entrance; typical sizes otherwise.
    const doorHalf = p.entranceWidthM ? p.entranceWidthM / 2 : 1.1;
    const corridorHalf = p.entranceWidthM ? p.entranceWidthM / 2 : 1.5;
    return { doorZ, endZ, doorHalf, corridorHalf, passZ: doorZ === null ? null : doorZ + 1.4 };
  }

  function rebuildProps(p) {
    scene.remove(props);
    props.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    props = new THREE.Group();
    const lay = layout(p);
    const stripWidth = Math.max(8, Math.min(p.coverageWidthM, 40) * 1.4) + 2 * Math.abs(p.offsetM);
    countingStrip = lineStrip(p.distanceM, stripWidth, p.colors.count, 0.85);
    props.add(countingStrip);
    if (p.faceLineDistanceM !== null && Math.abs(p.faceLineDistanceM - p.distanceM) > 0.02) {
      props.add(lineStrip(p.faceLineDistanceM, stripWidth, p.colors.face, p.faceLineVisible ? 0.9 : 0.35));
    }
    if (lay.doorZ !== null) {
      const side = 7;
      props.add(wallBox(side, 3, -(lay.doorHalf + side / 2), 1.5, lay.doorZ));
      props.add(wallBox(side, 3, lay.doorHalf + side / 2, 1.5, lay.doorZ));
      props.add(wallBox(lay.doorHalf * 2, 0.7, 0, 2.65, lay.doorZ));
    } else {
      const length = lay.endZ + 2;
      props.add(wallBox(0.18, 2.6, -lay.corridorHalf - 0.1, 1.3, length / 2, length));
      props.add(wallBox(0.18, 2.6, lay.corridorHalf + 0.1, 1.3, length / 2, length));
    }
    scene.add(props);
  }

  function spawn(agent, lay, p, fresh) {
    const roll = random();
    const kind = crossTraffic && roll < 0.35
      ? "cross"
      : lay.doorZ !== null && random() < 0.4 ? "pass" : random() < 0.6 ? "in" : "out";
    const lane = (random() * 2 - 1) * ((lay.doorZ !== null ? lay.doorHalf : lay.corridorHalf) - 0.35);
    const nearZ = 0.8;
    let from;
    let to;
    if (kind === "cross") {
      // Walks left to right across the view, on the camera side of the door, without crossing the counting line.
      const farthest = lay.doorZ !== null ? lay.doorZ - 0.5 : lay.endZ - 1;
      const z = 1.2 + random() * Math.max(0.5, farthest - 1.2);
      const span = lay.doorZ !== null ? Math.max(7, lay.doorHalf + 2) : lay.corridorHalf - 0.25;
      const dir = random() < 0.5 ? -1 : 1;
      from = { x: -span * dir, z };
      to = { x: span * dir, z };
    } else if (kind === "pass") {
      const z = lay.passZ + (random() - 0.5) * 0.6;
      const dir = random() < 0.5 ? -1 : 1;
      const span = Math.max(9, lay.doorHalf + 4);
      from = { x: -span * dir, z };
      to = { x: span * dir, z };
    } else if (kind === "in") {
      from = { x: lane, z: lay.endZ };
      to = { x: lane * 0.6, z: nearZ };
    } else {
      from = { x: lane * 0.6, z: nearZ };
      to = { x: lane, z: lay.endZ };
    }
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    Object.assign(agent, {
      kind,
      from,
      to,
      length,
      travelled: (fresh ? random() : 0) * length,
      speed: 1.05 + random() * 0.45,
      phase: random() * Math.PI * 2,
      lastZ: null,
      flash: 0,
      flashDirection: null,
      faceFlash: 0,
    });
    agent.body.group.scale.setScalar((p.humanHeightM / MODEL_HEIGHT_M) * (0.94 + random() * 0.1));
  }

  function respawnAll(p) {
    agents.forEach((a) => scene.remove(a.body.group));
    const lay = layout(p);
    agents = Array.from({ length: lay.doorZ !== null ? 7 : 6 }, () => {
      const agent = { body: makePerson() };
      scene.add(agent.body.group);
      spawn(agent, lay, p, true);
      return agent;
    });
    syncWalking();
  }

  function resize() {
    if (!input) return;
    const width = ui.canvas.parentElement.clientWidth;
    if (!width) return;
    setSize(width, Math.round(width / input.aspect));
  }

  function setSize(width, height) {
    renderer.setSize(width, height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ui.overlay.width = Math.round(width * dpr);
    ui.overlay.height = Math.round(height * dpr);
    ui.overlay.style.width = width + "px";
    ui.overlay.style.height = height + "px";
    ui.overlay.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function step(dt) {
    const lay = layout(input);
    for (const agent of agents) {
      agent.travelled += agent.speed * dt;
      if (agent.travelled >= agent.length) {
        if (agent.kind === "pass" || agent.kind === "cross") counts.passers += 1;
        spawn(agent, lay, input, false);
      }
      const t = agent.travelled / agent.length;
      const x = agent.from.x + (agent.to.x - agent.from.x) * t;
      const z = agent.from.z + (agent.to.z - agent.from.z) * t;
      const g = agent.body.group;
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(agent.to.x - agent.from.x, agent.to.z - agent.from.z);
      agent.phase += agent.speed * dt * 5.2;
      const swing = Math.sin(agent.phase);
      agent.body.legL.rotation.x = swing * 0.55;
      agent.body.legR.rotation.x = -swing * 0.55;
      agent.body.armL.rotation.x = -swing * 0.45;
      agent.body.armR.rotation.x = swing * 0.45;

      if (agent.kind !== "pass" && agent.kind !== "cross" && agent.lastZ !== null) {
        const crossed = crossingDirection(agent.lastZ, z, input.distanceM);
        if (crossed) {
          counts[crossed] += 1;
          agent.flash = 0.9;
          agent.flashDirection = crossed;
          if (countingStrip) countingStrip.material.opacity = 1;
        }
        const faceLine = input.faceLineDistanceM;
        if (faceLine !== null && input.faceLineVisible && crossingDirection(agent.lastZ, z, faceLine) === "in") {
          counts.faces += 1;
          agent.faceFlash = 0.9;
        }
      }
      agent.lastZ = z;
      agent.flash = Math.max(0, agent.flash - dt);
      agent.faceFlash = Math.max(0, agent.faceFlash - dt);
    }
  }

  const projected = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const toPoint = new THREE.Vector3();
  function toScreen(x, y, z, w, h) {
    if (isFisheye()) {
      const f = input.fisheyeProjection({ x: x - cameraX(), y: y - input.heightM, z });
      return { x: ((f.u + 1) / 2) * w, y: ((1 - f.v) / 2) * h, behind: !f.inside };
    }
    projected.set(x, y, z).project(camera);
    return { x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h, behind: projected.z > 1 };
  }

  // Pixel density at a point, from the console's lens model.
  function densityAt(x, y, z) {
    const offset = { x: x - cameraX(), y: y - input.heightM, z };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    let offAxisDeg;
    if (isFisheye()) {
      offAxisDeg = input.fisheyeProjection(offset).offAxisDeg;
    } else {
      camera.getWorldDirection(axis);
      toPoint.set(offset.x, offset.y, offset.z).normalize();
      offAxisDeg = (Math.acos(Math.max(-1, Math.min(1, axis.dot(toPoint)))) * 180) / Math.PI;
    }
    return input.pixelDensity(distance, offAxisDeg);
  }

  // The part of the image the console treats as reliable coverage.
  function drawEffectiveCoverage(ctx, w, h) {
    const shade = "rgba(8, 10, 14, 0.38)";
    const edgeColor = "rgba(120, 220, 160, 0.75)";
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 5]);
    ctx.font = "600 10px Inter, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    if (isFisheye()) {
      const cx = w / 2;
      const cy = h / 2;
      const radius = (Math.min(w, h) / 2) * EFFECTIVE_SHARE;
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(120, 220, 160, 0.9)";
      if (!quiet) ctx.fillText(input.text.effective, cx - radius * 0.7, cy + radius * 0.75);
      return;
    }
    const edge = w * ((1 - EFFECTIVE_SHARE) / 2);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, edge, h);
    ctx.fillRect(w - edge, 0, edge, h);
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, h);
    ctx.moveTo(w - edge, 0);
    ctx.lineTo(w - edge, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(120, 220, 160, 0.9)";
    if (!quiet) ctx.fillText(input.text.effective, edge + 5, h - 6);
  }

  function personBox(g, tall, w, h) {
    const { x, z } = g.position;
    const points = [
      [x, 0, z], [x, tall, z], [x - 0.3, tall / 2, z], [x + 0.3, tall / 2, z], [x, tall / 2, z - 0.3], [x, tall / 2, z + 0.3],
    ].map(([px, py, pz]) => toScreen(px, py, pz, w, h));
    if (points.some((p) => p.behind)) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (box.x > w || box.x + box.w < 0 || box.y > h || box.y + box.h < 0) return null;
    return box;
  }

  // Detection boxes and line labels, drawn the way a counting camera's overlay shows them.
  function drawOverlay() {
    const ctx = ui.overlay.getContext("2d");
    const w = parseFloat(ui.overlay.style.width) || 0;
    const h = parseFloat(ui.overlay.style.height) || 0;
    ctx.clearRect(0, 0, w, h);
    drawEffectiveCoverage(ctx, w, h);
    ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    const lay = layout(input);
    const lineLabels = [];
    const densityLabels = [];
    const label = (z, text, color) => {
      const left = toScreen(-1.4, 0, z, w, h);
      if (left.behind || left.y < 0 || left.y > h) return false;
      let y = Math.min(h - 4, left.y - 4);
      // Lines a few centimetres apart land on the same row; stack the later label above the earlier one.
      lineLabels.forEach((prev) => { if (Math.abs(prev.y + 13 - y) < 14) y = prev.y - 1; });
      if (quiet) return true;
      ctx.fillStyle = color;
      ctx.fillText(text, 8, y);
      lineLabels.push({ x: 8, y: y - 13, w: ctx.measureText(text).width, h: 14 });
      return true;
    };
    const countingVisible = label(input.distanceM, input.text.countingLine + " " + input.distanceM.toFixed(2) + " m", input.colors.count);
    if (input.faceLineDistanceM !== null && Math.abs(input.faceLineDistanceM - input.distanceM) > 0.02) {
      label(input.faceLineDistanceM, input.text.faceLine + " " + input.faceLineDistanceM.toFixed(2) + " m", input.colors.face);
    }
    for (const agent of shownAgents()) {
      const g = agent.body.group;
      const behindWall = lay.doorZ !== null && g.position.z > lay.doorZ + 0.1 && Math.abs(g.position.x) > lay.doorHalf - 0.1;
      if (behindWall) continue;
      const tall = MODEL_HEIGHT_M * g.scale.x;
      const box = personBox(g, tall, w, h);
      if (!box) continue;
      const counted = agent.flash > 0;
      const countColor = agent.flashDirection === "out" ? input.colors.out : input.colors.count;
      ctx.strokeStyle = counted ? countColor : "rgba(230, 236, 245, 0.55)";
      ctx.lineWidth = counted ? 2 : 1;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      const centreX = box.x + box.w / 2;
      // Density at this person's face, the figure demographics depend on.
      if (box.h >= 28) {
        const faceY = tall * (input.facePointM / input.humanHeightM);
        const text = Math.round(densityAt(g.position.x, faceY, g.position.z)) + " px/m";
        densityLabels.push({ text, centreX, top: box.y, bottom: box.y + box.h, priority: box.h });
      }
      if (counted) {
        const tag = agent.flashDirection === "out" ? input.text.out : input.text.in;
        const tagWidth = ctx.measureText(tag).width + 8;
        ctx.fillStyle = countColor;
        ctx.fillRect(box.x, box.y, tagWidth, 15);
        ctx.fillStyle = "#0f1217";
        ctx.fillText(tag, box.x + 4, box.y + 13);
      }
      if (agent.faceFlash > 0) {
        const head = Math.max(8, Math.min(box.w, box.h) * 0.3);
        ctx.strokeStyle = input.colors.face;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centreX - head / 2, box.y, head, head);
        ctx.fillStyle = input.colors.face;
        ctx.fillText(input.text.face, centreX + head / 2 + 3, box.y + head);
      }
    }
    if (quiet) return;
    // Density labels go last, placed around each other, the line labels and the readout box.
    ctx.font = "600 11px JetBrains Mono, monospace";
    const candidates = densityLabels.map((c) => ({ ...c, width: ctx.measureText(c.text).width + 8, height: 15 }));
    placeLabels(candidates, [densityReadoutRect(w), ...lineLabels], w).forEach((spot) => {
      ctx.fillStyle = "rgba(12, 15, 20, 0.62)";
      ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
      ctx.fillStyle = "rgba(230, 236, 245, 0.92)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(spot.text, spot.x + spot.w / 2, spot.y + spot.h / 2 + 0.5);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
    if (!countingVisible) {
      ctx.fillStyle = input.colors.bad;
      ctx.fillText(input.text.outsideFrame, 8, h - 8);
    }
    drawDensityReadout(ctx, w);
  }

  function densityReadoutRect(w) {
    const rows = input.faceLineDistanceM !== null ? 2 : 1;
    return { x: w - 184, y: 8, w: 176, h: 10 + rows * 17 };
  }

  // Top-right readout: pixel density where each line meets the floor (counting) or the face point (face).
  function drawDensityReadout(ctx, w) {
    const rows = [[input.text.countingLine, input.colors.count, densityAt(0, 0, input.distanceM)]];
    if (input.faceLineDistanceM !== null) {
      rows.push([input.text.faceLine, input.colors.face, densityAt(0, input.facePointM, input.faceLineDistanceM)]);
    }
    const lineHeight = 17;
    const { x, y, w: boxW, h: boxH } = densityReadoutRect(w);
    ctx.fillStyle = "rgba(12, 15, 20, 0.72)";
    ctx.fillRect(x, y, boxW, boxH);
    rows.forEach(([name, color, density], i) => {
      const rowY = y + 5 + (i + 1) * lineHeight - 4;
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, rowY - 8, 8, 3);
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(230, 236, 245, 0.9)";
      ctx.fillText(name, x + 22, rowY);
      ctx.font = "600 11px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(density) + " px/m", x + boxW - 8, rowY);
    });
    ctx.textAlign = "left";
  }

  // A measurement tag that always faces the orbit view and stays readable over the scene.
  function labelSprite(text, color) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = "600 44px 'JetBrains Mono', ui-monospace, monospace";
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = width;
    canvas.height = 72;
    ctx.font = font;
    ctx.fillStyle = "rgba(12, 15, 20, 0.86)";
    ctx.beginPath();
    ctx.roundRect(2, 2, width - 4, 68, 14);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#eef2f8";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 38);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    const tall = 0.46;
    sprite.scale.set((tall * width) / 72, tall, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // A dimension: a line with end ticks and its measurement in the middle.
  function dimension(a, b, text, color, tick) {
    const group = new THREE.Group();
    const points = [a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)];
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#eef2f8", transparent: true, opacity: 0.8, depthTest: false }),
    );
    lines.renderOrder = 9;
    const label = labelSprite(text, color);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    group.add(lines, label);
    return group;
  }

  function rebuildHelpers(p) {
    scene.remove(helpers);
    helpers.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    helpers = new THREE.Group();
    const origin = new THREE.Vector3(-p.offsetM, p.heightM, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.36), material(p.colors.camera));
    body.position.copy(origin);
    body.quaternion.copy(camera.quaternion);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, p.heightM, 8), material("#59616e"));
    mast.position.set(origin.x, p.heightM / 2, 0);
    helpers.add(body, mast);
    const lines = new THREE.LineBasicMaterial({ color: p.colors.camera, transparent: true, opacity: 0.75 });
    if (p.lens === "fisheye") {
      // The effective cone of a ceiling fisheye, drawn where it meets the floor.
      const radius = p.heightM * Math.tan(((p.fovDeg / 2) * EFFECTIVE_SHARE * Math.PI) / 180);
      const ring = Array.from({ length: 65 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2;
        return new THREE.Vector3(origin.x + Math.cos(a) * radius, 0.02, Math.sin(a) * radius);
      });
      helpers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), lines));
      const spokes = [0, 1, 2, 3].flatMap((i) => [origin, ring[i * 16]]);
      helpers.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), lines));
    } else {
      // Frustum corners, each carried down to the floor or out 12 m.
      camera.updateMatrixWorld();
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
        const dir = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(origin).normalize();
        const reach = dir.y < -0.02 ? Math.min(p.heightM / -dir.y, 12) : 8;
        return origin.clone().addScaledVector(dir, reach);
      });
      const edges = corners.flatMap((c, i) => [origin, c, c, corners[(i + 1) % 4]]);
      helpers.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), lines));
      const aim = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, new THREE.Vector3(0, p.humanHeightM / 2, p.distanceM)]),
        new THREE.LineDashedMaterial({ color: p.colors.camera, dashSize: 0.15, gapSize: 0.1 }),
      );
      aim.computeLineDistances();
      helpers.add(aim);
    }
    // The measurements that place the camera: mast height, straight out to the counting line, and sideways to the centre line.
    const foot = new THREE.Vector3(origin.x, 0.03, 0);
    const across = new THREE.Vector3(0.12, 0, 0);
    const along = new THREE.Vector3(0, 0, 0.12);
    helpers.add(dimension(new THREE.Vector3(origin.x + 0.3, 0, 0), new THREE.Vector3(origin.x + 0.3, p.heightM, 0), p.heightM.toFixed(1) + " m", p.colors.camera, along));
    helpers.add(dimension(foot, new THREE.Vector3(origin.x, 0.03, p.distanceM), p.distanceM.toFixed(2) + " m", p.colors.count, across));
    if (Math.abs(p.offsetM) >= 0.05) {
      helpers.add(dimension(foot, new THREE.Vector3(0, 0.03, 0), Math.abs(p.offsetM).toFixed(2) + " m", p.colors.camera, along));
      const centre = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, -1), new THREE.Vector3(0, 0.02, p.distanceM + 2)]),
        new THREE.LineDashedMaterial({ color: "#eef2f8", dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.45 }),
      );
      centre.computeLineDistances();
      helpers.add(centre);
    }
    // The feet angle the verdict is judged by: from level, down to the feet at the middle of the entrance.
    const feet = new THREE.Vector3(0, 0.02, p.distanceM);
    const level = new THREE.Vector3(feet.x - origin.x, 0, feet.z - origin.z).normalize();
    const feetAngle = Math.atan2(p.heightM, Math.hypot(feet.x - origin.x, feet.z));
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, feet]), new THREE.LineBasicMaterial({ color: p.colors.count, depthTest: false }));
    ray.renderOrder = 9;
    const reference = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, origin.clone().addScaledVector(level, 1.4)]),
      new THREE.LineDashedMaterial({ color: "#eef2f8", dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.7, depthTest: false }),
    );
    reference.computeLineDistances();
    const down = new THREE.Vector3(0, -1, 0);
    const swing = (angle, reach) => origin.clone().addScaledVector(level, Math.cos(angle) * reach).addScaledVector(down, Math.sin(angle) * reach);
    const arc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 25 }, (_, i) => swing((feetAngle * i) / 24, 0.9))),
      new THREE.LineBasicMaterial({ color: p.colors.count, depthTest: false }),
    );
    arc.renderOrder = 9;
    const angleTag = labelSprite(((feetAngle * 180) / Math.PI).toFixed(1) + "°", p.colors.count);
    angleTag.position.copy(swing(feetAngle / 2, 1.35));
    helpers.add(ray, reference, arc, angleTag);
    helpers.traverse((o) => o.layers.set(HELPER_LAYER));
    scene.add(helpers);
  }

  function renderOrbit() {
    if (!orbit || !orbitActive || !input) return;
    orbit.controls.update();
    // The orbit view sees the scene itself; the fisheye pass is only for the camera's own image.
    orbit.renderer.render(scene, orbit.view);
  }

  function aimOrbit(p, first) {
    const target = new THREE.Vector3(-p.offsetM / 2, 0.8, p.distanceM / 2);
    if (first) {
      orbit.view.position.set(target.x + p.distanceM * 0.7 + 4, p.heightM + 3, target.z - (p.distanceM * 1.1 + 5));
    } else {
      orbit.view.position.add(target.clone().sub(orbit.controls.target));
    }
    orbit.controls.target.copy(target);
  }

  function sizeOrbit() {
    if (!orbit) return;
    const canvas = orbit.renderer.domElement;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    orbit.renderer.setSize(width, height, false);
    orbit.view.aspect = width / height;
    orbit.view.updateProjectionMatrix();
  }

  function render() {
    if (!input) return;
    if (countingStrip) countingStrip.material.opacity = Math.max(0.85, countingStrip.material.opacity - 0.02);
    if (isFisheye()) {
      cubeCamera.position.set(cameraX(), input.heightM, 0);
      cubeCamera.update(renderer, scene);
      renderer.render(fisheyeScene, screenCamera);
    } else {
      renderer.render(scene, camera);
    }
    drawOverlay();
    renderOrbit();
    ui.counts.in.textContent = String(counts.in);
    ui.counts.out.textContent = String(counts.out);
    ui.counts.faces.textContent = String(counts.faces);
    ui.counts.passers.textContent = String(counts.passers);
  }

  function frame(time) {
    if (!(active || orbitActive) || !walking) return;
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function start() {
    lastTime = 0;
    if ((active || orbitActive) && walking) requestAnimationFrame(frame);
    else render();
  }

  function syncPassersRow() {
    if (input) ui.passersRow.hidden = input.scene !== "open_door" && !crossTraffic;
  }

  ui.crossButton.setAttribute("aria-pressed", String(crossTraffic));
  ui.crossButton.addEventListener("click", () => {
    crossTraffic = !crossTraffic;
    ui.crossButton.setAttribute("aria-pressed", String(crossTraffic));
    syncPassersRow();
    if (input) respawnAll(input);
    start();
  });

  ui.walkButton.addEventListener("click", () => {
    walking = !walking;
    syncWalking();
    start();
  });
  ui.resetButton.addEventListener("click", () => {
    Object.keys(counts).forEach((k) => {
      counts[k] = 0;
    });
    seed = 7;
    if (input) respawnAll(input);
    start();
  });
  window.addEventListener("resize", () => {
    if (!active && !orbitActive) return;
    if (active) resize();
    sizeOrbit();
    render();
  });
  syncWalking();

  // The still view for the site sheet: the whole frame, framed exactly as the console shows it.
  // The live view (walking or not) is put back before returning.
  function snapshot() {
    if (!input) return null;
    const width = 960;
    const height = Math.round(width / input.aspect);
    const wasWalking = walking;
    walking = false;
    syncWalking();
    quiet = true;
    try {
      setSize(width, height);
      render();
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const ctx = out.getContext("2d");
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      ctx.drawImage(ui.overlay, 0, 0, width, height);
      return { url: out.toDataURL("image/jpeg", 0.9), aspect: width / height };
    } finally {
      quiet = false;
      walking = wasWalking;
      syncWalking();
      resize();
      render();
    }
  }

  return {
    snapshot,
    // The orbit view: the same scene from outside, built the first time it is shown.
    setOrbit(canvas, OrbitControls, next) {
      if (next && !orbit) {
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const view = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
        view.layers.enable(HELPER_LAYER);
        const controls = new OrbitControls(view, canvas);
        controls.enableDamping = false;
        controls.maxPolarAngle = Math.PI * 0.49;
        controls.addEventListener("change", () => { if (!walking) requestAnimationFrame(renderOrbit); });
        orbit = { renderer, view, controls };
        if (input) aimOrbit(input, true);
      }
      const wasActive = orbitActive;
      orbitActive = next;
      if (orbitActive) {
        sizeOrbit();
        if (!wasActive) start();
      }
    },
    setPlacement(placement) {
      const first = input === null;
      input = placement;
      camera.fov = Math.min(placement.vFovDeg, 170);
      camera.aspect = placement.aspect;
      camera.position.set(-placement.offsetM, placement.heightM, 0);
      // Turned to the middle of the entrance, then tilted down.
      camera.rotation.set((-placement.tiltDeg * Math.PI) / 180, Math.atan2(-placement.offsetM, -placement.distanceM), 0);
      camera.updateProjectionMatrix();
      if (placement.lens === "fisheye") fisheyeMaterial.uniforms.halfFov.value = (placement.fovDeg * Math.PI) / 360;
      rebuildProps(placement);
      poseStanding(placement);
      camera.updateMatrixWorld();
      rebuildHelpers(placement);
      if (orbit) aimOrbit(placement, false);
      syncPassersRow();
      const key = [placement.scene, placement.lens, placement.distanceM.toFixed(1), placement.entranceWidthM || 0, (placement.faceLineDistanceM || 0).toFixed(1)].join("|");
      if (first || key !== layoutKey) respawnAll(placement);
      layoutKey = key;
      if (active) {
        resize();
        if (!walking) render();
      }
    },
    setActive(next) {
      const wasActive = active;
      active = next;
      if (active && !wasActive) {
        resize();
        start();
      }
    },
  };
}
