import {
  ExecutionResult,
  FormattedExecutionResult,
  GraphQLError,
  GraphQLFormattedError,
} from "graphql";

export class ContinuationNotFoundError extends Error {
  constructor(continuationId: string) {
    super(`Missing continuation ${continuationId}`);
  }
}

/**
 * Given a result or serialized result object, re-attaches errors
 * in the object path where they'd be expected, so they
 * will return appropriate errors when passed
 * through the default resolve algorithm
 */
export function interleaveErrors(
  result: ExecutionResult | FormattedExecutionResult
) {
  const { data, errors } = result;
  if (data == null && errors?.length) {
    return errors?.[0] ?? new GraphQLError("Unknown Error");
  }
  if (errors?.length) {
    for (const error of errors) {
      let gqlError = ensureGraphQLError(error);
      let target: any = data;
      let path = error.path ?? [];
      for (let i = 0; i < path.length ?? 0; i++) {
        if (target[path[i]] !== null) {
          target = target[path[i]];
        } else {
          target[path[i]] = gqlError.originalError ?? gqlError;
        }
      }
    }
  }
  return data;
}

/**
 * If the execution takes place on a query field, rather than on the query directly,
 * we need to remove the field from the result, including the path array from
 * the errors array
 */
export function removeFieldFromErrorPath(
  field: string,
  result: ExecutionResult
) {
  if (field && result.data?.[field] !== undefined) {
    // @ts-ignore
    result.data = result.data[field];
    result.errors = result.errors?.map((e) => {
      if (e.path?.[0] === field) {
        Object.defineProperty(e, "path", {
          value: e.path.slice(1),
        });
      }
      return e;
    });
  }
  return result;
}

function ensureGraphQLError(error: GraphQLError | GraphQLFormattedError) {
  return error instanceof Error
    ? error
    : new GraphQLError(error.message, error);
}
