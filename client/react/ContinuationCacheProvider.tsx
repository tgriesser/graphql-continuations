import { createContext, useReducer } from "react";
import type { ContinuationErrors } from "./useContinuation";

type ActionPayload = {
  continuationId: string;
  value: { data?: unknown; errors?: ContinuationErrors | null };
};
type State = Record<string, ActionPayload["value"]>;

interface ContinuationCacheShape {
  state: State;
  fetcher: typeof fetch;
  apiEndpoint: string;
  addResult: (obj: ActionPayload) => void;
}

export const ContinuationCache = createContext<ContinuationCacheShape | null>(
  null
);

export const ContinuationCacheProvider: React.FC<
  React.PropsWithChildren<{
    apiEndpoint?: string;
    initialCache?: Record<string, any>;
    fetcher?: typeof fetch;
  }>
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
      }}
    >
      {props.children}
    </ContinuationCache.Provider>
  );
};
