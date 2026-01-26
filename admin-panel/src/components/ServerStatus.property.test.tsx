import { describe, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import ServerStatus from './ServerStatus';
import type { StatusResponse } from '../types/server';

/**
 * Property 5: Server State Display
 * **Validates: Requirements 5.1**
 * 
 * For any valid server state value (offline, starting, running, stopping), 
 * the Admin Panel should render the corresponding state indicator in the UI.
 */
describe('Property 5: Server State Display', () => {
  afterEach(() => {
    cleanup(); // Clean up DOM between tests
  });

  it('should render the correct state indicator for any valid server state', () => {
    // Define the valid server states
    const serverStateArbitrary = fc.constantFrom(
      'offline' as const,
      'starting' as const,
      'running' as const,
      'stopping' as const
    );

    // Define arbitrary for optional fields when server is running
    const runningServerDataArbitrary = fc.record({
      publicIp: fc.option(fc.ipV4(), { nil: undefined }),
      port: fc.integer({ min: 1, max: 65535 }),
      playerCount: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
      serverName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      gamePhase: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    });

    // Create arbitrary for StatusResponse
    const statusResponseArbitrary = fc.tuple(serverStateArbitrary, runningServerDataArbitrary)
      .map(([serverState, runningData]): StatusResponse => ({
        serverState,
        lastUpdated: new Date().toISOString(),
        port: runningData.port,
        // Only include running-specific data if server is running
        ...(serverState === 'running' ? runningData : {}),
      }));

    fc.assert(
      fc.property(statusResponseArbitrary, (status) => {
        // Clean up before each property test iteration
        cleanup();
        
        // Render the component with the generated status
        render(
          <ServerStatus
            status={status}
            isLoading={false}
            lastUpdated={new Date()}
          />
        );

        // Verify that the correct state text is displayed
        const expectedStateText = getExpectedStateText(status.serverState);
        const statusElement = screen.getByText(expectedStateText);
        
        // The status element should be visible
        expect(statusElement).toBeInTheDocument();
        expect(statusElement).toBeVisible();

        // Verify state-specific styling is applied
        const statusBadge = statusElement.closest('span');
        expect(statusBadge).toHaveClass('inline-flex', 'px-2', 'py-1', 'text-xs', 'font-semibold', 'rounded-full');

        // Verify state-specific content is shown/hidden appropriately
        if (status.serverState === 'running') {
          // Running state should show additional info if available
          if (status.publicIp) {
            expect(screen.getByText(new RegExp(status.publicIp))).toBeInTheDocument();
          }
          if (status.playerCount !== undefined) {
            expect(screen.getByText(status.playerCount.toString())).toBeInTheDocument();
          }
        } else {
          // Non-running states should not show IP address
          expect(screen.queryByText(/IP:/)).not.toBeInTheDocument();
          expect(screen.queryByText(/Players:/)).not.toBeInTheDocument();
        }
      }),
      { numRuns: 50 } // Reduced runs to avoid timeout
    );
  });

  it('should handle null status gracefully when not loading', () => {
    cleanup();
    
    render(
      <ServerStatus
        status={null}
        isLoading={false}
        lastUpdated={null}
      />
    );

    // Should show offline state when status is null and not loading
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading and status is null', () => {
    cleanup();
    
    render(
      <ServerStatus
        status={null}
        isLoading={true}
        lastUpdated={null}
      />
    );

    // Should show loading skeleton, not "Offline" text
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    // Should have loading skeleton elements
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});

function getExpectedStateText(serverState: string): string {
  switch (serverState) {
    case 'running':
      return 'Running';
    case 'starting':
      return 'Starting';
    case 'stopping':
      return 'Stopping';
    case 'offline':
    default:
      return 'Offline';
  }
}