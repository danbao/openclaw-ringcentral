import type { PluginRuntime } from "clawdbot/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setRingCentralRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getRingCentralRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("RingCentral runtime not initialized");
  }
  return runtime;
}
