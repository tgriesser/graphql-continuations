## GraphQL Continuations

A WIP idea around a simpler approach to the problem solved by `@defer`

http://htmlpreview.github.io/?https://github.com/tgriesser/graphql-continuations/blob/main/docs/index.html

```graphql
query QueryWithNestedData {
  viewer {
    id
    name
    continuation(waitMs: 100) {
      __typename
      ... on Continuation {
        continuationId
      }
      ... on User {
        id
        remoteProfile {
          data
        }
      }
    }
  }
}
```

Feedback welcome!
