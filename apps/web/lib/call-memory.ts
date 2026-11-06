export function isCallMemoryEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.call_memory_enabled !== false;
}
