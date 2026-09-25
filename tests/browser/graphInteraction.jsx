import React from "react";
import { createRoot } from "react-dom/client";
import { BranchChatMapApp } from "../../src/ui/BranchChatMapApp";
import { ViewState } from "../../src/state/viewState";
import { createRootMap, addChildNode, updateNode } from "../../src/domain/chatMap";
import { createDefaultSettings } from "../../src/settingsDefaults";

const root = createRootMap("学习路线", "什么是量子力学");
const first = addChildNode(root, root.rootNodeId, { title: "什么是波粒二象性" });
const second = addChildNode(first.map, root.rootNodeId, { title: "量子态如何测量" });
const third = addChildNode(second.map, first.child.id, { title: "测量与观察的区别" });
const map = updateNode(third.map, second.child.id, { status: "understood" });
const listeners = new Set();
let revision = 0;
const plugin = {
  settings: { ...createDefaultSettings("zh-CN"), onboardingCardDismissed: true },
  app: {},
  manifest: { id: "spider" },
  updateSettings: async (patch) => {
    plugin.settings = { ...plugin.settings, ...patch };
    revision++;
    listeners.forEach((listener) => listener());
  },
  subscribeSettings: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  getSettingsRevision: () => revision,
};
const vs = new ViewState(plugin, { saveMap: async () => {} }, map);
createRoot(document.querySelector("#app")).render(
  <BranchChatMapApp
    plugin={plugin}
    viewState={vs}
    onController={() => {}}
    setTabTitle={() => {}}
    onNewSpider={() => {}}
    onLoadMap={() => {}}
  />,
);
window.graphChecks = { vs, rootId: root.rootNodeId, openId: first.child.id, understoodId: second.child.id, deepId: third.child.id };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const nodeElement = (id) => [...document.querySelectorAll(".react-flow__node[data-id]")].find((element) => element.dataset.id === id);
document.querySelector("#run-graph").addEventListener("click", async () => {
  const result = document.querySelector("#result");
  result.textContent = "Running...";
  try {
    const search = document.querySelector(".bcm-search-input");
    search.focus();
    await delay(40);
    document.querySelector(".bcm-search-filter").click();
    await delay(40);
    assert(document.querySelectorAll(".bcm-search-result").length === 3, "open filter count");
    assert(![...document.querySelectorAll(".bcm-search-result")].some((element) => element.textContent.includes("量子态如何测量")), "understood node excluded");
    [...document.querySelectorAll(".bcm-search-result")].find((element) => element.textContent.includes("测量与观察的区别")).click();
    await delay(500);
    assert(vs.getSnapshot().activeNodeId === third.child.id, "search selects deep node");
    const target = nodeElement(third.child.id).getBoundingClientRect();
    const graph = document.querySelector(".bcm-graph").getBoundingClientRect();
    assert(target.left >= graph.left && target.right <= graph.right && target.top >= graph.top && target.bottom <= graph.bottom, "search target is visible");

    document.querySelector(".bcm-more > button").click();
    await delay(20);
    [...document.querySelectorAll(".bcm-more-item")].find((element) => element.textContent.includes("聚焦当前问题链")).click();
    await delay(80);
    assert(document.querySelectorAll(".react-flow__node").length === 3, "focus mode keeps current chain");

    const focusedNode = nodeElement(third.child.id);
    focusedNode.focus();
    focusedNode.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
    await delay(30);
    assert(document.querySelector("#mock-node-menu"), "Shift+F10 opens node menu");
    let menu = document.querySelector("#mock-node-menu").getBoundingClientRect();
    assert(menu.left >= 0 && menu.right <= innerWidth && menu.top >= 0 && menu.bottom <= innerHeight, "keyboard menu fits viewport");
    document.querySelector("#mock-node-menu").remove();

    const title = nodeElement(first.child.id).querySelector(".bcm-node-title");
    const rect = title.getBoundingClientRect();
    const x = rect.left + Math.max(4, rect.width / 2);
    const y = rect.top + Math.max(4, rect.height / 2);
    title.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, clientX: x, clientY: y }));
    await delay(620);
    title.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, clientX: x, clientY: y }));
    assert(document.querySelector("#mock-node-menu"), "touch long press opens node menu");
    menu = document.querySelector("#mock-node-menu").getBoundingClientRect();
    assert(menu.left >= 0 && menu.right <= innerWidth && menu.top >= 0 && menu.bottom <= innerHeight, "touch menu fits viewport");
    document.querySelector("#mock-node-menu").remove();

    title.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, clientX: x, clientY: y }));
    title.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", bubbles: true, clientX: x + 25, clientY: y + 25 }));
    await delay(620);
    title.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, clientX: x + 25, clientY: y + 25 }));
    assert(!document.querySelector("#mock-node-menu"), "drag cancels long press");
    result.textContent = "PASS search · focus · keyboard menu · touch menu · drag cancellation";
  } catch (error) {
    result.textContent = `FAIL ${error.message}`;
    console.error(error);
  }
});

let armedDrag = null;
document.querySelector("#run-snap").addEventListener("click", () => {
  armedDrag = {
    before: nodeElement(root.rootNodeId).getBoundingClientRect(),
    storedBefore: vs.getSnapshot().map.nodes[root.rootNodeId].position,
    started: false,
    updated: false,
    guideSeen: false,
  };
  document.querySelector("#result").textContent = "Drag the root card about 40px right and 6px down...";
});

window.addEventListener("mousedown", (event) => {
  if (!armedDrag || !event.target.closest?.(`.react-flow__node[data-id='${root.rootNodeId}']`)) return;
  armedDrag.started = true;
}, true);

window.addEventListener("mousemove", () => {
  if (!armedDrag?.started) return;
  armedDrag.guideSeen ||= document.querySelectorAll(".bcm-snap-guide").length > 0;
  if (!armedDrag.updated) {
    armedDrag.updated = true;
    vs.updateCurrentNodeStatus("understood");
  }
}, true);

window.addEventListener("mouseup", async () => {
  const check = armedDrag;
  if (!check?.started) return;
  armedDrag = null;
  await delay(100);
  const result = document.querySelector("#result");
  try {
    const after = nodeElement(root.rootNodeId).getBoundingClientRect();
    const storedAfter = vs.getSnapshot().map.nodes[root.rootNodeId].position;
    assert(after.left - check.before.left > 25, "card moves after a mid-drag update");
    assert(Math.abs(after.top - check.before.top) < 2, "connected card snaps to its row");
    assert(storedAfter.x - check.storedBefore.x > 20 && Math.abs(storedAfter.y - check.storedBefore.y) < 2, "snapped position is saved");
    assert(check.updated && vs.getSnapshot().map.nodes[root.rootNodeId].status === "understood", "mid-drag update survives");
    assert(check.guideSeen, "guide appears during drag");
    assert(document.querySelectorAll(".bcm-snap-guide").length === 0, "guides clear after drag");
    result.textContent = "PASS actual drag · mid-drag update · snap guide · saved position";
  } catch (error) {
    result.textContent = `FAIL ${error.message}`;
    console.error(error);
  } finally {
    vs.updateCurrentNodeStatus("open");
  }
}, true);
