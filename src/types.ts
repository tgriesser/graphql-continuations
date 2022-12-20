import type { GraphQLResolveInfo, execute } from "graphql";
import type { BaseAdapter } from "./adapters/BaseAdapter.js";

export interface ContinuationFieldOptions<Context = any> {
  /**
   * Configure the waitMs for this type's continuation field
   * @example
   *  waitMs: 200
   */
  waitMs?: number;
  /**
   * Top-level field executed to resolve the selection set
   * For example, if this object implements the "Node" interface,
   * this queryField would be "node"
   *
   * @example
   *  queryField: "node"
   */
  queryField?: string;
  /**
   * String or strings used to fulfill the queryField to complete
   * this value. For instance, if this object implements the "Node"
   * interface, this fieldArgs would be "id", since this is the arg
   * needed to resolve the node field
   *
   * @example
   *  fieldArgs: "id"
   */
  fieldArgs?: string | string[];
  /**
   * Generates the field arg values passed to the executed query,
   * for instance if this were an object implementing the "Node"
   * interface, this would be:
   *
   * @example
   *  fieldArgValues: (source, args, ctx, info) => {
   *    const resolve = info.parentType.getFields().id.resolve ?? defaultFieldResolver
   *    return { id: resolve(source, {}, ctx, info) }
   *  }
   */
  fieldArgValues?: (
    source: unknown,
    args: unknown,
    ctx: Context,
    info: GraphQLResolveInfo
  ) => object;
  /**
   * Whether the return type of the field is nullable or not
   * @default false
   */
  nullable?: boolean;
}

export interface ContinuationConfig<Context = any> {
  /**
   * Makes a continuation adapter, for storing & retrieving the result of a
   * resolver execution
   */
  adapter: BaseAdapter<Context>;
  /**
   * The default amount of time we want to wait for the continuation
   * to execute before returning.
   * 10ms if not specified
   */
  defaultWaitMs?: number;
  /**
   * When we search for a continuation, if a field has nested continuations
   * and we know we have the value, we
   */
  resolveContinuationsRecursively?: boolean;
  /**
   * Optional, allows us to specify a different execute function
   */
  executeImpl?: typeof execute;
  /**
   * Wraps any Objects implementing the Node interface from the Relay specification:
   * https://relay.dev/docs/guides/graphql-server-specification/
   * Default is true if we detect the schema is implementing the spec
   */
  wrapNodes?: boolean | string[];
  /**
   * Configuration for each type we want to add a continuation field to,
   * or modify the continuation field configuration for
   */
  typeConfig?: {
    [typeName: string]: ContinuationFieldOptions<Context> | false;
  };
  /**
   * If this is an ObjectType implementing the "Node" interface,
   * determines the field we use to lookup the node's ID type
   */
  nodeIdField?: string;
}
