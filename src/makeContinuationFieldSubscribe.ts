import type { GraphQLFieldResolver } from "graphql";
import type { ContinuationConfig } from "./types.js";
import type { ResolveContinuationArgs } from "./adapters/BaseAdapter.js";

interface ContinuationResolvedEvent {
  continuationId: string;
  value: unknown;
}

export function makeContinuationFieldSubscribe(
  config: ContinuationConfig
): GraphQLFieldResolver<
  unknown,
  unknown,
  { continuationId: string },
  AsyncIterable<unknown>
> {
  return (source, { continuationId }, ctx, info) => {
    return makeIterator(
      config,
      [source, { continuationIds: [continuationId] }, ctx, info],
      (val: ContinuationResolvedEvent) => val.value
    );
  };
}

const DONE = Object.freeze({ value: null, done: true });

export function makeContinuationListFieldSubscribe(
  config: ContinuationConfig
): GraphQLFieldResolver<
  unknown,
  unknown,
  { continuationIds: [string] },
  AsyncIterable<ContinuationResolvedEvent>
> {
  return (...args) => {
    return makeIterator(config, args, (e) => e);
  };
}

function makeIterator<T>(
  config: ContinuationConfig,
  args: ResolveContinuationArgs<{ continuationIds: string[] }>,
  onEvent: (evt: ContinuationResolvedEvent) => T
): AsyncIterable<T> {
  let idCount = args[1].continuationIds.length;

  if (idCount === 0) {
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            return Promise.resolve({ done: true, value: null });
          },
        };
      },
    };
  }

  return {
    [Symbol.asyncIterator]() {
      const awaitingIds = new Set(args[1].continuationIds);
      let queuedResult: Array<T | null> = [];
      let resolveFn: Function | undefined;
      let completed: boolean = false;

      function getNextValue(): Promise<IteratorResult<T, null>> {
        if (completed) {
          return Promise.resolve(DONE);
        }
        if (queuedResult.length === 0) {
          return new Promise((resolve) => {
            resolveFn = resolve;
          }).then(() => {
            resolveFn = undefined;
            return getNextValue();
          });
        }
        const value = queuedResult.shift();
        if (value === undefined) {
          return Promise.resolve(DONE);
        }
        if (value === null) {
          completed = true;
        }
        return Promise.resolve(value === null ? DONE : { done: false, value });
      }

      // Create a lookup of the continuationIds we're waiting to resolve,
      // when it completes we send the event and dispose of the subscription
      const unsubscribe = config.adapter.subscribeResults(
        args,
        (continuationId, value) => {
          if (awaitingIds.has(continuationId)) {
            queuedResult.push(onEvent({ continuationId, value }));
            awaitingIds.delete(continuationId);
            if (awaitingIds.size === 0) {
              unsubscribe();
              queuedResult.push(null);
            }
            resolveFn?.();
          }
        }
      );

      return {
        next() {
          return getNextValue();
        },
        return() {
          // Unsubscribe so we don't receive any more events
          unsubscribe?.();
          // Clear the awaiting ids
          awaitingIds.clear();
          // Ensure the next value is null to signal "done"
          queuedResult = [null];
          // Clear out the resolveFn promise, if one exists
          resolveFn?.();
          // Close the iterator
          return getNextValue();
        },
      };
    },
  };
}
