## GraphQL Continuations

A WIP idea around a simpler approach to the problem solved by `@defer`

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

TODO:

Proper field level configuration

Feedback welcome!
