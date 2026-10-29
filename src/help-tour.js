// The Help panel and its "Show me" tours. Inlined into the console's script by generate.mjs, after the site sheet
// (so the Share button exists) and before start-up. Tours point at the live controls, so they never go stale.

const HELP_TEXT = {
  en: {
    hpHelp: "Help", hpTitle: "How to use the console", hpIntro: "Five short guides. Show me walks through the real controls; press Esc to stop at any time.",
    hpShowMe: "Show me", hpClose: "Close", hpShortcut: "Press ? to open this help from anywhere.",
    hpCredit: "People in the 3D views: Microsoft Rocketbox avatars, © 2020 Microsoft,", hpLicence: "MIT licence",
    hpNext: "Next", hpBack: "Back", hpDone: "Done", hpStep: "{i} of {n}", hpStop: "Stop the tour",

    g1Title: "Read the verdict", g1Sum: "What Best, Acceptable and Out of range mean, and where warnings appear.",
    g1s1: "The verdict: Best, Acceptable or Out of range. It is the feet angle at the middle of the entrance, where people are counted.",
    g1s2: "The counting line decides the verdict. The scale shows where the feet angle sits: green is Best, amber is Acceptable.",
    g1s3: "The face line is for demographics (age and gender). It is shown for information and never fails a placement.",
    g1s4: "Warnings appear here, the most important first: an end of the entrance outside the bands, too few pixels, a height outside the range. +N more steps through the rest.",

    g2Title: "Find the distance or the height", g2Sum: "Enter what you know; the console works out the rest.",
    g2s1: "Choose what to solve. Distance: give the mounting height and get where the counting line goes. Height: give the distance you have and get the height to mount at.",
    g2s2: "Mounting height, from the floor to the centre of the lens. Type it or drag the slider.",
    g2s3: "Counting line distance, straight out from the point below the camera. Tap a solved value to set it yourself (Manual).",
    g2s4: "The feet distance window: where the counting line can go. Green is Best, amber is Acceptable, the thumb is your line.",

    g3Title: "Set the entrance and the camera position", g3Sum: "The doorway width, and a camera that is not on the centre line.",
    g3s1: "Entrance width: the doorway people walk through. Both ends are checked, 0.35 m in from each frame.",
    g3s2: "If the camera cannot sit on the entrance centre line, set how far left or right it is. It turns to aim at the middle.",
    g3s3: "Or drag the camera on the Top view. The counting line is coloured by the feet angle along its length; the arc shows how far the camera turns.",

    g4Title: "Check the views", g4Sum: "The side elevation, the 3D scene and what the camera sees.",
    g4s1: "Side view: the camera's own slice down to the middle of the entrance, with the Best and Acceptable bands on the floor.",
    g4s2: "Orbit shows the same scene in 3D from outside: the camera, its view cone and the distances. Drag to look around.",
    g4s3: "Camera view: what the camera itself sees. The window at the top right is one face at the camera's real resolution, a best case before blur and glare. Walk people sends a crowd across the counting line to watch the counting.",

    g5Title: "Share and print", g5Sum: "Keep a placement as a link or a printable site sheet.",
    g5s1: "Share makes a link that holds the whole placement; opening it later restores everything. In the Share window, add the site and location, then open the printable site sheet.",
    g5s2: "Copy readings puts the key numbers on the clipboard, ready to paste into a chat or a report."
  },
  th: {
    hpHelp: "วิธีใช้", hpTitle: "วิธีใช้งานโปรแกรม", hpIntro: "คู่มือสั้น ๆ 5 เรื่อง กด แสดงให้ดู เพื่อพาไล่ดูปุ่มจริงบนหน้าจอ กด Esc เพื่อหยุดได้ทุกเมื่อ",
    hpShowMe: "แสดงให้ดู", hpClose: "ปิด", hpShortcut: "กด ? เพื่อเปิดหน้านี้ได้จากทุกที่",
    hpCredit: "คนในภาพ 3 มิติ: อวตาร Microsoft Rocketbox © 2020 Microsoft", hpLicence: "สัญญาอนุญาต MIT",
    hpNext: "ถัดไป", hpBack: "ย้อนกลับ", hpDone: "เสร็จ", hpStep: "{i} จาก {n}", hpStop: "หยุดการแนะนำ",

    g1Title: "อ่านผลการประเมิน", g1Sum: "ดีที่สุด พอใช้ และเกินเกณฑ์ หมายถึงอะไร และคำเตือนอยู่ตรงไหน",
    g1s1: "ผลการประเมิน: ดีที่สุด พอใช้ หรือเกินเกณฑ์ ตัดสินจากมุมเท้าที่กลางทางเข้า ซึ่งเป็นจุดที่นับคน",
    g1s2: "เส้นนับเป็นตัวตัดสินผล แถบแสดงว่ามุมเท้าอยู่ตรงไหน สีเขียวคือดีที่สุด สีเหลืองคือพอใช้",
    g1s3: "เส้นจับใบหน้าใช้สำหรับข้อมูลเพศและอายุ แสดงไว้เพื่อข้อมูลเท่านั้น ไม่ทำให้ตำแหน่งไม่ผ่าน",
    g1s4: "คำเตือนจะแสดงตรงนี้ เรื่องสำคัญที่สุดก่อน เช่น ปลายทางเข้าอยู่นอกเกณฑ์ พิกเซลน้อยเกินไป หรือความสูงอยู่นอกช่วง กด อีก N ข้อ เพื่อดูข้อถัดไป",

    g2Title: "หาระยะหรือความสูง", g2Sum: "ใส่ค่าที่รู้ โปรแกรมคำนวณที่เหลือให้",
    g2s1: "เลือกสิ่งที่จะคำนวณ ระยะ: ใส่ความสูงติดตั้ง แล้วได้ตำแหน่งเส้นนับ ความสูง: ใส่ระยะที่มี แล้วได้ความสูงที่ควรติดตั้ง",
    g2s2: "ความสูงติดตั้ง วัดจากพื้นถึงกึ่งกลางเลนส์ พิมพ์ค่าหรือเลื่อนแถบ",
    g2s3: "ระยะเส้นนับ วัดตรงออกไปจากจุดใต้กล้อง แตะค่าที่คำนวณไว้เพื่อกำหนดเอง (กำหนดเอง)",
    g2s4: "ช่วงระยะตามมุมเท้า: ตำแหน่งที่วางเส้นนับได้ สีเขียวคือดีที่สุด สีเหลืองคือพอใช้ ปุ่มกลมคือเส้นนับของคุณ",

    g3Title: "ตั้งทางเข้าและตำแหน่งกล้อง", g3Sum: "ความกว้างทางเข้า และกล้องที่ไม่ได้อยู่บนแนวกึ่งกลาง",
    g3s1: "ความกว้างทางเข้า: ช่องที่คนเดินผ่าน ปลายทั้งสองด้านจะถูกตรวจ โดยเว้นเข้ามาจากขอบประตูด้านละ 0.35 m",
    g3s2: "ถ้าติดกล้องบนแนวกึ่งกลางทางเข้าไม่ได้ ให้ใส่ระยะที่ห่างไปทางซ้ายหรือขวา กล้องจะหันไปเล็งกลางทางเข้า",
    g3s3: "หรือลากกล้องในมุมมองจากด้านบน เส้นนับมีสีตามมุมเท้าตลอดแนว ส่วนโค้งบอกว่ากล้องหันไปกี่องศา",

    g4Title: "ดูมุมมองต่าง ๆ", g4Sum: "มุมมองด้านข้าง ฉาก 3 มิติ และภาพที่กล้องเห็น",
    g4s1: "มุมมองด้านข้าง: ภาพตัดของกล้องลงไปถึงกลางทางเข้า พร้อมช่วงดีที่สุดและพอใช้บนพื้น",
    g4s2: "หมุนดู แสดงฉากเดียวกันแบบ 3 มิติจากด้านนอก: กล้อง กรวยภาพ และระยะต่าง ๆ ลากเพื่อหมุนดู",
    g4s3: "ภาพจากกล้อง: สิ่งที่กล้องมองเห็นจริง หน้าต่างมุมขวาบนคือใบหน้าหนึ่งคนที่ความละเอียดจริงของกล้อง เป็นกรณีดีที่สุดก่อนภาพเบลอหรือแสงจ้า กด ให้คนเดิน เพื่อดูคนเดินผ่านเส้นนับและการนับ",

    g5Title: "แชร์และพิมพ์", g5Sum: "เก็บตำแหน่งไว้เป็นลิงก์ หรือใบสรุปหน้างานที่พิมพ์ได้",
    g5s1: "แชร์ สร้างลิงก์ที่เก็บตำแหน่งทั้งหมด เปิดลิงก์ภายหลังจะได้ค่าเดิมครบ ในหน้าต่างแชร์ ใส่ชื่อสถานที่และจุดติดตั้ง แล้วเปิดใบสรุปหน้างานเพื่อพิมพ์",
    g5s2: "คัดลอกค่า คัดลอกตัวเลขสำคัญไว้ วางในแชทหรือรายงานได้ทันที"
  }
};
Object.keys(HELP_TEXT).forEach((code) => Object.assign(I18N[code], HELP_TEXT[code]));

const HELP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.9"></path><path d="M12 17.2h.01"></path></svg>';

const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
const pillarOf = (id) => () => document.getElementById(id).closest(".pillar");
const showTopView = (name) => () => {
  const button = document.querySelector('[data-topview="' + name + '"]');
  if (button && button.getAttribute("aria-pressed") !== "true") button.click();
};
const showSideMode = (name) => () => {
  const button = document.querySelector('[data-sidemode="' + name + '"]');
  if (button && button.getAttribute("aria-pressed") !== "true") button.click();
};

// Each step names its targets in order of preference; the first one on screen is the one highlighted.
const TOURS = [
  { id: "verdict", title: "g1Title", summary: "g1Sum", steps: [
    { targets: ["#verdict .verdict-lead", "#answer"], text: "g1s1" },
    { targets: [pillarOf("feetStatus")], text: "g1s2" },
    { targets: [pillarOf("faceStatus")], text: "g1s3" },
    { targets: ["#verdict .verdict-foot"], text: "g1s4" }
  ] },
  { id: "solve", title: "g2Title", summary: "g2Sum", steps: [
    { targets: [".rail .solve"], text: "g2s1" },
    { targets: ["#heightField", "#quickHeightStepper"], text: "g2s2" },
    { targets: ["#distanceField"], text: "g2s3" },
    { targets: [".rangebar"], text: "g2s4" }
  ] },
  { id: "entrance", title: "g3Title", summary: "g3Sum", steps: [
    { targets: ["#entranceField"], text: "g3s1" },
    { targets: ["#offsetField"], text: "g3s2" },
    { targets: ["#topCanvas"], text: "g3s3", prep: showTopView("top") }
  ] },
  { id: "views", title: "g4Title", summary: "g4Sum", steps: [
    { targets: [() => document.getElementById("sideCanvas").closest(".stage")], text: "g4s1", prep: showSideMode("side") },
    { targets: ["#sideModeSeg"], text: "g4s2" },
    { targets: ["#simWrap"], text: "g4s3", prep: showTopView("camera") }
  ] },
  { id: "share", title: "g5Title", summary: "g5Sum", steps: [
    { targets: ["#shareButton"], text: "g5s1" },
    { targets: ["#copyReadings"], text: "g5s2" }
  ] }
];

// ---------- Markup ----------
(function buildHelpMarkup() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "help-button";
  button.id = "helpButton";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("data-i18n-attr", "aria-label:hpHelp");
  button.innerHTML = HELP_ICON + '<span data-i18n="hpHelp">Help</span>';
  document.getElementById("shareButton").before(button);

  const dialog = document.createElement("dialog");
  dialog.className = "share-dialog help-dialog";
  dialog.id = "helpDialog";
  dialog.setAttribute("aria-labelledby", "helpDialogTitle");
  dialog.innerHTML =
    '<form method="dialog" class="share-close-form"><button class="share-close" data-i18n-attr="aria-label:hpClose">' + SHEET_ICON.close + "</button></form>" +
    '<h2 id="helpDialogTitle" data-i18n="hpTitle">How to use the console</h2>' +
    '<p class="share-help" data-i18n="hpIntro"></p>' +
    '<ul class="help-guides">' + TOURS.map((tour) =>
      '<li><div><b data-i18n="' + tour.title + '"></b><span data-i18n="' + tour.summary + '"></span></div>' +
      '<button type="button" class="help-show" data-tour="' + tour.id + '" data-i18n="hpShowMe">Show me</button></li>'
    ).join("") + "</ul>" +
    '<p class="help-shortcut" data-i18n="hpShortcut"></p>' +
    '<p class="help-credit"><span data-i18n="hpCredit"></span> <a href="people/LICENSE-Rocketbox.md" target="_blank" rel="noopener" data-i18n="hpLicence"></a></p>';
  document.body.appendChild(dialog);

  const tour = document.createElement("div");
  tour.className = "tour";
  tour.id = "tour";
  tour.hidden = true;
  tour.innerHTML =
    '<div class="tour-shield"></div>' +
    '<div class="tour-ring" id="tourRing"></div>' +
    '<div class="tour-pop" id="tourPop" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">' +
      '<div class="tour-head"><b id="tourTitle"></b><span id="tourCount"></span>' +
      '<button type="button" class="tour-close" id="tourClose" data-i18n-attr="aria-label:hpStop">' + SHEET_ICON.close + "</button></div>" +
      '<p class="tour-text" id="tourText"></p>' +
      '<div class="tour-actions"><button type="button" class="tour-back" id="tourBack" data-i18n="hpBack">Back</button>' +
      '<button type="button" class="tour-next" id="tourNext" data-i18n="hpNext">Next</button></div>' +
    "</div>";
  document.body.appendChild(tour);
})();

Object.assign(els, {
  helpButton: byId("helpButton"), helpDialog: byId("helpDialog"), tour: byId("tour"), tourRing: byId("tourRing"), tourPop: byId("tourPop"),
  tourTitle: byId("tourTitle"), tourCount: byId("tourCount"), tourText: byId("tourText"), tourBack: byId("tourBack"), tourNext: byId("tourNext"),
  tourClose: byId("tourClose")
});

// ---------- Tours ----------
const tourState = { tour: null, index: 0, target: null, openedRail: false, frame: 0 };

function onScreen(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // On a phone the controls live in the bottom sheet; while it is closed they do not count as shown.
  return !(isPhone() && el.closest("#railMore") && !els.rail.classList.contains("open"));
}

function resolveTarget(step) {
  const found = step.targets.map((target) => (typeof target === "function" ? target() : document.querySelector(target)));
  const visible = found.find(onScreen);
  if (visible) return visible;
  // Only in the closed sheet: open it, and close it again when the tour ends.
  const inSheet = found.find((el) => el && el.closest("#railMore"));
  if (inSheet && isPhone()) {
    setSheet(true);
    tourState.openedRail = true;
    return inSheet;
  }
  return found.find(Boolean) || null;
}

function positionTour() {
  const target = tourState.target;
  if (!target || els.tour.hidden) return;
  const rect = target.getBoundingClientRect();
  const pad = 6;
  Object.assign(els.tourRing.style, {
    left: rect.left - pad + "px", top: rect.top - pad + "px", width: rect.width + pad * 2 + "px", height: rect.height + pad * 2 + "px"
  });
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  // The caption's width is set before its height is read: the text wraps to that width.
  const width = Math.min(340, viewport.width - 24);
  els.tourPop.style.width = width + "px";
  const box = { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const spot = placeTourPopover(box, { width: width, height: els.tourPop.offsetHeight }, viewport);
  Object.assign(els.tourPop.style, { left: spot.left + "px", top: spot.top + "px" });
  els.tourPop.dataset.side = spot.side;
}

// Follows the control while the page scrolls or a panel animates.
function placeTour() {
  positionTour();
  if (!els.tour.hidden) tourState.frame = requestAnimationFrame(placeTour);
}

function showStep(index) {
  const tour = tourState.tour;
  tourState.index = index;
  const step = tour.steps[index];
  if (step.prep) step.prep();
  tourState.target = resolveTarget(step);
  els.tourTitle.textContent = t(tour.title);
  els.tourCount.textContent = t("hpStep", { i: index + 1, n: tour.steps.length });
  els.tourText.textContent = t(step.text);
  els.tourBack.hidden = index === 0;
  els.tourNext.textContent = t(index === tour.steps.length - 1 ? "hpDone" : "hpNext");
  // A jump, not a smooth scroll: the ring and caption then glide from the last control to this one.
  if (tourState.target) tourState.target.scrollIntoView({ block: "center", behavior: "auto" });
  positionTour();
  els.tourNext.focus();
}

function startTour(id) {
  const tour = TOURS.find((candidate) => candidate.id === id);
  if (!tour) return;
  if (els.helpDialog.open) els.helpDialog.close();
  setTab("visualizer");
  tourState.tour = tour;
  tourState.openedRail = false;
  els.tour.hidden = false;
  document.body.classList.add("touring");
  showStep(0);
  cancelAnimationFrame(tourState.frame);
  tourState.frame = requestAnimationFrame(placeTour);
}

function endTour() {
  if (!tourState.tour) return;
  cancelAnimationFrame(tourState.frame);
  els.tour.hidden = true;
  document.body.classList.remove("touring");
  if (tourState.openedRail) setSheet(false);
  tourState.tour = null;
  tourState.target = null;
  els.helpButton.focus();
}

els.tourNext.addEventListener("click", () => {
  if (tourState.index >= tourState.tour.steps.length - 1) endTour();
  else showStep(tourState.index + 1);
});
els.tourBack.addEventListener("click", () => { if (tourState.index > 0) showStep(tourState.index - 1); });
els.tourClose.addEventListener("click", endTour);

// ---------- Opening help ----------
function openHelp() {
  if (tourState.tour) endTour();
  applyStaticText();
  els.helpDialog.showModal();
}

els.helpButton.addEventListener("click", openHelp);
els.helpDialog.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tour]");
  if (button) startTour(button.dataset.tour);
});

document.addEventListener("keydown", (event) => {
  if (tourState.tour) {
    if (event.key === "Escape") { event.preventDefault(); endTour(); }
    else if (event.key === "ArrowRight") els.tourNext.click();
    else if (event.key === "ArrowLeft" && !els.tourBack.hidden) els.tourBack.click();
    return;
  }
  const typing = event.target.closest && event.target.closest("input, textarea, select, [contenteditable]");
  if (event.key === "?" && !typing && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    openHelp();
  }
});
