#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolRequest,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { NReplClient } from './nrepl-client.js';

class NReplMcpServer {
  private server: Server;
  private nreplClient: NReplClient | null = null;
  private host: string | null = null;
  private port: number | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'nrepl-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {
            'nrepl://status': {
              name: 'nREPL Connection Status',
              description: 'Returns the current nREPL connection status including port and session information',
            },
            'nrepl://namespaces': {
              name: 'Project Namespaces',
              description: 'Returns a list of all namespaces in the current project',
            },
          },
        },
      }
    );

    this.setupRequestHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]:', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupRequestHandlers() {
    // Add handler for listing resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'nrepl://status',
          name: 'nREPL Connection Status',
          description: 'Returns the current nREPL connection status including port and session information',
          mimeType: 'application/json'
        },
        {
          uri: 'nrepl://namespaces',
          name: 'Project Namespaces',
          description: 'Returns a list of all namespaces in the current project',
          mimeType: 'application/json'
        }
      ]
    }));

    // Add handler for reading resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'nrepl://namespaces') {
        await this.ensureNReplClient();
        
        // Add tools.namespace dependency and set up namespace finding
        const setupCode = `
          (require '[clojure.repl.deps :refer [add-lib]])
          (add-lib 'org.clojure/tools.namespace {:mvn/version "1.4.4"})
          (require '[clojure.tools.namespace.find :as ns-find])
        `;
        await this.nreplClient!.eval(setupCode);
        
        // Find all namespaces in the current directory
        const findNamespacesCode = `
          (pr-str 
            (into []
              (map str)
              (ns-find/find-namespaces-in-dir 
                (clojure.java.io/file "./"))))
        `;
        const namespaces = await this.nreplClient!.eval(findNamespacesCode);
        
        // Parse the Clojure vector string into a JavaScript array
        const namespacesArray = JSON.parse(
          namespaces
            .replace(/^"(.+)"$/, '$1') // Remove outer quotes from pr-str
            .replace(/\\/g, '') // Remove escaping
            .replace(/\s+/g, ',') // Replace whitespace with commas
            .replace(/,+/g, ',') // Remove multiple commas
            .replace(/,\]/g, ']') // Remove trailing comma
        );
        
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify({ namespaces: namespacesArray }, null, 2)
          }]
        };
      } else if (request.params.uri === 'nrepl://status') {
        const status = {
          host: this.host,
          port: this.port,
          connected: this.nreplClient !== null,
          sessionId: this.nreplClient?.sessionId || null,
          lastError: this.nreplClient?.lastError || null
        };
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2)
          }]
        };
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource: ${request.params.uri}`
      );
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'connect',
          description: 'Connect to an nREPL server.\n' +
            'Example: (connect {:host "localhost" :port 1234})',
          inputSchema: {
            type: 'object',
            properties: {
              host: { type: 'string', description: 'nREPL server host' },
              port: { type: 'number', description: 'nREPL server port' }
            },
            required: ['host', 'port']
          }
        },
        {
          name: 'eval_form',
          description: 'Evaluate Clojure code in a specific namespace or the current one. Examples:\n' +
            '- Define and call a function: {"code": "(defn greet [name] (str \\"Hello, \\" name \\"!\\"))(greet \\"World\\"))"}\n' +
            '- Reload code: {"code": "(clj-reload.core/reload)"}\n' +
            '- Evaluate in a specific namespace: {"code": "(clojure.repl.deps/sync-deps)", "ns": "user"}',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Clojure code to evaluate' },
              ns: { type: 'string', description: 'Optional namespace to evaluate in. Changes persist for subsequent evaluations.' },
            },
            required: ['code'],
          },
        },
        {
          name: 'get_ns_vars',
          description: 'Get all public vars (functions, values) in a namespace with their metadata and current values. Example:\n' +
            '- List main namespace vars: (get_ns_vars {:ns "main"})\n' +
            'Returns a map where keys are var names and values contain:\n' +
            '- :meta - Metadata including :doc string, :line number, :file path\n' +
            '- :value - Current value of the var',
          inputSchema: {
            type: 'object',
            properties: {
              ns: { type: 'string', description: 'Namespace to inspect' },
            },
            required: ['ns'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      try {
        switch (request.params.name) {
          case 'connect': {
            const args = request.params.arguments;
            if (!args || typeof args.host !== 'string' || typeof args.port !== 'number') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'host and port parameters are required'
              );
            }

            // Close existing connection if any
            if (this.nreplClient) {
              await this.nreplClient.close();
              this.nreplClient = null;
            }

            this.host = args.host;
            this.port = args.port;
            this.nreplClient = new NReplClient(this.port);
            await this.nreplClient.clone(); // Create initial session

            return {
              content: [{ type: 'text', text: `Connected to nREPL server at ${this.host}:${this.port}` }],
            };
          }

          case 'eval_form': {
            await this.ensureNReplClient();
            const args = request.params.arguments;
            if (!args || typeof args.code !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'code parameter must be a string'
              );
            }

            let result: string;
            if (args.ns) {
              // If namespace is provided, change to it first
              await this.nreplClient!.eval(`(in-ns '${args.ns})`);
              result = await this.nreplClient!.eval(args.code);
            } else {
              result = await this.nreplClient!.eval(args.code);
            }

            return {
              content: [{ type: 'text', text: result }],
            };
          }

          case 'get_ns_vars': {
            await this.ensureNReplClient();
            const args = request.params.arguments;
            if (!args || typeof args.ns !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'ns parameter must be a string'
              );
            }
            const result = await this.nreplClient!.eval(
              `(into {} (for [[sym v] (ns-publics '${args.ns})] [sym {:meta (meta v) :value (deref v)}]))`
            );
            return {
              content: [{ type: 'text', text: result }],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `nREPL error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async ensureNReplClient() {
    if (!this.host || !this.port) {
      throw new McpError(
        ErrorCode.InternalError,
        'Not connected to nREPL server - use connect tool first'
      );
    }

    if (!this.nreplClient) {
      this.nreplClient = new NReplClient(this.port);
      await this.nreplClient.clone(); // Create initial session
    }
  }

  private async cleanup() {
    if (this.nreplClient) {
      await this.nreplClient.close();
    }
    await this.server.close();
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('nREPL MCP server running on stdio');
  }
}

// Start the server
const server = new NReplMcpServer();
server.run().catch((error: Error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
