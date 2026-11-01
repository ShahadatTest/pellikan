# AI Policy

AI-augmented contributions are welcome as long as they meet the standards in this file. We only want AI used ethically, or not at all. Not using it is a perfectly good choice here, and nobody will think less of your PR for being written by hand.

Using AI ethically in coding means writing and maintaining software with accountability, transparency, and a commitment to quality. Large language models (LLMs) and code assistants generate text based on patterns, not an understanding of logic. That makes them a collaborator, never a replacement for human judgment.

## In practice

- **You are accountable for every line you submit.** "The AI wrote it" is not an explanation. If you cannot explain what a change does and why it is correct, do not open the PR.
- **Read and test AI output like code from a stranger.** Run it, step through it, and check it against the test suites (`npm test`, `cargo test --lib`, `npm run data:check`) and the checklist in [ACCESSIBILITY.md](ACCESSIBILITY.md). Generated code can look right and be wrong, and it often invents functions, options, or package names that do not exist.
- **Be transparent.** If AI wrote or substantially shaped a change, say so in the PR description. Reviewers should know how much scrutiny to bring.
- **Protect user data and secrets.** Pellikan is a local-first application. Never paste user data, private notes, database files, API keys, or credentials into third-party AI services. API keys belong in the OS keychain, never in source code or `localStorage`.
- **Do not add dependencies or copy code you have not vetted.** AI tools can suggest packages that are abandoned, mislicensed, or malicious. Models are also trained on code under licenses that may conflict with this project. Check package licenses, maintainers, and security records yourself before adding a dependency.
- **Respect copyright and licensing boundaries.** Licensing is a hard constraint for Pellikan (see [DATA_SOURCES.md](DATA_SOURCES.md) and [CONTRIBUTING.md](CONTRIBUTING.md)). Never use AI to ingest, summarize, or reproduce proprietary or copyrighted translations (such as the ESV) into the repository.
- **Use AI to learn, not as a crutch.** Try the problem yourself first, then use AI to explain a concept or help debug. This project is maintained by volunteers, and the next maintainer needs contributors who understand the codebase, not just ones who can prompt for it.
- **Keep AI out of judgment calls.** Translations, theological sources, copy, tone, and design decisions belong to humans. Pellikan maintains a plain, factual tone without marketing language. Do not submit AI-generated translations, commentary, UI copy, or accessibility annotations without verifying that they are accurate and fit the project.
- **Do not use AI to flood the project.** No bulk, unreviewed PRs or issues. One change you understand beats ten you do not.
- **Maintainers can ask for a rewrite.** If a PR looks unreviewed, unexplained, or hallucinated, it may be closed or sent back, whether or not AI was involved.

