// Walk simulation seen through the placement camera. Three.js is passed in so this module
// loads without it; crossingDirection and pixelsPerMetre are the pure parts and are unit-tested.

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
 * Horizontal pixel density at a straight-line distance from the camera.
 * @param {number} resolutionWidthPx
 * @param {number} horizontalFovDeg
 * @param {number} distanceM straight-line distance from the camera (m)
 * @returns {number} pixels per metre
 */
export function pixelsPerMetre(resolutionWidthPx, horizontalFovDeg, distanceM) {
  return resolutionWidthPx / (2 * distanceM * Math.tan((horizontalFovDeg * Math.PI) / 360));
}

const MODEL_HEIGHT_M = 1.7;
// Matches the engine's 80% effective coverage: the outer 10% on each side is shaded.
const EFFECTIVE_EDGE = 0.1;
const SKIN = ["#f1c7a5", "#d9a47c", "#b97b52", "#8d5a3b", "#5f3b26"];
const TOPS = ["#3d6fb6", "#7a8796", "#b5443c", "#2f7d5b", "#c9a227", "#e6e1d6", "#5a4a8c", "#26313d"];
const BOTTOMS = ["#2b3440", "#3c4f6b", "#5b5148", "#1f2329", "#6b6f75"];
const HAIR = ["#1b1612", "#3b2a1e", "#6b4a2b", "#8a8a8a"];

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

  let props = new THREE.Group();
  scene.add(props);
  let countingStrip = null;
  let input = null;
  let layoutKey = "";
  let agents = [];
  let active = false;
  let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let crossTraffic = false;
  let lastTime = 0;
  let seed = 7;
  // Seeded so a reset replays a believable crowd rather than a new random one each time.
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const counts = { in: 0, out: 0, faces: 0, passers: 0 };

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
    const farZ = Math.max(p.distanceM, p.faceLineDistanceM || 0) + 5;
    const endZ = p.depthM ? Math.max(p.distanceM + 1, Math.min(farZ, p.depthM - 0.4)) : farZ;
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
    const stripWidth = Math.max(8, p.coverageWidthM * 1.4);
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
    if (p.depthM) props.add(wallBox(40, 3.5, 0, 1.75, p.depthM, 0.2));
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
      flashText: "",
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
  }

  function resize() {
    if (!input) return;
    const width = ui.canvas.parentElement.clientWidth;
    if (!width) return;
    const height = Math.round(width / input.aspect);
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
          agent.flashText = crossed === "in" ? "IN" : "OUT";
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
  function toScreen(x, y, z, w, h) {
    projected.set(x, y, z).project(camera);
    return { x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h, behind: projected.z > 1 };
  }

  // The middle 80% of the frame width, the part the console treats as reliable coverage.
  function drawEffectiveCoverage(ctx, w, h) {
    const edge = w * EFFECTIVE_EDGE;
    ctx.fillStyle = "rgba(8, 10, 14, 0.38)";
    ctx.fillRect(0, 0, edge, h);
    ctx.fillRect(w - edge, 0, edge, h);
    ctx.strokeStyle = "rgba(120, 220, 160, 0.75)";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, h);
    ctx.moveTo(w - edge, 0);
    ctx.lineTo(w - edge, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 10px Inter, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(120, 220, 160, 0.9)";
    ctx.fillText("effective 80%", edge + 5, h - 6);
  }

  // Detection boxes and line labels, drawn the way a counting camera's overlay shows them.
  function drawOverlay() {
    const ctx = ui.overlay.getContext("2d");
    const w = parseFloat(ui.overlay.style.width) || 0;
    const h = parseFloat(ui.overlay.style.height) || 0;
    ctx.clearRect(0, 0, w, h);
    drawEffectiveCoverage(ctx, w, h);
    ctx.font = "600 11px Inter, sans-serif";
    ctx.textBaseline = "bottom";
    const lay = layout(input);
    const label = (z, text, color) => {
      const left = toScreen(-1.4, 0, z, w, h);
      if (left.behind || left.y < 0 || left.y > h) return false;
      ctx.fillStyle = color;
      ctx.fillText(text, 8, Math.min(h - 4, left.y - 4));
      return true;
    };
    const countingVisible = label(input.distanceM, "counting line " + input.distanceM.toFixed(2) + " m", input.colors.count);
    if (input.faceLineDistanceM !== null && Math.abs(input.faceLineDistanceM - input.distanceM) > 0.02) {
      label(input.faceLineDistanceM, "face line " + input.faceLineDistanceM.toFixed(2) + " m", input.colors.face);
    }
    for (const agent of agents) {
      const g = agent.body.group;
      const behindWall = lay.doorZ !== null && g.position.z > lay.doorZ + 0.1 && Math.abs(g.position.x) > lay.doorHalf - 0.1;
      if (behindWall) continue;
      const tall = MODEL_HEIGHT_M * g.scale.x;
      const feet = toScreen(g.position.x, 0, g.position.z, w, h);
      const top = toScreen(g.position.x, tall, g.position.z, w, h);
      if (feet.behind || top.behind) continue;
      const half = Math.abs(toScreen(g.position.x + 0.3, tall / 2, g.position.z, w, h).x - feet.x);
      const box = { x: feet.x - half, y: top.y, w: half * 2, h: feet.y - top.y };
      if (box.x > w || box.x + box.w < 0 || box.y > h || box.y + box.h < 0) continue;
      const counted = agent.flash > 0;
      ctx.strokeStyle = counted ? input.colors.count : "rgba(230, 236, 245, 0.55)";
      ctx.lineWidth = counted ? 2 : 1;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      // Density at this person's face, the figure demographics depend on.
      if (box.h >= 28) {
        const faceY = tall * (input.facePointM / input.humanHeightM);
        const faceDistance = Math.hypot(g.position.x, input.heightM - faceY, g.position.z);
        const ppm = pixelsPerMetre(input.resolutionW, input.hFovDeg, faceDistance);
        ctx.font = "600 10px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(230, 236, 245, 0.85)";
        ctx.fillText(Math.round(ppm) + " px/m", feet.x, box.y - 3);
        ctx.textAlign = "left";
        ctx.font = "600 11px Inter, sans-serif";
      }
      if (counted) {
        const tagWidth = ctx.measureText(agent.flashText).width + 8;
        ctx.fillStyle = input.colors.count;
        ctx.fillRect(box.x, box.y, tagWidth, 15);
        ctx.fillStyle = "#0f1217";
        ctx.fillText(agent.flashText, box.x + 4, box.y + 13);
      }
      if (agent.faceFlash > 0) {
        const head = box.h * 0.16;
        ctx.strokeStyle = input.colors.face;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(feet.x - head * 0.6, box.y, head * 1.2, head * 1.1);
        ctx.fillStyle = input.colors.face;
        ctx.fillText("face", feet.x + head * 0.7, box.y + head);
      }
    }
    if (!countingVisible) {
      ctx.fillStyle = input.colors.bad;
      ctx.fillText("Counting line is outside the frame", 8, h - 8);
    }
    drawDensityReadout(ctx, w);
  }

  // Top-right readout: pixel density where each line meets the floor (counting) or the face point (face).
  function drawDensityReadout(ctx, w) {
    const rows = [["Counting line", input.colors.count, Math.hypot(input.heightM, input.distanceM)]];
    if (input.faceLineDistanceM !== null) {
      rows.push(["Face line", input.colors.face, Math.hypot(input.heightM - input.facePointM, input.faceLineDistanceM)]);
    }
    const lineHeight = 17;
    const boxW = 168;
    const boxH = 10 + rows.length * lineHeight;
    const x = w - boxW - 8;
    const y = 8;
    ctx.fillStyle = "rgba(12, 15, 20, 0.72)";
    ctx.fillRect(x, y, boxW, boxH);
    rows.forEach(([name, color, distance], i) => {
      const rowY = y + 5 + (i + 1) * lineHeight - 4;
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, rowY - 8, 8, 3);
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(230, 236, 245, 0.9)";
      ctx.fillText(name, x + 22, rowY);
      ctx.font = "600 11px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(pixelsPerMetre(input.resolutionW, input.hFovDeg, distance)) + " px/m", x + boxW - 8, rowY);
    });
    ctx.textAlign = "left";
  }

  function render() {
    if (!input) return;
    if (countingStrip) countingStrip.material.opacity = Math.max(0.85, countingStrip.material.opacity - 0.02);
    renderer.render(scene, camera);
    drawOverlay();
    ui.counts.in.textContent = String(counts.in);
    ui.counts.out.textContent = String(counts.out);
    ui.counts.faces.textContent = String(counts.faces);
    ui.counts.passers.textContent = String(counts.passers);
  }

  function frame(time) {
    if (!active || !playing) return;
    const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function start() {
    lastTime = 0;
    if (active && playing) requestAnimationFrame(frame);
    else render();
  }

  function syncPlayButton() {
    ui.playButton.textContent = playing ? "Pause" : "Play";
    ui.playButton.setAttribute("aria-pressed", String(playing));
  }

  function syncPassersRow() {
    if (input) ui.passersRow.hidden = input.scene !== "open_door" && !crossTraffic;
  }

  ui.crossButton.setAttribute("aria-pressed", "false");
  ui.crossButton.addEventListener("click", () => {
    crossTraffic = !crossTraffic;
    ui.crossButton.setAttribute("aria-pressed", String(crossTraffic));
    syncPassersRow();
    if (input) respawnAll(input);
    start();
  });

  ui.playButton.addEventListener("click", () => {
    playing = !playing;
    syncPlayButton();
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
    if (!active) return;
    resize();
    render();
  });
  syncPlayButton();

  return {
    setPlacement(placement) {
      const first = input === null;
      input = placement;
      camera.fov = placement.vFovDeg;
      camera.aspect = placement.aspect;
      camera.position.set(0, placement.heightM, 0);
      camera.rotation.set((-placement.tiltDeg * Math.PI) / 180, Math.PI, 0);
      camera.updateProjectionMatrix();
      rebuildProps(placement);
      syncPassersRow();
      const key = [placement.scene, placement.distanceM.toFixed(1), placement.depthM || 0, placement.entranceWidthM || 0, (placement.faceLineDistanceM || 0).toFixed(1)].join("|");
      if (first || key !== layoutKey) respawnAll(placement);
      layoutKey = key;
      if (active) {
        resize();
        if (!playing) render();
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
