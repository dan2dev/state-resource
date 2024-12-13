export function useResource<T>() {
  const state = { message: "initial project" };
  return { state };
}

export function store<T>(config: any) {
  return () => {
    return {
      state: { message: "initial project" },
    };
  };
}

if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  const worker = new Worker(new URL("state-resource/worker", import.meta.url));
  console.log("Web Workers are supported in this environment.");
} else {
  console.log("Web Workers are not supported in this environment.");
}
