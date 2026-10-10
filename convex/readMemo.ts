/** A query-local Promise cache for repeated reads of one indexed lookup key. */
export function memoizeRead<K, V>(read: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const pending = new Map<K, Promise<V>>();
  return (key: K) => {
    let value = pending.get(key);
    if (!value) {
      value = read(key);
      pending.set(key, value);
    }
    return value;
  };
}
