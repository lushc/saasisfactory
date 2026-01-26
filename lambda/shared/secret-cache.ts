// Simple in-memory cache for secrets with TTL
import { TIMEOUTS } from './constants';

interface CacheEntry {
  value: string;
  expires: number;
}

class SecretCache {
  private cache = new Map<string, CacheEntry>();
  private ttl = TIMEOUTS.SECRET_CACHE_TTL;

  async get(secretId: string): Promise<string | null> {
    const cached = this.cache.get(secretId);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    
    // Clean up expired entry
    if (cached) {
      this.cache.delete(secretId);
    }
    
    return null;
  }

  set(secretId: string, value: string): void {
    this.cache.set(secretId, {
      value,
      expires: Date.now() + this.ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // For testing purposes
  size(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const secretCache = new SecretCache();