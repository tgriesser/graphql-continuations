import gql from "graphql-tag";

gql`
  fragment ContinuationData on User {
    remoteProfile {
      data
    }
  }
`;

gql`
  query UserListQuery {
    userList {
      id
      name
      continuation {
        __typename
        ... on Continuation {
          continuationId
        }
        ...ContinuationData
      }
    }
  }
`;

gql`
  query ResolveContinuationData($continuationId: String!) {
    resolveContinuation(continuationId: $continuationId) {
      ...ContinuationData
    }
  }
`;

gql`
  subscription SubscribeContinuationData($continuationId: String!) {
    subscribeContinuation(continuationId: $continuationId) {
      ...ContinuationData
    }
  }
`;

gql`
  subscription SubscribeContinuationDataList($continuationIds: [String!]!) {
    subscribeContinuationList(continuationIds: $continuationIds) {
      continuationId
      value {
        ...ContinuationData
      }
    }
  }
`;
