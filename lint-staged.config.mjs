export default {
  "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}": [
    "bun --no-env-file lint --no-script",
    "bun --no-env-file fmt",
  ],
  "*.{json,jsonc,css,html,md,yml,yaml,toml}": ["bun --no-env-file fmt"],
};
