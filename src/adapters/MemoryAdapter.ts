import type { execute } from "graphql";
import {
  BaseAdapter,
  ContinuationID,
  ResolveContinuationArgs,
  StoreResultArgs,
  Unsubscribe,
} from "./BaseAdapter.js";
import { ContinuationNotFoundError } from "../errorHandling.js";
import type { BaseExpires } from "../types.js";

export interface MemoryAdapterConfig {
  /**
   * Sets the "expires" times for the payloads set in redis
   */
  expires?: BaseExpires;
}

export class MemoryAdapter<Context = any> extends BaseAdapter {
  inMemoryCompletions = new Map<string, ReturnType<typeof execute>>();
  inFlightCompletions = new Map<string, Promise<ReturnType<typeof execute>>>();
  #expires: Required<BaseExpires>;

  constructor(config: MemoryAdapterConfig) {
    super();
    this.#expires = {
      completedValue: config.expires?.completedValue ?? 60 * 10,
      retrievedValue: config.expires?.retrievedValue ?? 60, // 1 min
    };
  }

  async hasResult(continuationId: ContinuationID, ctx: Context) {
    return this.inMemoryCompletions.has(continuationId);
  }

  async storeResult(...args: StoreResultArgs<Context>) {
    const key = this.generateId();
    this.inFlightCompletions.set(
      key,
      args[0].then((result) => {
        this.inMemoryCompletions.set(key, result);
        this.inFlightCompletions.delete(key);
        setTimeout(() => {
          this.inMemoryCompletions.delete(key);
        }, this.#expires.completedValue);
        return result;
      })
    );
    return key;
  }

  async resolveResult(
    ...args: ResolveContinuationArgs<{ continuationId: string }>
  ) {
    const [_source, { continuationId }] = args;
    const result =
      this.inMemoryCompletions.get(continuationId) ??
      this.inFlightCompletions.get(continuationId);
    if (!result) {
      throw new ContinuationNotFoundError(continuationId);
    }
    return Promise.resolve(result).then((data) => {
      // Deletes the data on the server after 10 seconds
      setTimeout(() => {
        this.inMemoryCompletions.delete(continuationId);
      }, this.#expires.retrievedValue);
      return data;
    });
  }

  subscribeResults(
    args: ResolveContinuationArgs<{ continuationIds: string[] }>,
    onResult: (continuationId: string, val: unknown) => void
  ): Unsubscribe {
    let unsubscribed = false;
    const [source, { continuationIds }, ctx, info] = args;
    continuationIds.map((id) => {
      this.resolveResult(source, { continuationId: id }, ctx, info).then(
        (data) => {
          if (!unsubscribed) {
            onResult(id, data);
          }
        }
      );
    });
    return () => {
      unsubscribed = true;
    };
  }
}

export function memoryAdapter<Context>(config: MemoryAdapterConfig = {}) {
  return new MemoryAdapter<Context>(config);
}
