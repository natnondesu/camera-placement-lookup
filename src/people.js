// Rocketbox avatars (Microsoft, MIT) for the walk simulation: realistic faces, so the face window shows what a
// camera would get. Loaded as FBX straight from the repo; a failure leaves the box figures in place.

export const PEOPLE = [
  { id: "Female_Adult_01", sex: "f" },
  { id: "Male_Adult_03", sex: "m" },
  { id: "Female_Adult_03", sex: "f" },
  { id: "Male_Adult_04", sex: "m" },
  { id: "Female_Adult_06", sex: "f" },
  { id: "Male_Adult_06", sex: "m" },
  { id: "Female_Adult_11", sex: "f" },
  { id: "Male_Adult_12", sex: "m" },
];

export const PEOPLE_CLIPS = {
  f: { walk: "f_walk_neutral", idle: "f_idle_breathe_01" },
  m: { walk: "m_walk_neutral", idle: "m_idle_breathe_01" },
};

const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

/**
 * Where a texture the FBX names should come from: colour maps were shrunk to JPEG (opacity masks to PNG with alpha);
 * normal and specular maps were left out of the build, so they load as a blank pixel and are dropped after loading.
 * @param {string} url as the FBX loader asks for it, often carrying the artist's own Windows path
 * @param {string} folder the avatar's folder, ending in /
 * @returns {string}
 */
export function textureUrl(url, folder) {
  const name = url.split(/[\\/]/).pop();
  if (!/\.tga$/i.test(name)) return url;
  if (/_opacity_color\.tga$/i.test(name)) return folder + name.slice(0, -4) + ".png";
  if (/_color\.tga$/i.test(name)) return folder + name.slice(0, -4) + ".jpg";
  return BLANK_IMAGE;
}

/**
 * A walk clip that walks on the spot: the root keeps its sway and bob but not its travel, which the simulation
 * supplies, and other bones keep only their rotations, so one clip fits every avatar's own proportions.
 * @param {typeof import("three")} THREE
 * @param {import("three").AnimationClip} clip
 * @returns {{ clip: import("three").AnimationClip, speedMps: number }} speedMps the pace the clip was captured at
 */
export function inPlace(THREE, clip) {
  let speedMps = 0;
  const tracks = clip.tracks.flatMap((track) => {
    const [bone, property] = track.name.split(".");
    if (bone === "MotionExtractionHelper" || bone === "Bip01_Footsteps") return [];
    if (bone === "Bip01" && property === "position") {
      const values = track.values.slice();
      const last = values.length - 3;
      // Rocketbox clips are in centimetres and walk along +z.
      speedMps = Math.abs(values[last + 2] - values[2]) / 100 / clip.duration;
      for (let i = 2; i < values.length; i += 3) values[i] = values[2];
      return [new THREE.VectorKeyframeTrack(track.name, track.times, values)];
    }
    return property === "position" || property === "scale" ? [] : [track];
  });
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, tracks), speedMps };
}

/**
 * Loads every avatar and clip, then returns a maker for walking or standing people.
 * @param {typeof import("three")} THREE
 * @param {{ FBXLoader: Function, clone: Function, base: string, heightM: number }} options
 *   base: the folder holding the avatar folders and anims/; heightM: the height a body is built at
 */
export async function loadPeople(THREE, { FBXLoader, clone, base, heightM }) {
  const loadFbx = (url, folder) => {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((asked) => (asked === url ? asked : textureUrl(asked, folder)));
    manager.addHandler(/\.tga$/i, new THREE.TextureLoader(manager));
    return new FBXLoader(manager).loadAsync(url);
  };
  const clipFor = async (name) => inPlace(THREE, (await loadFbx(base + "anims/" + name + ".max.fbx", base)).animations[0]);
  const [clips, templates] = await Promise.all([
    Promise.all(Object.entries(PEOPLE_CLIPS).map(async ([sex, names]) => [sex, { walk: await clipFor(names.walk), idle: await clipFor(names.idle) }])),
    Promise.all(PEOPLE.map(async (person) => {
      const folder = base + person.id + "/";
      return { ...person, model: prepare(THREE, await loadFbx(folder + person.id + ".fbx", folder), heightM) };
    })),
  ]);
  const clipsBySex = Object.fromEntries(clips);

  /**
   * @param {number} index which avatar, wrapping around the list
   * @param {"walk" | "idle"} motion
   * @param {number} phase where in the cycle to start, 0 to 1
   */
  return function makeAvatar(index, motion, phase) {
    const template = templates[((index % templates.length) + templates.length) % templates.length];
    const model = clone(template.model);
    const group = new THREE.Group();
    group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const { clip, speedMps } = clipsBySex[template.sex][motion];
    const action = mixer.clipAction(clip);
    action.time = phase * clip.duration;
    action.play();
    mixer.update(0);
    // The face sits in front of and above the head bone's pivot, which is at the top of the neck.
    const head = new THREE.Object3D();
    model.getObjectByName("Bip01_Head").add(head);
    head.position.copy(model.getObjectByName("Bip01_Head").userData.faceOffset);
    return {
      group,
      head,
      animate(dt, speedNow) {
        action.timeScale = speedNow / speedMps;
        mixer.update(dt);
      },
    };
  };
}

// One template: metres, a simple matte material, hair and lashes cut out by their alpha, and the face located.
function prepare(THREE, model, heightM) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const headBone = model.getObjectByName("Bip01_Head");
  const headWorld = headBone.getWorldPosition(new THREE.Vector3());
  const tall = box.max.y - box.min.y;
  // In the avatar's own units (centimetres): about 9 cm up and 9 cm forward of the pivot, between the eyes.
  const face = headWorld.clone().add(new THREE.Vector3(0, tall * 0.05, tall * 0.05));
  headBone.userData.faceOffset = headBone.worldToLocal(face);
  model.scale.setScalar(heightM / tall);
  model.position.y = -box.min.y * (heightM / tall);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    node.material = [].concat(node.material).map((old) => {
      const cutout = /opacity/i.test(old.name);
      if (old.map) old.map.colorSpace = THREE.SRGBColorSpace;
      const next = new THREE.MeshStandardMaterial({
        name: old.name,
        map: old.map,
        roughness: 0.78,
        metalness: 0,
        alphaTest: cutout ? 0.45 : 0,
        side: cutout ? THREE.DoubleSide : THREE.FrontSide,
      });
      old.dispose();
      return next;
    });
    if (node.material.length === 1) node.material = node.material[0];
  });
  return model;
}
