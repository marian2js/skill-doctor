export const groupBy = <T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
};
