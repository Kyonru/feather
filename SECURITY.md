# Security Policy

## Supported Versions

Feather receives security fixes on the latest minor release line. Older release
lines may receive fixes at the maintainer's discretion when a vulnerability is
severe and a backport is practical.

| Version | Supported |
| ------- | --------- |
| 1.1.x   | Yes       |
| < 1.1   | No        |

## Reporting a Vulnerability

Please do not report security vulnerabilities in public issues, discussions, or
pull requests.

Use GitHub's private vulnerability reporting for this repository:

https://github.com/Kyonru/feather/security/advisories/new

If private vulnerability reporting is unavailable, open a public issue with only
a brief request for a private security contact. Do not include exploit details,
proof-of-concept code, secrets, logs, screenshots, or vulnerable project files in
the public issue.

Helpful reports include:

- The affected Feather version and installation method.
- The affected surface, such as the desktop app, CLI, Lua runtime, package
  installer, plugin system, debugger, console, build pipeline, or generated
  artifacts.
- Reproduction steps or a minimal proof of concept.
- Expected impact and any known mitigations.
- Whether the issue is already public or has been shared elsewhere.

## Response Expectations

You should receive an initial response within 7 days. Accepted vulnerabilities
will be triaged, fixed in a supported release when possible, and documented in
release notes or an advisory once disclosure is safe. Reports may be declined if
they require already-compromised developer machines, only affect intentionally
enabled dangerous development settings, or do not create a meaningful security
impact.

## Development-Only Features

Feather includes powerful development tools, including a debugger, console,
package installer, hot reload, and build helpers. Treat these as trusted
development tooling unless the documentation for a specific feature says it is
safe for production. Use `feather doctor --production` or
`feather doctor --security --json` before shipping a build.
