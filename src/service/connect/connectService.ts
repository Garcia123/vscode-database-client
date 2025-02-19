import { CacheKey, CodeCommand, DatabaseType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import { ConnectionManager } from "@/service/connectionManager";
import { resolve } from "path";
import { platform } from "os";
import { commands, Disposable, window, workspace } from "vscode";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { ConnectionNode } from "../../model/database/connectionNode";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ClientManager } from "../ssh/clientManager";
import { ConnnetionConfig } from "./config/connnetionConfig";
import { readFileSync, unlinkSync } from "fs";
import { GlobalState, WorkState } from "@/common/state";
var commandExistsSync = require('command-exists').sync;

export class ConnectService {

    public async openConnect(provider: DbTreeDataProvider, connectionNode?: ConnectionNode) {
        let node: any;
        if (connectionNode) {
            node = { ...NodeUtil.removeParent(connectionNode), isGlobal: connectionNode.global }
            if (node.ssh) {
                node.ssh.tunnelPort = null
                if (!node.ssh.algorithms) {
                    node.ssh.algorithms = { cipher: [] }
                }
            }
        }
        let plat: string = platform();
        ViewManager.createWebviewPanel({
            path: "app", title: connectionNode ? "edit" : "connect",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "connection.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'connect')
                }).on("route-connect", async () => {
                    if (node) {
                        handler.emit("edit", node)
                    } else {
                        handler.emit("connect")
                    }
                    const exists = plat == 'win32' ? true : commandExistsSync("sqlite") || commandExistsSync("sqlite3");
                    handler.emit("sqliteState", exists)
                }).on("installSqlite", () => {
                    let command: string;
                    switch (plat) {
                        case 'darwin':
                            command = `brew install sqlite3`
                            break;
                        case 'linux':
                            if (commandExistsSync("apt")) {
                                command = `sudo apt -y install sqlite`;
                            } else if (commandExistsSync("yum")) {
                                command = `sudo yum -y install sqlite3`;
                            } else if (commandExistsSync("dnf")) {
                                command = `sudo dnf install sqlite` // Fedora
                            } else {
                                command = `sudo pkg install -y sqlite3` // freebsd
                            }
                            break;
                        default: return;
                    }
                    const terminal = window.createTerminal("installSqlite")
                    terminal.sendText(command)
                    terminal.show()
                }).on("connecting", async (data) => {
                    const connectionOption = data.connectionOption
                    const node:Node = Util.trim(NodeUtil.of(connectionOption))
                    try {
                        node.initKey();
                        await this.connect(node)
                        await provider.addConnection(node)
                        const { key, connectionKey } = node
                        handler.emit("success", { message: 'connect success!', key, connectionKey })
                    } catch (err) {
                        if (err?.message) {
                            handler.emit("error", err.message)
                        } else {
                            handler.emit("error", err)
                        }
                    }
                }).on('copy', value => {
                    Util.copyToBoard(value)
                }).on("close", () => {
                    handler.panel.dispose()
                }).on("choose", ({ event, filters }) => {
                    window.showOpenDialog({ filters }).then((uris) => {
                        if (uris && uris[0]) {
                            const uri = uris[0]
                            handler.emit("choose", { event, path: uri.fsPath })
                        }
                    })
                })
            }
        });
    }

    public async connect(connectionNode: Node): Promise<void> {
        if (connectionNode.dbType == DatabaseType.SSH) {
            connectionNode.ssh.key=connectionNode.key;
            await ClientManager.getSSH(connectionNode.ssh, {withSftp:false})
            return;
        }
        ConnectionManager.removeConnection(connectionNode.getConnectId())
        await ConnectionManager.getConnection(connectionNode)
    }

    static listenConfig(): Disposable {
        const configPath = resolve(FileManager.getPath("config.json"))
        workspace.onDidCloseTextDocument(e => {
            const changePath = resolve(e.uri.fsPath);
            if (changePath == configPath) {
                unlinkSync(configPath)
            }
        })
        return workspace.onDidSaveTextDocument(e => {
            const changePath = resolve(e.uri.fsPath);
            if (changePath == configPath) {
                this.saveConfig(configPath)
            }
        });
    }

    private static async saveConfig(path: string) {
        const configContent = readFileSync(path, { encoding: 'utf8' })
        try {
            const connectonConfig: ConnnetionConfig = JSON.parse(configContent)
            await GlobalState.update(CacheKey.DATBASE_CONECTIONS, connectonConfig.database.global);
            await WorkState.update(CacheKey.DATBASE_CONECTIONS, connectonConfig.database.workspace);
            await GlobalState.update(CacheKey.NOSQL_CONNECTION, connectonConfig.nosql.global);
            await WorkState.update(CacheKey.NOSQL_CONNECTION, connectonConfig.nosql.workspace);
            DbTreeDataProvider.refresh();
            unlinkSync(path)
        } catch (error) {
            window.showErrorMessage("Parse connect config fail!")
        }
    }

    public openConfig() {

        const connectonConfig: ConnnetionConfig = {
            database: {
                global: GlobalState.get(CacheKey.DATBASE_CONECTIONS),
                workspace: WorkState.get(CacheKey.DATBASE_CONECTIONS),
            },
            nosql: {
                global: GlobalState.get(CacheKey.NOSQL_CONNECTION),
                workspace: WorkState.get(CacheKey.NOSQL_CONNECTION),
            }
        };

        FileManager.record("config.json", JSON.stringify(connectonConfig, this.trim, 2), FileModel.WRITE).then(filePath => {
            FileManager.show(filePath)
        })

    }

    public trim(key: string, value: any): any {
        switch (key) {
            case "iconPath":
            case "contextValue":
            case "parent":
            case "key":
            case "label":
            case "id":
            case "resourceUri":
            case "pattern":
            case "level":
            case "tooltip":
            case "descriptionz":
            case "collapsibleState":
            case "terminalService":
            case "forwardService":
            case "file":
            case "parentName":
            case "connectionKey":
            case "sshConfig":
            case "fullPath":
            case "uid":
            case "command":
            case "dialect":
            case "provider":
            case "context":
            case "isGlobal":
                return undefined;
        }
        return value;
    }

}