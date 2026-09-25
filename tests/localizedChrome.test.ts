import { describe, expect, it } from "vitest";
import { updateLocalizedChrome } from "../src/localizedChrome";

describe("updateLocalizedChrome", () => {
  it("updates command names and the ribbon label", () => {
    const command = { name: "打开 spider" };
    const attributes = new Map<string, string>();
    const ribbon = {
      setAttribute(name: string, value: string): void {
        attributes.set(name, value);
      },
    };

    updateLocalizedChrome("en", [{ command, key: "openMap" }], ribbon as HTMLElement);

    expect(command.name).toBe("Open Spider Chat");
    expect(attributes.get("aria-label")).toBe("Open Spider Chat");
    expect(attributes.get("title")).toBe("Open Spider Chat");
  });
});
