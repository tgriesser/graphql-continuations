import { describe, it } from "vitest";
import path from "path";
import fs from "fs";

import { addContinuationsToSchema, memoryAdapter } from "../src";
import { testSchema } from "./fixtures/test-schema";
import { printSchema } from "graphql";

describe("addContinuationsToSchema", () => {
  it("adds continuation fields to the schema", () => {
    const newSchema = addContinuationsToSchema(testSchema, {
      adapter: memoryAdapter(),
    });

    fs.writeFileSync(
      path.join(
        __dirname,
        "fixtures/test-schema-addContinuationsToSchema.graphql"
      ),
      printSchema(newSchema) + "\n"
    );
  });

  it("adds continuation fields to the schema, with subscriptions", () => {
    const newSchema = addContinuationsToSchema(testSchema, {
      adapter: memoryAdapter(),
      addSubscriptionField: true,
    });

    fs.writeFileSync(
      path.join(
        __dirname,
        "fixtures/test-schema-addContinuationsToSchemaWithSubscription.graphql"
      ),
      printSchema(newSchema) + "\n"
    );
  });
});
