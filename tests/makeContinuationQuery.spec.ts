import { execute, ExecutionResult, graphql, printSchema, print } from "graphql";
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  CONTINUATION_FOR_NODE,
  CONTINUATION_FOR_QUERY,
  CONTINUATION_FOR_QUERY_WITH_FRAGMENTS,
  CONTINUATION_FOR_QUERY_WTIHOUT_TYPENAME,
  RESOLVE_CONTINUATION_FOR_NODE,
  RESOLVE_CONTINUATION_FOR_QUERY,
} from "./fixtures/query-fixtures.js";
import { testSchema } from "./fixtures/test-schema.js";
import { addContinuationsToSchema, memoryAdapter } from "../src";
import { errMsgFromResult, throwIfLongerThanMs } from "./fixtures/utils";

fs.writeFileSync(
  path.join(__dirname, "fixtures/test-schema.graphql"),
  printSchema(testSchema) + "\n"
);

const schema = addContinuationsToSchema(testSchema, {
  adapter: memoryAdapter(),
  defaultWaitMs: 5,
});

describe("fixtureSchema", () => {
  it("fetches the continuation for a query with inline fragments", async () => {
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
      150
    )) as ExecutionResult<any, any>;
    expect(errMsgFromResult(continuationResult)).toBeUndefined();
    expect(continuationResult.data?.resolveContinuation?.remoteStats).toEqual({
      data: "Remote Stats Data!",
    });
  });

  it("resolves immediately for a query with inline fragments", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_QUERY),
      variableValues: {
        waitMs: 200,
      },
    })) as ExecutionResult<any, any>;
    expect(result).toMatchInlineSnapshot(`
      {
        "data": {
          "continuation": {
            "__typename": "Query",
            "remoteStats": {
              "data": "Remote Stats Data!",
            },
          },
          "viewer": {
            "id": "User:1",
            "name": "Example User",
          },
        },
      }
    `);
  });

  it("fetches the continuation for a query without __typename defined in the result", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_QUERY_WTIHOUT_TYPENAME),
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(result)).toBeUndefined();
    expect(result.data.continuation.continuationId).toBeDefined();
    const continuationResult = (await execute({
      schema,
      document: RESOLVE_CONTINUATION_FOR_QUERY,
      variableValues: {
        continuationId: result.data.continuation.continuationId,
      },
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(continuationResult)).toBeUndefined();
    expect(
      continuationResult.data.resolveContinuation.__typename
    ).toBeUndefined();
    expect(continuationResult.data?.resolveContinuation?.remoteStats).toEqual({
      data: "Remote Stats Data!",
    });
  });

  it("fetches the continuation for a query using fragments", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_QUERY_WITH_FRAGMENTS),
      variableValues: {
        testArg: 1,
      },
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(result)).toBeUndefined();
    expect(result.data.continuation.continuationId).toBeDefined();
    const continuationResult = (await execute({
      schema,
      document: RESOLVE_CONTINUATION_FOR_QUERY,
      variableValues: {
        continuationId: result.data.continuation.continuationId,
      },
    })) as ExecutionResult<any, any>;

    expect(errMsgFromResult(continuationResult)).toBeUndefined();
    expect(
      continuationResult.data.resolveContinuation.__typename
    ).toBeUndefined();
    expect(continuationResult.data?.resolveContinuation?.remoteStats).toEqual({
      data: "Remote Stats Data!",
    });
  });

  it("fetches the result of a node", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_NODE),
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(result)).toBeUndefined();
    expect(result.data.viewer.continuation.__typename).toEqual("Continuation");
    const continuationResult = (await execute({
      schema,
      document: RESOLVE_CONTINUATION_FOR_NODE,
      variableValues: {
        continuationId: result.data.viewer.continuation.continuationId,
      },
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(continuationResult)).toBeUndefined();
    expect(continuationResult.data?.resolveContinuation?.remoteProfile).toEqual(
      {
        data: "Remote Profile Data!",
      }
    );
  });

  it("resolves continuation for node with an error", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_NODE),
      variableValues: {
        withError: true,
      },
    })) as ExecutionResult<any, any>;
    expect(errMsgFromResult(result)).toBeUndefined();
    expect(result.data.viewer.continuation.__typename).toEqual("Continuation");
    const continuationResult = (await execute({
      schema,
      document: RESOLVE_CONTINUATION_FOR_NODE,
      variableValues: {
        continuationId: result.data.viewer.continuation.continuationId,
        withError: true,
      },
    })) as ExecutionResult<any, any>;
    expect(
      continuationResult.data.resolveContinuation.remoteProfile.errorField
    ).toEqual(null);
    expect(continuationResult.errors).toHaveLength(1);
  });

  it("resolves immediately for node with an error", async () => {
    const result = (await graphql({
      schema,
      source: print(CONTINUATION_FOR_NODE),
      variableValues: {
        withError: true,
        waitMs: 200,
      },
    })) as ExecutionResult<any, any>;
    expect(result.data?.viewer.continuation.remoteProfile.errorField).toEqual(
      null
    );
    expect(result.errors).toHaveLength(1);
  });
});
