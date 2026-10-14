# Security policy

## Supported versions

The maintainers provide security updates for these versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Threat model

For details about the runtime attack surface, supply chain security, and development environment security, see [THREATMODEL.md](THREATMODEL.md). Researchers should read it before reporting. It documents what is in scope, what is an explicit non-goal, and where known gaps remain.

The maintainer incident-response runbook, including session revocation, key rotation, and notification steps, is in [THREATMODEL.md §3.7](THREATMODEL.md#37-incident-response-runbook).

## Verifying a release

Releases of `@gcmdev/faxios` published by the release workflow (`.github/workflows/release.yml`) carry an [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) that cryptographically binds the package to the workflow and commit SHA that produced it. Versions 0.1.0 to 0.2.1 were published by hand and have no attestation.

Consumers can verify provenance locally:

```bash
# Verify every package in your lockfile, including @gcmdev/faxios
npm audit signatures
```

A successful verification proves the tarball was built in the `adrianbrowning/faxios` GitHub Actions environment on a known commit. It was not tampered with between build and registry. It does not prove the code in that commit is free of bugs.

If `npm audit signatures` reports a missing or invalid attestation for a `@gcmdev/faxios` version newer than 0.2.1, treat it as a potential supply-chain incident and report via the private channel below.

## Reporting a vulnerability

If you believe you have found a security vulnerability in faxios, report it through the private channel below. If the vulnerability is in a third-party library, report it to that library's maintainers.

## Reporting process

Do not report security vulnerabilities through public GitHub issues. Use GitHub's private security channel by opening a [security advisory](https://github.com/adrianbrowning/faxios/security/advisories/new).

This channel is for security vulnerabilities only. To report harassment or other behavior that breaks the code of conduct, use the private channel described in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md#reporting).

## Disclosure policy

When we receive a security vulnerability report, we assign it a primary handler. The handler confirms the problem, determines affected versions, evaluates severity, develops and ships a fix, and coordinates public disclosure with the reporter.

### 60-day resolution and disclosure commitment

We commit to resolving and publicly disclosing every valid security advisory within 60 calendar days of the initial report, measured from the moment a report is received through the [GitHub security advisory channel](https://github.com/adrianbrowning/faxios/security/advisories/new).

The 60-day clock is a commitment to reporters and downstream consumers. It is a backstop, not an aspiration. If we cannot ship a fix in time, we still publish the advisory at day 60 with mitigation guidance so consumers can act. We then keep working on the fix and update the advisory with patch details when they are ready.

We release the fix separately from the advisory, but we do not delay the advisory beyond day 60. We try to release the fix before publishing the advisory so users can patch before vulnerability details are public.

Exceptions and extensions:

- If a reporter requests a shorter embargo (e.g. they plan to present findings at a conference), we accommodate where possible.
- If a fix requires a breaking change, coordinating with major downstream consumers, or an upstream fix (for example in a runtime's `fetch` implementation), we may extend beyond 60 days. Any extension is disclosed publicly at day 60 via the advisory, with a revised ETA and the reason.
- If a report turns out to be out of scope (e.g. falls under an explicit non-goal in [THREATMODEL.md §2.6](THREATMODEL.md)), we close it with an explanation to the reporter within the triage window (≤ 3 days). Out-of-scope reports do not enter the 60-day queue.
- Actively exploited vulnerabilities are treated as incidents. The fix and advisory ship as soon as a patch is validated, not on the 60-day schedule.

Reporter expectations:

While a report is under embargo, we ask reporters not to disclose it publicly until the earlier of the coordinated advisory publication or day 60. If the 60-day deadline passes without action from us, reporters are free to disclose independently. We treat that as a failure on our part, not on theirs.

## Security updates

We release security updates after the patch is developed and tested. We notify users through the project's GitHub repository, publish release notes and security advisories on GitHub releases, and deprecate all versions that contain the vulnerability.
