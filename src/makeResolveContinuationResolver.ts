import { GraphQLFieldResolver } from "graphql";
import { ContinuationConfig } from "./types.js";
import { interleaveErrors } from "./errorHandling.js";
import { markWrapped } from "./wrapExistingResolver.js";
import { setWithinContinuation } from "./withinContinuation.js";

/**
 * Makes the resolver used to resolve the continuation
 */
export function makeResolveContinuationResolver<Context>(
  config: ContinuationConfig<Context>
): GraphQLFieldResolver<unknown, Context, { continuationId: string }> {
  return markWrapped(async (source, args, ctx, info) => {
    // Marks fields below this as being within a continuation resolution,
    // so we don't double-execute any resolvers
    setWithinContinuation(info);
    const result = await config.adapter.resolveResult(source, args, ctx, info);
    return interleaveErrors(result);
  });
}
