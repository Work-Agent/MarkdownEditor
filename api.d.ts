export interface PluginApi {
  commands: {
    "markdown-editor.save": { input: { "ref": string; "content": string; }; output: unknown };
    "markdown-editor.readAsset": { input: { "ref": string; }; output: unknown };
    "markdown-editor.writeImage": { input: { "ref": string; "name": string; "mime": string; "data": string; }; output: unknown };
    "markdown-editor.files": { input: { "root": string; "query"?: string; "limit"?: number; }; output: unknown };
  };
}
