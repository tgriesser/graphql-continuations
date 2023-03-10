import {
  GraphQLFieldResolver,
  GraphQLResolveInfo,
  defaultFieldResolver,
  execute,
} from "graphql";
import { isPromiseLike } from "./jsutils.js";
import { makeContinuationQueryDocument } from "./makeContinuationQueryDocument.js";
import { interleaveErrors, removeFieldFromErrorPath } from "./errorHandling.js";
import type { ContinuationFieldOptions, ContinuationConfig } from "./types.js";
import {
  setWithinContinuation,
  withinContinuationField,
} from "./withinContinuation.js";
import { markWrapped } from "./wrapExistingResolver.js";
import { CONTINUATION_RACE, CONTINUATION_TYPE_NAME } from "./constants.js";

/**
 * Makes the field resolver associated with handling a continuation,
 * added to a type with the ability to complete its selection set with
 * a re-entry as a root Query field
 */
export function makeContinuationFieldResolver<Context>(
  config: ContinuationConfig<Context>,
  fieldOptions: ContinuationFieldOptions<Context>
): GraphQLFieldResolver<any, any, { waitMs: number }> {
  return markWrapped(async (source, args, ctx, info) => {
    if (withinContinuationField(info)) {
      return maybeResolveNestedContination(config, source, args, ctx, info);
    }
    const { executeImpl = execute } = config;

    const { document, targetField, isNode, variableNames } =
      makeContinuationQueryDocument(info, fieldOptions);

    const variableValues: Record<string, any> = {};

    for (const variable of variableNames) {
      variableValues[variable] = info.variableValues[variable];
    }

    if (isNode) {
      const nodeIdField = config.nodeIdField ?? "id";
      const nodeResolve =
        info.parentType.getFields()[nodeIdField].resolve ??
        defaultFieldResolver;
      let nodeId = nodeResolve(source, args, ctx, info);
      if (isPromiseLike(nodeId)) {
        nodeId = await nodeId;
      }
      variableValues[nodeIdField] = nodeId;
    }

    let queryPromise = Promise.resolve(
      executeImpl({
        schema: info.schema,
        document,
        contextValue: ctx,
        variableValues,
      })
    );

    if (targetField) {
      queryPromise = queryPromise.then((result) =>
        removeFieldFromErrorPath(targetField, result)
      );
    }

    const waitPromise = new Promise<typeof CONTINUATION_RACE>((resolve) =>
      setTimeout(() => resolve(CONTINUATION_RACE), args.waitMs)
    );
    const result = await Promise.race([waitPromise, queryPromise]);

    if (result === CONTINUATION_RACE) {
      const continuationId = config.adapter.storeResult(
        queryPromise,
        source,
        args,
        ctx,
        info
      );
      return {
        __typename: CONTINUATION_TYPE_NAME,
        continuationId,
      };
    }

    // Signals to resolvers that we're within the continuation resolve context, so we
    // don't double execute resolve functions
    setWithinContinuation(info);

    // If there are errors, we need to set them in the context of the result data so
    // they're picked up by the execution result
    return interleaveErrors(result);
  });
}

/**
 * If we're within a continuation field, checks whether we
 */
async function maybeResolveNestedContination<Context>(
  config: ContinuationConfig<Context>,
  source: any,
  args: any,
  ctx: Context,
  info: GraphQLResolveInfo
) {
  const { resolveContinuationsRecursively = true } = config;
  if (
    resolveContinuationsRecursively &&
    source.__typename === CONTINUATION_TYPE_NAME
  ) {
    const hasResult = await config.adapter.hasResult(
      source.continuationId,
      source
    );
    if (hasResult) {
      return config.adapter.resolveResult(
        source,
        { continuationId: source.continuationId },
        ctx,
        info
      );
    }
  }
  return defaultFieldResolver(source, args, ctx, info);
}
