import { print } from "graphql";
import {
  ContinuationCacheProvider,
  useContinuationSubscription,
} from "../../../client/react";
import {
  ContinuationDataFragment,
  SubscribeContinuationDataDocument,
} from "../codegen/graphql";
import { App } from "./App";
import { createClient } from "graphql-sse";

const SSEProfileData: React.FC<{
  data:
    | { __typename: "Continuation"; continuationId: string }
    | ContinuationDataFragment;
}> = ({ data }) => {
  const d = useContinuationSubscription(data, {
    query: print(SubscribeContinuationDataDocument),
  });
  if (d.loading) {
    return (
      <span data-cy="loading" style={{ color: "red" }}>
        Loading...
      </span>
    );
  }
  return (
    <span data-cy="loaded" style={{ color: "green" }}>
      {d.data?.remoteProfile?.data}
    </span>
  );
};

export const SSEExample = () => {
  const sseClient = createClient({
    singleConnection: true,
    url: `${window.location.origin}/graphql/memory/sse`,
  });
  return (
    <ContinuationCacheProvider
      apiEndpoint="/graphql/memory"
      subscriptionClient={sseClient}
    >
      <App ProfileDataComponent={SSEProfileData} />
    </ContinuationCacheProvider>
  );
};
