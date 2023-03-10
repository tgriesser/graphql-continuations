import { createContext, useReducer } from "react";
import type {
  ContinuationCacheProviderProps,
  ContinuationErrors,
  FormatRequestInit,
  SubscriptionClient,
} from "./common";

type State = Record<string, ActionPayload["value"]>;
type ActionPayload = {
  continuationId: string;
  value: {
    data?: unknown;
    errors?: ContinuationErrors | null;
  };
};

interface ContinuationCacheShape {
  state: State;
  fetcher: typeof fetch;
  apiEndpoint: string;
  addResult: (obj: ActionPayload) => void;
  formatRequestInit: FormatRequestInit;
  subscriptionClient?: SubscriptionClient;
}

export const ContinuationCache = createContext<ContinuationCacheShape | null>(
  null
);

export const ContinuationCacheProvider: React.FC<
  React.PropsWithChildren<ContinuationCacheProviderProps>
> = (props) => {
  const [state, addResult] = useReducer(
    (state: State, action: ActionPayload): State => {
      return {
        ...state,
        [action.continuationId]: action.value,
      };
    },
    props.initialCache ?? {}
  );
  return (
    <ContinuationCache.Provider
      value={{
        state,
        addResult,
        fetcher: props.fetcher ?? fetch,
        apiEndpoint: props.apiEndpoint ?? "/graphql",
        subscriptionClient: props.subscriptionClient,
        formatRequestInit: props.formatRequestInit ?? ((i: RequestInit) => i),
      }}
    >
      {props.children}
    </ContinuationCache.Provider>
  );
};
