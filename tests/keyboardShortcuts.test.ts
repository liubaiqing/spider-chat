import { describe, expect, it } from "vitest";
import {
  shouldCreateBranchFromTab,
  shouldHandleCanvasNavigation,
  shouldGoToParentFromShiftTab,
} from "../src/ui/keyboardShortcuts";

function createTarget(matches: string[] = []): EventTarget {
  return {
    closest(selector: string): object | null {
      return matches.some((match) => selector.includes(match)) ? {} : null;
    },
  } as unknown as EventTarget;
}

function createEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "Tab",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: createTarget(),
    ...overrides,
  } as KeyboardEvent;
}

describe("Spider keyboard shortcut scope", () => {
  it("keeps Tab available for standard interactive controls", () => {
    expect(shouldCreateBranchFromTab(createEvent({ target: createTarget(["button"]) }), true, true)).toBe(false);
    expect(shouldCreateBranchFromTab(createEvent({ target: createTarget(["textarea"]) }), true, true)).toBe(false);
  });

  it("creates a branch for selected message text or a focused canvas", () => {
    expect(shouldCreateBranchFromTab(createEvent(), true, true)).toBe(true);
    expect(shouldCreateBranchFromTab(createEvent({ target: createTarget(["data-spider-canvas"]) }), true, false)).toBe(true);
    expect(shouldCreateBranchFromTab(createEvent(), true, false)).toBe(false);
  });

  it("limits Shift+Tab and arrow navigation to the canvas", () => {
    const canvasTarget = createTarget(["data-spider-canvas"]);
    expect(shouldGoToParentFromShiftTab(createEvent({ shiftKey: true, target: canvasTarget }), true)).toBe(true);
    expect(shouldGoToParentFromShiftTab(createEvent({ shiftKey: true }), true)).toBe(false);
    expect(shouldHandleCanvasNavigation(createEvent({ key: "ArrowRight", target: canvasTarget }))).toBe(true);
    expect(shouldHandleCanvasNavigation(createEvent({ key: "Delete", target: createTarget(["select"]) }))).toBe(false);
  });
});
