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
import { createClient } from "graphql-ws";

const WSProfileData: React.FC<{
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

export const WSExample = () => {
  const wsClient = createClient({
    url: `${window.location.origin.replace("http", "ws")}/graphql/memory`,
  });
  return (
    <ContinuationCacheProvider
      apiEndpoint="/graphql/memory"
      subscriptionClient={wsClient}
    >
      <App ProfileDataComponent={WSProfileData} />
    </ContinuationCacheProvider>
  );
};
