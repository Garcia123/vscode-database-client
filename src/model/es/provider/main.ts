import { stringify } from 'comment-json';
import * as vscode from 'vscode';
import { EsUtil } from '../esUtil';
import { DocumentFinder } from './documentFinder';
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider';
import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider';
import { ElasticMatch } from './ElasticMatch';
import { ElasticMatches } from './ElasticMatches';

export async function activeEs(context: vscode.ExtensionContext) {
    const languages = { language: 'es' };
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(languages, new ElasticCompletionItemProvider(), '/', '?', '&', '"'),
        vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)),
        vscode.commands.registerCommand('mysql.elastic.document', (em: ElasticMatch) => { DocumentFinder.open(em.Path.Text) }),
        vscode.commands.registerCommand('mysql.runES', runES),
        vscode.commands.registerCommand('mysql.elastic.execute', EsUtil.executeEsQueryFile),
        vscode.commands.registerCommand('mysql.elastic.lint', (em: ElasticMatch) => {
            if (em && em.HasBody) {
                vscode.window.activeTextEditor.edit(editBuilder => {
                    editBuilder.replace(em.Body.Range, stringify(em.Body.obj, null, 2))
                });
            }
        }),
    );
}

function runES(){
    if (!vscode.window.activeTextEditor)
        return;
    const esMatches = new ElasticMatches(vscode.window.activeTextEditor);
    for (const esMatche of esMatches.Matches) {
        if (esMatche.Range.contains(vscode.window.activeTextEditor.selection.active)) {
            EsUtil.executeEsQueryFile(esMatche, false);
            return;
        }
    }
    vscode.window.showErrorMessage("Not elastic search query found!");
}
