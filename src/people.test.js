import { test } from "node:test";
import assert from "node:assert/strict";
import { inPlace, PEOPLE, PEOPLE_CLIPS, textureUrl } from "./people.js";

const FakeThree = {
  VectorKeyframeTrack: class { constructor(name, times, values) { Object.assign(this, { name, times, values }); } },
  AnimationClip: class { constructor(name, duration, tracks) { Object.assign(this, { name, duration, tracks }); } },
};

test("colour maps load as the shrunk JPEG from the avatar's folder, whatever path the artist saved", () => {
  assert.equal(textureUrl("C:\\Rocketbox\\Textures\\f001_head_color.tga", "people/Female_Adult_01/"), "people/Female_Adult_01/f001_head_color.jpg");
  assert.equal(textureUrl("Textures/f001_body_color.tga", "people/Female_Adult_01/"), "people/Female_Adult_01/f001_body_color.jpg");
});

test("opacity masks keep their alpha as PNG", () => {
  assert.equal(textureUrl("f001_opacity_color.tga", "people/F/"), "people/F/f001_opacity_color.png");
});

test("normal and specular maps, left out of the build, load as a blank pixel", () => {
  assert.match(textureUrl("f001_head_normal.tga", "people/F/"), /^data:image\/gif/);
  assert.match(textureUrl("f001_body_specular.tga", "people/F/"), /^data:image\/gif/);
});

test("the model file itself is fetched as asked", () => {
  assert.equal(textureUrl("people/F/F.fbx", "people/F/"), "people/F/F.fbx");
});

test("a walk clip walks on the spot at the pace it was captured", () => {
  const clip = {
    name: "walk",
    duration: 1,
    tracks: [
      { name: "Bip01.position", times: [0, 0.5, 1], values: [0, 90, 0, 2, 92, 70, 0, 90, 140] },
      { name: "Bip01.quaternion", times: [0], values: [0, 0, 0, 1] },
      { name: "Bip01_Spine.position", times: [0], values: [1, 2, 3] },
      { name: "Bip01_Spine.quaternion", times: [0], values: [0, 0, 0, 1] },
      { name: "Bip01_Footsteps.position", times: [0], values: [0, 0, 0] },
      { name: "MotionExtractionHelper.position", times: [0], values: [0, 0, 0] },
    ],
  };
  const { clip: still, speedMps } = inPlace(FakeThree, clip);
  assert.equal(speedMps, 1.4);
  assert.deepEqual(still.tracks.map((t) => t.name), ["Bip01.position", "Bip01.quaternion", "Bip01_Spine.quaternion"]);
  // Sway (x) and bob (y) stay; the travel forward (z) is gone.
  assert.deepEqual(Array.from(still.tracks[0].values), [0, 90, 0, 2, 92, 0, 0, 90, 0]);
  assert.equal(clip.tracks[0].values[8], 140);
});

test("both sexes appear in the crowd, and each has a walk and a stand", () => {
  assert.deepEqual([...new Set(PEOPLE.map((p) => p.sex))].sort(), ["f", "m"]);
  PEOPLE.forEach((p) => assert.ok(PEOPLE_CLIPS[p.sex].walk && PEOPLE_CLIPS[p.sex].idle));
});
