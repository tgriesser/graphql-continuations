import {
  GraphQLSchema,
  assertObjectType,
  extendSchema,
  getNamedType,
  isAbstractType,
  isInterfaceType,
  isObjectType,
  parse,
} from "graphql";
import type { ContinuationConfig } from "./types.js";
import {
  wrapExistingResolvers,
  wrapExistingResolveType,
} from "./wrapExistingResolver.js";
import { makeContinuationFieldResolver } from "./makeContinuationFieldResolver.js";
import { makeResolveContinuationResolver } from "./makeResolveContinuationResolver.js";
import {
  makeContinuationFieldSubscribe,
  makeContinuationListFieldSubscribe,
} from "./makeContinuationFieldSubscribe.js";
import { interleaveErrors } from "./errorHandling.js";
import { setWithinContinuation } from "./withinContinuation.js";

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

  if (config.addSubscriptionField) {
    const subscriptionType = schema.getSubscriptionType();
    extendParts.push(`
      """
      Container type for the continuation being resolved, including the continuationId
      so we know which continuation is resolved when the value is sent
      """
      type ContinuationResolvedEvent {
        continuationId: String!
        value: AllContinuationTypes
      }
    `);
    if (!subscriptionType) {
      let subscriptionName;

      // It's possible, though inconvenient, to have an existing Object Type named
      // "Subscription" we don't want to collide if that's the case
      const subscriptionNamedType = schema.getType("Subscription");
      if (!subscriptionNamedType) {
        subscriptionName = "Subscription";
      } else {
        subscriptionName = "SubscriptionSchemaType";
      }

      extendParts.push(`
        ${addSubscriptionType(subscriptionName, false)}

        extend schema {
          subscription: ${subscriptionName}
        }
      `);
    } else {
      extendParts.push(addSubscriptionType(subscriptionType.name));
    }
  }

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
            waitMs: Int = ${finalConfig.defaultWaitMs ?? 10}
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
    if (isAbstractType(type)) {
      wrapExistingResolveType(type);
    }
  }

  query.getFields().resolveContinuation.resolve =
    makeResolveContinuationResolver(config);

  if (finalConfig.addSubscriptionField) {
    const subscription = assertObjectType(
      schemaWithContinuations.getSubscriptionType()
    );

    subscription.getFields().subscribeContinuation.subscribe =
      makeContinuationFieldSubscribe(config);

    subscription.getFields().subscribeContinuation.resolve = (
      source,
      args,
      ctx,
      info
    ) => {
      setWithinContinuation(info);
      return interleaveErrors(source);
    };

    subscription.getFields().subscribeContinuationList.subscribe =
      makeContinuationListFieldSubscribe(config);

    subscription.getFields().subscribeContinuationList.resolve = (
      source,
      args,
      ctx,
      info
    ) => {
      setWithinContinuation(info);
      return interleaveErrors(source);
    };
  }

  return schemaWithContinuations;
}

function continuationUnion(name: string) {
  return `
    """
    Union returned for the continuation field on the ${name} type
    """
    union ${name}Continuation = Continuation | ${name}
  `;
}

function addSubscriptionType(subscriptionName: string, extend = true) {
  return `
    ${extend ? "extend" : ""} type ${subscriptionName} {
      """
      Subscription, emitting an event when the continuation identifier is resolved
      """
      subscribeContinuation(continuationId: String!): AllContinuationTypes
      
      """
      Subscription, emitting an event each time one of the continuation identifiers are resolved
      """
      subscribeContinuationList(continuationIds: [String!]!): ContinuationResolvedEvent
    }
  `;
}

function configWithDefaults(config: ContinuationConfig) {
  return {
    ...config,
  };
}
