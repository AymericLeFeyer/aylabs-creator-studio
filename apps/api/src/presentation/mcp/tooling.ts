import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

export type Shape = z.ZodRawShape;
export type ArgsOf<S extends Shape> = z.objectOutputType<S, z.ZodTypeAny>;

interface ToolConfig {
  title?: string;
  description: string;
  inputSchema: Shape;
  annotations?: Record<string, boolean>;
  _meta?: Record<string, unknown>;
}

/** Le typage de `registerTool` déroule tout le schéma : au-delà de trente outils, tsc abandonne. */
type RegisterTool = (
  name: string,
  config: ToolConfig,
  handler: (args: never) => Promise<CallToolResult>,
) => void;

/** Une réponse en JSON compact : le modèle le lit mieux qu'une phrase, et sans l'indentation. */
export const asJson = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) ?? 'null' }],
});

export const registerTool = <S extends Shape>(
  server: McpServer,
  name: string,
  config: Omit<ToolConfig, 'inputSchema'> & { inputSchema: S },
  handler: (args: ArgsOf<S>) => Promise<CallToolResult> | CallToolResult,
): void => {
  (server.registerTool.bind(server) as unknown as RegisterTool)(name, config, async (args) =>
    handler(args as ArgsOf<S>),
  );
};

/** Un outil de lecture : il n'écrit rien, et son résultat part tel quel en JSON. */
export const readTool = <S extends Shape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: S,
  handler: (args: ArgsOf<S>) => unknown,
): void => {
  registerTool(
    server,
    name,
    { description, inputSchema, annotations: { readOnlyHint: true } },
    async (args) => asJson(await handler(args)),
  );
};
