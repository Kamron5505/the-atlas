import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  // Core is a private workspace package: inline it into the published bundle.
  noExternal: ["@the-atlas/core"],
  banner: { js: "#!/usr/bin/env node" },
});
