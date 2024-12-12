import { useResource } from "state-resource";
import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";

export function Welcome() {
  const { state } = useResource()
  return (
    <main className="items-center justify-center pt-16 p-4">
      <h1>hello there</h1>
      <p>{state.message}</p>
    </main>
  );
}
