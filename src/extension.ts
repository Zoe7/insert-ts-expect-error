import * as vscode from "vscode";
import * as ts from "typescript";

/**
 * Finds the indentation level (leading spaces/tabs) of a line or range in the document.
 *
 * @param document - The VSCode TextDocument where we are searching.
 * @param range - The range or line where you want to determine the indentation.
 * @returns The string containing the leading spaces/tabs (the indentation).
 */
export function findIndentationLevel(
  document: vscode.TextDocument,
  range: vscode.Range
): string {
  const lineText = document.lineAt(range.start.line).text;

  // Match leading whitespace characters (spaces or tabs)
  const indentation = lineText.match(/^\s*/)?.[0] || "";

  return indentation;
}

/**
 * Recursively searches for the node that contains the offset.
 * @param node - The current AST node being inspected.
 * @param offset - The offset to search for.
 * @returns The found node, or null if not found in this branch.
 */
function findNode(node: ts.Node, offset: number): ts.Node | null {
  if (offset >= node.getFullStart() && offset <= node.getEnd()) {
    for (const child of node.getChildren()) {
      const found = findNode(child, offset);
      if (found) {
        return found;
      }
    }

    return node;
  }

  return null;
}

export function activate(context: vscode.ExtensionContext) {
  const selector = [
    { language: "typescript", scheme: "file" },
    { language: "typescriptreact", scheme: "file" },
  ];

  let disposable = vscode.languages.registerCodeActionsProvider(
    selector,
    new TsExpectErrorProvider(),
    {
      providedCodeActionKinds: TsExpectErrorProvider.providedCodeActionKinds,
    }
  );

  context.subscriptions.push(disposable);
}

class TsExpectErrorProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] | undefined {
    // Find any TypeScript diagnostic errors on the line
    const diagnostics = context.diagnostics.filter(
      (diagnostic) => diagnostic.source === "ts"
    );

    if (diagnostics.length === 0) {
      return;
    }

    const fix = this.createTsExpectErrorFix(document, diagnostics[0], range);
    return [fix];
  }

  private createTsExpectErrorFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    range: vscode.Range
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      "Insert @ts-expect-error",
      vscode.CodeActionKind.QuickFix
    );
    fix.edit = new vscode.WorkspaceEdit();

    const sanitizedErrorMessage = diagnostic.message
      .split(/(?:\r\n|\r|\n)/)
      .map((line) => line.replace(/\t/g, ""))
      .map((line) => line.trim())
      .join(" ");

    const truncatedErrorMessage =
      sanitizedErrorMessage.length > 60
        ? `${sanitizedErrorMessage.substring(0, 57)}...`
        : sanitizedErrorMessage;

    const position = new vscode.Position(range.start.line, 0);

    const indentation = findIndentationLevel(document, range);
    const commentText = `@ts-expect-error ${truncatedErrorMessage} ts(${diagnostic.code})`;

    const comment = this.isJsx(document, position)
      ? `${indentation}{/* ${commentText} */}`
      : `${indentation}// ${commentText}`;

    fix.edit.insert(document.uri, position, comment + "\n");

    return fix;
  }

  private isJsx(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    const sourceFile = ts.createSourceFile(
      document.fileName,
      document.getText(),
      ts.ScriptTarget.Latest,
      true
    );

    // Convert the VSCode position to an offset for TypeScript AST
    const offset = document.offsetAt(position);
    const foundNode = findNode(sourceFile, offset);

    if (foundNode === null) {
      console.log("Could not find matching node");
      return false;
    }

    const isJsx = ts.isJsxText(foundNode) || ts.isJsxElement(foundNode);

    return isJsx;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
