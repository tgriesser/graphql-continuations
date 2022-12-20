import type { GraphQLResolveInfo } from "graphql";

const hasContinuation = new WeakSet();
const withinContinuation = new WeakSet();

/**
 * variableValues is a unique object per-execution, we add the variableValues in the
 * WeakSet to detect whether we need to check if the current path is within a
 * continuation
 */
export function setWithinContinuation(info: GraphQLResolveInfo) {
  hasContinuation.add(info.variableValues);
  return withinContinuation.add(info.path);
}

/**
 * Checks whether the current execution path is nested beneath a continuation
 * or resolveContinuation, so we don't double-execute existing resolvers
 */
export function withinContinuationField(info: GraphQLResolveInfo) {
  if (!hasContinuation.has(info.variableValues)) {
    return false;
  }
  let current = info.path;
  while (current.prev) {
    if (withinContinuation.has(current)) {
      return true;
    }
    current = current.prev;
  }
  return withinContinuation.has(current);
}
