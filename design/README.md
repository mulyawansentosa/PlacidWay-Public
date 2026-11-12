# Design documents

Diagrams are written as [Mermaid](https://mermaid.js.org/) inside Markdown, so
they are versioned with the code and render directly in GitHub, GitLab, and the
VS Code Markdown preview (extension: *Markdown Preview Mermaid Support*).

| File | Contents |
|---|---|
| [`architecture.md`](architecture.md) | System context, module layers, chat request flow, ingestion/refresh flow, deployment topology. |
| [`database-erd.md`](database-erd.md) | ER diagram, relationship rules, column dictionary, indexes, and data invariants. |
| [`production-hardening.md`](production-hardening.md) | Jenkins SSH host-key pinning, production secret handling, rotation, and verification. |

Render locally with the Mermaid CLI after saving one diagram as a `.mmd` file:

```bash
npx -y @mermaid-js/mermaid-cli -i diagram.mmd -o diagram.svg
```

For multi-diagram documents, use the editor preview or GitHub.
