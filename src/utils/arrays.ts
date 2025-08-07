function unionBy<T, K>(a: T[], b: T[], key: (item: T) => K): T[] {
  const map = new Map<K, T>();

  for (const item of [...a, ...b]) {
    map.set(key(item), item);
  }

  return Array.from(map.values());
}

export { unionBy };
