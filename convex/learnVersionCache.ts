/** Avoid duplicate reads within one authorized query; never cache across requests or actors. */
export async function cachedVersionRead<K, V>(cache: Map<K, V | null>, key: K, load: () => Promise<V | null>): Promise<V | null> {
  if (cache.has(key)) return cache.get(key)!;
  const value = await load();
  cache.set(key, value);
  return value;
}
