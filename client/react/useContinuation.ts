import type { FormattedExecutionResult } from "graphql";
import { useEffect, useCallback, useState, useRef, useContext } from "react";
import { ContinuationCache } from "./ContinuationCacheProvider";

export type ContinuationErrors =
  | Exclude<FormattedExecutionResult["errors"], undefined>
  | Error[];

export type ContinuationResult<C> =
  | {
      loading: false;
      data: Exclude<C, { __typename?: "Continuation" }>;
      errors: null | ContinuationErrors;
    }
  | {
      loading: true;
      data: Extract<C, { __typename?: "Continuation" }>;
      errors: null | ContinuationErrors;
    }
  | {
      loading: false;
      data: null;
      errors: ContinuationErrors;
    };

export interface ContinuationFetchBody {
  query: string;
  operationName?: string;
  variables?: Record<string, any>;
  [key: string]: any;
}

export function useContinuation<
  C extends { __typename?: "Continuation" | string; continuationId?: string }
>(
  continuationOrData: C,
  operationBody: ContinuationFetchBody,
  fetchOptions?: Partial<RequestInit>
): ContinuationResult<C> {
  const continuationId =
    continuationOrData.__typename === "Continuation"
      ? continuationOrData.continuationId
      : null;

  const ctx = useContext(ContinuationCache);
  if (!ctx) {
    throw new Error(
      "A <ContinuationCacheProvider> must be added above any components with useContinuation calls"
    );
  }

  const cachedValue = continuationId ? ctx.state[continuationId] : null;
  const fetcher = ctx.fetcher ?? fetch;
  const apiEndpoint = ctx.apiEndpoint ?? "/graphql";
  const addResult = ctx.addResult;

  // We're fine using a ref here for the operationBody / fetchOptions data, since the
  // continuationId's value changing is what will determine whether we fetch or not
  const operationBodyRef = useRef(operationBody);
  const fetchOptionsRef = useRef(fetchOptions);

  const [loading, setIsLoading] = useState(
    continuationOrData.__typename === "Continuation" && !cachedValue
  );
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
    fetcher(apiEndpoint, {
      signal: abortController.signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "include",
      ...fetchOptionsRef.current,
      body: JSON.stringify({
        ...operationBodyRef.current,
        variables: {
          ...operationBodyRef.current.variables,
          continuationId,
        },
      }),
    })
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
      .catch(ignoreAbortError);

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
  return { loading, data, errors } as ContinuationResult<C>;
}
