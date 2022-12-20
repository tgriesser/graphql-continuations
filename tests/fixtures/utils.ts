import type { ExecutionResult } from "graphql";

export function errMsgFromResult(result: ExecutionResult) {
  const err = result.errors?.[0];
  if (err) {
    console.log(err.stack);
  }
  return err?.message;
}

const TIMED_OUT = Symbol.for("TIMED_OUT");
export async function throwIfLongerThanMs<R>(
  promise: R | Promise<R>,
  ms: number
): Promise<R> {
  const result = await Promise.race([
    Promise.resolve(promise),
    new Promise<typeof TIMED_OUT>((resolve, reject) =>
      setTimeout(() => resolve(TIMED_OUT), ms)
    ),
  ]);
  if (result === TIMED_OUT) {
    throw new Error("Timed out waiting for promise");
  }
  return result;
}
