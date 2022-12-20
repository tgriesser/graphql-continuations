## graphql-continuations/client

Contains reference adapters for popular frameworks:

```tsx
import {
  useContinuation,
  ContinuationCacheProvider,
} from "graphql-continuations/react";

function App() {
  return (
    <ContinuationCacheProvider>
      <ComponentWithUseContinuation />
    </ContinuationCacheProvider>
  );
}
```
