# GraphQL Continuations

This document aims to define an additional approach of pre-fetching and loading portions of a GraphQL query taking longer than the client deems an acceptable amount of time, with similar intentions as the `@defer` directive.

It does this with a pattern of adding a `continuation` field to an Object type, resolving with a Union containing either the result selection of fields for the parent type, or a unique identifier used by the the client to fetch and resolve the completed selection set at some point in the future after the initial response is returned.

**Goals:**

1. Modeled in pure GraphQL Object & Union types, no directives or schema extensions
2. Well suited for simple server side rendering (SSR), or other means of state pre-hydration
3. Keep the GraphQL execution response stateless, externalizing state for simpler client consumption
4. Allows the client to define acceptable wait times per continuation, to return full responses immediately if available, eliminating unnecessary loading states caused by incomplete results

Note:
A GraphQL Continuation relies on a server implementation with an runtime equivalent to JavaScript's `Promise.race`

## Overview

### Example Scenario

Let's start with the following example query:

```graphql
query PostPage($id: ID!) {
  # 2-9ms resolve execution
  viewer {
    id
    name
  }
  # 7-10ms resolve execution
  post(id: $id) {
    id
    name
    # 100-2000ms resolve execution
    statisticsService {
      likes
      analytics
    }
  }
}
```

In this example, resolving the source type for `viewer` & `post` typically takes < 10ms, while the `statisticsService` takes somewhere between 100ms and 2 seconds, depending on network & server conditions. This means in some cases, it will take up multiple seconds to resolve the GraphQL response.

Assuming no changes to improve the underlying `statisticsService`, there are a few options we have for providing a better user experience for the client:

**Option #1: Multiple Queries**

```graphql
query PostPage($id: ID!) {
  viewer {
    id
    name
  }
  post(id: $id) {
    id
    name
  }
}

query PostPageStats($id: ID!) {
  post(id: $id) {
    id
    statisticsService {
      likes
      views
    }
  }
}
```

**Option #2: @defer Directive**

```graphql
query PostPage($id: ID!) {
  viewer {
    id
    name
  }
  post(id: $id) {
    id
    name
    ... on Post @defer {
      statisticsService {
        likes
        views
      }
    }
  }
}
```

**Option #3: The continuation field**

```graphql
query PostPage($id: ID!) {
  viewer {
    id
    name
  }
  post(id: $id) {
    id
    name
    continuation(waitMs: 200) {
      __typename
      ... on Continuation {
        continuationId
      }
      ... on Post {
        id
        statisticsService {
          likes
          views
        }
      }
    }
  }
}
```

In this third example, if the result of the fields nested beneath `continuation` resolves in under 200ms, the response will resolve immediately with the fields nested beneath the `continuation` field:

```json
{
  "viewer": { "id": "Vmlld2VyOjE=", "name": "User" },
  "post": {
    "id": "UG9zdDox",
    "name": "Continuation Spec",
    "continuation": {
      "__typename": "Post",
      "id": "UG9zdDox",
      "statisticsService": {
        "likes": 1000,
        "views": 20000
      }
    }
  }
}
```

Otherwise the field will resolve in 200ms with a Continuation type, including `continuationId`, a server provided identifier used by the client to fetch the eventual resolved result fields:

```json
{
  "viewer": { "id": "Vmlld2VyOjE=", "name": "User" },
  "post": {
    "id": "UG9zdDox",
    "name": "Continuation Spec",
    "continuation": {
      "__typename": "Continuation",
      "continuationId": "78bcc330-5747-40a3-81b3-980b43369dba"
    }
  }
}
```

### Performance Visualization

The charts are meant to portray a rough, back of the napkin visualization of the time sequence of different operations:

![Visualized](./charts.svg)

## Example Usage

Note:
This follows up on the Overview section above, please read that first for better context about what is happening here:

```graphql
fragment PostContinuationResult on Post {
  __typename
  id
  statisticsService {
    likes
    views
  }
}

query PostPage($id: ID!) {
  viewer {
    id
    name
  }
  post {
    id
    name
    continuation(waitMs: 200) {
      __typename
      ... on Continuation {
        continuationId
      }
      ...PostContinuationResult
    }
  }
}

query ResolvePostPageContinuation($continuationId: String!) {
  resolveContinuation(continuationId: $continuationId) {
    ...PostContinuationResult
  }
}
```

Note:
The below is meant as pseudocode, with `useQuery` representing a generic React hook from a Client like Urql, Apollo, React Query, or a vanilla fetch call.

```jsx
function PostComponent({ id }) {
  const { isLoading, data } = useQuery("PostPage", { id });
  if (isLoading) return null;
  return (
    <div>
      <HeaderComponent viewer={data.viewer} />
      <PostComponent post={data.post} />
      <PostStatsComponent post={data.post} />
    </div>
  );
}

function PostStatsComponent(post) {
  const { isLoading, data } = useContinuation(
    "ResolvePostPageContinuation",
    post.continuation
  );
  if (isLoading) return <Spinner />;
  return <div>{JSON.stringify(data, null, 2)}</div>;
}

// Again, pseduocode, giving an example of how a useContinuation hook might work in a client
// to refetch:
function useContinuation(operation, obj) {
  const [isLoading, setIsLoading] = useState(obj.__typename !== "Continuation");
  const [continuationData, setContinuationData] = useState(
    obj.__typename !== "Continuation" ? obj : null
  );
  const [error, setError] = useState(null);
  useEffect(() => {
    if (obj.__typename === "Continuation") {
      return fetchOperation(operation, {
        continuationId: obj.continuationId,
      }).subscribe({
        next(data) {
          setIsLoading;
          setContinuation(data);
        },
        error(e) {
          setError(e);
        },
      });
    }
  }, []);
  return { isLoading, data: continuationData, error };
}
```

## Implementation

A continuation field relies on being able to execute the `selectionSet` beneath the continuation selection as a root Query.

### On the Query type

Taking the following query:

```graphql
query RootLevelQuery {
  viewer {
    id
    name
  }
  slowRemoteQueryField {
    data
  }
}
```

Adding a `continuation` field to early return before the completion of `slowRemoteQueryField`

```graphql
query RootLevelQuery {
  viewer {
    id
    name
  }
  continuation {
    __typename
    ... on Continuation {
      continuationId
    }
    ... on Query {
      slowRemoteQueryField {
        data
      }
    }
  }
}
```

The selection set below the `Query` fragment is collected and re-executed as a separate query:

```graphql
query ExecutedContinuationQuery {
  slowRemoteQueryField {
    data
  }
}
```

and the result is associated with the identifier returned to the client as `continuationId`.

### On the Node Type

Schemas implementing the Relay specification provide a root level "node" field, making it straightforward to implement a `continuation` field:

```graphql
fragment PostContinuationResult on Post {
  __typename
  id
  statisticsService {
    likes
    views
  }
}

query PostPage($id: ID!) {
  viewer {
    id
    name
  }
  post {
    id
    name
    continuation(waitMs: 200) {
      __typename
      ... on Continuation {
        continuationId
      }
      ...PostContinuationResult
    }
  }
}
```

The executed query associated with `continuationId`:

```graphql
query ExcecutedContinuationQuery($id: ID!) {
  node(id: $id) {
    ...PostContinuationResult
  }
}
```

### Additional Considerations

Object types other than Query & types implementing the Node interface may add a continuation field, however the applications will be responsible for defining the query & variables used to

## Continuation Field

A Continuation field may only be defined on an Object type, and should contain an argument, `waitMs`. This argument _may_ have a default value, which can different for each implementation of the `continuation` field.

```graphql
type Query {
  continuation(waitMs: Int = 200): QueryContinuation
}
```

It _may_ contain additional arguments, to adjust the field's resolve behavior

A continuation field **must** and return a union type containing the Union type of the field's parent type, and the [Continuation type](#sec-Continuation-Type).

```graphql
union QueryContinuation = Continuation | Query
```

The type of a continuation field may also be non-null

```graphql
type Query {
  continuation(waitMs: Int! = 200): QueryContinuation!
}
```

There is no restriction on the name of the continuation type, however a common pattern is to concat the parent type + Continuation

## Continuation Type

The Continuation type **must** be an Object type containing a single field, `continuationId`.

```graphql
type Continuation {
  continuationId: String!
}
```

It may contain additional fields, for example if `resolveContinuation` were to returns an additional Continuation with progress information:

```graphql
type Continuation {
  continuationId: String!
  progressPercentage: Int
}
```

A Continuation type is always consumed by the client as a member of a Union type, most commonly alongside a `Query` or `Node` type.

The String returned for the `continuationId` to represent the eventual completion is left to the application. See [storing & resolving continuation state](#sec-Storing-Resolving-Continuation-State) for an example implementation

## resolveContinuation Query Field

A single top-level field must be defined to resolve the result of a continuation. It takes a single argument, `continuationId` and returns a Union type, representing all of the possible continuations that can be represented in the schema

```graphql
type Query {
  resolveContinuation(continuationId: String!): AllContinuationTypes
}
```

It must return a union of all of the possible types containing a `continuation` field, and any

## Continuation Union Types

The type of a continuation field is the union of the Continuation type and the containing parent type

QueryContinuation: Query | Continuation

UserContinuation: User | Continuation

The type of the `resolveContinuation` field is the union of all types in the schema with a continuation field

ResolveContinuationResult: Query | User

It may optionally include the Continuation type in the union, allowing resolving with a further continuation

ResolveContinuationResult: Query | User | Continuation

## Multiple & Nested Continuation Fields

Continuation fields follow the same rules as other GraphQL fields, meaning they can be aliased

```graphql
fragment ContinuationFragment on Continuation {
  continuationId
}

query MultipleContinuations {
  viewer {
    id
    name
  }
  statsInfo: continuation(waitMs: 100) {
    __typename
    ...ContinuationFragment
    ...StatsPanel
  }
  offScreenData: continuation(waitMs: 50) {
    __typename
    ...ContinuationFragment
    ...FooterInfo
    ...LowerSectionRecommendations
  }
}
```

It is likewise possible to nest continuations below continuations

```graphql
fragment NestedContinuationExample on QueryContinuation {
  ...ContinuationFragment
  slowRecommendationStats {
    data
  }
}

fragment LowerSectionRecommendations on Query {
  recommendations(first: 10) {
    nodes {
      title
      message
    }
  }
  stats: continuation(waitMs: 500) {
    ...NestedContinuationExample
  }
}
```

## Storing & Resolving Continuation State

This specification intentionally does not define the behavior around the formation of `continuationId`, whether they can be used one or multiple times, or the expiry of state behind these IDs.

### Example Using Redis:

TODO: Example for Redis

## Use in Client Libraries

One consideration for clients is the merging of schemas when utilizing document caching. It would be useful to update the state of the original document returning the continuation
