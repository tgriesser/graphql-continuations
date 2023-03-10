import type {
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLResolveInfo,
} from "graphql";
import { v4 } from "uuid";

export type StoreResultArgs<Context = any> = [
  queryPromise: Promise<ExecutionResult>,
  ...rest: ResolveContinuationArgs<{ waitMs: number }, Context>
];

export type Unsubscribe = () => void;

export type ResolveContinuationArgs<Args, Context = any> = [
  unknown,
  Args,
  Context,
  GraphQLResolveInfo
];

export type ContinuationID = string;

export abstract class BaseAdapter<Context = any> {
  generateId() {
    return v4();
  }

  /**
   * Used when we're recursively resolving continuations,
   * used as a quick check to see if we have the result in the
   * cache or not.
   */
  abstract hasResult(
    continuationId: ContinuationID,
    ctx: Context
  ): Promise<boolean>;

  /**
   * Takes the promise for a GraphQL result and stores it for later retrieval
   */
  abstract storeResult(
    resultPromise: Promise<ExecutionResult>,
    ...args: ResolveContinuationArgs<{ waitMs: number }, Context>
  ): Promise<ContinuationID>;

  /**
   * If the result is a string, we run it through the
   * deserializeResult function, otherwise we just resolve it
   */
  abstract resolveResult(
    ...args: ResolveContinuationArgs<
      { continuationId: ContinuationID },
      Context
    >
  ): Promise<ExecutionResult | FormattedExecutionResult>;

  /**
   * Subscribes to the result of various continuationIds,
   * invoking onResult when each becomes available
   */
  abstract subscribeResults(
    args: ResolveContinuationArgs<{ continuationIds: string[] }>,
    onResult: (continuationId: string, val: unknown) => void
  ): Unsubscribe;
}
