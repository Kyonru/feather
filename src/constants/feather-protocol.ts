/**
 * Wire protocol compatibility between the desktop app and the Lua runtime.
 *
 * This is NOT the plugin API version (`FEATHER_PLUGIN_API`). That one gates
 * which plugins a runtime can load. This one gates whether the runtime and the
 * desktop app can talk to each other at all.
 *
 * They are separate because the runtime and the desktop app ship on separate
 * release trains (see V4.md section 6), so their version numbers are expected
 * to differ. Before v4 they were kept equal by lock-step releases and nothing
 * needed to be negotiated.
 *
 * The runtime reports its version as `protocolVersion` in the `feather:hello`
 * config payload. Keep this in sync with `FEATHER_PROTOCOL_VERSION` in
 * `packages/runtime-lua/feather/init.lua` — `npm run check:protocol` enforces it.
 */

/** Wire protocol version this desktop build speaks. */
export const FEATHER_PROTOCOL_VERSION = 1;

/**
 * Oldest runtime protocol version this desktop build can still talk to.
 *
 * Raise this only when dropping support for an old runtime is deliberate.
 */
export const FEATHER_PROTOCOL_MIN_SUPPORTED = 1;

export type ProtocolStatus = 'ok' | 'legacy' | 'runtime-too-old' | 'runtime-too-new';

export interface ProtocolCompatibility {
  status: ProtocolStatus;
  /** The runtime's reported version, or null when it reported none. */
  runtime: number | null;
  /** True when the desktop app should not trust command/response round-trips. */
  incompatible: boolean;
  /** Short, specific description of what is wrong. Empty when status is 'ok'. */
  summary: string;
  /** What the user should actually do about it. Empty when status is 'ok'. */
  remediation: string;
}

/**
 * Compare a runtime-reported protocol version against what this build supports.
 *
 * A runtime that reports nothing is treated as `legacy`, not as broken: every
 * runtime released before this negotiation existed omits the field, and those
 * sessions still work. It is surfaced as guidance, not as a failure.
 */
export function evaluateProtocol(protocolVersion: unknown): ProtocolCompatibility {
  if (typeof protocolVersion !== 'number' || !Number.isFinite(protocolVersion)) {
    return {
      status: 'legacy',
      runtime: null,
      incompatible: false,
      summary: 'This game is running a Feather runtime from before protocol negotiation.',
      remediation: `Update the Feather runtime in your game to report a protocol version. The desktop app speaks protocol v${FEATHER_PROTOCOL_VERSION}.`,
    };
  }

  if (protocolVersion < FEATHER_PROTOCOL_MIN_SUPPORTED) {
    return {
      status: 'runtime-too-old',
      runtime: protocolVersion,
      incompatible: true,
      summary: `The game speaks protocol v${protocolVersion}; this desktop app needs at least v${FEATHER_PROTOCOL_MIN_SUPPORTED}.`,
      remediation: 'Update the Feather runtime in your game, or install an older desktop app that still supports it.',
    };
  }

  if (protocolVersion > FEATHER_PROTOCOL_VERSION) {
    return {
      status: 'runtime-too-new',
      runtime: protocolVersion,
      incompatible: true,
      summary: `The game speaks protocol v${protocolVersion}; this desktop app only speaks v${FEATHER_PROTOCOL_VERSION}.`,
      remediation: 'Update the Feather desktop app, or pin the game to an older Feather runtime.',
    };
  }

  return {
    status: 'ok',
    runtime: protocolVersion,
    incompatible: false,
    summary: '',
    remediation: '',
  };
}
