import { Injectable } from "@nestjs/common";

interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * Tiny in-process TTL cache. Sufficient for a single API instance (≤100 users).
 *
 * When scaling out to multiple API replicas (≈1000 users) this is the one piece
 * that must move to a shared store: keep this same get/set/del/delByPrefix
 * surface and back it with Redis so all replicas share + invalidate together.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  /** Drop every entry whose key starts with the given prefix (bulk invalidation). */
  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
