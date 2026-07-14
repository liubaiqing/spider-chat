import { describe, expect, it, vi } from "vitest";
import { PluginSettingsStore } from "../src/state/pluginSettingsStore";

describe("PluginSettingsStore", () => {
  it("notifies subscribers and exposes a monotonically increasing revision", () => {
    const store = new PluginSettingsStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.notify();
    expect(store.getRevision()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.notify();
    expect(store.getRevision()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
