import { useResource } from "state-resource";
import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import { useState } from "react";
// import worker2 from "state-resource/worker";

// console.log(worker2);



if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  const worker = new Worker(new URL('state-resource/worker', import.meta.url))
  console.log("Web Workers are supported in this environment.");
  worker.addEventListener("message", (e) => {
    console.log('data1');
    console.log(e.data);
  });
  worker.addEventListener("message", (e) => {
    console.log('data2');
    console.log(e.data);
  });
  // worker.onmessage = (e) => {
    
  //   console.log(e.data);
  //   // setWorkerResult(e.data); // Update state with worker data
  // };
} else {
  console.log("Web Workers are not supported in this environment.");
}

// const worker = new Worker("state-resource/worker");

export function Welcome() {
  const { state } = useResource()
  const [count, setCount] = useState(0);



  return (
    <main className="items-center justify-center pt-16 p-4">
      <h1>hello there</h1>
      <p>{state.message}</p>
      <button>click me</button>
    </main>
  );
}
