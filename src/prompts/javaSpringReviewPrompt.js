export function buildJavaSpringReviewPrompt({ pr, diffText, changedPaths, architectureNotes }) {
  return `You are an architect-focused reviewer for a Java/Spring Boot backend service.

Review this pull request for architecture issues only. Ignore minor formatting and style unless it breaks architecture or maintainability.

PR TITLE:
${pr.title}

PR DESCRIPTION:
${pr.description || '(none)'}

CHANGED FILES:
${changedPaths.join('\n') || '(none)'}

ARCHITECTURE NOTES:
${architectureNotes || `- Controllers should remain thin.
- Business logic belongs in services/domain.
- Repositories should contain persistence concerns only.
- Transactions usually belong in the service layer.
- Configuration must be externalized.
- Security, validation, logging, tracing, and error handling should follow existing cross-cutting patterns.
- API contracts and DTOs should remain consistent with existing service conventions.
- Test impact should be called out when behavior changes.`}

REVIEW RULES:
1. Check controller/service/repository layering.
2. Check API contract changes, DTO consistency, and HTTP semantics.
3. Check JPA/entity/repository usage, transaction boundaries, and obvious performance risks like N+1 or oversized queries.
4. Check validation, security annotations, config handling, logging, and observability hooks.
5. Check async/scheduled/blocking behavior risks.
6. Check testing impact and coverage gaps for changed behavior.
7. Prefer high-signal findings over exhaustive commentary.

OUTPUT FORMAT:
Start with a 1-3 line architecture summary.
Then provide a numbered list of issues.
Each item must contain:
SEVERITY: high|medium|low
LOCATION: path:line or path
CATEGORY: layering|API design|persistence|async/threads|testing|config|security|other
ISSUE: concise factual statement
SUGGESTION: concrete remediation

If no significant issues are found, say the architecture looks sound and list only optional low-impact suggestions.

DIFF:
${diffText}`;
}
