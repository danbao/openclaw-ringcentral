import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { ringcentralDock, ringcentralPlugin } from "./src/channel.js";
import { setRingCentralRuntime } from "./src/runtime.js";

const plugin = {
  id: "ringcentral",
  name: "RingCentral",
  description: "Moltbot RingCentral Team Messaging channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    setRingCentralRuntime(api.runtime);
    api.registerChannel({ plugin: ringcentralPlugin, dock: ringcentralDock });
    // WebSocket mode: no HTTP handler needed
  },
};

export default plugin;
