export class PluginSettingsStore {
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getRevision = (): number => this.revision;

  notify(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
