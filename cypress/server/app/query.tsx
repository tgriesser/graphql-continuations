import { print } from "graphql";
import {
  ContinuationCacheProvider,
  useContinuationQuery,
} from "../../../client/react";
import {
  ContinuationDataFragment,
  ResolveContinuationDataDocument,
} from "../codegen/graphql";
import { App } from "./App";

const QueryProfileData: React.FC<{
  data:
    | { __typename: "Continuation"; continuationId: string }
    | ContinuationDataFragment;
}> = ({ data }) => {
  const d = useContinuationQuery(data, {
    query: print(ResolveContinuationDataDocument),
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

export const QueryExample = () => {
  return (
    <ContinuationCacheProvider apiEndpoint="/graphql/memory">
      <App ProfileDataComponent={QueryProfileData} />
    </ContinuationCacheProvider>
  );
};
