/**
 * Helpers to creates the utility types for implementing
 * GraphQL Continuations
 */
import {
  print,
  ExecutionResult,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldResolver,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLString,
  GraphQLUnionType,
  GraphQLError,
  defaultFieldResolver,
  graphql,
} from "graphql";
import { makeContinuationQueryDocument } from "./makeContinuationQuery";

let globalWaitMs: number = 10;

function checkWaitMs(waitMs: number) {
  if (waitMs == null || waitMs % 1 !== 0) {
    throw new Error(`Expected waitMs to be an integer, saw ${waitMs}`);
  }
}

export interface OnContinuationConfig {
  source: any;
  args: any;
  context: any;
  info: GraphQLResolveInfo;
}

export function setGlobalWaitMs(waitMs: number) {
  checkWaitMs(waitMs);
  globalWaitMs = waitMs;
}

export const ContinuationType = new GraphQLObjectType({
  name: "Continuation",
  description:
    "Represents the eventual result of a selectionSet for a GraphQL Object type",
  fields: {
    continuationId: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

type PromiseOrValue<T> = Promise<T> | T;

interface ContinuationFieldConfig<TSource, TContext, TArgs = any>
  extends Omit<
    GraphQLFieldConfig<TSource, TContext, TArgs>,
    "resolve" | "type"
  > {
  /**
   * The parent object type of the field definition
   */
  type: GraphQLObjectType;
  /**
   * The default waitMs for this field, otherwise defaults to the global
   */
  waitMs?: number;
  /**
   * Returns a string or a Promise for a string, representing an identifier to
   * lookup the completed result value
   */
  onContinuation: (
    result: PromiseOrValue<ExecutionResult<any>>,
    source: unknown,
    args: unknown,
    ctx: unknown,
    info: GraphQLResolveInfo
  ) => string | Promise<string>;
}

const CONTINUATION = Symbol.for("graphql-continuation");

/**
 *
 */
export function continuationField<TSource, TContext, TArgs = any>(
  config: ContinuationFieldConfig<TSource, TContext, TArgs>
): GraphQLFieldConfig<any, any> {
  if (config.waitMs != null) {
    checkWaitMs(config.waitMs);
  }
  return {
    ...config,
    args: {
      waitMs: {
        type: GraphQLInt,
        defaultValue: config.waitMs ?? globalWaitMs,
        description:
          "The maximum amount of time to wait for the body to resolve",
      },
      ...config.args,
    },
    type: new GraphQLUnionType({
      name: `${config.type.name}Continuation`,
      description: `Union returned when the continuation field is used on the ${config.type.name} type`,
      types: () => [config.type, ContinuationType],
    }),
    resolve: async (source, args: { waitMs: number }, ctx, info) => {
      const waitPromise = new Promise<typeof CONTINUATION>((resolve) =>
        setTimeout(() => resolve(CONTINUATION), args.waitMs)
      );
      const { document, targetField, isNode, variableNames } =
        makeContinuationQueryDocument(info);

      const variableValues: Record<string, any> = {};

      for (const variable of variableNames) {
        variableValues[variable] = info.variableValues[variable];
      }

      if (isNode) {
        const nodeResolve =
          info.parentType.getFields()["id"].resolve ?? defaultFieldResolver;
        let nodeId = nodeResolve(source, args, ctx, info);
        if (isPromiseLike(nodeId)) {
          nodeId = await nodeId;
        }
        variableValues["id"] = nodeId;
      }

      const queryPromise = Promise.resolve(
        graphql({
          schema: info.schema,
          source: print(document),
          contextValue: ctx,
          variableValues,
        })
      ).then((val) => {
        if (targetField && val.data?.[targetField] !== undefined) {
          // @ts-ignore
          val.data = val.data[targetField];
          val.errors = val.errors?.map((e) => {
            if (e.path?.[0] === targetField) {
              Object.defineProperty(e, "path", {
                value: e.path.slice(1),
              });
            }
            return e;
          });
        }
        return val;
      });

      const result = await Promise.race([waitPromise, queryPromise]);

      if (result === CONTINUATION) {
        const continuationId = config.onContinuation(
          queryPromise,
          source,
          args,
          ctx,
          info
        );
        return {
          __typename: "Continuation",
          continuationId,
        };
      }

      if (result.data === undefined) {
        return result.errors?.[0];
      }

      // If there are errors, we need to set them in the context of the result data so
      // they're picked up by the execution result
      const returnVal = result.errors?.length
        ? interleaveErrors(result.data, result.errors)
        : result.data;

      return returnVal;
    },
  };
}

/**
 * Given a response object, and a list of errors, attaches the errors in the path where they'd be expected
 * on the object, so they will return appropriate errors
 */
export function interleaveErrors(data: any, errors: readonly GraphQLError[]) {
  if (data === undefined) {
    return errors[0];
  }
  for (const error of errors) {
    let target = data;
    let path = error.path ?? [];
    for (let i = 0; i < path.length ?? 0; i++) {
      if (target[path[i]] !== null) {
        target = target[path[i]];
      } else {
        target[path[i]] = error.originalError ?? error;
      }
    }
  }
  return data;
}

function isPromiseLike<T>(val: any): val is PromiseLike<T> {
  return val && typeof val === "object" && typeof val.then === "function";
}

type MaybeThunk<T> = T | (() => T);

interface ResolveContinuationFieldConfig {
  types: MaybeThunk<GraphQLObjectType[]>;
  args?: GraphQLFieldConfigArgumentMap;
  resolveContinuation: (
    continuationId: string,
    ...rest: Parameters<GraphQLFieldResolver<any, any>>
  ) => Promise<any>;
}

export function resolveContinuationField(
  config: ResolveContinuationFieldConfig
): GraphQLFieldConfig<any, any> {
  return {
    args: {
      ...config.args,
      continuationId: {
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    type: new GraphQLUnionType({
      name: "ResolveContinuation",
      description: "Union returned when resolving the result of a continuation",
      types: config.types,
    }),
    resolve: (source, args, ctx, info) => {
      return config.resolveContinuation(
        args.continuationId,
        source,
        args,
        ctx,
        info
      );
    },
  };
}
