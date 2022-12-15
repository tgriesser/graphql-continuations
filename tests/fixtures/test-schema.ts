import {
  execute,
  GraphQLFieldConfig,
  GraphQLID,
  GraphQLInt,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";

import { v4 } from "uuid";

import { continuationField, resolveContinuationField } from "../../src";

const inMemoryCompletions: Record<
  string,
  Promise<ReturnType<typeof execute>>
> = {};

function onContinuation(result) {
  const continuationId = v4();
  inMemoryCompletions[continuationId] = Promise.resolve(result).then(
    (result) => result.data
  );
  return continuationId;
}

const errorField = {
  type: GraphQLString,
  resolve: (source) => {
    return new Error("Error Field Test");
  },
};

const testArg = {
  type: GraphQLInt,
  args: {
    testArg: {
      type: new GraphQLNonNull(GraphQLInt),
    },
  },
  resolve: (source, args) => {
    return args.testArg;
  },
};

const idField: GraphQLFieldConfig<any, any> = {
  type: new GraphQLNonNull(GraphQLID),
  resolve: (source, args, ctx, info) => {
    return `${info.parentType.name}:${source.id}`;
  },
};

const Node = new GraphQLInterfaceType({
  name: "Node",
  fields: {
    id: idField,
  },
});

const UserRemoteProfile = new GraphQLObjectType({
  name: "UserRemoteProfile",
  fields: {
    data: {
      type: GraphQLString,
    },
    errorField,
    testArg,
  },
});

const User = new GraphQLObjectType({
  name: "User",
  interfaces: () => [Node],
  fields: () => ({
    id: idField,
    name: { type: GraphQLString },
    remoteProfile: {
      type: UserRemoteProfile,
      description: "Loads remote profile, takes 10 ms to resolve",
      resolve: () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: "Remote Profile Data!" });
          }, 10);
        });
      },
    },
    friends: {
      type: new GraphQLList(User),
    },
    continuation: continuationField({
      type: User,
      waitMs: 5,
      onContinuation,
    }),
  }),
});

const RemoteStats = new GraphQLObjectType({
  name: "RemoteStats",
  fields: {
    data: {
      type: GraphQLString,
    },
    testArg,
    errorField,
  },
});

const Query = new GraphQLObjectType({
  name: "Query",
  fields: () => ({
    node: {
      type: Node,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
        },
      },
      resolve: (source, args, ctx, info) => {
        const [__typename, id] = args.id.split(":");
        return { __typename, id };
      },
    },
    viewer: {
      type: User,
      resolve: () => ({ id: 1, name: "Example User" }),
    },
    remoteStats: {
      type: RemoteStats,
      description: "Loads remote stats, takes 15 ms to resolve",
      resolve: () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: "Remote Stats Data!" });
          }, 15);
        });
      },
    },
    continuation: continuationField({
      type: Query,
      onContinuation,
    }),
    resolveContinuation: resolveContinuationField({
      types: () => [User, Query],
      resolveContinuation(continuationId) {
        if (!inMemoryCompletions[continuationId]) {
          throw new Error("Invalid continuationId");
        }
        return inMemoryCompletions[continuationId];
      },
    }),
  }),
});

export const schema = new GraphQLSchema({
  query: Query,
});
