export { addContinuationsToSchema } from "./addContinuationsToSchema.js";
export { makeContinuationFieldResolver } from "./makeContinuationFieldResolver.js";
export { makeContinuationQueryDocument } from "./makeContinuationQueryDocument.js";
export { wrapExistingResolver } from "./wrapExistingResolver.js";

import { BaseAdapter } from "./adapters/BaseAdapter.js";
import { memoryAdapter } from "./adapters/MemoryAdapter.js";
import { redisAdapter } from "./adapters/RedisAdapter.js";

import type { ContinuationRedisAdapterConfig } from "./adapters/RedisAdapter.js";

export type { ContinuationRedisAdapterConfig };

export { BaseAdapter, memoryAdapter, redisAdapter };

export type {
  ContinuationConfig,
  ContinuationFieldOptions as ConfigurationTypeConfig,
} from "./types.js";
