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

/**
 * Who is hidden behind others in the camera's picture: a person whose head (the top fifth of their box, the middle half
 * of its width) is more than half covered by people nearer the camera. A nearer person covers the middle 60% of their
 * box's width, about the width of a body rather than the arms' reach the box allows for.
 * @param {{ box: { x: number, y: number, w: number, h: number }, depth: number }[]} people depth: distance from the camera
 * @returns {boolean[]} hidden, in the same order
 */
export function occlusionOf(people) {
  const bodies = people.map(({ box }) => ({ x: box.x + box.w * 0.2, y: box.y, w: box.w * 0.6, h: box.h }));
  return people.map((person, index) => {
    const nearer = bodies.filter((_, other) => other !== index && people[other].depth < person.depth);
    if (nearer.length === 0) return false;
    const { box } = person;
    let covered = 0;
    let total = 0;
    for (let i = 0; i < 5; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const x = box.x + box.w * (0.25 + (0.5 * (i + 0.5)) / 5);
        const y = box.y + box.h * ((0.2 * (j + 0.5)) / 4);
        total += 1;
        if (nearer.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) covered += 1;
      }
    }
    return covered / total > 0.5;
  });
}

export const MODEL_HEIGHT_M = 1.7;
// How busy the scene is: how many people, how many walk in pairs or threes, and how often someone stops on the way
// through or a group stands talking. Phones get a smaller crowd.
const CROWDS = {
  light: { door: 7, corridor: 6, escalator: 6, pairs: 0, trios: 0, stopShare: 0, chatShare: 0 },
  busy: { door: 14, corridor: 12, escalator: 12, pairs: 2, trios: 1, stopShare: 0.25, chatShare: 0.15 },
  crowded: { door: 22, corridor: 18, escalator: 18, phone: 14, pairs: 3, trios: 2, stopShare: 0.35, chatShare: 0.22 },
};
// Matches the engine's 80% effective coverage: the outer 10% each side, or 20% of a fisheye's radius.
const EFFECTIVE_SHARE = 0.8;
const SKIN = ["#f1c7a5", "#d9a47c", "#b97b52", "#8d5a3b", "#5f3b26"];
const TOPS = ["#3d6fb6", "#7a8796", "#b5443c", "#2f7d5b", "#c9a227", "#e6e1d6", "#5a4a8c", "#26313d"];
const BOTTOMS = ["#2b3440", "#3c4f6b", "#5b5148", "#1f2329", "#6b6f75"];
const HAIR = ["#1b1612", "#3b2a1e", "#6b4a2b", "#8a8a8a"];
// A person whose feet are deeper than this below the landing floor (riding down a well) gets no detection box.
const DEEPEST_BOXED_M = 0.5;

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

// A curved (barrel) lens: each output pixel finds its angle from the lens axis through r = f g(θ), with
// g(θ) = (1 - w) tan θ + w (θ + aθ³), then reads the wide pinhole render that covers the whole picture. Same lens as
// the plan and the coverage figures (lensFor).
const BARREL_FRAGMENT = `
uniform sampler2D tScene;
uniform float a;
uniform float w;
uniform float f;
uniform float halfH;
uniform vec2 extent;
uniform float maxTheta;
varying vec2 vUv;
void main() {
  vec2 img = vec2(vUv.x * 2.0 - 1.0, (vUv.y * 2.0 - 1.0) * halfH);
  float r = length(img);
  float target = r / f;
  float lo = 0.0;
  float hi = maxTheta;
  for (int i = 0; i < 32; i++) {
    float mid = 0.5 * (lo + hi);
    float g = (1.0 - w) * tan(mid) + w * (mid + a * mid * mid * mid);
    if (g < target) lo = mid; else hi = mid;
  }
  float theta = 0.5 * (lo + hi);
  float edge = (1.0 - w) * tan(maxTheta) + w * (maxTheta + a * maxTheta * maxTheta * maxTheta);
  vec2 pin = r < 1e-6 ? img / f : img * (tan(theta) / r);
  vec2 uv = pin / extent * 0.5 + 0.5;
  if (target > edge || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.02, 0.025, 0.03, 1.0);
    return;
  }
  gl_FragColor = texture2D(tScene, uv);
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

  // Barrel lens: the scene is rendered by a wider pinhole camera (same pose) that covers the whole picture, then bent.
  const barrelTarget = new THREE.WebGLRenderTarget(16, 16);
  const barrelMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: barrelTarget.texture }, a: { value: 0 }, w: { value: 1 }, f: { value: 1 }, halfH: { value: 0.75 },
      extent: { value: new THREE.Vector2(1, 1) }, maxTheta: { value: 1.5 },
    },
    vertexShader: FISHEYE_VERTEX,
    fragmentShader: BARREL_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const barrelScene = new THREE.Scene();
  barrelScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), barrelMaterial));
  const isBarrel = () => input !== null && input.lensModel !== null && input.lensModel.kind === "barrel";
  const bufferSize = new THREE.Vector2();

  // The face window: one person's face rendered from the camera at the camera's own pixel count, then shown enlarged
  // pixel for pixel, so the installer sees what the demographics model would get. A best case: no blur, noise or glare.
  const FACE_CROP_M = 0.3;
  const FACE_WIDTH_M = 0.16;
  const FACE_SUPERSAMPLE = 4;
  const faceCamera = new THREE.PerspectiveCamera(10, 1, 0.05, 120);
  const faceTarget = new THREE.WebGLRenderTarget(16, 16);
  faceTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const faceCanvas = document.createElement("canvas");
  const faceSample = document.createElement("canvas");
  const faceAnchor = new THREE.Vector3();
  let faceShot = null;
  let faceShotAt = 0;

  let props = new THREE.Group();
  scene.add(props);
  // The escalator pair's scenery, with the hooks that move its steps; null in the other scenes.
  let escalatorRig = null;
  // How far the escalator belts have run, in metres. Only step(dt) advances it, so Pause holds the steps.
  let beltTravel = 0;
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
  let crowd = "light";
  // People hidden behind others, sampled a few times a second while walking: since the last reset.
  const occlusion = { seen: 0, hidden: 0, sampledAt: 0 };
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

  // Avatars, once loaded; until then, and if they never load, people are built from boxes.
  let avatars = null;
  let avatarCount = 0;
  let standingIndex = 0;
  // Walking, but held still on one frame to look at it.
  let paused = false;
  const animating = () => walking && !paused;

  function makePerson(motion) {
    if (avatars && avatars.complete) {
      avatarCount += 1;
      return avatars.make(avatarCount - 1, motion, random());
    }
    return makeBoxPerson();
  }

  function makeBoxPerson() {
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
    let phase = random() * Math.PI * 2;
    return {
      isBox: true,
      group,
      head,
      animate(dt, speed) {
        phase += speed * dt * 5.2;
        const swing = speed > 0 ? Math.sin(phase) : 0;
        legL.rotation.x = swing * 0.55;
        legR.rotation.x = -swing * 0.55;
        armL.rotation.x = -swing * 0.45;
        armR.rotation.x = swing * 0.45;
      },
      setMotion() {},
    };
  }

  const standing = { body: makeBoxPerson(), flash: 0, flashDirection: null, faceFlash: 0 };
  scene.add(standing.body.group);
  const shownAgents = () => (walking ? agents : [standing]);

  // Where along the counting line the standing person is, in scene x; kept inside the walkable width.
  let standX = 0;
  // Which line they stand on: the counting line, or the face line when it is a separate line.
  let standLine = "count";
  const faceLineApart = (p) => p.faceLineDistanceM !== null && Math.abs(p.faceLineDistanceM - p.distanceM) > 0.02;
  const standZ = (p) => (standLine === "face" && faceLineApart(p) ? p.faceLineDistanceM : p.distanceM);
  // Where the standing person may stand along their line (scene x), and how high their feet are. Past the comb plate
  // the face line crosses the steps: they stand in the arriving lane, on the step under them.
  function standSpan(p) {
    const lay = layout(p);
    const z = standZ(p);
    if (lay.esc && z - p.distanceM > lay.esc.combU - 1e-6) {
      const lane = lay.esc.lanes.find((l) => l.role === "arrive");
      const inset = Math.min(0.25, Math.max(0, lane.maxX - lane.minX - 0.1) / 2);
      return { min: -lane.maxX + inset, max: -lane.minX - inset, y: escalatorRig ? escalatorRig.treadY("arrive", z - p.distanceM, beltTravel) : 0, lane: true };
    }
    const half = lay.esc ? lay.esc.widthM / 2 : lay.doorZ !== null ? lay.doorHalf : lay.corridorHalf;
    const reach = Math.max(0, half - 0.35);
    return { min: -reach, max: reach, y: 0, lane: false };
  }

  function poseStanding(p) {
    const g = standing.body.group;
    const span = standSpan(p);
    // Coming onto the lane from elsewhere, they stand in the middle of it rather than against its edge.
    standX = span.lane && (standX < span.min || standX > span.max) ? (span.min + span.max) / 2 : Math.max(span.min, Math.min(span.max, standX));
    g.position.set(standX, span.y, standZ(p));
    g.rotation.y = Math.PI;
    g.scale.setScalar(p.humanHeightM / MODEL_HEIGHT_M);
  }

  function syncWalking() {
    agents.forEach((agent) => { agent.body.group.visible = walking && !agent.hidden; });
    standing.body.group.visible = !walking;
    ui.walkButton.setAttribute("aria-pressed", String(walking));
    ui.walkOnly.forEach((el) => { el.hidden = !walking; });
    ui.stillOnly.forEach((el) => { el.hidden = walking; });
    ui.person.row.hidden = walking || !avatars;
    ui.stand.row.hidden = walking || !input || !faceLineApart(input);
    if (input) {
      const on = faceLineApart(input) ? standLine : "count";
      ui.stand.buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.stand === on)));
      ui.stand.dots.count.style.background = input.colors.count;
      ui.stand.dots.face.style.background = input.colors.face;
      ui.stillNote.textContent = on === "face" ? input.text.stillFace : input.text.stillCount;
    }
    ui.pauseButton.setAttribute("aria-pressed", String(paused));
    if (input) {
      ui.pauseButton.textContent = paused ? input.text.resume : input.text.pause;
      if (avatars) ui.person.label.textContent = input.text.personOf.split("{i}").join(String(standingIndex + 1)).split("{n}").join(String(avatars.total));
    }
  }

  function standAvatar(index) {
    scene.remove(standing.body.group);
    standingIndex = (index + avatars.count) % avatars.count;
    standing.body = avatars.make(standingIndex, "idle", 0.3);
    scene.add(standing.body.group);
    if (input) poseStanding(input);
    syncWalking();
  }

  function usePeople(loaded, nextIndex = 0) {
    avatars = loaded;
    peopleStatus = loaded.complete ? "ready" : "first";
    standAvatar(nextIndex);
    if (!input) return;
    if (loaded.complete) {
      seed = 7;
      respawnAll(input);
    }
    if (active || orbitActive) render();
  }

  // The avatars are the heaviest part of the page, so they are fetched only once a 3D view is actually on screen. A
  // phone gets the standing person first and the rest when the crowd or another person is asked for. A failed load is
  // tried again after a while; meanwhile the figures are boxes and the face window says so.
  let peopleRequested = false;
  let peopleStatus = "idle";
  let allRequested = false;
  let pendingIndex = 0;
  const RETRY_MS = 15000;
  function requestPeople(scope) {
    if (scope === "all") allRequested = true;
    peopleStatus = avatars ? peopleStatus : "loading";
    ui.loadPeople(scope)
      .then((loaded) => usePeople(loaded, loaded.complete ? pendingIndex : 0))
      .catch((error) => {
        console.error("People models could not load; showing simple figures", error);
        if (!avatars) peopleStatus = "failed";
        window.setTimeout(() => {
          if (scope === "all") allRequested = false; else peopleRequested = false;
          if (peopleStatus === "failed") peopleStatus = "idle";
          if (scope === "all") needAllPeople(); else wantPeople();
        }, RETRY_MS);
        if (active || orbitActive) render();
      });
  }
  function needAllPeople(index) {
    if (index !== undefined) pendingIndex = index;
    if (!ui.loadPeople || allRequested || (avatars && avatars.complete)) return;
    requestPeople("all");
  }
  const onScreen = (canvas) => {
    const box = canvas.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
  };
  function wantPeople() {
    if (peopleRequested || !ui.loadPeople) return;
    if (!((active && onScreen(ui.canvas)) || (orbitActive && orbit && onScreen(orbit.renderer.domElement)))) return;
    peopleRequested = true;
    const phone = window.innerWidth < 760;
    if (phone) requestPeople("first"); else needAllPeople();
  }
  // Capturing, so a scroll inside any panel counts too.
  window.addEventListener("scroll", wantPeople, { capture: true, passive: true });
  window.addEventListener("resize", wantPeople);

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
    const esc = p.scene === "escalator" && p.escalator ? p.escalator : null;
    const endZ = Math.max(p.distanceM, p.faceLineDistanceM || 0) + 5;
    // The doorway or corridor is as wide as the entered entrance; typical sizes otherwise.
    const doorHalf = p.entranceWidthM ? p.entranceWidthM / 2 : 1.1;
    const corridorHalf = p.entranceWidthM ? p.entranceWidthM / 2 : 1.5;
    const laneAt = (role) => esc.lanes.find((l) => l.role === role);
    return {
      doorZ, endZ, doorHalf, corridorHalf, passZ: doorZ === null ? null : doorZ + 1.4, esc,
      // Scene x of each lane's middle, and the comb plate where people step on or off.
      combZ: esc ? p.distanceM + esc.combU : null,
      arriveX: esc ? -laneAt("arrive").centreX : 0,
      leaveX: esc ? -laneAt("leave").centreX : 0,
    };
  }

  function rebuildProps(p) {
    scene.remove(props);
    props.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    props = new THREE.Group();
    const lay = layout(p);
    const stripWidth = Math.max(8, Math.min(p.coverageWidthM, 40) * 1.4) + 2 * Math.abs(p.offsetM);
    countingStrip = lineStrip(p.distanceM, stripWidth, p.colors.count, 0.85);
    props.add(countingStrip);
    escalatorRig = lay.esc ? buildEscalatorScene(THREE, p, material, stripWidth) : null;
    if (escalatorRig) escalatorRig.setTravel(beltTravel);
    // A well in the floor means the floor and grid are rebuilt in pieces around it; otherwise the plain ones stay.
    const cutGround = Boolean(escalatorRig && escalatorRig.replacesGround);
    floor.visible = !cutGround;
    grid.visible = !cutGround;
    if (!escalatorRig && p.faceLineDistanceM !== null && Math.abs(p.faceLineDistanceM - p.distanceM) > 0.02) {
      props.add(lineStrip(p.faceLineDistanceM, stripWidth, p.colors.face, p.faceLineVisible ? 0.9 : 0.35));
    }
    if (escalatorRig) {
      props.add(escalatorRig.group);
    } else if (lay.doorZ !== null) {
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

  // A group's leader decides where the group goes; the others keep beside it (see step).
  function spawn(agent, lay, p, fresh) {
    const style = CROWDS[crowd];
    agent.stopAt = null;
    agent.stopLeft = 0;
    agent.chatAt = null;
    agent.chatLeft = 0;
    agent.followers.forEach((f) => Object.assign(f, { lastZ: null, flash: 0, flashDirection: null, faceFlash: 0, phase: null, hidden: false }));
    const roll = random();
    const kind = crossTraffic && roll < 0.35
      ? "cross"
      : lay.doorZ !== null && random() < 0.4 ? "pass" : random() < 0.6 ? "in" : "out";
    const lane = (random() * 2 - 1) * ((lay.doorZ !== null ? lay.doorHalf : lay.corridorHalf) - 0.35);
    const nearZ = 0.8;
    // Somewhere across the width of the lane the walker steps on or off at.
    const inLane = (x) => x + (random() - 0.5) * Math.max(0, Math.min(0.5, lay.esc ? lay.esc.stepWidthM - 0.4 : 0));
    let from;
    let to;
    if (kind === "cross") {
      // Walks left to right across the view, on the camera side of the door, without crossing the counting line.
      const farthest = lay.esc ? p.distanceM - 0.15 : lay.doorZ !== null ? lay.doorZ - 0.5 : lay.endZ - 1;
      const z = 1.2 + random() * Math.max(0.5, farthest - 1.2);
      const span = lay.esc ? lay.esc.widthM / 2 + 2.5 : lay.doorZ !== null ? Math.max(7, lay.doorHalf + 2) : lay.corridorHalf - 0.25;
      const dir = random() < 0.5 ? -1 : 1;
      from = { x: -span * dir, z };
      to = { x: span * dir, z };
    } else if (kind === "pass") {
      const z = lay.passZ + (random() - 0.5) * 0.6;
      const dir = random() < 0.5 ? -1 : 1;
      const span = Math.max(9, lay.doorHalf + 4);
      from = { x: -span * dir, z };
      to = { x: span * dir, z };
    } else if (lay.esc) {
      // Straight from the comb plate of the arriving lane, or to the comb plate of the leaving one.
      const arriveX = inLane(lay.arriveX);
      const leaveX = inLane(lay.leaveX);
      from = kind === "in" ? { x: arriveX, z: lay.combZ } : { x: leaveX * 0.7, z: nearZ };
      to = kind === "in" ? { x: arriveX * 0.7, z: nearZ } : { x: leaveX, z: lay.combZ };
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
      lastZ: null,
      flash: 0,
      flashDirection: null,
      faceFlash: 0,
      phase: null,
      hidden: false,
    });
    agent.body.group.scale.setScalar((p.humanHeightM / MODEL_HEIGHT_M) * (0.94 + random() * 0.1));
    const onEscalator = Boolean(lay.esc) && (kind === "in" || kind === "out");
    if (onEscalator) seatOnEscalator(agent, lay, p, fresh);
    // A group walking in or out may stop about a metre past the counting line to talk, then carry on the same way.
    if ((kind === "in" || kind === "out") && agent.followers.length > 0 && !(onEscalator && kind === "in") && random() < style.chatShare) {
      const target = p.distanceM + (kind === "in" ? -1 : 1);
      const t = (from.z - target) / (from.z - to.z);
      if (t > 0.05 && t < 0.95 && agent.travelled < t * length) {
        agent.chatAt = t * length;
        agent.chatLeft = 6 + random() * 7;
        return;
      }
    }
    // Someone walking in or out may stop just short of the counting line (looking at a phone, waiting), then carry on.
    if ((kind === "in" || kind === "out") && random() < style.stopShare) {
      const target = p.distanceM + (kind === "in" ? 0.45 : -0.45);
      const t = (from.z - target) / (from.z - to.z);
      if (t > 0.05 && t < 0.95 && agent.travelled < t * length) {
        agent.stopAt = t * length;
        agent.stopLeft = 2 + random() * 3.5;
      }
    }
  }



  function respawnAll(p) {
    agents.forEach((a) => scene.remove(a.body.group));
    const lay = layout(p);
    const style = CROWDS[crowd];
    const phone = typeof window !== "undefined" && window.innerWidth < 760 && style.phone;
    const total = phone ? style.phone : lay.esc ? style.escalator : lay.doorZ !== null ? style.door : style.corridor;
    // The crowd always starts from the same avatar, so a reset replays the same people.
    avatarCount = 1;
    agents = Array.from({ length: total }, () => {
      const agent = { body: makePerson("walk"), leader: null, side: 0, followers: [] };
      scene.add(agent.body.group);
      return agent;
    });
    // Groups: the first agents are leaders, each with one or two companions beside them.
    let next = 0;
    const team = (size) => {
      const leader = agents[next];
      next += 1;
      for (let i = 1; i < size && next < agents.length; i += 1, next += 1) {
        const member = agents[next];
        member.leader = leader;
        member.side = size === 2 ? 1 : i === 1 ? -1 : 1;
        leader.followers.push(member);
      }
    };
    for (let i = 0; i < style.trios; i += 1) team(3);
    for (let i = 0; i < style.pairs; i += 1) team(2);
    agents.filter((a) => !a.leader).forEach((agent) => spawn(agent, lay, p, true));
    agents.filter((a) => a.leader).forEach((member) => member.body.group.scale.setScalar((p.humanHeightM / MODEL_HEIGHT_M) * (0.94 + random() * 0.1)));
    // Paused, step() does not run: put the new people on their start poses now rather than in a heap at the camera.
    if (lay.esc && p === input) {
      agents.filter((a) => !a.leader).forEach((agent) => placeGroup(agent, 0, lay));
    }
    Object.assign(occlusion, { seen: 0, hidden: 0, sampledAt: 0 });
    syncWalking();
  }

  function resize() {
    if (!input) return;
    const stage = ui.canvas.closest(".sim-stage");
    // Expanded, the stage has a set size and the image fits inside it; otherwise the image sets the height.
    const width = stage.dataset.fill === "true" ? Math.min(stage.clientWidth, stage.clientHeight * input.aspect) : stage.clientWidth;
    if (!width) return;
    setSize(Math.round(width), Math.round(width / input.aspect));
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

  const faceU = () => (input.faceLineDistanceM !== null ? input.faceLineDistanceM - input.distanceM : null);

  // ---- People on the escalator pair. Each person is either walking the landing (travelled along from -> to), riding
  // (standing on one step: boardU is where they got on, boardT the belt travel then), or done (carried out of sight).
  const riderU = (a, kit) => a.boardU + kit.beltDirection(a.rideRole) * (beltTravel - a.boardT);
  const ridersOn = (role, except, kit) => agents.filter((a) => a.phase === "ride" && a.rideRole === role && !except.includes(a)).map((a) => riderU(a, kit));

  // Puts a group (leader and companions) on the route at spawn. Everyone is spread along the whole route at the start of
  // a walk, so the scene is alive at once; later arrivals queue, out of sight, behind the last rider.
  function seatOnEscalator(agent, lay, p, fresh) {
    const kit = p.escalatorKit;
    const E = kit.ESCALATOR;
    const L = lay.esc;
    const members = [agent, ...agent.followers];
    const arriving = agent.kind === "in";
    const role = arriving ? "arrive" : "leave";
    const dir = kit.beltDirection(role);
    members.forEach((m) => Object.assign(m, {
      phase: "walk", hidden: false, rideRole: role, rideX: arriving ? agent.from.x : agent.to.x, boardU: 0, boardT: 0,
      travelled: 0, speed: agent.speed, stopAt: null, stopLeft: 0,
    }));
    const taken = ridersOn(role, members, kit);
    const free = (us) => us.every((u) => taken.every((t) => Math.abs(t - u) >= E.rideGapM - 1e-6));
    const ride = (us) => members.forEach((m, k) => Object.assign(m, { phase: "ride", boardU: us[k], boardT: beltTravel, easeU: 0 }));
    const rideS = kit.rideSeconds(L);
    const walkS = agent.length / agent.speed;
    const lattice = kit.stepCentres(L, dir * beltTravel);
    const nearest = (u) => lattice.reduce((best, c) => (Math.abs(c - u) < Math.abs(best - u) ? c : best), lattice[0]);
    let seated = false;
    if (fresh) {
      for (let attempt = 0; attempt < 8 && !seated; attempt += 1) {
        const tau = random() * (rideS + walkS);
        if (arriving) {
          if (tau >= rideS) {
            members.forEach((m) => { m.travelled = (tau - rideS) * agent.speed; });
            seated = true;
          } else {
            const base = nearest(L.endU - tau * E.beltSpeedMps);
            const us = members.map((_, k) => base + k * E.rideGapM);
            if (free(us)) { ride(us); seated = true; }
          }
        } else if (tau < walkS) {
          agent.travelled = tau * agent.speed;
          seated = true;
        } else {
          const base = nearest(kit.boardingU(L, "leave", beltTravel) + (tau - walkS) * E.beltSpeedMps);
          const us = members.map((_, k) => base - k * E.rideGapM);
          if (us[us.length - 1] >= L.combU - 1e-6 && free(us)) {
            ride(us);
            members.forEach((m) => { m.travelled = agent.length; });
            seated = true;
          }
        }
      }
    }
    if (!seated && arriving) {
      const start = kit.freeBoarding(L, "arrive", beltTravel, taken, E.rideGapM);
      ride(members.map((_, k) => start + k * E.rideGapM));
    }
  }

  // One group on the escalator pair for a frame: the belt carries riders, walkers cross the landing, and a leaver
  // waits at the comb plate until the step in front of them is free.
  function moveOnEscalator(agent, dt, lay, respawned = false) {
    const kit = input.escalatorKit;
    const E = kit.ESCALATOR;
    const L = lay.esc;
    const arriving = agent.kind === "in";
    const role = arriving ? "arrive" : "leave";
    const members = [agent, ...agent.followers];
    const d = input.distanceM;
    const heading = Math.atan2(agent.to.x - agent.from.x, agent.to.z - agent.from.z);
    const reach = L.widthM / 2 - 0.25;
    const pointAt = (travelled) => {
      const t = agent.length > 0 ? Math.min(1, travelled / agent.length) : 0;
      return { x: agent.from.x + (agent.to.x - agent.from.x) * t, z: agent.from.z + (agent.to.z - agent.from.z) * t };
    };
    // A lane is one step wide: people are in single file at the comb plate and spread abreast over the next 0.8 m.
    const spreadAt = (z) => Math.min(1, Math.max(0, (lay.combZ - z) / 0.8));
    const settle = (m, x, y, z, rotation, speedNow, visible) => {
      m.hidden = !visible;
      m.body.group.position.set(x, y, z);
      m.body.group.rotation.y = rotation;
      m.body.setMotion(speedNow > 0 ? "walk" : "idle");
      m.body.animate(dt, speedNow);
    };

    members.forEach((m, rank) => {
      let speedNow = 0;
      if (m.phase === "ride") {
        const pose = kit.riderAt(L, role, m.boardU, beltTravel - m.boardT);
        if (pose.status === "off") {
          if (arriving) Object.assign(m, { phase: "walk", travelled: 0 });
          else m.phase = "done";
        }
      }
      if (m.phase === "walk") {
        const leader = m === agent;
        if (arriving) {
          const limit = leader ? agent.length : agent.phase === "walk" ? Math.min(agent.length, agent.travelled) : 0;
          const stopped = leader && agent.stopAt !== null && agent.travelled >= agent.stopAt && agent.stopLeft > 0;
          if (stopped) agent.stopLeft -= dt;
          // Companions who stepped off later hurry to regroup with the leader.
          const pace = m.speed * (!leader && m.travelled < limit - 0.02 ? 1.35 : 1);
          if (!stopped && m.travelled < limit) m.travelled = Math.min(limit, m.travelled + pace * dt);
          speedNow = !stopped && m.travelled < limit ? pace : 0;
        } else {
          // A leaver stands back from the comb plate while the step in front of them is taken.
          const slot = kit.freeBoarding(L, "leave", beltTravel, ridersOn("leave", [m], kit), E.rideGapM);
          const limit = Math.min(agent.length, slot === null ? agent.length - 0.6 : agent.length);
          if (leader) {
            const stopped = agent.stopAt !== null && agent.travelled >= agent.stopAt && agent.stopLeft > 0 && agent.travelled < agent.length;
            if (stopped) agent.stopLeft -= dt;
            else if (agent.travelled < limit) agent.travelled = Math.min(limit, agent.travelled + agent.speed * dt);
            speedNow = !stopped && agent.travelled < limit ? agent.speed : 0;
          } else {
            const at = pointAt(Math.min(agent.travelled, agent.length));
            const target = agent.travelled - E.rideGapM * rank * (1 - spreadAt(at.z));
            const front = members[rank - 1];
            const cap = front.phase === "walk" ? front.travelled - 0.45 : Infinity;
            const next = Math.min(m.travelled + m.speed * 1.35 * dt, Math.max(m.travelled, Math.min(target, limit, cap)));
            speedNow = next > m.travelled + 1e-6 ? m.speed : 0;
            m.travelled = next;
          }
          // The step centre is up to a step ahead of the comb plate: walk onto it rather than jump.
          if (slot !== null && m.travelled >= agent.length - 1e-6) Object.assign(m, { phase: "ride", boardU: slot, boardT: beltTravel, easeU: Math.max(0, slot - L.combU) });
        }
        if (m.phase === "walk") {
          const at = pointAt(m.travelled);
          const side = leader ? 0 : m.side * spreadAt(at.z) * 0.55;
          const x = Math.max(-reach, Math.min(reach, at.x + Math.cos(heading) * side));
          settle(m, x, 0, at.z - Math.sin(heading) * side, heading, speedNow, true);
          return;
        }
      }
      if (m.phase === "ride") {
        const u = riderU(m, kit);
        const queued = arriving && u > L.endU + 1e-6;
        const easing = m.easeU > 0;
        if (easing) m.easeU = Math.max(0, m.easeU - m.speed * dt);
        settle(m, m.rideX, escalatorRig ? escalatorRig.treadY(role, u, beltTravel) : 0, d + u - (m.easeU || 0), arriving ? Math.PI : 0, easing ? m.speed : 0, !queued);
        return;
      }
      // Done: carried out of sight, waiting for the rest of the group.
      m.hidden = true;
    });
    // The next trip starts once everyone in the group has finished this one.
    const finished = arriving ? members.every((m) => m.phase === "walk" && m.travelled >= agent.length - 1e-6) : members.every((m) => m.phase === "done");
    if (!arriving) {
      // The leaver's clock keeps running after they board, so companions behind them know where to be.
      if (agent.phase !== "walk" && agent.travelled < agent.length + 5) agent.travelled += agent.speed * dt;
    }
    if (finished) {
      spawn(agent, lay, input, false);
      // Put the new group on its start pose now, so the counting sees no jump from the old route to the new one.
      if (!respawned && (agent.kind === "in" || agent.kind === "out")) moveOnEscalator(agent, 0, lay, true);
    }
  }

  // Where a leader and its companions stand this frame: walking side by side, or in a small circle while talking.
  function placeGroup(agent, dt, lay) {
    const g = agent.body.group;
    let speedNow = agent.speed;
    // Talking: the group stands in a small circle where the leader stopped, then falls back into step and walks on.
    if (agent.chatAt !== null && agent.travelled >= agent.chatAt && agent.chatLeft > 0) {
      agent.chatLeft -= dt;
      const ring = agent.followers.length;
      agent.followers.forEach((member, i) => {
        const angle = (Math.PI * 2 * (i + 1)) / (ring + 1);
        const m = member.body.group;
        m.position.set(g.position.x + Math.sin(angle) * 0.75, g.position.y, g.position.z + Math.cos(angle) * 0.75);
        m.rotation.y = Math.atan2(g.position.x - m.position.x, g.position.z - m.position.z);
      });
      const centre = agent.followers.reduce((sum, m) => ({ x: sum.x + m.body.group.position.x, z: sum.z + m.body.group.position.z }), { x: 0, z: 0 });
      g.rotation.y = Math.atan2(centre.x / ring - g.position.x, centre.z / ring - g.position.z);
      [agent, ...agent.followers].forEach((a) => {
        a.body.setMotion(a === agent ? "idle" : "chat");
        a.body.animate(dt, 0);
      });
      // Stepping out of the circle is not a crossing: counting picks up again from where each one walks on.
      if (agent.chatLeft <= 0) agent.followers.forEach((member) => { member.lastZ = null; });
      return;
    }
    if (lay.esc && (agent.kind === "in" || agent.kind === "out")) {
      moveOnEscalator(agent, dt, lay);
      return;
    }
    if (agent.stopAt !== null && agent.travelled >= agent.stopAt && agent.stopLeft > 0) {
      agent.stopLeft -= dt;
      speedNow = 0;
    } else {
      agent.travelled += agent.speed * dt;
    }
    if (agent.travelled >= agent.length) {
      if (agent.kind === "pass" || agent.kind === "cross") counts.passers += 1 + agent.followers.length;
      spawn(agent, lay, input, false);
    }
    const t = agent.length > 0 ? agent.travelled / agent.length : 0;
    const x = agent.from.x + (agent.to.x - agent.from.x) * t;
    const z = agent.from.z + (agent.to.z - agent.from.z) * t;
    const heading = Math.atan2(agent.to.x - agent.from.x, agent.to.z - agent.from.z);
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    // Companions walk abreast, about 0.55 m apart; inside the entrance they keep within its width.
    const reach = (lay.esc ? lay.esc.widthM / 2 : lay.doorZ !== null ? lay.doorHalf : lay.corridorHalf) - 0.25;
    agent.followers.forEach((member) => {
      const m = member.body.group;
      let mx = x + Math.cos(heading) * 0.55 * member.side;
      const mz = z - Math.sin(heading) * 0.55 * member.side;
      if (agent.kind === "in" || agent.kind === "out") mx = Math.max(-reach, Math.min(reach, mx));
      m.position.set(mx, 0, mz);
      m.rotation.y = heading;
    });
    [agent, ...agent.followers].forEach((a) => {
      a.body.setMotion(speedNow > 0 ? "walk" : "idle");
      a.body.animate(dt, speedNow);
    });
  }

  function step(dt) {
    const lay = layout(input);
    if (escalatorRig) {
      beltTravel += input.escalatorKit.ESCALATOR.beltSpeedMps * dt;
      escalatorRig.setTravel(beltTravel);
    }
    agents.filter((a) => !a.leader).forEach((agent) => placeGroup(agent, dt, lay));
    if (lay.esc) agents.forEach((a) => { a.body.group.visible = !a.hidden; });
    for (const agent of agents) {
      if (agent.leader) agent.kind = agent.leader.kind;
      const z = agent.body.group.position.z;

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
    // Through the lens the plan and the coverage use; the 3D camera looks down its own -z.
    const lens = input.lensModel;
    projected.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const image = lens.toImage({ x: projected.x, y: projected.y, z: -projected.z });
    if (image === null) return { x: 0, y: 0, behind: true };
    return { x: ((image.x + 1) / 2) * w, y: ((1 - image.y / lens.halfH) / 2) * h, behind: false };
  }

  // A direction in the world for a point of the picture (x across -1 to 1, y up -halfH to halfH), through the lens.
  function pictureRay(x, y) {
    const c = input.lensModel.toRay(x, y);
    return c === null ? null : new THREE.Vector3(c.x, c.y, -c.z).applyQuaternion(camera.quaternion);
  }

  // The 3D camera's own projection: the picture itself for a pinhole; for a barrel lens, a wider pinhole covering it.
  function configureLens(p) {
    const lens = p.lensModel;
    if (!lens || lens.kind !== "barrel") {
      camera.fov = Math.min(p.vFovDeg, 170);
      camera.aspect = p.aspect;
      return;
    }
    let reachX = 0;
    let reachY = 0;
    const steps = 16;
    const edge = (x0, y0, x1, y1) => {
      for (let i = 0; i <= steps; i += 1) {
        const c = lens.toRay(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
        if (c === null || c.z < 0.08) continue;
        reachX = Math.max(reachX, Math.abs(c.x / c.z));
        reachY = Math.max(reachY, Math.abs(c.y / c.z));
      }
    };
    const h = lens.halfH;
    edge(-1, -h, 1, -h); edge(1, -h, 1, h); edge(1, h, -1, h); edge(-1, h, -1, -h);
    reachX *= 1.01;
    reachY *= 1.01;
    camera.fov = (2 * Math.atan(reachY) * 180) / Math.PI;
    camera.aspect = reachX / reachY;
    const u = barrelMaterial.uniforms;
    u.a.value = lens.a;
    u.w.value = lens.w;
    u.f.value = lens.f;
    u.halfH.value = h;
    u.extent.value.set(reachX, reachY);
    u.maxTheta.value = Math.min(1.55, lens.maxTheta);
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
    const { x, y, z } = g.position;
    const points = [
      [x, y, z], [x, y + tall, z], [x - 0.3, y + tall / 2, z], [x + 0.3, y + tall / 2, z], [x, y + tall / 2, z - 0.3], [x, y + tall / 2, z + 0.3],
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
      let left = null;
      for (let x = -30; x <= 30; x += 0.5) {
        const s = toScreen(x, 0, z, w, h);
        if (s.behind || s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue;
        if (left === null || s.x < left.x) left = s;
      }
      if (left === null) return false;
      let y = Math.min(h - 4, left.y - 4);
      // Lines a few centimetres apart land on the same row; stack the later label above the earlier one.
      lineLabels.forEach((prev) => { if (Math.abs(prev.y + 13 - y) < 14) y = prev.y - 1; });
      if (quiet) return true;
      const width = ctx.measureText(text).width;
      const x = Math.max(8, Math.min(w - width - 8, left.x + 4));
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      lineLabels.push({ x, y: y - 13, w: width, h: 14 });
      return true;
    };
    const countingVisible = label(input.distanceM, input.text.countingLine + " " + input.distanceM.toFixed(2) + " m", input.colors.count);
    if (input.faceLineDistanceM !== null && Math.abs(input.faceLineDistanceM - input.distanceM) > 0.02) {
      label(input.faceLineDistanceM, input.text.faceLine + " " + input.faceLineDistanceM.toFixed(2) + " m", input.colors.face);
    }
    const seen = [];
    for (const agent of shownAgents()) {
      const g = agent.body.group;
      const behindWall = lay.doorZ !== null && g.position.z > lay.doorZ + 0.1 && Math.abs(g.position.x) > lay.doorHalf - 0.1;
      // The standing person is always boxed: they were put there to be measured, wherever the face line falls.
      const deepRider = lay.esc && agent.phase === "ride" && input.escalatorKit.pastBoxCutoff(lay.esc, g.position.z - input.distanceM, faceU());
      if (behindWall || deepRider || !g.visible || (agent !== standing && g.position.y < -DEEPEST_BOXED_M)) continue;
      const tall = MODEL_HEIGHT_M * g.scale.x;
      const box = personBox(g, tall, w, h);
      if (!box) continue;
      seen.push({ agent, box, tall, depth: Math.hypot(g.position.x - cameraX(), g.position.y + tall * 0.6 - input.heightM, g.position.z) });
    }
    const hidden = walking ? occlusionOf(seen) : seen.map(() => false);
    const now = performance.now();
    if (walking && !paused && !quiet && now - occlusion.sampledAt > 250) {
      occlusion.sampledAt = now;
      occlusion.seen += seen.length;
      occlusion.hidden += hidden.filter(Boolean).length;
    }
    seen.forEach(({ agent, box, tall }, index) => {
      const g = agent.body.group;
      const counted = agent.flash > 0;
      const countColor = agent.flashDirection === "out" ? input.colors.out : input.colors.count;
      // Someone hidden behind nearer people is boxed dashed: the camera may not see their head to count them.
      ctx.strokeStyle = counted ? countColor : hidden[index] ? "rgba(240, 190, 90, 0.95)" : "rgba(230, 236, 245, 0.55)";
      ctx.lineWidth = counted ? 2 : hidden[index] ? 1.5 : 1;
      if (hidden[index] && !counted) ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
      const centreX = box.x + box.w / 2;
      // Density at this person's face, the figure demographics depend on.
      if (box.h >= 28) {
        const faceY = tall * (input.facePointM / input.humanHeightM);
        const text = Math.round(densityAt(g.position.x, g.position.y + faceY, g.position.z)) + " px/m";
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
      if (agent === standing && Math.abs(standX) >= 0.005 && !quiet) {
        const text = input.text.fromCentre.split("{m}").join(Math.abs(standX).toFixed(2));
        const tagWidth = ctx.measureText(text).width + 8;
        const tag = { x: Math.max(0, Math.min(w - tagWidth, centreX - tagWidth / 2)), y: box.y + box.h + 3, w: tagWidth, h: 15 };
        ctx.fillStyle = "rgba(12, 15, 20, 0.72)";
        ctx.fillRect(tag.x, tag.y, tag.w, tag.h);
        ctx.fillStyle = "rgba(230, 236, 245, 0.92)";
        ctx.fillText(text, tag.x + 4, tag.y + 13);
        lineLabels.push(tag);
      }
      if (agent.faceFlash > 0) {
        const head = Math.max(8, Math.min(box.w, box.h) * 0.3);
        ctx.strokeStyle = input.colors.face;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centreX - head / 2, box.y, head, head);
        ctx.fillStyle = input.colors.face;
        ctx.fillText(input.text.face, centreX + head / 2 + 3, box.y + head);
      }
    });
    if (quiet) return;
    // Density labels go last, placed around each other, the line labels and the readout box.
    ctx.font = "600 11px JetBrains Mono, monospace";
    const candidates = densityLabels.map((c) => ({ ...c, width: ctx.measureText(c.text).width + 8, height: 15 }));
    placeLabels(candidates, [densityReadoutRect(w), faceWindowRect(w), ...lineLabels], w).forEach((spot) => {
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
    drawFaceWindow(ctx, w);
  }

  function densityReadoutRect(w) {
    const rows = input.faceLineDistanceM !== null ? 2 : 1;
    return { x: w - 214, y: 8, w: 206, h: 10 + rows * 17 };
  }

  // Top-right readout: pixel density where each line meets the floor (counting) or the face point (face).
  function drawDensityReadout(ctx, w) {
    const rows = [[input.text.readCount, input.colors.count, densityAt(0, 0, input.distanceM)]];
    if (input.faceLineDistanceM !== null) {
      rows.push([input.text.readFace, input.colors.face, densityAt(0, input.facePointM, input.faceLineDistanceM)]);
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
      // The picture's outline through the lens, each ray carried down to the floor or out 12 m, and its four corners
      // joined to the camera. A curved lens bends the outline as it bends the camera view.
      camera.updateMatrixWorld();
      const h = p.lensModel.halfH;
      const carried = (x, y) => {
        const dir = pictureRay(x, y);
        if (!dir) return null;
        const reach = dir.y < -0.02 ? Math.min(p.heightM / -dir.y, 12) : 12;
        return origin.clone().addScaledVector(dir, reach);
      };
      const corners = [[-1, -h], [1, -h], [1, h], [-1, h]];
      const outline = corners.flatMap(([x0, y0], i) => {
        const [x1, y1] = corners[(i + 1) % 4];
        return Array.from({ length: 24 }, (_, k) => carried(x0 + ((x1 - x0) * k) / 24, y0 + ((y1 - y0) * k) / 24));
      }).filter(Boolean);
      helpers.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline), lines));
      const spokes = corners.map(([x, y]) => carried(x, y)).filter(Boolean).flatMap((c) => [origin, c]);
      helpers.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), lines));
      // The aim line follows the lens axis down to half a person's height, wherever the camera is panned.
      const axis = camera.getWorldDirection(new THREE.Vector3());
      const drop = p.heightM - p.humanHeightM / 2;
      const aimEnd = axis.y < -0.02 ? origin.clone().addScaledVector(axis, Math.min(drop / -axis.y, 20)) : origin.clone().addScaledVector(axis, 8);
      const aim = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, aimEnd]),
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

  // Still: the person on the counting line. Walking: whoever is walking in nearest the face line (or the counting line),
  // once through the doorway: beyond it the door header hides the face from a ceiling camera.
  function faceSubject() {
    if (!walking) return standing;
    const line = input.faceLineDistanceM !== null ? input.faceLineDistanceM : input.distanceM;
    const lay = layout(input);
    const doorZ = lay.doorZ;
    const walkers = agents.filter((a) => {
      const z = a.body.group.position.z;
      const unboxedRider = lay.esc && input.escalatorKit.pastBoxCutoff(lay.esc, z - input.distanceM, faceU());
      return a.kind === "in" && a.body.group.visible && z > 0.6 && (doorZ === null || z < doorZ) && a.body.group.position.y >= -DEEPEST_BOXED_M && !unboxedRider;
    });
    return walkers.reduce((best, a) => (!best || Math.abs(a.body.group.position.z - line) < Math.abs(best.body.group.position.z - line) ? a : best), null);
  }

  function captureFace() {
    const agent = faceSubject();
    if (!agent) { faceShot = { inView: false }; return; }
    if (agent.body.isBox) { faceShot = { inView: false, box: true }; return; }
    agent.body.head.getWorldPosition(faceAnchor);
    const spot = toScreen(faceAnchor.x, faceAnchor.y, faceAnchor.z, 1, 1);
    if (spot.behind || spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1) { faceShot = { inView: false }; return; }
    // The picture is centred on the model's own face; the figures use the rule's face point, as the box label
    // above the person and the readouts do, so the same person never shows two px/m values.
    const g = agent.body.group;
    const faceY = MODEL_HEIGHT_M * g.scale.x * (input.facePointM / input.humanHeightM);
    const density = densityAt(g.position.x, g.position.y + faceY, g.position.z);
    const px = Math.max(2, Math.min(160, Math.round(density * FACE_CROP_M)));
    const sampled = px * FACE_SUPERSAMPLE;
    faceCamera.position.set(cameraX(), input.heightM, 0);
    faceCamera.lookAt(faceAnchor);
    faceCamera.fov = (2 * Math.atan(FACE_CROP_M / 2 / faceCamera.position.distanceTo(faceAnchor)) * 180) / Math.PI;
    faceCamera.updateProjectionMatrix();
    faceTarget.setSize(sampled, sampled);
    renderer.setRenderTarget(faceTarget);
    renderer.render(scene, faceCamera);
    renderer.setRenderTarget(null);
    const pixels = new Uint8Array(sampled * sampled * 4);
    renderer.readRenderTargetPixels(faceTarget, 0, 0, sampled, sampled, pixels);
    faceSample.width = faceSample.height = sampled;
    const sampleCtx = faceSample.getContext("2d");
    const image = sampleCtx.createImageData(sampled, sampled);
    const rowBytes = sampled * 4;
    // The render target comes back bottom row first.
    for (let row = 0; row < sampled; row += 1) {
      image.data.set(pixels.subarray((sampled - 1 - row) * rowBytes, (sampled - row) * rowBytes), row * rowBytes);
    }
    sampleCtx.putImageData(image, 0, 0);
    // Averaging the oversampled render down to the real pixel count, as a sensor pixel averages the light on it.
    faceCanvas.width = faceCanvas.height = px;
    const faceCtx = faceCanvas.getContext("2d");
    faceCtx.imageSmoothingEnabled = true;
    faceCtx.imageSmoothingQuality = "high";
    faceCtx.drawImage(faceSample, 0, 0, px, px);
    faceShot = { inView: true, facePx: Math.max(1, Math.round(density * FACE_WIDTH_M)), density: Math.round(density) };
  }

  function faceWindowRect(w) {
    const readout = densityReadoutRect(w);
    // Larger when the view is expanded, where the pixel detail is worth the room.
    const size = Math.round(Math.min(w >= 900 ? 220 : 132, Math.max(84, w * 0.2)));
    return { x: w - 8 - size, y: readout.y + readout.h + 8, w: size, h: size + 48 };
  }

  function drawFaceWindow(ctx, w) {
    const box = faceWindowRect(w);
    const inner = box.w - 8;
    ctx.fillStyle = "rgba(12, 15, 20, 0.86)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    if (faceShot && faceShot.inView) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(faceCanvas, box.x + 4, box.y + 4, inner, inner);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = "rgba(230, 236, 245, 0.6)";
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const note = faceShot && faceShot.box ? (peopleStatus === "failed" ? input.text.faceViewFailed : input.text.faceViewLoading) : input.text.faceViewNone;
      ctx.fillText(note, box.x + box.w / 2, box.y + 4 + inner / 2);
    }
    ctx.strokeStyle = input.colors.face;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 3.5, box.y + 3.5, inner + 1, inner + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "600 11px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(230, 236, 245, 0.92)";
    if (faceShot && faceShot.inView) {
      ctx.fillText(input.text.faceViewPx.split("{px}").join(String(faceShot.facePx)), box.x + 6, box.y + inner + 19);
      ctx.fillText(faceShot.density + " px/m", box.x + 6, box.y + inner + 33);
    }
    ctx.font = "600 10.5px Inter, 'Noto Sans Thai', sans-serif";
    ctx.fillStyle = "rgba(230, 236, 245, 0.6)";
    ctx.fillText(input.text.faceViewBest, box.x + 6, box.y + inner + 46);
  }

  function render() {
    if (!input) return;
    if (countingStrip) countingStrip.material.opacity = Math.max(0.85, countingStrip.material.opacity - 0.02);
    if (isFisheye()) {
      cubeCamera.position.set(cameraX(), input.heightM, 0);
      cubeCamera.update(renderer, scene);
      renderer.render(fisheyeScene, screenCamera);
    } else if (isBarrel()) {
      // The wide render keeps the picture's own pixel scale in the middle, where the lens is closest to a pinhole.
      renderer.getDrawingBufferSize(bufferSize);
      const u = barrelMaterial.uniforms;
      const width = Math.min(4096, Math.ceil(u.extent.value.x * u.f.value * bufferSize.x));
      const height = Math.min(4096, Math.ceil(u.extent.value.y * u.f.value * bufferSize.x));
      if (barrelTarget.width !== width || barrelTarget.height !== height) barrelTarget.setSize(width, height);
      renderer.setRenderTarget(barrelTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(barrelScene, screenCamera);
    } else {
      renderer.render(scene, camera);
    }
    // Still frames capture every time; a walking crowd refreshes the face about ten times a second.
    const now = performance.now();
    if (!quiet && (!animating() || now - faceShotAt > 100)) {
      captureFace();
      faceShotAt = now;
    }
    drawOverlay();
    renderOrbit();
    ui.counts.in.textContent = String(counts.in);
    ui.counts.out.textContent = String(counts.out);
    ui.counts.faces.textContent = String(counts.faces);
    ui.counts.passers.textContent = String(counts.passers);
    ui.counts.hidden.textContent = occlusion.seen > 0 ? Math.round((100 * occlusion.hidden) / occlusion.seen) + "%" : "–";
  }

  function frame(time) {
    if (!(active || orbitActive) || !animating()) return;
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function start() {
    lastTime = 0;
    if ((active || orbitActive) && animating()) requestAnimationFrame(frame);
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
    needAllPeople();
    walking = !walking;
    paused = false;
    if (input) poseStanding(input);
    syncWalking();
    start();
  });
  function setCrowd(level) {
    crowd = level;
    ui.crowd.buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.crowd === level)));
    Object.keys(counts).forEach((k) => { counts[k] = 0; });
    seed = 7;
    if (input) respawnAll(input);
  }
  ui.crowd.buttons.forEach((button) => button.addEventListener("click", () => {
    setCrowd(button.dataset.crowd);
    start();
  }));

  // The view's own settings, for the console's Reset and its Undo.
  function applyView(view) {
    walking = view.walking;
    paused = view.paused;
    standLine = view.standLine;
    standX = view.standX;
    if (view.crowd !== crowd) setCrowd(view.crowd);
    if (avatars && view.standingIndex !== standingIndex) standAvatar(view.standingIndex);
    if (input) poseStanding(input);
    syncWalking();
    start();
  }
  ui.pauseButton.addEventListener("click", () => {
    paused = !paused;
    syncWalking();
    start();
  });
  // Dragging the standing person along the counting line: the nearest point of the line to the pointer, found on
  // screen so the same search works through a fisheye.
  let dragging = false;
  function standBox() {
    const g = standing.body.group;
    const w = parseFloat(ui.overlay.style.width) || 0;
    const h = parseFloat(ui.overlay.style.height) || 0;
    return personBox(g, MODEL_HEIGHT_M * g.scale.x, w, h);
  }
  function pointerOnCanvas(event) {
    const rect = ui.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function overStanding(point) {
    const box = walking || !input ? null : standBox();
    const pad = 8;
    return Boolean(box) && point.x >= box.x - pad && point.x <= box.x + box.w + pad && point.y >= box.y - pad && point.y <= box.y + box.h + pad;
  }
  function lineXAt(point) {
    const span = standSpan(input);
    const w = parseFloat(ui.overlay.style.width) || 0;
    const h = parseFloat(ui.overlay.style.height) || 0;
    const midY = span.y + (MODEL_HEIGHT_M * standing.body.group.scale.x) / 2;
    const miss = (x) => {
      const s = toScreen(x, midY, standZ(input), w, h);
      return s.behind ? Infinity : (s.x - point.x) ** 2 + (s.y - point.y) ** 2;
    };
    const reach = span.max - span.min;
    let best = span.min;
    for (let i = 0; i <= 40; i += 1) {
      const x = span.min + (reach * i) / 40;
      if (miss(x) < miss(best)) best = x;
    }
    let lo = Math.max(span.min, best - reach / 20);
    let hi = Math.min(span.max, best + reach / 20);
    for (let i = 0; i < 24; i += 1) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (miss(a) < miss(b)) hi = b; else lo = a;
    }
    return (lo + hi) / 2;
  }
  const standMiddle = () => {
    const span = standSpan(input);
    return (span.min + span.max) / 2;
  };
  function moveStanding(x) {
    // Clamp here: poseStanding reads a position outside the lane as "came from elsewhere" and centres the person.
    const span = standSpan(input);
    standX = Math.max(span.min, Math.min(span.max, x));
    poseStanding(input);
    render();
  }
  ui.canvas.addEventListener("pointerdown", (event) => {
    if (!overStanding(pointerOnCanvas(event))) return;
    dragging = true;
    ui.canvas.setPointerCapture(event.pointerId);
    ui.canvas.dataset.drag = "dragging";
    event.preventDefault();
  });
  ui.canvas.addEventListener("pointermove", (event) => {
    const point = pointerOnCanvas(event);
    if (dragging) moveStanding(lineXAt(point));
    else ui.canvas.dataset.drag = overStanding(point) ? "grab" : "";
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    ui.canvas.dataset.drag = "grab";
  };
  ui.canvas.addEventListener("pointerup", endDrag);
  ui.canvas.addEventListener("pointercancel", endDrag);
  ui.canvas.addEventListener("dblclick", (event) => {
    if (overStanding(pointerOnCanvas(event))) moveStanding(standMiddle());
  });
  // Arrow keys move the standing person the way it moves on screen; Home puts them back in the middle.
  ui.canvas.addEventListener("keydown", (event) => {
    if (walking || !input || !["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      moveStanding(standMiddle());
      return;
    }
    const w = parseFloat(ui.overlay.style.width) || 0;
    const h = parseFloat(ui.overlay.style.height) || 0;
    const z = standZ(input);
    const y = 1 + standSpan(input).y;
    const screenRight = toScreen(standX + 0.1, y, z, w, h).x > toScreen(standX, y, z, w, h).x ? 1 : -1;
    const step = (event.shiftKey ? 0.25 : 0.05) * (event.key === "ArrowRight" ? 1 : -1) * screenRight;
    moveStanding(standX + step);
  });

  ui.stand.buttons.forEach((button) => button.addEventListener("click", () => {
    standLine = button.dataset.stand;
    if (input) poseStanding(input);
    syncWalking();
    render();
  }));

  // Stepping to another person needs the full set; until it arrives, the step waits.
  const stepPerson = (delta) => {
    const target = (standingIndex + delta + avatars.total) % avatars.total;
    if (!avatars.complete) {
      needAllPeople(target);
      pendingIndex = target;
      return;
    }
    standAvatar(target);
    render();
  };
  ui.person.prev.addEventListener("click", () => stepPerson(-1));
  ui.person.next.addEventListener("click", () => stepPerson(1));
  ui.resetButton.addEventListener("click", () => {
    Object.keys(counts).forEach((k) => {
      counts[k] = 0;
    });
    Object.assign(occlusion, { seen: 0, hidden: 0, sampledAt: 0 });
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
    // For tests: who is riding and who is on the landing, and how far the belts have run.
    stats() {
      const shown = walking && input && input.scene === "escalator" ? agents.filter((a) => a.body.group.visible) : [];
      const riding = shown.filter((a) => a.phase === "ride");
      return {
        walking, paused, counts: { ...counts }, beltTravelM: beltTravel,
        riding: riding.length, onLanding: shown.length - riding.length,
        ridersY: riding.map((a) => Math.round(a.body.group.position.y * 100) / 100),
        people: shown.map((a) => ({ id: agents.indexOf(a), kind: a.kind, chatting: ((l) => l.chatAt !== null && l.travelled >= l.chatAt && l.chatLeft > 0)(a.leader || a), x: a.body.group.position.x, y: a.body.group.position.y, z: a.body.group.position.z, riding: a.phase === "ride" })),
        faceSubjectZ: walking && input ? (() => { const who = faceSubject(); return who ? who.body.group.position.z : null; })() : null,
      };
    },
    viewState: () => ({ walking, paused, crowd, standingIndex, standLine, standX }),
    resetView: () => applyView({ walking: false, paused: false, crowd: "light", standingIndex: 0, standLine: "count", standX: 0 }),
    restoreView: applyView,
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
        controls.addEventListener("change", () => { if (!animating()) requestAnimationFrame(renderOrbit); });
        orbit = { renderer, view, controls };
        if (input) aimOrbit(input, true);
      }
      const wasActive = orbitActive;
      orbitActive = next;
      if (orbitActive) {
        sizeOrbit();
        if (!wasActive) start();
      }
      wantPeople();
    },
    setPlacement(placement) {
      const first = input === null;
      input = placement;
      configureLens(placement);
      camera.position.set(-placement.offsetM, placement.heightM, 0);
      // Turned to the middle of the entrance, then tilted down.
      // The scene's x runs opposite to the engine's, so a pan to the camera's right turns it toward scene -x.
      camera.rotation.set((-placement.tiltDeg * Math.PI) / 180, Math.PI - (placement.panDeg * Math.PI) / 180, 0);
      camera.updateProjectionMatrix();
      if (placement.lens === "fisheye") fisheyeMaterial.uniforms.halfFov.value = (placement.fovDeg * Math.PI) / 360;
      rebuildProps(placement);
      poseStanding(placement);
      camera.updateMatrixWorld();
      rebuildHelpers(placement);
      if (orbit) aimOrbit(placement, false);
      syncPassersRow();
      const key = [placement.scene, placement.scene === "escalator" ? placement.landing : "", placement.lens, placement.distanceM.toFixed(1), placement.entranceWidthM || 0, (placement.faceLineDistanceM || 0).toFixed(1)].join("|");
      if (first || key !== layoutKey) respawnAll(placement);
      layoutKey = key;
      syncWalking();
      if (active) {
        resize();
        if (!animating()) render();
      } else if (orbitActive && !animating()) {
        // Orbit can be on screen while the camera's own view is not (the Top tab); it still follows every change.
        renderOrbit();
      }
    },
    setActive(next) {
      const wasActive = active;
      active = next;
      if (active && !wasActive) {
        resize();
        start();
      }
      wantPeople();
    },
  };
}
