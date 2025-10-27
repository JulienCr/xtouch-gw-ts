/**
 * Runtime environment detection utilities
 */

/**
 * Detects if the application is running under PM2
 * PM2 sets environment variables like pm_id, NODE_APP_INSTANCE, and PM2_HOME
 */
export function isRunningUnderPm2(): boolean {
  return Boolean(
    process.env.pm_id ||
    process.env.NODE_APP_INSTANCE ||
    process.env.PM2_HOME
  );
}

/**
 * Determines if the interactive CLI should be attached
 * @returns true if CLI should be attached, false otherwise
 */
export function shouldAttachCli(): boolean {
  // Explicit override via environment variable
  if (process.env.DISABLE_CLI === 'true') {
    return false;
  }

  // Don't attach CLI when running under PM2
  if (isRunningUnderPm2()) {
    return false;
  }

  // Only attach CLI in interactive terminals
  return Boolean(process.stdin.isTTY);
}
