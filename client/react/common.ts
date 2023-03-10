import type { ExecutionResult, FormattedExecutionResult } from "graphql";

export type ContinuationIdShape = {
  __typename: "Continuation";
  continuationId: string;
};

export type FormatRequestInit = (reqInit: RequestInit) => RequestInit;

export interface ContinuationCacheProviderProps {
  apiEndpoint?: string;
  initialCache?: Record<string, any>;
  fetcher?: typeof fetch;
  subscriptionClient?: SubscriptionClient;
  formatRequestInit?: FormatRequestInit;
}

// Subscription client, conforming to:
//  https://github.com/enisdenjo/graphql-sse
//  https://github.com/enisdenjo/graphql-ws
export interface SubscriptionClient {
  subscribe<Data = Record<string, unknown>, Extensions = unknown>(
    request: OperationRequestBody,
    sink: Sink<ExecutionResult<Data, Extensions>>
  ): () => void;
}

/**
 * A representation of any set of values over any amount of time
 * @category Common
 */
export interface Sink<T = unknown> {
  /** Next value arriving. */
  next(value: T): void;
  /** An error that has occured. This function "closes" the sink. */
  error(error: unknown): void;
  /** The sink has completed. This function "closes" the sink. */
  complete(): void;
}

export interface OperationRequestBody {
  readonly operationName?: string;
  readonly query: string;
  readonly variables?: Record<string, unknown>;
  readonly extensions?: Record<string, unknown>;
  [key: string]: any;
}

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
