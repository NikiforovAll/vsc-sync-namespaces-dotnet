import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("Sync Namespaces");

    function executeNamespaceCommand(
        uri: vscode.Uri,
        isCheck: boolean,
        isWorkaround: boolean = false
    ) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open");
            return;
        }

        const basePath = workspaceFolder.uri.fsPath;
        const config = vscode.workspace.getConfiguration(
            "sync-namespaces-dotnet"
        );
        const solutionOrProjectPath = config.get<string>(
            "solutionOrProjectRelativePath",
            ""
        );
        const fullBasePath = path.join(basePath, solutionOrProjectPath);

        const targetPath =
            uri && uri.scheme === "file" ? uri.fsPath : fullBasePath;
        const relativePath = path.relative(fullBasePath, targetPath);
        const formattedRelativePath = relativePath
            ? relativePath.replace(/\\/g, "/").replace(/\/?$/, "/")
            : "";

        const action = isCheck ? "Checking" : "Syncing";
        outputChannel.appendLine(
            `${action} namespaces in folder: ${
                formattedRelativePath || "entire workspace"
            }`
        );
        outputChannel.show();

        const verifyOption = isCheck ? "--verify-no-changes" : "";
        let command = `dotnet format --diagnostics IDE0130 ${verifyOption} --severity info`;

        if (formattedRelativePath) {
            command += ` --include "${formattedRelativePath}"`;
        }

        outputChannel.appendLine(`Running command: ${command}`);
        outputChannel.appendLine(`Working directory: ${fullBasePath}`);

        exec(command, { cwd: fullBasePath }, (error, stdout, stderr) => {
            if (isWorkaround) {
                applyWorkaround(stderr, fullBasePath, outputChannel);
            } else {
                if (error) {
                    outputChannel.appendLine(`Error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    outputChannel.appendLine(`Warning: ${stderr}`);
                }
            }

            outputChannel.appendLine(
                `${action} completed for ${
                    formattedRelativePath || "entire workspace"
                }:\n${stdout}`
            );
            outputChannel.show();
        });
    }

    function applyWorkaround(
        output: string,
        basePath: string,
        outputChannel: vscode.OutputChannel
    ) {
        const regex = /^([a-zA-Z]:[/\\](?:[^/\\:*?"<>|\r\n]+[/\\])*[^/\\:*?"<>|\r\n]+\.cs).*Namespace "([^"]+)" does not match folder structure, expected "([^"]+)"/;

        const lines = output.split("\n");
        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                const [, filePath, oldNamespace, newNamespace] = match;
                const fullPath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(basePath, filePath);

                try {
                    let content = fs.readFileSync(fullPath, "utf8");
                    const regex = new RegExp(
                        `namespace\\s+${oldNamespace}`,
                        "g"
                    );
                    content = content.replace(
                        regex,
                        `namespace ${newNamespace}`
                    );
                    fs.writeFileSync(fullPath, content, "utf8");
                    outputChannel.appendLine(
                        `Updated namespace in ${filePath} from "${oldNamespace}" to "${newNamespace}"`
                    );
                } catch (err) {
                    outputChannel.appendLine(
                        `Error updating ${filePath}: ${err}`
                    );
                }
            }
        }
    }

    const syncNamespaces = vscode.commands.registerCommand(
        "sync-namespaces-dotnet.syncNamespaces",
        (uri: vscode.Uri) => {
            executeNamespaceCommand(uri, false);
        }
    );

    const checkNamespaces = vscode.commands.registerCommand(
        "sync-namespaces-dotnet.syncNamespacesCheck",
        (uri: vscode.Uri) => {
            executeNamespaceCommand(uri, true);
        }
    );

    const syncWorkaround = vscode.commands.registerCommand(
        "sync-namespaces-dotnet.syncNamespacesWorkaround",
        (uri: vscode.Uri) => {
            executeNamespaceCommand(uri, true, true);
        }
    );

    context.subscriptions.push(syncNamespaces, checkNamespaces, syncWorkaround);
}

export function deactivate() {}
