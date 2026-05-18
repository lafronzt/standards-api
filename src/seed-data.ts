import type { StandardInput } from "./domain/standard.js";

export const seedStandards: StandardInput[] = [
  {
    ruleKey: "SRE-K8S-003",
    title: "Kubernetes readiness probes required",
    description: "Production Kubernetes workloads must expose readiness probes so traffic is routed only to ready pods.",
    status: "active",
    severity: "high",
    category: "reliability",
    appliesTo: {
      frameworks: ["kubernetes"],
      runtimes: ["container"],
      file_patterns: ["**/deployment*.yaml", "**/deployment*.yml", "**/k8s/**/*.yaml", "**/k8s/**/*.yml"],
      environments: ["production"]
    },
    ruleText: "Every production Kubernetes Deployment must define a readinessProbe for each application container.",
    reviewGuidance: "Check changed Kubernetes manifests for containers without readinessProbe blocks.",
    goodExample: "readinessProbe:\\n  httpGet:\\n    path: /health/ready\\n    port: 8080",
    badExample: "containers:\\n  - name: api\\n    image: api:latest",
    owner: "platform",
    version: 1
  },
  {
    ruleKey: "SRE-API-001",
    title: "Services must expose health endpoints",
    description: "Services must provide health endpoints for runtime and dependency checks.",
    status: "active",
    severity: "medium",
    category: "reliability",
    appliesTo: {
      languages: ["typescript", "javascript", "go", "python"],
      file_patterns: ["src/**/*.{ts,js,go,py}", "app/**/*.{ts,js,go,py}"]
    },
    ruleText: "Services must expose a liveness endpoint and a readiness endpoint.",
    reviewGuidance: "Verify service routes include lightweight health endpoints and readiness checks for critical dependencies.",
    goodExample: "GET /health returns status ok; GET /health/ready checks database connectivity.",
    badExample: "Only business endpoints exist, with no health route.",
    owner: "platform",
    version: 1
  },
  {
    ruleKey: "OPS-TF-002",
    title: "Terraform changes must include rollback notes",
    description: "Infrastructure changes must document rollback steps before they are merged.",
    status: "active",
    severity: "medium",
    category: "compliance",
    appliesTo: {
      frameworks: ["terraform"],
      file_patterns: ["**/*.tf", "**/*.tfvars"],
      teams: ["sre", "platform"]
    },
    ruleText: "Terraform pull requests must include rollback notes or explicitly state why rollback is not applicable.",
    reviewGuidance: "Inspect PR description or adjacent docs for rollback steps when Terraform files change.",
    goodExample: "Rollback: revert this module version and run terraform apply for workspace prod.",
    badExample: "Terraform changes are made with no operational rollback guidance.",
    owner: "sre",
    version: 1
  },
  {
    ruleKey: "SEC-SECRET-001",
    title: "Secrets must not be committed",
    description: "Repositories must never contain plaintext secrets, private keys, or production credentials.",
    status: "active",
    severity: "critical",
    category: "security",
    appliesTo: {
      file_patterns: ["**/*", ".env*", "**/*.pem", "**/*.key"],
      repos: ["*"]
    },
    ruleText: "Do not commit plaintext secrets. Use the approved secret manager and environment injection.",
    reviewGuidance: "Look for credential-like values, private key headers, tokens, and populated .env files.",
    goodExample: "DATABASE_URL is read from process.env and stored in the secret manager.",
    badExample: "const token = 'sk_live_...';",
    owner: "security",
    version: 1
  },
  {
    ruleKey: "OBS-LOG-001",
    title: "Production services must emit structured logs",
    description: "Production services must use structured JSON logs with stable fields for correlation.",
    status: "active",
    severity: "medium",
    category: "observability",
    appliesTo: {
      languages: ["typescript", "javascript", "go", "python"],
      environments: ["production"]
    },
    ruleText: "Production service logs must be structured and include service, level, timestamp, request_id when available.",
    reviewGuidance: "Reject ad hoc console output in production paths and require structured logger usage.",
    goodExample: "logger.info({ request_id, user_id }, 'request completed')",
    badExample: "console.log('request completed ' + requestId)",
    owner: "observability",
    version: 1
  },
  {
    ruleKey: "REL-NET-004",
    title: "External calls must define timeouts/retries",
    description: "External network calls must bound latency and define retry behavior appropriate to idempotency.",
    status: "active",
    severity: "high",
    category: "reliability",
    appliesTo: {
      languages: ["typescript", "javascript", "go", "python"],
      file_patterns: ["src/**/*.ts", "src/**/*.js", "src/**/*.go", "src/**/*.py"]
    },
    ruleText: "Every external HTTP/RPC call must define a timeout and explicit retry policy.",
    reviewGuidance: "Inspect clients and SDK calls for configured timeouts, retry limits, and backoff.",
    goodExample: "fetch(url, { signal: AbortSignal.timeout(3000) }) with bounded retry wrapper.",
    badExample: "await fetch(url)",
    owner: "platform",
    version: 1
  }
];
