# Prompt Enhancer MCP: Feature Enhancements Design

## 1. Global Domain Dictionary
**Problem**: Smaller local LLMs often ignore negative constraints (e.g., "DO NOT expand acronyms") and end up hallucinating acronym definitions, such as expanding "MCP" to "Multi-Criteria Problem" instead of "Model Context Protocol".
**Solution**: Provide the model with explicit, positive constraints via a domain dictionary.

### Implementation Details:
*   **Default Dictionary**: The MCP will ship with a default set of common domain acronyms (e.g., `{"MCP": "Model Context Protocol", "LLM": "Large Language Model"}`).
*   **Configuration**: Users can override or extend this dictionary via the MCP's configuration system (e.g., in `package.json` config, or a workspace config file).
*   **Prompt Injection**: If the user's `draft` contains any acronyms found in the dictionary, the MCP will dynamically inject a `DOMAIN DICTIONARY` section into the `RULES_HEADER` in `src/meta-prompts.ts` before sending the prompt to the LLM. 
*   **Example Injection**: 
    ```text
    DOMAIN DICTIONARY: Use these exact expansions if the acronym appears in the draft:
    - MCP: Model Context Protocol
    ```

## 2. Automatic Context Gathering
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
