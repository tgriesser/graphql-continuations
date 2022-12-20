import {
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLUnionType,
  defaultFieldResolver,
  defaultTypeResolver,
  isObjectType,
} from "graphql";
import { withinContinuationField } from "./withinContinuation.js";
import { RESOLVER_SYMBOL } from "./constants.js";

/**
 * For all resolvers, wraps with a guard to ensure we don't double execute
 * existing resolvers when we're within the context of a resolving
 * continuation field
 */
export function wrapExistingResolver<Source, Args, Context>(
  resolve: GraphQLFieldResolver<Source, Args, Context>
): GraphQLFieldResolver<Source, Args, Context> {
  return markWrapped((source, args, ctx, info) => {
    if (withinContinuationField(info)) {
      return defaultFieldResolver(source, args, ctx, info);
    }
    return resolve(source, args, ctx, info);
  });
}

/**
 * Wraps the isTypeOf on individual objects, if we know we're within the context of an
 * execution result, we just need to check whether the shape matches what we'd expect
 * for the __typename in the resolver
 */
export function wrapExistingIsTypeOf(
  typeName: string,
  isTypeOf: GraphQLIsTypeOfFn<any, any>
): GraphQLIsTypeOfFn<any, any> {
  return (source: any, context: any, info: GraphQLResolveInfo) => {
    if (withinContinuationField(info)) {
      return source.__typename === typeName;
    }
    return isTypeOf(source, context, info);
  };
}

/**
 * Wraps a field resolver with a guard, preventing it from executing
 * the resolve if it knows it's executing for a fulfilled result of a
 * continuation
 */
export function wrapExistingResolvers(
  obj: GraphQLObjectType | GraphQLInterfaceType
) {
  const fields = obj.getFields();
  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    if (shouldWrapResolve(fieldDef.resolve)) {
      fieldDef.resolve = wrapExistingResolver(fieldDef.resolve);
    }
  }
  if (isObjectType(obj) && typeof obj.isTypeOf === "function") {
    obj.isTypeOf = wrapExistingIsTypeOf(obj.name, obj.isTypeOf);
  }
}

export function wrapExistingResolveType(
  type: GraphQLInterfaceType | GraphQLUnionType
) {
  const resolveType = type.resolveType;
  if (
    typeof resolveType === "function" &&
    resolveType !== defaultTypeResolver
  ) {
    type.resolveType = (value, context, info, abstractType) => {
      if (withinContinuationField(info)) {
        return defaultTypeResolver(value, context, info, abstractType);
      }
      return resolveType(value, context, info, abstractType);
    };
  }
}

/**
 * Determine if we should wrap the resolver, we don't need to re-wrap
 * the defaultFieldResolver since it does what we want, and we don't
 * need to wrap any of the resolvers added by graphql-continuations
 */
export function shouldWrapResolve(
  resolve?: GraphQLFieldResolver<any, any>
): resolve is GraphQLFieldResolver<any, any> {
  return Boolean(
    resolve &&
      resolve !== defaultFieldResolver &&
      Object.getOwnPropertyDescriptor(resolve, RESOLVER_SYMBOL)?.value !== true
  );
}

/**
 * Marks the resolve as being wrapped by the continuation
 */
export function markWrapped<Source, Context, Args>(
  fn: GraphQLFieldResolver<Source, Context, Args>
): GraphQLFieldResolver<Source, Context, Args> {
  Object.defineProperty(fn, RESOLVER_SYMBOL, {
    value: true,
    enumerable: false,
  });
  return fn;
}
