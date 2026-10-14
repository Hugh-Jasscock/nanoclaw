import net from 'net';

// Errors that mean the host couldn't reach the API, not that the agent or session is broken
const NETWORK_ERROR_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|Connection refused|Unable to connect to API/i;

export function isNetworkError(error: string | null | undefined): boolean {
  return !!error && NETWORK_ERROR_PATTERN.test(error);
}

/** Quick check that the Anthropic API is reachable before spending a container on it. */
export function isOnline(
  host = 'api.anthropic.com',
  port = 443,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
