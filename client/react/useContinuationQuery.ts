import type { FormattedExecutionResult } from "graphql";
import { useEffect, useCallback, useState, useRef, useContext } from "react";
import { ContinuationCache } from "./ContinuationCacheProvider";
import type {
  ContinuationErrors,
  ContinuationResult,
  ContinuationIdShape,
  OperationRequestBody,
} from "./common";

/**
 * @deprecated useContinuationQuery should be used instead
 */
export function useContinuation<
  D extends object,
  C extends { __typename: "Continuation"; continuationId: string } | D
>(continuationOrData: C, operationBody: OperationRequestBody) {
  console.error(
    new Error(`useContinuation is deprecated, useContinuationQuery instead`)
  );
  return useContinuationQuery(continuationOrData, operationBody);
}

/**
 * @returns
 */
export function useContinuationQuery<D>(
  continuationOrData:
    | ContinuationIdShape
    | (D & { __typename?: string; continuationId?: never }),
  operationBody: OperationRequestBody
): ContinuationResult<D> {
  const ctx = useContext(ContinuationCache);
  if (!ctx) {
    throw new Error(
      "A <ContinuationCacheProvider> must be added above any components with useContinuation calls"
    );
  }

  const continuationId =
    "__typename" in continuationOrData &&
    continuationOrData.__typename === "Continuation"
      ? continuationOrData.continuationId
      : null;

  const cachedValue = continuationId ? ctx.state[continuationId] : null;
  const { addResult, formatRequestInit, apiEndpoint, fetcher } = ctx;

  // We're fine using a ref here for the operationBody / fetchOptions data, since the
  // continuationId's value changing is what will determine whether we fetch or not
  const operationBodyRef = useRef(operationBody);

  useEffect(() => {
    operationBodyRef.current = operationBody;
  });

  const [loading, setIsLoading] = useState(continuationId && !cachedValue);
  const [data, setData] = useState(
    cachedValue ? cachedValue.data ?? null : continuationOrData
  );
  const [errors, setErrors] = useState<ContinuationErrors | null>(
    cachedValue ? cachedValue.errors ?? null : null
  );

  const ignoreAbortError = useCallback(
    (e: Error) => {
      if (e.name !== "AbortError") {
        setErrors([e]);
      }
    },
    [setErrors]
  );

  useEffect(() => {
    if (!continuationId || cachedValue) {
      return;
    }
    const abortController = new AbortController();
    let unmounted = false;
    const reqInit: RequestInit = {
      signal: abortController.signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        ...operationBodyRef.current,
        variables: {
          ...operationBodyRef.current.variables,
          continuationId,
        },
      }),
    };
    fetcher(apiEndpoint, formatRequestInit(reqInit))
      .then((res) => res.json())
      .then((d: FormattedExecutionResult) => {
        if (!unmounted) {
          const toWrite = d.data?.resolveContinuation ?? (null as any);
          setData(toWrite);
          if (d.errors?.length) {
            setErrors(d.errors);
          }
          addResult({ continuationId, value: { ...d.data, data: toWrite } });
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!unmounted) {
          ignoreAbortError(e);
        }
      });

    return () => {
      unmounted = true;
      abortController.abort();
    };
  }, [
    continuationId,
    ignoreAbortError,
    fetcher,
    apiEndpoint,
    addResult,
    cachedValue,
  ]);
  return { loading, data, errors } as ContinuationResult<D>;
}
