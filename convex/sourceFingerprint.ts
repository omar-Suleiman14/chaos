import { v, type Infer } from "convex/values";

export const sourceFingerprint = v.object({ algorithm: v.literal("aligned-byte-chunks-v1"), chunks: v.array(v.string()) });
export const SOURCE_SIMILARITY_LIMITS = { chunkBytes: 512, sampledChunks: 1024, candidates: 100, minimumDistinctChunks: 16, overlap: 0.9, sizeDifference: 0.02 } as const;

/** Bounded byte-level heuristic, not document semantics or a cryptographic digest. */
export function fingerprintBytes(bytes: Uint8Array): Infer<typeof sourceFingerprint> {
  const count = Math.floor(bytes.length / SOURCE_SIMILARITY_LIMITS.chunkBytes);
  const samples = Math.min(count, SOURCE_SIMILARITY_LIMITS.sampledChunks);
  const chunks = new Set<string>();
  for (let n = 0; n < samples; n++) {
    const index = samples === count ? n : Math.floor(n * (count - 1) / (samples - 1));
    let a = 2166136261, b = 5381;
    const start = index * SOURCE_SIMILARITY_LIMITS.chunkBytes;
    for (let i = start; i < start + SOURCE_SIMILARITY_LIMITS.chunkBytes; i++) {
      a = Math.imul(a ^ bytes[i], 16777619) >>> 0;
      b = (Math.imul(b, 33) ^ bytes[i]) >>> 0;
    }
    chunks.add(a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0"));
  }
  return { algorithm: "aligned-byte-chunks-v1", chunks: [...chunks].sort() };
}

export function nearByteDuplicate(a: Infer<typeof sourceFingerprint>, aSize: number, b: Infer<typeof sourceFingerprint>, bSize: number): boolean {
  if (a.algorithm !== b.algorithm || !aSize || !bSize || Math.abs(aSize - bSize) / Math.max(aSize, bSize) > SOURCE_SIMILARITY_LIMITS.sizeDifference) return false;
  const left = new Set(a.chunks), right = new Set(b.chunks);
  if (Math.min(left.size, right.size) < SOURCE_SIMILARITY_LIMITS.minimumDistinctChunks) return false;
  let common = 0;
  for (const chunk of left) if (right.has(chunk)) common++;
  return common / left.size >= SOURCE_SIMILARITY_LIMITS.overlap && common / right.size >= SOURCE_SIMILARITY_LIMITS.overlap;
}
