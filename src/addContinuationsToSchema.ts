import {
  GraphQLSchema,
  assertObjectType,
  extendSchema,
  getNamedType,
  isInterfaceType,
  isObjectType,
  parse,
} from "graphql";
import { ContinuationConfig } from "./types.js";
import { wrapExistingResolvers } from "./wrapExistingResolver.js";
import { makeContinuationFieldResolver } from "./makeContinuationFieldResolver.js";
import { makeResolveContinuationResolver } from "./makeResolveContinuationResolver.js";

/**
 * Given a GraphQL Schema, adds the continuation fields to any
 * types implementing the Node interface, as well as the Query type.
 *
 * This is meant to give a simple way to utilize continuations with a very
 * small footprint. If you are using a higher level framework like Nexus or Pothos,
 * it might be simpler to integrate directly with the schema builder, allowing for
 * better per-field configuration and
 */
export function addContinuationsToSchema<Context>(
  schema: GraphQLSchema,
  config: ContinuationConfig<Context>
) {
  const finalConfig = configWithDefaults(config);
  const nodeType = schema.getType("Node");
  const queryType = schema.getQueryType();
  const extendParts: string[] = [
    `type Continuation { continuationId: String! }`,
  ];

  if (!queryType) {
    throw new Error(
      `Cannot add graphql-continuations to a schema without a Query type`
    );
  }

  const withContinuation: string[] = [];

  if (
    isInterfaceType(nodeType) &&
    getNamedType(nodeType.getFields().id.type).name === "ID" &&
    queryType.getFields().node
  ) {
    const { objects } = schema.getImplementations(nodeType);
    for (const node of objects) {
      withContinuation.push(node.name);
      extendParts.push(`
        ${continuationUnion(node.name)}

        extend type ${node.name} {
          continuation(
            """The maximum amount of time to wait for the continuation selections to resolve"""
            waitMs: Int = ${config.defaultWaitMs ?? 10}
          ): ${node.name}Continuation!
        }
      `);
    }

    withContinuation.push(queryType.name);
    extendParts.push(`
      """
      Union of all types containing a continuation field, used as the result for Query.resolveContinuation
      """
      union AllContinuationTypes = ${objects.concat(queryType).join(" | ")}

      ${continuationUnion(queryType.name)}

      extend type ${queryType.name} {
        continuation(
          """The maximum amount of time to wait for the continuation selections to resolve"""
          waitMs: Int = ${config.defaultWaitMs ?? 10}
        ): ${queryType.name}Continuation!

        """Given a continuationId, resolves with the completed selection set for the continuation field"""
        resolveContinuation(continuationId: String!): AllContinuationTypes
      }
    `);
  }

  const schemaWithContinuations = extendSchema(
    schema,
    parse(extendParts.join("\n"))
  );

  const query = assertObjectType(schemaWithContinuations.getQueryType());
  for (const type of Object.values(schemaWithContinuations.getTypeMap())) {
    if (isObjectType(type) || isInterfaceType(type)) {
      if (type.name.startsWith("__")) {
        continue;
      }
      wrapExistingResolvers(type);
      const typeConfig = config.typeConfig?.[type.name] ?? {};
      if (withContinuation.includes(type.name) && typeConfig !== false) {
        type.getFields().continuation.resolve = makeContinuationFieldResolver(
          config,
          typeConfig
        );
      }
    }
  }

  query.getFields().resolveContinuation.resolve =
    makeResolveContinuationResolver(config);

  return schemaWithContinuations;
}

function continuationUnion(name: string) {
  return `
    """Union returned for the continuation field on the ${name} type"""
    union ${name}Continuation = Continuation | ${name}
  `;
}

function configWithDefaults(config: ContinuationConfig) {
  return {
    ...config,
  };
}
