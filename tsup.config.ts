import { defineConfig } from "tsup";

// Dual-build to ESM + CJS so both `import` and `require` callers
// resolve cleanly via the package.json `exports` conditions.

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  splitting: false,
});
