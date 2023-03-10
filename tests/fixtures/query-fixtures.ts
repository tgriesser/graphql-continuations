import gql from "graphql-tag";

const CONTINUATION_FRAG = gql`
  fragment ContinuationFrag on Continuation {
    continuationId
  }
`;
const QUERY_FRAG = gql`
  fragment QueryFrag on Query {
    remoteStats {
      data
      errorField @include(if: $withError)
    }
  }
`;
const NODE_FRAG = gql`
  fragment NodeFrag on User {
    remoteProfile {
      data
      errorField @include(if: $withError)
    }
  }
`;

export const RESOLVE_CONTINUATION_FOR_QUERY = gql`
  query SomeQueryWithContinuation_Resolve(
    $continuationId: String!
    $withError: Boolean = false
  ) {
    resolveContinuation(continuationId: $continuationId) {
      ...QueryFrag
    }
  }
  ${QUERY_FRAG}
`;

//
export const CONTINUATION_FOR_QUERY = gql`
  query SomeQueryWithContinuation($withError: Boolean = false, $waitMs: Int) {
    viewer {
      id
      name
    }
    continuation(waitMs: $waitMs) {
      __typename
      ...ContinuationFrag
      ...QueryFrag
    }
  }
  ${CONTINUATION_FRAG}
  ${QUERY_FRAG}
`;

//
export const CONTINUATION_FOR_QUERY_WTIHOUT_TYPENAME = gql`
  query SomeQueryWithContinuation($withError: Boolean = false, $waitMs: Int) {
    viewer {
      id
      name
    }
    continuation(waitMs: $waitMs) {
      ...ContinuationFrag
      ...QueryFrag
    }
  }
  ${CONTINUATION_FRAG}
  ${QUERY_FRAG}
`;

//
export const CONTINUATION_FOR_NODE = gql`
  query ContinuationForNode($withError: Boolean = false, $waitMs: Int) {
    viewer {
      id
      name
      continuation(waitMs: $waitMs) {
        __typename
        ...ContinuationFrag
        ... on User {
          remoteProfile(simulateDelayMax: 50) {
            data
            errorField @include(if: $withError)
          }
        }
      }
    }
  }
  ${CONTINUATION_FRAG}
`;

//
export const RESOLVE_CONTINUATION_FOR_NODE = gql`
  query SomeQueryWithContinuation_ResolveNode(
    $continuationId: String!
    $withError: Boolean = false
    $waitMs: Int
  ) {
    resolveContinuation(continuationId: $continuationId, waitMs: $waitMs) {
      __typename
      ...NodeFrag
    }
  }
  ${NODE_FRAG}
`;

//
export const CONTINUATION_FOR_QUERY_WITH_FRAGMENTS = gql`
  fragment ContinuationFields on Continuation {
    continuationId
  }

  fragment QueryFields on Query {
    remoteStats {
      data
      testArg(testArg: $testArg)
    }
  }

  query SomeQueryWithContinuation($testArg: Int!) {
    viewer {
      id
      name
    }
    continuation {
      ...ContinuationFields
      ...QueryFields
    }
  }
`;

//
export const NESTED_CONTINUATION_WITH_FRAGMENTS_AND_ARG = gql`
  fragment ContinuationFields on Continuation {
    continuationId
  }

  fragment UserFields on User {
    remoteProfile {
      testArg(testArg: $testArg)
    }
  }

  fragment QueryFields on Query {
    remoteStats {
      data
    }
    viewer {
      continuation {
        ...ContinuationFields
        ...UserFields
      }
    }
  }

  query SomeNodeQueryWithNestedContinuations($testArg: Int!) {
    viewer {
      id
      name
    }
    continuation {
      ...ContinuationFields
      ...QueryFields
    }
  }
`;
