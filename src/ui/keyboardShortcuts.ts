const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable='true']",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
  "[data-spider-note-editor='true']",
].join(", ");

const CANVAS_SELECTOR = "[data-spider-canvas='true']";

function hasClosest(target: EventTarget | null): target is EventTarget & { closest(selector: string): Element | null } {
  return typeof target === "object"
    && target !== null
    && "closest" in target
    && typeof target.closest === "function";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return hasClosest(target) && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function isCanvasTarget(target: EventTarget | null): boolean {
  return hasClosest(target) && Boolean(target.closest(CANVAS_SELECTOR));
}

function hasUnsupportedModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

export function shouldCreateBranchFromTab(event: KeyboardEvent, enabled: boolean, hasSelection: boolean): boolean {
  if (!enabled || event.key !== "Tab" || event.shiftKey || hasUnsupportedModifier(event) || isInteractiveTarget(event.target)) {
    return false;
  }
  return hasSelection || isCanvasTarget(event.target);
}

export function shouldGoToParentFromShiftTab(event: KeyboardEvent, enabled: boolean): boolean {
  return enabled
    && event.key === "Tab"
    && event.shiftKey
    && !hasUnsupportedModifier(event)
    && !isInteractiveTarget(event.target)
    && isCanvasTarget(event.target);
}

export function shouldHandleCanvasNavigation(event: KeyboardEvent): boolean {
  if (isInteractiveTarget(event.target) || !isCanvasTarget(event.target)) {
    return false;
  }
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key);
}
