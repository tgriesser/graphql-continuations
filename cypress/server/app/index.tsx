import { createRoot } from "react-dom/client";
import { createClient, Provider } from "urql";
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router-dom";
import { QueryExample } from "./query";
import { WSExample } from "./ws";
import { SSEExample } from "./sse";

const memoryClient = createClient({
  url: "/graphql/memory",
});

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="query" element={<QueryExample />} />
      <Route path="ws" element={<WSExample />} />
      <Route path="sse" element={<SSEExample />} />
      <Route index element={<Navigate to="query" />} />
    </Route>
  )
);

createRoot(document.getElementById("root")!).render(
  <Provider value={memoryClient}>
    <RouterProvider router={router} />
  </Provider>
);
