import { defineConfig } from "cypress";
import { makeServer } from "./cypress/server/makeServer";
import type { AddressInfo } from "net";

export default defineConfig({
  e2e: {
    async setupNodeEvents(on, config) {
      const srv = await makeServer();
      return {
        ...config,
        baseUrl: `http://localhost:${(srv.address() as AddressInfo).port}`,
      };
    },
  },
});
