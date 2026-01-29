// Unit tests for parameter cache
import { parameterCache } from './parameter-cache';

describe('ParameterCache', () => {
  beforeEach(() => {
    parameterCache.clear();
  });

  afterEach(() => {
    parameterCache.clear();
  });

  describe('get and set operations', () => {
    it('should return null for non-existent parameter', async () => {
      const result = await parameterCache.get('/satisfactory/non-existent');
      expect(result).toBeNull();
    });

    it('should store and retrieve parameter values', async () => {
      const parameterName = '/satisfactory/test-param';
      const value = 'test-value';
      
      parameterCache.set(parameterName, value);
      const result = await parameterCache.get(parameterName);
      
      expect(result).toBe(value);
    });

    it('should handle parameter names with hierarchical structure', async () => {
      const parameterName = '/satisfactory/admin-password';
      const value = 'secure-password-123';
      
      parameterCache.set(parameterName, value);
      const result = await parameterCache.get(parameterName);
      
      expect(result).toBe(value);
    });
  });

  describe('TTL functionality', () => {
    it('should expire cached parameters after TTL', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const parameterName = '/satisfactory/test-param';
      const value = 'test-value';
      
      parameterCache.set(parameterName, value);
      
      // Should be available immediately
      let result = await parameterCache.get(parameterName);
      expect(result).toBe(value);
      
      // Advance time beyond TTL (5 minutes = 300000ms)
      currentTime += 300001;
      
      // Should be expired now
      result = await parameterCache.get(parameterName);
      expect(result).toBeNull();
      
      // Restore original Date.now
      Date.now = originalDateNow;
    });

    it('should clean up expired entries', async () => {
      const originalDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      const parameterName = '/satisfactory/test-param';
      const value = 'test-value';
      
      parameterCache.set(parameterName, value);
      expect(parameterCache.size()).toBe(1);
      
      // Advance time beyond TTL
      currentTime += 300001;
      
      // Access expired entry should clean it up
      await parameterCache.get(parameterName);
      expect(parameterCache.size()).toBe(0);
      
      Date.now = originalDateNow;
    });
  });

  describe('cache management', () => {
    it('should delete specific parameters', () => {
      const param1 = '/satisfactory/param1';
      const param2 = '/satisfactory/param2';
      
      parameterCache.set(param1, 'value1');
      parameterCache.set(param2, 'value2');
      expect(parameterCache.size()).toBe(2);
      
      parameterCache.delete(param1);
      expect(parameterCache.size()).toBe(1);
    });

    it('should clear all cached parameters', () => {
      parameterCache.set('/satisfactory/param1', 'value1');
      parameterCache.set('/satisfactory/param2', 'value2');
      expect(parameterCache.size()).toBe(2);
      
      parameterCache.clear();
      expect(parameterCache.size()).toBe(0);
    });

    it('should return correct cache size', () => {
      expect(parameterCache.size()).toBe(0);
      
      parameterCache.set('/satisfactory/param1', 'value1');
      expect(parameterCache.size()).toBe(1);
      
      parameterCache.set('/satisfactory/param2', 'value2');
      expect(parameterCache.size()).toBe(2);
    });
  });

  describe('parameter naming patterns', () => {
    it('should handle various parameter naming patterns', async () => {
      const testCases = [
        '/satisfactory/admin-password',
        '/satisfactory/jwt-secret',
        '/satisfactory/server-admin-password',
        '/satisfactory/api-token',
        '/satisfactory/client-password'
      ];
      
      for (const paramName of testCases) {
        const value = `value-for-${paramName}`;
        parameterCache.set(paramName, value);
        const result = await parameterCache.get(paramName);
        expect(result).toBe(value);
      }
      
      expect(parameterCache.size()).toBe(testCases.length);
    });
  });
});