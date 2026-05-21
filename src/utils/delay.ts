export function randomDelaySeconds(minSeconds: number, maxSeconds: number): number {
  const low = Math.max(0, Math.floor(minSeconds));
  const high = Math.max(low, Math.floor(maxSeconds));
  const span = high - low + 1;
  return low + Math.floor(Math.random() * span);
}

export async function sleep(milliseconds: number): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, milliseconds));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown sleep failure';
    throw new Error(`Sleep failed: ${message}`);
  }
}
