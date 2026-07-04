# Arquitetura de Publicação (NPM & GitHub Actions)

## 1. Resumo do Entendimento
* **O que estamos a construir:** Um *pipeline* de publicação automatizada para o pacote `prompt-enhancer-mcp` no registo público do NPM.
* **Porquê:** Para distribuir a versão atual (e futuras iterações) a outros developers sem intervenção manual e com controlo de versão semântico.
* **Para quem:** Developers e utilizadores de clientes MCP (ex: Claude Desktop, Antigravity) que usem Ollama.
* **Restrições Chave:** O pacote tem de funcionar como CLI (via instalação global) e como utilitário temporário (via `npx`). Apenas os ficheiros essenciais (`dist/`, `docs/`) serão publicados.
* **Não é um objetivo:** Não estamos a publicar uma biblioteca de código base (*SDK*) para importação direta em código fonte de terceiros.

## 2. Premissas e Assunções
* O pacote será licenciado sob a licença **MIT**.
* O *namespace* de distribuição será associado à conta do utilizador (`@nuno-morais/prompt-enhancer-mcp`).
* O código fonte passará a viver num repositório Git remoto gerido pelo GitHub.
* O utilizador detém ou criará acesso a um Token de Automação no serviço npmjs.com.

## 3. Log de Decisões (Decision Log)
| Decisão | Alternativas Consideradas | Motivo da Escolha |
|---|---|---|
| **Pipeline via GitHub Actions** | Publicação manual no terminal ou uso da lib `release-it`. | O utilizador preferiu segurança e a filosofia "deploy on merge", delegando a responsabilidade de *build* para a Cloud. |
| **Distribuição Automatizada (CD)** | Publicação acionada manualmente por GitHub Releases. | Requisito explícito: a publicação deve ser automática sempre que ocorrer um *push/merge* na *branch* `main`. |
| **Semantic Release** | Alteração manual do campo `version` no `package.json` a cada PR. | Evita falhas humanas, calcula automaticamente a versão (Major/Minor/Patch) baseada na semântica dos *commits* e lida com as tags do Git. |
| **Enforcement de Conventional Commits** | Não forçar o padrão, confiando na disciplina do *developer*. | Requisito explícito. Para garantir que o *Semantic Release* nunca falha, bloquearemos *commits* locais mal formatados através do `husky` e do `commitlint`. |

## 4. O Desenho Final (Final Design)

A arquitetura final do fluxo de trabalho divide-se em duas camadas:

### 4.1. Camada Local (Pre-commit)
O projeto será enriquecido com a ferramenta `husky` acoplada ao `@commitlint/cli`. 
* Sempre que tentar fazer um `git commit`, um *hook* local irá verificar a mensagem.
* Se escrever *"corrigi um erro"*, o Git aborta o commit. 
* Se escrever *"fix: resolve import do commander"*, o Git aceita e grava.

### 4.2. Camada Cloud (Continuous Deployment)
O pacote terá os seus metadados (`package.json`) fechados com o *scope* correto e a diretiva de acesso público.
* Ao fundir um Pull Request na *branch* `main`, o *workflow* `.github/workflows/publish.yml` é desencadeado.
* O GitHub Actions corre o ambiente `Node.js`, instala dependências e executa os testes e a compilação (`npm run build`).
* O passo final invoca a ferramenta `semantic-release`. Esta lê os *commits*, decide a nova versão (ex: `0.1.1`), publica diretamente no NPM utilizando a chave secreta `NPM_TOKEN`, e cria uma *Release Notes* profissional no repositório do GitHub.
