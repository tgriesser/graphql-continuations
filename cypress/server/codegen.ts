import type { CodegenConfig } from "@graphql-codegen/cli";
import fs from "fs";

try {
  fs.mkdirSync("./codegen");
} catch {}

const config: CodegenConfig = {
  overwrite: true,
  schema: "http://localhost:3001/graphql/memory",
  documents: "app/**/*.tsx",
  generates: {
    "./codegen/": {
      preset: "client",
      plugins: [],
    },
  },
  config: {
    useTypeImports: true,
  },
};

export default config;
