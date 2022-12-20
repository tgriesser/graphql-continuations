## GraphQL Continuations

A WIP idea around a simpler approach to the problem solved by `@defer`. Adds a continuation field to the `Query` and any types implementing the Relay `Node` interface. Resolves the selection set underneath the query and executes.

```
npm i graphql-continuations
```

### Try it out:

```ts
import { addContinuationsToSchema, memoryAdapter } from "graphql-continuations";

const schema = addContinuationsToSchema(myExistingSchema, {
  adapter: memoryAdapter(), // redisAdapter() or custom adapter intended for production usage
});
```

### Overview / Summary:

https://htmlpreview.github.io/?https://github.com/tgriesser/graphql-continuations/blob/main/docs/index.html

```graphql
fragment ExpensiveUserData on User {
  id
  remoteProfile {
    data
  }
}

query QueryWithNestedData {
  viewer {
    id
    name
    continuation(waitMs: 100) {
      __typename
      ... on Continuation {
        continuationId
      }
      ...ExpensiveUserData
    }
  }
}

query ResolveUserData($cid: String!) {
  resolveContinuation(continuationId: $cid) {
    ...ExpensiveUserData
  }
}
```

### TODO:

Proper field level configuration

Feedback welcome!

### License

MIT
