export class OperationTimeoutError extends Error {
  constructor(readonly code: string) { super(code); this.name = "OperationTimeoutError"; }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OperationTimeoutError(errorCode)), timeoutMs);
      timer.unref?.();
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
