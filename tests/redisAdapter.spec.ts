import {
  ExecutionResult,
  GraphQLSchema,
  execute,
  graphql,
  print,
} from "graphql";
import { default as Redis } from "ioredis";
import { describe, it, expect, beforeEach, afterAll, afterEach } from "vitest";
import { testSchema } from "./fixtures/test-schema";
import { addContinuationsToSchema, redisAdapter } from "../src";
import {
  CONTINUATION_FOR_QUERY,
  RESOLVE_CONTINUATION_FOR_QUERY,
} from "./fixtures/query-fixtures";
import { errMsgFromResult, throwIfLongerThanMs } from "./fixtures/utils";

const REDIS_URL = process.env.REDIS_URL;

describe("redisAdapter", () => {
  let schema: GraphQLSchema;
  let redisClient: Redis;
  let redisClientSubscribe: Redis;
  beforeEach(async () => {
    redisClient = new Redis(REDIS_URL ?? "");
    redisClientSubscribe = new Redis(REDIS_URL ?? "");
    schema = addContinuationsToSchema(testSchema, {
      adapter: redisAdapter({
        client: redisClient,
        clientSubscribe: redisClientSubscribe,
      }),
    });
  });
  afterEach(async () => {
    await Promise.all([redisClient.quit(), redisClientSubscribe.quit()]);
  });
  it.skipIf(!REDIS_URL)("should work with the redisAdapter", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_QUERY),
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(result)).toBeUndefined();
    expect(result.data.continuation.__typename).toEqual("Continuation");
    const continuationResult = (await throwIfLongerThanMs(
      execute({
        schema,
        document: RESOLVE_CONTINUATION_FOR_QUERY,
        variableValues: {
          continuationId: result.data.continuation.continuationId,
        },
      }),
      1500
    )) as ExecutionResult<any, any>;
    expect(errMsgFromResult(continuationResult)).toBeUndefined();
    expect(continuationResult.data?.resolveContinuation?.remoteStats).toEqual({
      data: "Remote Stats Data!",
    });
  });
});
