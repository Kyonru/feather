export type ReconnectSessionState = {
  connected?: boolean;
  pendingConfig?: boolean;
} | null | undefined;

export function shouldRequestSessionConfig(session: ReconnectSessionState, hasConfig: boolean): boolean {
  return !session || session.connected !== true || session.pendingConfig === true || !hasConfig;
}
