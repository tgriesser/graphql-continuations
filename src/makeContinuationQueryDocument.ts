import {
  Kind,
  NameNode,
  FieldNode,
  ArgumentNode,
  DocumentNode,
  SelectionSetNode,
  OperationTypeNode,
  FragmentDefinitionNode,
  VariableDefinitionNode,
  GraphQLResolveInfo,
  VariableNode,
  visit,
  ASTVisitor,
} from "graphql";
import { ContinuationFieldOptions } from "./types";
import { CONTINUATION_TYPE_NAME } from "./constants";

export interface FieldDoc {
  isNode: boolean;
  document: DocumentNode;
  targetField?: string;
  variableNames: string[];
}

const docMap = new WeakMap<FieldNode, FieldDoc>();

/**
 * Takes an operation, and converts it into a standalone query which will
 * be raced against the waitMs of the continuation field
 */
export function makeContinuationQueryDocument(
  info: GraphQLResolveInfo,
  fieldOptions: ContinuationFieldOptions
): FieldDoc {
  // If we have already seen this selection node, which happens if a continuation is nested
  // within a list result (probably not a great idea), don't worry about re-executing the parse
  const selectionNode = info.fieldNodes[0];
  const doc = docMap.get(selectionNode);
  if (doc) {
    return doc;
  }

  const fragmentNames = new Set<string>();
  const fragments: FragmentDefinitionNode[] = [];
  const { selectionSet } = selectionNode;

  if (!selectionSet) {
    throw new Error(
      `Expected selectionSet beneath continuation field at ${info.fieldNodes}`
    );
  }

  const variableNames = new Set<string>();
  const variableDefinitions: VariableDefinitionNode[] = [];

  let hasTypename = false;

  // Find all of the "Continuation" fragments and strip those out of the second query we execute,
  // making sure to detect any variables in the selectionSet to re-define those in the new query
  const visitor: ASTVisitor = {
    Field(node, key, parent, path) {
      if (node.name.value === "__typename" && path.length === 2) {
        hasTypename = true;
      }
    },
    FragmentSpread(frag) {
      const fragmentDef = info.fragments[frag.name.value];
      if (fragmentDef.typeCondition.name.value === CONTINUATION_TYPE_NAME) {
        return null;
      }
      if (!fragmentNames.has(frag.name.value)) {
        fragmentNames.add(frag.name.value);
        fragments.push(fragmentDef);
        visit(fragmentDef, visitor);
      }
    },
    InlineFragment(frag) {
      if (frag.typeCondition?.name.value === CONTINUATION_TYPE_NAME) {
        return null;
      }
    },
    Argument(arg) {
      if (arg.value.kind === Kind.VARIABLE) {
        const variableName = arg.value.name.value;
        if (!variableNames.has(variableName)) {
          variableNames.add(variableName);
          const def = info.operation.variableDefinitions?.find(
            (d) => d.variable.name.value === variableName
          );
          if (def) {
            variableDefinitions.push(def);
          }
        }
      }
    },
  };

  let docSelectionSet = visit(selectionSet, visitor);

  if (!hasTypename) {
    // We need to ensure we know the __typename when resolving the
    // fields below continuation, even if it's not provided so we don't need
    // to define isTypeOf for the union type
    docSelectionSet.selections = [
      fieldNode({
        name: nameNode("__typename"),
      }),
      ...docSelectionSet.selections,
    ];
  }

  let targetField: string | undefined;
  let isNode = false;

  if (info.parentType !== info.schema.getQueryType()) {
    const nodeInterface = info.parentType
      .getInterfaces()
      .find((i) => i.name === "Node");

    if (nodeInterface) {
      isNode = true;
      //
      variableDefinitions.push(
        variableDefinitionNode({
          variable: variableNode({ name: nameNode("id") }),
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: { kind: Kind.NAMED_TYPE, name: nameNode("ID") },
          },
        })
      );

      targetField = "node";
      docSelectionSet = selectionSetNode({
        selections: [
          fieldNode({
            name: nameNode("node"),
            arguments: [
              argumentNode({
                name: nameNode("id"),
                value: variableNode({ name: nameNode("id") }),
              }),
            ],
            selectionSet: docSelectionSet,
          }),
        ],
      });
    }
  }
  const continuationDoc: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [
      ...fragments,
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: OperationTypeNode.QUERY,
        name: nameNode("ContinuationQuery"),
        selectionSet: docSelectionSet,
        variableDefinitions,
      },
    ],
  };

  const returnDoc = {
    document: continuationDoc,
    variableNames: Array.from(variableNames),
    targetField,
    isNode,
  };
  docMap.set(selectionNode, returnDoc);

  return returnDoc;
}

function variableDefinitionNode(
  opts: Omit<VariableDefinitionNode, "kind">
): VariableDefinitionNode {
  return { kind: Kind.VARIABLE_DEFINITION, ...opts };
}

function variableNode(opts: Omit<VariableNode, "kind">): VariableNode {
  return { kind: Kind.VARIABLE, ...opts };
}

function argumentNode(opts: Omit<ArgumentNode, "kind">): ArgumentNode {
  return { kind: Kind.ARGUMENT, ...opts };
}

function fieldNode(opts: Omit<FieldNode, "kind">): FieldNode {
  return { kind: Kind.FIELD, ...opts };
}

function nameNode(name: string): NameNode {
  return { kind: Kind.NAME, value: name };
}

function selectionSetNode(
  opts: Omit<SelectionSetNode, "kind">
): SelectionSetNode {
  return { kind: Kind.SELECTION_SET, ...opts };
}
