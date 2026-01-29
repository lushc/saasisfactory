// Simple in-memory cache for parameters with TTL
import { TIMEOUTS } from './constants';

interface CacheEntry {
  value: string;
  expires: number;
}

class ParameterCache {
  private cache = new Map<string, CacheEntry>();
  private ttl = TIMEOUTS.PARAMETER_CACHE_TTL;

  async get(parameterName: string): Promise<string | null> {
    const cached = this.cache.get(parameterName);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    
    // Clean up expired entry
    if (cached) {
      this.cache.delete(parameterName);
    }
    
    return null;
  }

  set(parameterName: string, value: string): void {
    this.cache.set(parameterName, {
      value,
      expires: Date.now() + this.ttl
    });
  }

  delete(parameterName: string): void {
    this.cache.delete(parameterName);
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
export const parameterCache = new ParameterCache();