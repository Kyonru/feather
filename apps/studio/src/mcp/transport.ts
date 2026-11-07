/**
 * How Studio's creative MCP server reaches the outside world.
 *
 * Abstracted for the same reason the command sender is: the creative tools run
 * both in Studio's Tauri shell and as a plain web page, and only the former has
 * a native MCP host. Keeping the transport behind an interface is what lets the
 * web build stay Tauri-free while the desktop build wires the real thing.
 *
 * With nothing registered every call is a no-op, which is the correct browser
 * behaviour — there is no MCP client to talk to.
 */

export type CreativeMcpRequest = {
  id: string;
  tool: string;
  action: string;
  params?: Record<string, unknown>;
};

export type CreativeMcpResolution = {
  id: string;
  ok: boolean;
  response: unknown;
  error: string | null;
};

export interface CreativeMcpTransport {
  /** Publish the current state of a tool for MCP resources to read. */
  publishSnapshot: (tool: string, snapshot: unknown) => void;
  /** Subscribe to incoming tool invocations. Returns an unsubscribe function. */
  onRequest: (handler: (request: CreativeMcpRequest) => void) => Promise<() => void>;
  /** Answer one invocation. */
  resolve: (payload: CreativeMcpResolution) => Promise<void>;
}

const noTransport: CreativeMcpTransport = {
  publishSnapshot: () => {},
  onRequest: async () => () => {},
  resolve: async () => {},
};

let current: CreativeMcpTransport = noTransport;

export function setCreativeMcpTransport(transport: CreativeMcpTransport): void {
  current = transport;
}

export function creativeMcpTransport(): CreativeMcpTransport {
  return current;
}
