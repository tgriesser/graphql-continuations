import {
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLResolveInfo,
} from "graphql";
import {
  BaseAdapter,
  ContinuationID,
  ResolveContinuationArgs,
  StoreResultArgs,
} from "./BaseAdapter.js";
import { ContinuationNotFoundError } from "../errorHandling.js";

const PUB_SUB_NSP = "gqlc-pub";

type Callback<T = any> = (err?: Error | null, result?: T) => void;

export type MaybeCtxFn<Context, T> = ((ctx: Context) => T) | T;

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
      setex(key: string, expire: number, value: string): Promise<"OK">;
      exists(key: string): Promise<number>;
      publish(nsp: string, evt: string): Promise<number>;
    }
  >;
  /**
   * Connection to subscribe to the completion of the continuation value
   */
  clientSubscribe: MaybeCtxFn<
    Context,
    {
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
    }
  >;
  /**
   * If there's an unhandled error when writing
   */
  onError?: (e: Error) => any;
  /**
   * Optionally adds additional authorization for accessing the result based on the uuid
   */
  authorize?: (
    ...args: ResolveContinuationArgs<{ continuationId: string }, Context>
  ) => boolean;
}

const ONE_HOUR_SEC = 60 * 60;

class ContinuationRedisAdapter<Context = any> extends BaseAdapter<Context> {
  constructor(private config: ContinuationRedisAdapterConfig<Context>) {
    super();
  }

  onUnhandledError = (e: Error) => {
    if (this.config.onError) {
      this.config.onError(e);
    } else {
      console.error(e.stack);
    }
  };

  private key(continuationId: ContinuationID, type?: ":pending") {
    return `${this.config.keyPrefix ?? "gqlc:"}${continuationId}${type ?? ""}`;
  }

  /**
   * Checks whether we've completed the continuation yet, utilized
   * when determining whether to recursively resolve the continuations
   */
  async hasResult(
    continuationId: ContinuationID,
    ctx: Context,
    info: GraphQLResolveInfo
  ) {
    return Boolean(await this.#client(ctx).exists(this.key(continuationId)));
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
      this.key(continuationId, ":pending"),
      ONE_HOUR_SEC,
      new Date().toISOString()
    );

    promiseResult
      .then(async (result) => {
        await Promise.all([
          this.#client(ctx).del(this.key(continuationId, ":pending")),
          this.#client(ctx).setex(
            this.key(continuationId),
            ONE_HOUR_SEC,
            this.serializeResult(result)
          ),
        ]);
        await this.#client(ctx).publish(
          `${PUB_SUB_NSP}:${continuationId}`,
          "1"
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
          this.key(continuationId, ":pending")
        );
        if (isPending) {
          await this.#subscribeAndWait(resolveResultArgs, resolve, reject);
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

  #clientSubscribe(ctx: Context) {
    if (typeof this.config.clientSubscribe === "function") {
      return this.config.clientSubscribe(ctx);
    }
    return this.config.clientSubscribe;
  }

  async #getFormattedResult(
    resolveResultArgs: ResolveContinuationArgs<{ continuationId: string }>
  ) {
    const [_source, { continuationId }, ctx] = resolveResultArgs;
    const result = await this.#client(ctx).get(this.key(continuationId));
    if (!result) {
      throw new ContinuationNotFoundError(continuationId);
    }
    return this.deserializeResult(result);
  }

  async #subscribeAndWait(
    resolveResultArgs: ResolveContinuationArgs<{ continuationId: string }>,
    resolve: (value: FormattedExecutionResult) => void,
    reject: (err: any) => void
  ) {
    const [_source, { continuationId }, ctx] = resolveResultArgs;
    const clientSubscribe = this.#clientSubscribe(ctx);
    const onContinuationId = (chan: string) => {
      if (chan === `${PUB_SUB_NSP}:${continuationId}`) {
        clientSubscribe.off("message", onContinuationId);
        clientSubscribe.unsubscribe(`${PUB_SUB_NSP}:${continuationId}`, (e) => {
          if (e) {
            this.onUnhandledError(e);
          }
        });
        this.#getFormattedResult(resolveResultArgs).then(resolve, reject);
      }
    };
    clientSubscribe.subscribe(`${PUB_SUB_NSP}:${continuationId}`, (e) => {
      if (e) {
        this.onUnhandledError(e);
      }
    });
    clientSubscribe.on("message", onContinuationId);
    // We're pretty sure at this point that we don't have a result,
    // but let's add one additional check to be sure we didn't hit
    // some race condition and start awaiting forever
    if (await this.#client(ctx).exists(this.key(continuationId))) {
      onContinuationId(`${PUB_SUB_NSP}:${continuationId}`);
    }
  }

  serializeResult(result: ExecutionResult) {
    return JSON.stringify(result);
  }

  deserializeResult(str: string): FormattedExecutionResult {
    return JSON.parse(str);
  }
}

export function redisAdapter<Context>(
  config: ContinuationRedisAdapterConfig<Context>
) {
  return new ContinuationRedisAdapter(config);
}
