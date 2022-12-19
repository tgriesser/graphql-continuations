import { GraphQLResolveInfo, execute } from "graphql";
import {
  BaseAdapter,
  ContinuationID,
  ResolveContinuationArgs,
  StoreResultArgs,
} from "./BaseAdapter.js";
import { ContinuationNotFoundError } from "../errorHandling.js";

export class MemoryAdapter<Context = any> extends BaseAdapter {
  inMemoryCompletions = new Map<string, ReturnType<typeof execute>>();
  inFlightCompletions = new Map<string, Promise<ReturnType<typeof execute>>>();

  async hasResult(
    continuationId: ContinuationID,
    ctx: Context,
    info: GraphQLResolveInfo
  ) {
    return this.inMemoryCompletions.has(continuationId);
  }

  async storeResult(...args: StoreResultArgs<Context>) {
    const key = this.generateId();
    this.inFlightCompletions.set(
      key,
      args[0].then((result) => {
        this.inMemoryCompletions.set(key, result);
        this.inFlightCompletions.delete(key);
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
    return result;
  }
}

export function memoryAdapter<Context>() {
  return new MemoryAdapter<Context>();
}
