[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/johancodinha-nrepl-mcp-server-badge.png)](https://mseep.ai/app/johancodinha-nrepl-mcp-server)

# nREPL MCP Server

A [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) server designed for MCP clients, such as **Claude Desktop** or **CLine** in VSCode. This server can be used with any LLM when used with CLine. This server enables interaction with a running **Clojure nREPL instance**, allowing evaluation of Clojure code, namespace inspection, and other utilities via MCP.

---

## Features

- **Connect** to a running nREPL server by specifying host and port.
- **Evaluate Clojure code** in a given namespace or the current one.
- **List project namespaces** using `tools.namespace`.
- **Retrieve nREPL connection status**, including host, port, and session details.
- **Inspect public vars** in any Clojure namespace, displaying metadata such as docstrings and values.

---

## Installation & Setup

### Installing in CLine (VSCode) or Claude Desktop

To use this server with **CLine** or **Claude Desktop**, follow these steps:

1. Open **CLine** in VSCode or **Claude Desktop**.
2. Navigate to the **MCP Settings**.
3. Add a new MCP server with the following configuration:
   ```json
   {
     "mcpServers": {
       "nrepl-mcp-server": {
         "command": "npx",
         "args": [
           "nrepl-mcp-server"
         ],
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```
4. Save and restart the client to apply changes.

This will allow the client to communicate with the nREPL MCP server via standard input/output.

### Install via `npx`

To quickly run the server without cloning the repository:

```bash
npx nrepl-mcp-server
```

### Manual Installation

1. **Clone the repository**
2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project** (transpiles TypeScript to JavaScript)

   ```bash
   npm run build
   ```

4. **Run the server**

   - **Production Mode**: Runs from compiled output.
     ```bash
     npm start
     ```
   - **Development Mode**: Uses ts-node for live changes.
     ```bash
     npm run dev
     ```

This starts the server, listening on **STDIO** for MCP requests. Mcp client will start the server for you.

---

## Actions

### Connecting to nREPL

Allows establishing a connection to an nREPL server by specifying a **host** and **port**.

### Evaluating Clojure Code

Executes arbitrary Clojure expressions in either the **default namespace** or a **specified namespace**.

### Retrieving Namespace Information

Lists all namespaces in the current project directory using `tools.namespace`.

### Inspecting Public Vars

Fetches metadata and current values for all **public vars** in a specified namespace.

### Fetching nREPL Connection Status

Provides details on the current nREPL connection, including host, port, session ID, and last error (if any).

---

## Resources

### `nrepl://status`

Provides information about the current nREPL connection, including:

- Host and port
- Connection status
- Active session ID

### `nrepl://namespaces`

Lists all namespaces detected in the project directory.

---

## Contributing

Contributions are welcome! If you have feature suggestions or bug reports, please open an issue or pull request.

## License

This project is licensed under the **MIT License**. Feel free to modify and distribute according to its terms.
