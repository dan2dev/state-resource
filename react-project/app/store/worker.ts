if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  const worker = new Worker(new URL("state-resource/worker", import.meta.url));
  console.log("Web Workers are supported in this environment.");
} else {
  console.log("Web Workers are not supported in this environment.");
}
