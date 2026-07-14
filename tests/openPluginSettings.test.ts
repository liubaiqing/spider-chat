import { describe, expect, it, vi } from "vitest";
import { openPluginSettings } from "../src/ui/openPluginSettings";

describe("openPluginSettings", () => {
  it("opens the settings modal on the Spider tab", () => {
    const open = vi.fn();
    const openTabById = vi.fn();
    const app = { setting: { open, openTabById } };

    expect(openPluginSettings(app as never, "spider")).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(openTabById).toHaveBeenCalledWith("spider");
  });

  it("returns false when the host does not expose settings navigation", () => {
    expect(openPluginSettings({} as never, "spider")).toBe(false);
  });
});
