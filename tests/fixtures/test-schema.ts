import {
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

const errorField = {
  type: GraphQLString,
  resolve: () => {
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
  resolve: (_source: any, args: { testArg: number }) => {
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

class UserShape {
  constructor(readonly id: number, readonly name: string) {}
}

const User: GraphQLObjectType = new GraphQLObjectType({
  name: "User",
  interfaces: () => [Node],
  isTypeOf: (o) => o instanceof UserShape,
  fields: () => ({
    id: idField,
    name: { type: GraphQLString },
    remoteProfile: {
      type: UserRemoteProfile,
      description: "Loads remote profile, with simulated delay",
      args: {
        simulateDelayMin: {
          type: new GraphQLNonNull(GraphQLInt),
          defaultValue: 100,
        },
        simulateDelayMax: {
          type: new GraphQLNonNull(GraphQLInt),
          defaultValue: 2000,
        },
      },
      resolve: (source, args) => {
        const toWait = Math.max(
          args.simulateDelayMin,
          Math.random() * args.simulateDelayMax
        );
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: "Remote Profile Data!" });
          }, toWait);
        });
      },
    },
    friends: {
      type: new GraphQLList(User),
    },
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
        if (__typename === "User") {
          return new UserShape(Number(id), "Example User");
        }
        return { __typename, id };
      },
    },
    viewer: {
      type: User,
      resolve: () => new UserShape(1, "Example User"),
    },
    userList: {
      type: new GraphQLList(User),
      resolve: () =>
        new Array(10)
          .fill(1)
          .map((_, idx) => new UserShape(idx, `Example User ${idx}`)),
    },
    remoteStats: {
      type: RemoteStats,
      description: "Loads remote stats, with simulated delay",
      args: {
        simulateDelay: {
          type: GraphQLInt,
          defaultValue: 100,
        },
      },
      resolve: (source, args) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: "Remote Stats Data!" });
          }, args.simulateDelay);
        });
      },
    },
  }),
});

export const testSchema = new GraphQLSchema({
  query: Query,
});
