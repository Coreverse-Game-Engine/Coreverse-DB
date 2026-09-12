# Pull Requests

The repository's `pull_request_template.md` and `CODEOWNERS` govern review; a few points worth calling out:

- **`ci-required`** is the single aggregate status check branch protection relies on — it gates on OpenAPI lint, client verification (drift + typecheck), Deno unit tests, the Supabase pgTAP suite, and SQLFluff, so a green `ci-required` means all of those passed, not just one.
- **CodeQL** and **Semgrep** run as separate, non-blocking-by-default security scans — findings there are worth addressing even if they don't gate merge the same way `ci-required` does.
- **Dependabot** (`dependabot.yml`) opens PRs for npm (root) and GitHub Actions dependency updates; Deno dependencies are not covered (Deno isn't a supported Dependabot ecosystem), so Deno import-map updates are manual.
- Follow the repository's issue templates (`bug_report.yml`, `feature_request.yml`) when filing issues that motivate a PR, so the PR description can reference a well-formed issue rather than restating context inline.

See [Overview](overview.md) for the pre-PR checklist and [Testing](testing.md) for what coverage a PR is expected to include.
