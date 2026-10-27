// Share links and the printable site sheet. Inlined into the console's script by generate.mjs, after the
// console's own functions (t, fmt, els, state, currentPlacement, presetFor and friends) and before start-up.

const SHEET_TEXT = {
  en: {
    shShare: "Share", shTitle: "Share this placement", shHelp: "The link opens this exact setup. The site sheet is a printable page.",
    shSite: "Site", shLocation: "Location", shSiteHint: "e.g. Central World", shLocationHint: "e.g. Entrance A, camera 1",
    shCopy: "Copy link", shCopied: "Link copied.", shCopyFailed: "Copy was blocked; select the link and copy it.", shOpenSheet: "Site sheet", shClose: "Close",
    shBack: "Back to console", shPrint: "Print or save PDF", shViewTitle: "Site sheet",
    shShared: "Shared placement", shDismiss: "Dismiss",
    shVerdictChanged: "Made with rules {version} when the verdict was {then}; with today's rules it is {now}.",
    shNewRules: "Made with rules {version}; today's rules ({today}) give the same verdict.",
    shCameraGone: "The camera in this link ({camera}) is no longer in the catalogue; showing {current} instead.",
    shSheetTitle: "Camera placement", shPrepared: "Prepared", shRules: "Rules", shScene: "Scene", shCamera: "Camera",
    shFov: "{h}° × {v}° at {f} mm", shDatasheet: "(datasheet)",
    shVerdict_best: "<b>Placement is best.</b> Feet angle {angle}° at the counting line, inside the best band {min}–{max}°.",
    shVerdict_acceptable: "<b>Placement is acceptable.</b> Feet angle {angle}° at the counting line, outside the best band {min}–{max}° but within {amin}–{amax}°.",
    shVerdict_out_of_range: "<b>Placement is out of range.</b> {reason}",
    shMount: "Mount the camera above the floor", shMountHint: "Measure to the centre of the lens.",
    shLine: "Mark the counting line out from the point below the camera", shLineHint: "Straight out, across the full entrance.",
    shTilt: "Tilt the camera down", shTiltHint: "It aims at {aim} m on a person standing on the line.",
    shTiltFisheye: "Point the camera straight down", shTiltFisheyeHint: "Ceiling fisheye: the lens faces the floor.",
    shZoomWide: "Set the zoom to the widest end", shZoomTele: "Set the zoom to the longest end", shZoom: "Set the zoom",
    shLensFixed: "Fixed lens", shFisheyeLens: "Fisheye lens, no zoom to set", shStream: "Main stream {w} × {h}.",
    shSideTitle: "Side elevation", shCamTitle: "Camera view (simulated)", shKeyEffective: "effective 80%",
    shKeyCount: "counting line", shKeyFace: "face line", shFaceLineLabel: "face line",
    shThReading: "Reading", shThValue: "Value", shThMeaning: "Meaning",
    shRowCount: "feet {angle}°, best band {near}–{far} m from the camera, {ppm} px/m",
    shRowFace: "face {angle}°, {ppm} px/m at the face.", shFaceFloor: "Below the {min} px/m face floor; demographics only, never fails the placement.",
    shRowEntrance: "inside the effective {eff} m of the {cover} m the camera covers",
    shFaceWarn: "Faces are {ppm} px/m at the face line, under the {min} px/m floor: demographics may be unreliable. Zoom in a little or mount lower if demographics matter here.",
    shAsInstalled: "As installed (measured)", shHeight: "Height", shCountingLine: "Counting line", shZoomBlank: "Zoom", shTiltBlank: "Tilt",
    shOnSite: "On site", shCheck1: "Counting line marked across the full entrance", shCheck2: "Nothing blocks the view: signs, beams, doors",
    shCheck3: "No strong backlight from glass doors or windows", shCheck4: "Power and network tested; stream visible",
    shOpenTitle: "Open this placement", shOpenNote: "Scan or open the link to see the same placement in the console, with the live simulation.",
    shInstalledBy: "Installed by", shDate: "Date"
  },
  th: {
    shShare: "แชร์", shTitle: "แชร์ตำแหน่งนี้", shHelp: "ลิงก์นี้เปิดการตั้งค่าเดียวกันทุกอย่าง และพิมพ์เป็นใบงานติดตั้งได้",
    shSite: "สถานที่", shLocation: "ตำแหน่ง", shSiteHint: "เช่น เซ็นทรัลเวิลด์", shLocationHint: "เช่น ทางเข้า A กล้อง 1",
    shCopy: "คัดลอกลิงก์", shCopied: "คัดลอกลิงก์แล้ว", shCopyFailed: "เบราว์เซอร์ไม่อนุญาตให้คัดลอก เลือกลิงก์แล้วคัดลอกเอง", shOpenSheet: "ใบงานติดตั้ง", shClose: "ปิด",
    shBack: "กลับไปหน้าคำนวณ", shPrint: "พิมพ์หรือบันทึก PDF", shViewTitle: "ใบงานติดตั้ง",
    shShared: "ตำแหน่งที่แชร์มา", shDismiss: "ปิด",
    shVerdictChanged: "สร้างด้วยกฎ {version} ตอนนั้นผลคือ {then} ตามกฎปัจจุบันผลคือ {now}",
    shNewRules: "สร้างด้วยกฎ {version} กฎปัจจุบัน ({today}) ให้ผลเหมือนเดิม",
    shCameraGone: "ไม่พบกล้องในลิงก์ ({camera}) ในรายการแล้ว แสดง {current} แทน",
    shSheetTitle: "ตำแหน่งติดตั้งกล้อง", shPrepared: "จัดทำ", shRules: "กฎ", shScene: "ลักษณะพื้นที่", shCamera: "กล้อง",
    shFov: "มุมรับภาพ {h}° × {v}° ที่ {f} mm", shDatasheet: "(ตามสเปก)",
    shVerdict_best: "<b>ตำแหน่งนี้ดีที่สุด</b> มุมเท้าที่เส้นนับ {angle}° อยู่ในช่วงดีที่สุด {min}–{max}°",
    shVerdict_acceptable: "<b>ตำแหน่งนี้พอใช้</b> มุมเท้าที่เส้นนับ {angle}° อยู่นอกช่วงดีที่สุด {min}–{max}° แต่อยู่ในช่วง {amin}–{amax}°",
    shVerdict_out_of_range: "<b>ตำแหน่งนี้เกินเกณฑ์</b> {reason}",
    shMount: "ติดตั้งกล้องสูงจากพื้น", shMountHint: "วัดถึงกึ่งกลางเลนส์",
    shLine: "ทำเครื่องหมายเส้นนับ ห่างจากจุดใต้กล้อง", shLineHint: "ตรงออกไป และยาวตลอดความกว้างทางเข้า",
    shTilt: "ก้มกล้องลง", shTiltHint: "เล็งที่ความสูง {aim} m ของคนที่ยืนบนเส้นนับ",
    shTiltFisheye: "หันกล้องลงตรงๆ", shTiltFisheyeHint: "ฟิชอายติดเพดาน เลนส์หันลงพื้น",
    shZoomWide: "ตั้งซูมที่ระยะกว้างสุด", shZoomTele: "ตั้งซูมที่ระยะไกลสุด", shZoom: "ตั้งซูม",
    shLensFixed: "เลนส์ตายตัว", shFisheyeLens: "เลนส์ฟิชอาย ไม่ต้องตั้งซูม", shStream: "สตรีมหลัก {w} × {h}",
    shSideTitle: "มุมมองด้านข้าง", shCamTitle: "ภาพจากกล้อง (จำลอง)", shKeyEffective: "ใช้งานได้ 80%",
    shKeyCount: "เส้นนับ", shKeyFace: "เส้นจับใบหน้า", shFaceLineLabel: "เส้นจับใบหน้า",
    shThReading: "รายการ", shThValue: "ค่า", shThMeaning: "ความหมาย",
    shRowCount: "มุมเท้า {angle}° ช่วงดีที่สุด {near}–{far} m จากกล้อง {ppm} px/m",
    shRowFace: "มุมใบหน้า {angle}° ที่ใบหน้า {ppm} px/m", shFaceFloor: "ต่ำกว่าเกณฑ์ใบหน้า {min} px/m ใช้เก็บข้อมูลเพศ/อายุเท่านั้น ไม่ทำให้ตำแหน่งไม่ผ่าน",
    shRowEntrance: "อยู่ในช่วงใช้งานได้ {eff} m จาก {cover} m ที่กล้องมองเห็น",
    shFaceWarn: "ที่เส้นจับใบหน้ามีเพียง {ppm} px/m ต่ำกว่าเกณฑ์ {min} px/m ข้อมูลเพศ/อายุอาจไม่แม่นยำ ซูมเข้าเล็กน้อยหรือติดตั้งให้ต่ำลงหากต้องการข้อมูลนี้",
    shAsInstalled: "ค่าที่ติดตั้งจริง (วัดได้)", shHeight: "ความสูง", shCountingLine: "เส้นนับ", shZoomBlank: "ซูม", shTiltBlank: "มุมก้ม",
    shOnSite: "ตรวจหน้างาน", shCheck1: "ทำเครื่องหมายเส้นนับตลอดความกว้างทางเข้าแล้ว", shCheck2: "ไม่มีสิ่งบังภาพ เช่น ป้าย คาน ประตู",
    shCheck3: "ไม่มีแสงย้อนแรงจากประตูกระจกหรือหน้าต่าง", shCheck4: "ทดสอบไฟและเครือข่ายแล้ว เห็นภาพจากกล้อง",
    shOpenTitle: "เปิดตำแหน่งนี้", shOpenNote: "สแกนหรือเปิดลิงก์เพื่อดูตำแหน่งเดียวกันในโปรแกรม พร้อมการจำลอง",
    shInstalledBy: "ผู้ติดตั้ง", shDate: "วันที่"
  }
};
Object.keys(SHEET_TEXT).forEach((code) => Object.assign(I18N[code], SHEET_TEXT[code]));

const SHEET_ICON = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"></path><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19z"></path><path d="M12 10v4M12 17.5h.01"></path></svg>'
};

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function readSaved(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch (error) {
    return "";
  }
}

function saveLocal(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Remembering the site is a convenience; the link still carries it.
  }
}

state.site = readSaved("cpl-site");
state.location = readSaved("cpl-location");
state.sheetSnapshot = null;

// ---------- Markup ----------
(function buildShareMarkup() {
  const share = document.createElement("button");
  share.type = "button";
  share.className = "share-button";
  share.id = "shareButton";
  share.setAttribute("data-i18n-attr", "aria-label:shShare");
  share.innerHTML = SHEET_ICON.share + '<span data-i18n="shShare">Share</span>';
  document.querySelector(".topbar .lang-seg").before(share);

  const banner = document.createElement("div");
  banner.className = "shared-banner";
  banner.id = "sharedBanner";
  banner.hidden = true;
  banner.setAttribute("role", "status");
  banner.innerHTML = '<div><b data-i18n="shShared">Shared placement</b> <span id="sharedWhere"></span><p id="sharedNote" hidden></p></div>' +
    '<button type="button" class="shared-dismiss" id="sharedDismiss" data-i18n-attr="aria-label:shDismiss">' + SHEET_ICON.close + "</button>";
  document.querySelector(".workspace").before(banner);

  const dialog = document.createElement("dialog");
  dialog.className = "share-dialog";
  dialog.id = "shareDialog";
  dialog.setAttribute("aria-labelledby", "shareDialogTitle");
  dialog.innerHTML =
    '<form method="dialog" class="share-close-form"><button class="share-close" data-i18n-attr="aria-label:shClose">' + SHEET_ICON.close + "</button></form>" +
    '<h2 id="shareDialogTitle" data-i18n="shTitle">Share this placement</h2>' +
    '<p class="share-help" data-i18n="shHelp"></p>' +
    '<label class="share-field"><span data-i18n="shSite">Site</span><input id="shareSite" autocomplete="off" data-i18n-attr="placeholder:shSiteHint"></label>' +
    '<label class="share-field"><span data-i18n="shLocation">Location</span><input id="shareLocation" autocomplete="off" data-i18n-attr="placeholder:shLocationHint"></label>' +
    '<input class="share-link" id="shareLink" readonly aria-label="Link">' +
    '<div class="share-actions"><button type="button" class="share-copy" id="shareCopy" data-i18n="shCopy">Copy link</button>' +
    '<button type="button" class="share-open" id="shareOpenSheet" data-i18n="shOpenSheet">Site sheet</button></div>' +
    '<p class="share-status" id="shareStatus" aria-live="polite"></p>';
  document.body.appendChild(dialog);

  const view = document.createElement("section");
  view.className = "sheet-view";
  view.id = "sheetView";
  view.hidden = true;
  view.setAttribute("data-i18n-attr", "aria-label:shViewTitle");
  view.innerHTML =
    '<div class="sheet-toolbar">' +
      '<button type="button" class="sheet-back" id="sheetBack">' + SHEET_ICON.back + '<span data-i18n="shBack">Back to console</span></button>' +
      '<div class="solve-seg lang-seg" role="group" aria-label="Language" data-i18n-attr="aria-label:language">' +
        '<button type="button" data-lang="en" aria-pressed="true">EN</button><button type="button" data-lang="th" aria-pressed="false">ไทย</button>' +
      "</div>" +
      '<button type="button" class="sheet-print" id="sheetPrint" data-i18n="shPrint">Print or save PDF</button>' +
    "</div>" +
    '<article class="sheet" id="sheetPage" aria-live="off"></article>';
  document.body.appendChild(view);
})();

Object.assign(els, {
  shareButton: byId("shareButton"), sharedBanner: byId("sharedBanner"), sharedWhere: byId("sharedWhere"), sharedNote: byId("sharedNote"),
  shareDialog: byId("shareDialog"), shareSite: byId("shareSite"), shareLocation: byId("shareLocation"), shareLink: byId("shareLink"),
  shareStatus: byId("shareStatus"), sheetView: byId("sheetView"), sheetPage: byId("sheetPage")
});

// ---------- The link ----------
function sharedPlacementFrom(p) {
  const preset = presetFor(state.presetId);
  return {
    rulesVersion: RULES.version,
    scene: p.profile.id,
    camera: state.presetId,
    focalMm: preset.lens === "fisheye" ? null : Number(els.focalInput.value),
    resolution: p.resolution ? { w: p.resolution.w, h: p.resolution.h } : null,
    sensor: state.presetId === "custom" ? els.sensorSelect.value : null,
    solve: state.solveMode,
    heightM: p.heightM,
    distanceM: p.distanceM,
    tiltDeg: state.tiltUserAdjusted && preset.lens !== "fisheye" ? Number(els.tiltInput.value) : null,
    entranceM: state.entranceM,
    verdict: p.result.verdict,
    site: state.site,
    location: state.location
  };
}

function shareUrl(p) {
  return location.href.split("#")[0] + "#" + encodePlacement(sharedPlacementFrom(p));
}

let hashTimer = null;
// Called at the end of every update: the address bar always holds the current placement, and an open sheet follows it.
function syncShareState(p) {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hash = encodePlacement(sharedPlacementFrom(p));
    if (location.hash.slice(1) !== hash) history.replaceState(null, "", "#" + hash);
  }, 250);
  if (els.shareDialog.open) els.shareLink.value = shareUrl(p);
  if (!els.sheetView.hidden) renderSheet(p);
}

// A link opened on another device restores everything it carries, then says where it came from.
function restoreSharedPlacement() {
  const shared = decodePlacement(location.hash);
  if (!shared) return;
  const notes = [];
  if (shared.scene && RULES.profiles.some((profile) => profile.id === shared.scene)) {
    state.profileId = shared.scene;
    populateScenes();
  }
  if (shared.camera) {
    const known = shared.camera === "custom" || CAMERA_CATALOG.cameras.some((camera) => camera.id === shared.camera);
    if (known) {
      els.presetSelect.value = shared.camera;
      applyPreset(shared.camera);
    } else {
      notes.push(t("shCameraGone", { camera: shared.camera, current: els.presetSelect.selectedOptions[0].textContent }));
    }
  }
  if (shared.sensor && state.presetId === "custom") els.sensorSelect.value = shared.sensor;
  if (shared.focalMm !== null) setFieldValue(els.focalInput, els.focalRange, shared.focalMm, 1);
  if (shared.resolution) {
    const key = shared.resolution.w + "x" + shared.resolution.h;
    if ([...els.resolutionSelect.options].some((option) => option.value === key)) els.resolutionSelect.value = key;
  }
  if (shared.heightM !== null) setFieldValue(els.heightInput, els.heightRange, shared.heightM, 1);
  if (shared.distanceM !== null) setFieldValue(els.distanceInput, els.distanceRange, shared.distanceM, 2);
  if (shared.tiltDeg !== null) {
    state.tiltUserAdjusted = true;
    setFieldValue(els.tiltInput, els.tiltRange, shared.tiltDeg, 1);
  }
  state.entranceM = shared.entranceM;
  els.entranceInput.value = shared.entranceM === null ? "" : String(shared.entranceM);
  if (shared.site !== null) state.site = shared.site;
  if (shared.location !== null) state.location = shared.location;
  setSolveMode(["distance", "height", "manual"].includes(shared.solve) ? shared.solve : "distance");

  const now = currentPlacement().result.verdict;
  let warn = notes.length > 0;
  if (shared.verdict && STATUS_LABEL[shared.verdict] && shared.verdict !== now) {
    notes.push(t("shVerdictChanged", { version: shared.rulesVersion || "?", then: STATUS_LABEL[shared.verdict], now: STATUS_LABEL[now] }));
    warn = true;
  } else if (shared.rulesVersion && shared.rulesVersion !== RULES.version) {
    notes.push(t("shNewRules", { version: shared.rulesVersion, today: RULES.version }));
  }
  els.sharedWhere.textContent = [shared.site, shared.location].filter(Boolean).join(" · ");
  els.sharedNote.textContent = notes.join(" ");
  els.sharedNote.hidden = notes.length === 0;
  els.sharedBanner.dataset.state = warn ? "warn" : "info";
  els.sharedBanner.hidden = false;
}

// ---------- Share dialog ----------
function openShareDialog() {
  els.shareSite.value = state.site;
  els.shareLocation.value = state.location;
  els.shareLink.value = shareUrl(currentPlacement());
  els.shareStatus.textContent = "";
  if (typeof els.shareDialog.showModal === "function") els.shareDialog.showModal();
  else els.shareDialog.setAttribute("open", "");
}

function setSiteField(key, value) {
  state[key] = value.trim();
  saveLocal(key === "site" ? "cpl-site" : "cpl-location", state[key]);
  update();
}

els.shareButton.addEventListener("click", openShareDialog);
els.shareSite.addEventListener("input", (event) => setSiteField("site", event.target.value));
els.shareLocation.addEventListener("input", (event) => setSiteField("location", event.target.value));
els.shareLink.addEventListener("focus", () => els.shareLink.select());
byId("shareCopy").addEventListener("click", () => {
  const link = shareUrl(currentPlacement());
  const done = (message) => { els.shareStatus.textContent = message; };
  if (!navigator.clipboard) { els.shareLink.select(); done(t("shCopyFailed")); return; }
  navigator.clipboard.writeText(link).then(() => done(t("shCopied"))).catch(() => { els.shareLink.select(); done(t("shCopyFailed")); });
});
byId("shareOpenSheet").addEventListener("click", () => {
  els.shareDialog.close();
  openSiteSheet();
});
byId("sharedDismiss").addEventListener("click", () => { els.sharedBanner.hidden = true; });

// ---------- Site sheet ----------
function openSiteSheet() {
  // The simulation is paused and posed for one frame; without WebGL the sheet goes without the camera view.
  state.sheetSnapshot = window.walkSim && typeof window.walkSim.snapshot === "function" ? window.walkSim.snapshot() : null;
  els.sheetView.hidden = false;
  document.body.classList.add("sheet-open");
  renderSheet(currentPlacement());
  els.sheetView.scrollTop = 0;
  byId("sheetBack").focus();
}

function closeSiteSheet() {
  els.sheetView.hidden = true;
  document.body.classList.remove("sheet-open");
  els.shareButton.focus();
}

byId("sheetBack").addEventListener("click", closeSiteSheet);
// The console wires its own language buttons before this code runs, so the sheet's toolbar wires its pair here.
els.sheetView.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));
byId("sheetPrint").addEventListener("click", () => {
  try {
    window.print();
  } catch (error) {
    // Some embedded viewers block printing; the browser menu still prints the page.
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.sheetView.hidden && !els.shareDialog.open) closeSiteSheet();
});

const deg = (value) => fmt(value, 1);
const statusClass = (status) => (status === "best" ? "best" : status === "acceptable" ? "ok" : "bad");

function sheetSteps(p) {
  const r = p.result;
  const preset = presetFor(state.presetId);
  const fisheye = preset.lens === "fisheye";
  const focal = Number(els.focalInput.value);
  const stream = t("shStream", { w: p.resolution.w, h: p.resolution.h });
  const aimM = p.heightM - Math.tan(toRad(r.tilt.value)) * p.distanceM;
  let zoomText = t("shZoom");
  if (preset.focalMinMm === preset.focalMaxMm) zoomText = t("shLensFixed");
  else if (Math.abs(focal - preset.focalMinMm) < 0.05) zoomText = t("shZoomWide");
  else if (Math.abs(focal - preset.focalMaxMm) < 0.05) zoomText = t("shZoomTele");
  const steps = [
    [t("shMount"), t("shMountHint"), fmt(p.heightM, 1), "m"],
    [t("shLine"), t("shLineHint"), fmt(p.distanceM, 2), "m"],
    fisheye
      ? [t("shTiltFisheye"), t("shTiltFisheyeHint"), "90", "°"]
      : [t("shTilt"), t("shTiltHint", { aim: fmt(aimM, 2) }), deg(r.tilt.value), "°"],
    fisheye ? [t("shFisheyeLens"), stream, fmt(preset.fovDeg, 0), "°"] : [zoomText, stream, fmt(focal, 1), "mm"]
  ];
  return '<ol class="steps">' + steps.map((step, i) =>
    '<li><span class="n">' + (i + 1) + '</span><span class="do">' + escapeHtml(step[0]) + "<small>" + escapeHtml(step[1]) + '</small></span><span class="v">' + step[2] + "<span>" + step[3] + "</span></span></li>"
  ).join("") + "</ol>";
}

// Side elevation drawn to scale from the placement, as an installer's dimensioned sketch.
function sideElevationSvg(p) {
  const r = p.result;
  const profile = p.profile;
  const H = p.heightM;
  const D = p.distanceM;
  const fisheye = r.optics.lens === "fisheye";
  const faceD = r.faceLine.distanceM !== null && !r.faceLine.coincides ? r.faceLine.distanceM : null;
  const win = feetDistanceWindow(profile, H);
  const maxX = Math.max(D, faceD || 0, win.bestMax) * 1.1;
  const left = 44;
  const floor = 170;
  const s = Math.min((330 - left) / maxX, (floor - 22) / H);
  const X = (m) => (left + m * s).toFixed(1);
  const Y = (m) => (floor - m * s).toFixed(1);
  const camX = left;
  const camY = Y(H);
  const feet = statusClass(r.feet.status);
  const person = (x, cls) => {
    const tall = profile.humanHeightM * s;
    const head = Math.max(3.5, tall * 0.08);
    const xf = Number(x);
    const top = floor - tall;
    return '<g class="se-person se-' + cls + '"><circle cx="' + x + '" cy="' + (top + head).toFixed(1) + '" r="' + head.toFixed(1) + '"></circle>' +
      '<path d="M' + x + " " + (top + head * 2).toFixed(1) + " V" + (floor - tall * 0.45).toFixed(1) +
      " M" + x + " " + (floor - tall * 0.45).toFixed(1) + " L" + (xf - tall * 0.11).toFixed(1) + " " + floor +
      " M" + x + " " + (floor - tall * 0.45).toFixed(1) + " L" + (xf + tall * 0.11).toFixed(1) + " " + floor + '"></path></g>';
  };
  const parts = [];
  parts.push('<line class="se-floor" x1="' + left + '" y1="' + floor + '" x2="336" y2="' + floor + '"></line>');
  parts.push('<line class="se-band" x1="' + X(win.bestMin) + '" y1="' + floor + '" x2="' + X(win.bestMax) + '" y2="' + floor + '"></line>');
  parts.push('<line class="se-mast" x1="' + camX + '" y1="' + camY + '" x2="' + camX + '" y2="' + floor + '"></line>');
  parts.push('<rect class="se-camera" x="' + (camX - 9) + '" y="' + (Number(camY) - 6) + '" width="18" height="12" rx="3"></rect>');
  parts.push('<line class="se-ray se-' + feet + '" x1="' + (camX + 6) + '" y1="' + camY + '" x2="' + X(D) + '" y2="' + floor + '"></line>');
  if (faceD !== null) {
    parts.push('<line class="se-ray se-face" x1="' + (camX + 6) + '" y1="' + camY + '" x2="' + X(faceD) + '" y2="' + Y(profile.facePointM) + '"></line>');
    parts.push(person(X(faceD), "face"));
    parts.push('<text class="se-label se-face-text" x="' + (Number(X(faceD)) + 8) + '" y="' + (floor - profile.humanHeightM * s - 2).toFixed(1) + '">' + escapeHtml(t("shFaceLineLabel")) + "</text>");
  }
  if (!fisheye) {
    const aimM = H - Math.tan(toRad(r.tilt.value)) * D;
    parts.push('<line class="se-aim" x1="' + (camX + 6) + '" y1="' + camY + '" x2="' + X(D) + '" y2="' + Y(aimM) + '"></line>');
    parts.push('<circle class="se-aim-dot" cx="' + X(D) + '" cy="' + Y(aimM) + '" r="2.8"></circle>');
    parts.push('<line class="se-ref" x1="' + (camX + 6) + '" y1="' + camY + '" x2="' + (camX + 66) + '" y2="' + camY + '"></line>');
    const a = toRad(r.tilt.value);
    const arcX = (camX + 6 + 34 * Math.cos(a)).toFixed(1);
    const arcY = (Number(camY) + 34 * Math.sin(a)).toFixed(1);
    parts.push('<path class="se-arc" d="M ' + (camX + 40) + " " + camY + " A 34 34 0 0 1 " + arcX + " " + arcY + '"></path>');
    parts.push('<text class="se-num se-blue" x="' + (camX + 46) + '" y="' + (Number(camY) + 18) + '">' + deg(r.tilt.value) + "°</text>");
  }
  parts.push(person(X(D), feet));
  parts.push('<text class="se-num se-' + feet + '" x="' + (Number(X(D)) - 14) + '" y="' + (floor - 6) + '" text-anchor="end">' + deg(r.feet.angleDeg) + "°</text>");
  parts.push('<line class="se-dim" x1="22" y1="' + camY + '" x2="22" y2="' + floor + '" marker-start="url(#seArrow)" marker-end="url(#seArrow)"></line>');
  const midY = ((Number(camY) + floor) / 2).toFixed(1);
  parts.push('<text class="se-num se-ink" x="15" y="' + midY + '" text-anchor="middle" transform="rotate(-90 15 ' + midY + ')">' + fmt(H, 1) + " m</text>");
  parts.push('<line class="se-dim" x1="' + left + '" y1="' + (floor + 16) + '" x2="' + X(D) + '" y2="' + (floor + 16) + '" marker-start="url(#seArrow)" marker-end="url(#seArrow)"></line>');
  parts.push('<text class="se-num se-ink" x="' + ((left + Number(X(D))) / 2).toFixed(1) + '" y="' + (floor + 12) + '" text-anchor="middle">' + fmt(D, 2) + " m</text>");
  parts.push('<line class="se-tick" x1="' + X(D) + '" y1="' + floor + '" x2="' + X(D) + '" y2="' + (floor + 22) + '"></line>');
  if (faceD !== null) {
    parts.push('<line class="se-dim se-face-dim" x1="' + left + '" y1="' + (floor + 30) + '" x2="' + X(faceD) + '" y2="' + (floor + 30) + '" marker-end="url(#seArrowFace)"></line>');
    parts.push('<text class="se-num se-face-text" x="' + (Number(X(faceD)) + 6) + '" y="' + (floor + 33) + '">' + fmt(faceD, 2) + " m</text>");
    parts.push('<line class="se-tick" x1="' + X(faceD) + '" y1="' + floor + '" x2="' + X(faceD) + '" y2="' + (floor + 34) + '"></line>');
  }
  return '<svg viewBox="8 8 340 206" role="img" aria-label="' + escapeHtml(t("shSideTitle")) + '">' +
    '<defs><marker id="seArrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" class="se-arrow"></path></marker>' +
    '<marker id="seArrowFace" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" class="se-arrow-face"></path></marker></defs>' +
    parts.join("") + "</svg>";
}

function sheetReadings(p) {
  const r = p.result;
  const profile = p.profile;
  const win = feetDistanceWindow(profile, p.heightM);
  const face = faceLineCopy(p);
  const fl = r.faceLine;
  const faceTag = !fl.visible ? "muted" : fl.tooSmall ? "ok" : "best";
  const rows = [
    [t("countingLine"), fmt(p.distanceM, 2, " m"), statusClass(r.feet.status), STATUS_LABEL[r.feet.status],
      t("shRowCount", { angle: deg(r.feet.angleDeg), near: fmt(win.bestMin, 2), far: fmt(win.bestMax, 2), ppm: fmt(r.optics.pixelsPerMetre, 0) }), ""],
    [t("faceLine"), fl.distanceM === null ? t("none") : fmt(fl.distanceM, 2, " m"), faceTag, face.label,
      fl.angleDeg === null ? face.note
        : t("shRowFace", { angle: deg(fl.angleDeg), ppm: fmt(fl.pixelsPerMetre, 0) }) + " " + (fl.visible && fl.tooSmall ? t("shFaceFloor", { min: profile.minPixelsPerMetre.face }) : face.note), "face-name"]
  ];
  if (r.entrance !== null) {
    const entryClass = { covered: "best", tight: "ok", too_wide: "bad" }[r.entrance.status];
    const note = r.entrance.status === "covered"
      ? t("shRowEntrance", { eff: fmt(r.optics.effectiveWidthM, 1), cover: fmt(r.optics.coverageWidthM, 1) })
      : entranceCopy(r.entrance, r.optics.coverageWidthM);
    rows.push([t("entranceShort"), fmt(r.entrance.widthM, 1, " m"), entryClass, t(ENTRY_STATE[r.entrance.status]), note, ""]);
  }
  return '<table class="sh-readings"><thead><tr><th>' + escapeHtml(t("shThReading")) + '</th><th class="num">' + escapeHtml(t("shThValue")) + '</th><th class="note">' + escapeHtml(t("shThMeaning")) + "</th></tr></thead><tbody>" +
    rows.map((row) => '<tr><td class="what ' + row[5] + '">' + escapeHtml(row[0]) + '</td><td class="num">' + escapeHtml(row[1]) + '</td><td class="note"><span class="sh-tag ' + row[2] + '">' + escapeHtml(row[3]) + "</span> " + escapeHtml(row[4]) + "</td></tr>").join("") +
    "</tbody></table>";
}

function sheetWarnings(p) {
  const r = p.result;
  const profile = p.profile;
  const lines = [];
  if (!r.countingLine.framed) lines.push(t("cutOff"));
  if (r.warnings.includes("height_outside_range")) {
    lines.push(t("heightWarn", { height: fmt(p.heightM, 1), scene: sceneName(profile), min: fmt(profile.heightRangeM.min, 1), max: fmt(profile.heightRangeM.max, 1) }));
  }
  if (r.warnings.includes("low_pixel_density")) lines.push(t("densityWarn", { ppm: fmt(r.optics.pixelsPerMetre, 0), min: profile.minPixelsPerMetre.counting }));
  if (r.faceLine.visible && r.faceLine.tooSmall) lines.push(t("shFaceWarn", { ppm: fmt(r.faceLine.pixelsPerMetre, 0), min: profile.minPixelsPerMetre.face }));
  if (r.entrance !== null && r.entrance.status !== "covered") lines.push(entranceCopy(r.entrance, r.optics.coverageWidthM));
  if (lines.length === 0) return "";
  return '<div class="warn" role="note">' + SHEET_ICON.warn + "<div>" + lines.map((line) => "<p>" + escapeHtml(line) + "</p>").join("") + "</div></div>";
}

function renderSheet(p) {
  const r = p.result;
  const profile = p.profile;
  const preset = presetFor(state.presetId);
  const cameraName = els.presetSelect.selectedOptions[0] ? els.presetSelect.selectedOptions[0].textContent : "";
  const fovText = r.optics.lens === "fisheye"
    ? fmt(r.optics.horizontalFovDeg, 0) + "°"
    : t("shFov", { h: fmt(r.optics.horizontalFovDeg, 0), v: fmt(r.optics.verticalFovDeg, 0), f: fmt(Number(els.focalInput.value), 1) }) + (preset.datasheetFov ? " " + t("shDatasheet") : "");
  const fa = profile.feetAngleDeg;
  const verdictLine = t("shVerdict_" + r.verdict, {
    angle: deg(r.feet.angleDeg), min: fa.best.min, max: fa.best.max, amin: fa.acceptable.min, amax: fa.acceptable.max,
    reason: escapeHtml(verdictCopy(p))
  });
  const prepared = new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const link = shareUrl(p);
  const snap = state.sheetSnapshot;
  const cameraView = snap
    ? '<figure class="draw cam"><figcaption>' + escapeHtml(t("shCamTitle")) + '</figcaption><img src="' + snap.url + '" alt="' + escapeHtml(t("shCamTitle")) + '">' +
      '<span class="cam-key"><i class="k-count"></i>' + escapeHtml(t("shKeyCount", { d: fmt(p.distanceM, 2) })) +
      (r.faceLine.distanceM !== null && !r.faceLine.coincides ? '<i class="k-face"></i>' + escapeHtml(t("shKeyFace", { d: fmt(r.faceLine.distanceM, 2) })) : "") +
      '<i class="k-eff"></i>' + escapeHtml(t("shKeyEffective")) + "</span></figure>"
    : "";

  els.sheetPage.lang = lang;
  els.sheetPage.innerHTML =
    '<header class="sheet-head"><div><h2 class="sheet-title">' + escapeHtml(t("shSheetTitle")) + "</h2>" +
      '<dl class="site-fields">' +
        "<dt>" + escapeHtml(t("shSite")) + '</dt><dd><input data-site-field="site" value="' + escapeHtml(state.site) + '" placeholder="' + escapeHtml(t("shSiteHint")) + '" aria-label="' + escapeHtml(t("shSite")) + '"></dd>' +
        "<dt>" + escapeHtml(t("shLocation")) + '</dt><dd><input data-site-field="location" value="' + escapeHtml(state.location) + '" placeholder="' + escapeHtml(t("shLocationHint")) + '" aria-label="' + escapeHtml(t("shLocation")) + '"></dd>' +
        "<dt>" + escapeHtml(t("shScene")) + "</dt><dd>" + escapeHtml(sceneName(profile)) + "</dd>" +
        "<dt>" + escapeHtml(t("shCamera")) + "</dt><dd>" + escapeHtml(cameraName) + ' <span class="fov">· ' + escapeHtml(fovText) + "</span></dd>" +
      "</dl></div>" +
      '<div class="meta-right"><span>' + escapeHtml(t("shPrepared")) + "</span><b>" + escapeHtml(prepared) + "</b><span>" + escapeHtml(t("shRules")) + "</span><b>" + escapeHtml(RULES.version) + "</b></div>" +
    "</header>" +
    '<section class="sh-verdict"><span class="pill ' + statusClass(r.verdict) + '">' + escapeHtml(STATUS_LABEL[r.verdict]) + "</span><p>" + verdictLine + "</p></section>" +
    sheetSteps(p) +
    '<section class="drawings' + (snap ? "" : " single") + '"><figure class="draw"><figcaption>' + escapeHtml(t("shSideTitle")) + "</figcaption>" + sideElevationSvg(p) + "</figure>" + cameraView + "</section>" +
    sheetReadings(p) +
    sheetWarnings(p) +
    '<section class="check"><div><h3>' + escapeHtml(t("shAsInstalled")) + '</h3><div class="blanks">' +
      [["shHeight", "m"], ["shCountingLine", "m"], ["shZoomBlank", "mm"], ["shTiltBlank", "°"]].map((b) => '<div class="blank"><span>' + escapeHtml(t(b[0])) + "</span><span>" + b[1] + "</span></div>").join("") +
      "</div></div><div><h3>" + escapeHtml(t("shOnSite")) + '</h3><ul class="sh-ticks">' +
      ["shCheck1", "shCheck2", "shCheck3", "shCheck4"].map((key) => "<li>" + escapeHtml(t(key)) + "</li>").join("") +
    "</ul></div></section>" +
    '<footer class="foot"><div class="qr" id="sheetQr" aria-hidden="true"></div><div><h3>' + escapeHtml(t("shOpenTitle")) + '</h3><a class="link" href="' + escapeHtml(link) + '">' + escapeHtml(link.replace(/^https?:\/\//, "")) + "</a><p>" + escapeHtml(t("shOpenNote")) + "</p></div>" +
      '<div class="sign"><div>' + escapeHtml(t("shInstalledBy")) + "</div><div>" + escapeHtml(t("shDate")) + "</div></div></footer>";

  els.sheetPage.querySelectorAll("[data-site-field]").forEach((input) => input.addEventListener("change", () => {
    setSiteField(input.dataset.siteField, input.value);
  }));
  drawQr(byId("sheetQr"), link);
}

// The QR code comes from a small library loaded on first use; without it the printed link still works.
let qrLibrary = null;
function loadQrLibrary() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLibrary) {
    qrLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
      script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("QR library missing")));
      script.onerror = () => reject(new Error("QR library could not load"));
      document.head.appendChild(script);
    });
  }
  return qrLibrary;
}

function drawQr(target, text) {
  loadQrLibrary().then((qrcode) => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        if (qr.isDark(row, col)) path += "M" + col + " " + row + "h1v1h-1z";
      }
    }
    target.innerHTML = '<svg viewBox="-2 -2 ' + (n + 4) + " " + (n + 4) + '" shape-rendering="crispEdges"><path d="' + path + '"></path></svg>';
  }).catch((error) => {
    target.hidden = true;
    console.warn("Site sheet QR code unavailable:", error.message);
  });
}
