export function createOrderedRegistry<T extends { id: string; order: number }>(label: string) {
  const entries = new Map<string, T>();

  return {
    register(entry: T): void {
      if (entries.has(entry.id)) {
        throw new Error(`${label} "${entry.id}" is already registered.`);
      }

      entries.set(entry.id, entry);
    },
    list(): T[] {
      return [...entries.values()].sort((a, b) => a.order - b.order);
    },
    get(id: string): T | undefined {
      return entries.get(id);
    },
  };
}
