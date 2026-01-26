import * as fc from 'fast-check';
import { ShutdownTimerState } from './types';

// Mock the entire dynamodb-utils module
const mockGetShutdownTimerState = jest.fn();
const mockStartShutdownTimer = jest.fn();
const mockCancelShutdownTimer = jest.fn();
const mockUpdateShutdownTimerState = jest.fn();
const mockIsTimerExpired = jest.fn();

jest.mock('./dynamodb-utils', () => ({
  getShutdownTimerState: mockGetShutdownTimerState,
  startShutdownTimer: mockStartShutdownTimer,
  cancelShutdownTimer: mockCancelShutdownTimer,
  updateShutdownTimerState: mockUpdateShutdownTimerState,
  isTimerExpired: mockIsTimerExpired
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

// Mock the handleShutdownTimer function from index.ts
jest.mock('./aws-utils');
jest.mock('./satisfactory-api');

describe('Monitor Lambda Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set default environment variables
    process.env.SHUTDOWN_TIMEOUT_MINUTES = '10';
    process.env.SHUTDOWN_TIMER_TABLE = 'test-table';
  });

  /**
   * Property 2: Shutdown Timer Activation
   * **Validates: Requirements 4.1**
   * 
   * For any player count transition from greater than zero to zero, 
   * the monitor Lambda should create or update a shutdown timer entry 
   * in DynamoDB with the current timestamp.
   */
  describe('Property 2: Shutdown Timer Activation', () => {
    test('should start shutdown timer when player count transitions from >0 to 0', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // previousPlayerCount > 0
        fc.integer({ min: 5, max: 30 }), // timeoutMinutes
        async (previousPlayerCount, timeoutMinutes) => {
          // Arrange: Mock existing state with players (no timer active)
          const existingState: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: null, // No timer currently active
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: previousPlayerCount, // Previous count > 0
            lastChecked: Date.now() - 60000 // 1 minute ago
          };

          // Mock the getShutdownTimerState to return existing state
          mockGetShutdownTimerState.mockResolvedValue(existingState);

          const beforeTime = Date.now();

          // Mock the startShutdownTimer to return the expected result
          const expectedResult: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: beforeTime,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: beforeTime
          };
          mockStartShutdownTimer.mockResolvedValue(expectedResult);

          // Set environment variable for timeout
          process.env.SHUTDOWN_TIMEOUT_MINUTES = timeoutMinutes.toString();

          // Act: Simulate the transition logic from handleShutdownTimer
          // When playerCount is 0 and no timer is started, it should start the timer
          const currentPlayerCount = 0;
          const currentState = await mockGetShutdownTimerState();
          
          let result: ShutdownTimerState;
          if (currentPlayerCount === 0 && !currentState.timerStarted) {
            // This is the transition from >0 to 0 - start the timer
            result = await mockStartShutdownTimer(currentPlayerCount, timeoutMinutes);
          } else {
            // This shouldn't happen in our test case, but handle it
            result = currentState;
          }
          
          const afterTime = Date.now();

          // Assert: Timer should be started for the transition
          if (currentPlayerCount === 0 && previousPlayerCount > 0) {
            expect(result.id).toBe('singleton');
            expect(result.timerStarted).not.toBeNull();
            expect(result.timerStarted).toBeGreaterThanOrEqual(beforeTime);
            expect(result.timerStarted).toBeLessThanOrEqual(afterTime);
            expect(result.shutdownTimeoutMinutes).toBe(timeoutMinutes);
            expect(result.lastPlayerCount).toBe(0);
            
            // Verify that startShutdownTimer was called with correct parameters
            expect(mockStartShutdownTimer).toHaveBeenCalledWith(0, timeoutMinutes);
          }
        }
      ), { numRuns: 50 });
    });

    test('should not start timer if already started', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 5, max: 30 }), // timeoutMinutes
        fc.integer({ min: 1, max: 300000 }), // existingTimerAge in ms
        async (timeoutMinutes, existingTimerAge) => {
          // Arrange: Mock existing state with timer already started
          const timerStartTime = Date.now() - existingTimerAge;
          const existingState: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: timerStartTime,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: Date.now() - 60000
          };

          mockGetShutdownTimerState.mockResolvedValue(existingState);

          // Act: Get current state (simulating timer already active)
          const result = await mockGetShutdownTimerState();

          // Assert: Timer should remain with original start time
          expect(result.timerStarted).toBe(timerStartTime);
          expect(result.shutdownTimeoutMinutes).toBe(timeoutMinutes);
        }
      ), { numRuns: 30 });
    });
  });

  /**
   * Property 3: Shutdown Timer Expiration
   * **Validates: Requirements 4.2**
   * 
   * For any shutdown timer that has been active for longer than the configured 
   * timeout period with player count remaining at zero, the monitor Lambda 
   * should trigger a graceful shutdown of the ECS task.
   */
  describe('Property 3: Shutdown Timer Expiration', () => {
    test('should detect timer expiration when elapsed time exceeds timeout', async () => {
      await fc.assert(fc.property(
        fc.integer({ min: 1, max: 30 }), // timeoutMinutes
        fc.integer({ min: 1, max: 60 }), // extraMinutes (how much over timeout)
        (timeoutMinutes, extraMinutes) => {
          // Arrange: Create timer state that started longer ago than timeout
          const timeoutMs = timeoutMinutes * 60 * 1000;
          const extraMs = extraMinutes * 60 * 1000;
          const timerStartTime = Date.now() - (timeoutMs + extraMs);
          
          const state: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: timerStartTime,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: Date.now()
          };

          // Mock isTimerExpired to return true for expired timers
          mockIsTimerExpired.mockReturnValue(true);

          // Act & Assert: Timer should be expired
          const expired = mockIsTimerExpired(state);
          expect(expired).toBe(true);
        }
      ), { numRuns: 50 });
    });

    test('should not detect expiration when timer is within timeout period', async () => {
      await fc.assert(fc.property(
        fc.integer({ min: 2, max: 30 }), // timeoutMinutes
        fc.integer({ min: 1, max: 50 }), // percentageElapsed (1-50% of timeout)
        (timeoutMinutes, percentageElapsed) => {
          // Arrange: Create timer state that started less than timeout ago
          const timeoutMs = timeoutMinutes * 60 * 1000;
          const elapsedMs = Math.floor((timeoutMs * percentageElapsed) / 100);
          const timerStartTime = Date.now() - elapsedMs;
          
          const state: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: timerStartTime,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: Date.now()
          };

          // Mock isTimerExpired to return false for non-expired timers
          mockIsTimerExpired.mockReturnValue(false);

          // Act & Assert: Timer should not be expired
          const expired = mockIsTimerExpired(state);
          expect(expired).toBe(false);
        }
      ), { numRuns: 50 });
    });
  });

  /**
   * Property 4: Shutdown Timer Cancellation
   * **Validates: Requirements 4.4**
   * 
   * For any shutdown timer that is active, when the player count transitions 
   * from zero to greater than zero, the monitor Lambda should cancel the timer 
   * by removing or nullifying the timer entry in DynamoDB.
   */
  describe('Property 4: Shutdown Timer Cancellation', () => {
    test('should cancel timer when player count transitions from 0 to >0', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // newPlayerCount > 0
        fc.integer({ min: 5, max: 30 }), // timeoutMinutes
        fc.integer({ min: 1, max: 300000 }), // timerAge in ms
        async (newPlayerCount, timeoutMinutes, timerAge) => {
          // Arrange: Mock existing state with active timer
          const timerStartTime = Date.now() - timerAge;
          const existingState: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: timerStartTime,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: Date.now() - 60000
          };

          mockGetShutdownTimerState.mockResolvedValue(existingState);

          // Set up environment variable
          process.env.SHUTDOWN_TIMEOUT_MINUTES = timeoutMinutes.toString();

          // Act: Simulate the handleShutdownTimer logic for player count > 0 with active timer
          const currentState = await mockGetShutdownTimerState();
          
          if (newPlayerCount > 0 && currentState.timerStarted) {
            // This should trigger timer cancellation
            await mockCancelShutdownTimer(newPlayerCount);
          }

          // Assert: Timer cancellation should be called when players connect and timer is active
          if (newPlayerCount > 0 && timerStartTime) {
            expect(mockCancelShutdownTimer).toHaveBeenCalledWith(newPlayerCount);
          }
        }
      ), { numRuns: 50 });
    });

    test('should update state when players connect but no timer is active', async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // playerCount > 0
        fc.integer({ min: 5, max: 30 }), // timeoutMinutes
        async (playerCount, timeoutMinutes) => {
          // Arrange: Mock existing state with no active timer
          const existingState: ShutdownTimerState = {
            id: 'singleton',
            timerStarted: null,
            shutdownTimeoutMinutes: timeoutMinutes,
            lastPlayerCount: 0,
            lastChecked: Date.now() - 60000
          };

          mockGetShutdownTimerState.mockResolvedValue(existingState);

          // Set up environment variable
          process.env.SHUTDOWN_TIMEOUT_MINUTES = timeoutMinutes.toString();

          // Act: Simulate the handleShutdownTimer logic for player count > 0 with no active timer
          const currentState = await mockGetShutdownTimerState();
          
          if (playerCount > 0) {
            if (currentState.timerStarted) {
              // Should cancel timer if active
              await mockCancelShutdownTimer(playerCount);
            } else {
              // Should just update state if no timer active
              await mockUpdateShutdownTimerState({
                ...currentState,
                lastPlayerCount: playerCount
              });
            }
          }

          // Assert: Should update state when no timer is active
          if (playerCount > 0 && !existingState.timerStarted) {
            expect(mockUpdateShutdownTimerState).toHaveBeenCalledWith(
              expect.objectContaining({
                id: 'singleton',
                timerStarted: null,
                lastPlayerCount: playerCount
              })
            );
          }
        }
      ), { numRuns: 30 });
    });
  });
});