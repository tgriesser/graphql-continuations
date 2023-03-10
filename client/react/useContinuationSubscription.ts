import type { FormattedExecutionResult } from "graphql";
import { useEffect, useState, useContext } from "react";
import { ContinuationCache } from "./ContinuationCacheProvider";
import type {
  ContinuationErrors,
  ContinuationResult,
  OperationRequestBody,
} from "./common";

/**
 * Accepts a single "continuation" field and issues a subscription
 * to resolve the data for the provided "continuationId", resolving
 * it from the cache if the data already exists
 *
 * @param continuationOrData
 * @param operationBody
 * @returns
 */
export function useContinuationSubscription<D extends object>(
  continuationOrData:
    | { __typename: "Continuation"; continuationId: string }
    | (D & { __typename?: string; continuationId?: never }),
  operationBody: OperationRequestBody
): ContinuationResult<D> {
  const continuationId =
    "__typename" in continuationOrData &&
    continuationOrData.__typename === "Continuation"
      ? continuationOrData.continuationId
      : null;

  const ctx = useContext(ContinuationCache);
  if (!ctx) {
    throw new Error(
      "A <ContinuationCacheProvider> must be added above any components with useContinuation calls"
    );
  }
  const { addResult, subscriptionClient } = ctx;
  if (!subscriptionClient) {
    throw new Error(
      `A subscriptionClient must be passed to <ContinuationCacheProvider> to useContinuationSubscription`
    );
  }
  const cachedValue = continuationId ? ctx.state[continuationId] : null;
  const [loading, setIsLoading] = useState(continuationId && !cachedValue);
  const [data, setData] = useState(
    cachedValue ? cachedValue.data ?? null : continuationOrData
  );
  const [errors, setErrors] = useState<ContinuationErrors | null>(
    cachedValue ? cachedValue.errors ?? null : null
  );
  useEffect(() => {
    if (!continuationId || cachedValue) {
      return;
    }
    const unsub = subscriptionClient.subscribe(
      {
        ...operationBody,
        variables: {
          ...operationBody.variables,
          continuationId,
        },
      },
      {
        next(value: FormattedExecutionResult) {
          const toWrite = value.data?.subscribeContinuation ?? (null as any);
          setData(toWrite);
          if (value.errors?.length) {
            setErrors(value.errors);
          }
          addResult({
            continuationId,
            value: { ...value.data, data: toWrite },
          });
          setIsLoading(false);
        },
        error(error: Error) {
          setErrors([error]);
        },
        complete() {},
      }
    );
    return unsub;
  }, [continuationId, addResult, cachedValue]);
  return { loading, data, errors } as ContinuationResult<D>;
}
