import { useQuery } from "urql";
import {
  ContinuationDataFragment,
  UserListQueryDocument,
} from "../codegen/graphql";

function nonNullFilter<F>(val: F | null | undefined): val is F {
  return Boolean(val);
}

export function App(props: {
  ProfileDataComponent: React.ElementType<{
    data:
      | { __typename: "Continuation"; continuationId: string }
      | ContinuationDataFragment;
  }>;
}) {
  const [data] = useQuery({ query: UserListQueryDocument });
  return (
    <div>
      <h1>Hello World</h1>
      <ul>
        {data.data?.userList?.filter(nonNullFilter).map((d) => (
          <li key={d.id}>
            {d.name}: <props.ProfileDataComponent data={d.continuation} />
          </li>
        ))}
      </ul>
    </div>
  );
}
