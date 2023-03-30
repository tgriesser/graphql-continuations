import type { ExecutionResult, FormattedExecutionResult } from "graphql";
import { EventEmitter } from "events";
import {
  BaseAdapter,
  ContinuationID,
  ResolveContinuationArgs,
  StoreResultArgs,
  Unsubscribe,
} from "./BaseAdapter.js";
import { ContinuationNotFoundError } from "../errorHandling.js";
import type { BaseExpires } from "../types.js";

const PUB_SUB_NSP = "gqlc-pub";

type Callback<T = any> = (err?: Error | null, result?: T) => void;

export type MaybeCtxFn<Context, T> = ((ctx: Context) => T) | T;

export interface Expires extends BaseExpires {
  /**
   * How long we keep a "pending" flag in memory, in seconds
   * @default 10 minutes
   */
  pendingFlag?: number;
}

export interface ContinuationRedisAdapterConfig<Context> {
  /**
   * Prefix for the key in Redis, default gqlc:
   */
  keyPrefix?: string;
  /**
   * IORedis Client, w/ set / get / exists
   */
  client: MaybeCtxFn<
    Context,
    {
      del(key: string): Promise<any>;
      get(key: string): Promise<string | null>;
      expire(key: string, seconds: number): Promise<number>;
      setex(key: string, expire: number, value: string): Promise<"OK">;
      exists(key: string): Promise<number>;
      publish(nsp: string, evt: string): Promise<number>;
    }
  >;
  /**
   * Connection to subscribe to the completion of the continuation value
   */
  clientSubscribe: {
    subscribe(nsp: string, callback: Callback<unknown>): Promise<unknown>;
    unsubscribe(nsp: string, callback: Callback<unknown>): Promise<unknown>;
    on(
      evt: "message",
      handler: (channel: string, message: string) => void
    ): unknown;
    off(
      evt: "message",
      handler: (channel: string, message: string) => void
    ): unknown;
  };
  /**
   * If there's an unhandled IORedis error when subscribing/unsubscribing
   */
  onError?: (e: Error) => any;
  /**
   * Optionally adds additional authorization for accessing the result based on the uuid
   */
  authorize?: (
    ...args: ResolveContinuationArgs<{ continuationId: string }, Context>
  ) => boolean;
  /**
   * Sets the "expires" times for the payloads set in redis
   */
  expires?: Expires;
}

class ContinuationRedisAdapter<Context = any> extends BaseAdapter<Context> {
  #ee: EventEmitter;
  #expires: Required<Expires>;

  constructor(private config: ContinuationRedisAdapterConfig<Context>) {
    super();
    this.#ee = new EventEmitter();
    this.#expires = {
      pendingFlag: config.expires?.pendingFlag ?? 60 * 10, // 10 min
      completedValue: config.expires?.completedValue ?? 60 * 10,
      retrievedValue: config.expires?.retrievedValue ?? 60, // 1 min
    };
    config.clientSubscribe.on("message", this.onContinuationId);
  }

  teardown() {
    this.config.clientSubscribe.off("message", this.onContinuationId);
  }

  onContinuationId = (chan: string, msg: string) => {
    if (chan.startsWith(`${PUB_SUB_NSP}:`)) {
      this.#ee.emit(chan, msg);
      this.#ee.removeAllListeners(chan);
      this.config.clientSubscribe.unsubscribe(chan, (e) => {
        if (e) {
          this.onUnhandledError(e);
        }
      });
    }
  };

  onUnhandledError = (e: Error) => {
    if (this.config.onError) {
      this.config.onError(e);
    } else {
      console.error(e.stack);
    }
  };

  #key(continuationId: ContinuationID, type?: ":pending") {
    return `${this.config.keyPrefix ?? "gqlc:"}${continuationId}${type ?? ""}`;
  }

  /**
   * Checks whether we've completed the continuation yet, utilized
   * when determining whether to recursively resolve the continuations
   */
  async hasResult(continuationId: ContinuationID, ctx: Context) {
    return Boolean(await this.#client(ctx).exists(this.#key(continuationId)));
  }

  /**
   * Takes the promise for the continuation query, and resolves with a string,
   * used to fetch the eventual result of the continuation
   */
  async storeResult(
    ...storeResultArgs: StoreResultArgs<Context>
  ): Promise<ContinuationID> {
    const continuationId = this.generateId();
    const [promiseResult, source, args, ctx, info] = storeResultArgs;
    await this.#client(ctx).setex(
      this.#key(continuationId, ":pending"),
      this.#expires.pendingFlag,
      new Date().toISOString()
    );

    promiseResult
      .then(async (result) => {
        const serializedResult = this.serializeResult(result);
        await Promise.all([
          this.#client(ctx).del(this.#key(continuationId, ":pending")),
          this.#client(ctx).setex(
            this.#key(continuationId),
            this.#expires.retrievedValue,
            serializedResult
          ),
        ]);
        this.#client(ctx).publish(
          `${PUB_SUB_NSP}:${continuationId}`,
          serializedResult
        );
      })
      .catch(this.onUnhandledError);
    return continuationId;
  }

  /**
   * Given the continuationId identifier, fetches the result of the query.
   * The UUID should be a decent guard against making this unguessable, however
   * storing additional data in the serialized result might be helpful to ensure
   * the continuationId is only accessed by the current userId or sessionId
   */
  async resolveResult(
    ...resolveResultArgs: ResolveContinuationArgs<{ continuationId: string }>
  ) {
    const [_source, { continuationId }, ctx] = resolveResultArgs;
    return new Promise<FormattedExecutionResult>(async (resolve, reject) => {
      try {
        const isPending = await this.#client(ctx).exists(
          this.#key(continuationId, ":pending")
        );
        if (isPending) {
          this.#subscribeAndWait(resolveResultArgs, (err, val) => {
            if (err) {
              return reject(err);
            }
            resolve(val);
          });
        } else {
          resolve(await this.#getFormattedResult(resolveResultArgs));
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  #client(ctx: Context) {
    if (typeof this.config.client === "function") {
      return this.config.client(ctx);
    }
    return this.config.client;
  }

  async #getFormattedResult(
    resolveResultArgs: ResolveContinuationArgs<{ continuationId: string }>
  ) {
    const [_source, { continuationId }, ctx] = resolveResultArgs;
    const result = await this.#client(ctx).get(this.#key(continuationId));
    if (!result) {
      throw new ContinuationNotFoundError(continuationId);
    }
    this.#client(ctx)
      .expire(this.#key(continuationId), this.#expires.retrievedValue)
      .catch((e) => this.onUnhandledError(e));
    return this.deserializeResult(result);
  }

  #subscribeAndWait(
    resolveResultArgs: ResolveContinuationArgs<{ continuationId: string }>,
    cb: (err: Error | null, val: FormattedExecutionResult) => void
  ) {
    let unsubscribed = false;
    let completed = false;
    const [_source, { continuationId }, ctx] = resolveResultArgs;
    const clientSubscribe = this.config.clientSubscribe;
    const client = this.#client(ctx);
    const onComplete = (val: string) => {
      if (!unsubscribed) {
        client.expire(this.#key(continuationId), this.#expires.retrievedValue);
        cb(null, this.deserializeResult(val));
        completed = true;
      }
    };
    this.#ee.once(`${PUB_SUB_NSP}:${continuationId}`, onComplete);

    // Subscribe to the event
    clientSubscribe.subscribe(`${PUB_SUB_NSP}:${continuationId}`, (e) => {
      if (e) {
        this.onUnhandledError(e);
      }
    });

    // We're pretty sure at this point that we don't have a result,
    // but let's add one additional check to be sure we didn't hit
    // a race condition with the subscription and start awaiting forever
    client
      .get(this.#key(continuationId))
      .then((val) => {
        if (typeof val === "string" && !unsubscribed) {
          this.onContinuationId(`${PUB_SUB_NSP}:${continuationId}`, val);
        }
      })
      .catch((e) => this.onUnhandledError(e));

    return () => {
      unsubscribed = true;
      if (!completed) {
        this.config.clientSubscribe.unsubscribe(
          `${PUB_SUB_NSP}:${continuationId}`,
          (e) => {
            if (e) {
              this.onUnhandledError(e);
            }
          }
        );
        this.#ee.removeListener(`${PUB_SUB_NSP}:${continuationId}`, onComplete);
      }
    };
  }

  serializeResult(result: ExecutionResult) {
    return JSON.stringify(result);
  }

  deserializeResult(str: string): FormattedExecutionResult {
    return JSON.parse(str);
  }

  subscribeResults(
    args: ResolveContinuationArgs<{ continuationIds: string[] }>,
    onResult: (continuationId: string, val: unknown) => void
  ): Unsubscribe {
    let unsubscribed = false;
    const [source, { continuationIds }, ctx, info] = args;
    const unsubscribes = continuationIds.map((continuationId, idx) =>
      this.#subscribeAndWait(
        [source, { continuationId }, ctx, info],
        (err, val) => {
          if (!unsubscribed) {
            if (err) {
              // TODO: Propagate this correctly
              this.onUnhandledError(err);
              onResult(continuationId, null);
            } else {
              onResult(continuationId, val);
            }
            unsubscribes.splice(idx, 1);
          }
        }
      )
    );
    return () => {
      unsubscribed = true;
      unsubscribes.map((u) => u());
    };
  }
}

export function redisAdapter<Context>(
  config: ContinuationRedisAdapterConfig<Context>
) {
  return new ContinuationRedisAdapter(config);
}
