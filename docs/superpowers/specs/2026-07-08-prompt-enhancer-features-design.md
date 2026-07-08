# Prompt Enhancer MCP: Feature Enhancements Design

## Automatic Context Gathering
**Problem**: The current MCP only optimizes the text of the prompt but lacks awareness of the project it is operating within, limiting its ability to provide highly specific structural constraints.
**Solution**: Automatically scan the workspace to build a background context payload that informs the LLM about the project environment.

### Implementation Details:
*   **New Utility (`src/context-scanner.ts`)**: A new module that runs before `optimize_prompt` sends its payload to the LLM.
*   **Scanning Capabilities**:
    1.  **Framework Detection**: Parse `package.json` to extract primary dependencies (e.g., React, Express, Vue, Tailwind) and determine the stack.
    2.  **Git State**: Execute a lightweight `git status -s` to identify files that are currently modified or staged, as these are highly relevant to the user's immediate task.
    3.  **Project Structure**: Capture a shallow, top-level directory tree (excluding heavy directories like `node_modules` or `.git`).
*   **Integration**: The gathered data will be wrapped in a `<background_context>` XML tag and prepended to the user's original `draft`. 
*   **Existing Compatibility**: The current `meta-prompts.ts` already contains instructions for the LLM to process `<background_context>` strictly as read-only background information, ensuring seamless integration without requiring major prompt rewrites.
