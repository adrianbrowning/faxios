# Security policy

## ⚠️ Decompression bomb / unbounded response buffering

By default, `maxContentLength` and `maxBodyLength` are set to `-1` (unlimited). A malicious or compromised server can return a small gzip/deflate/brotli/zstd-compressed body that expands to gigabytes, exhausting memory.

**If you make requests to servers you do not fully trust, you MUST set a `maxContentLength` (and `maxBodyLength`) suitable for your workload.** The fetch adapter enforces the limit while the response is read, so setting it is sufficient to neutralize decompression-bomb attacks.

```js
import faxios from "@gcmdev/faxios";

await faxios.get('https://example.com/data', {
  maxContentLength: 10 * 1024 * 1024, // 10 MB
  maxBodyLength: 10 * 1024 * 1024,
});

// Or globally:
faxios.defaults.maxContentLength = 10 * 1024 * 1024;
faxios.defaults.maxBodyLength = 10 * 1024 * 1024;
```

The default was not tightened because doing so would silently break every legitimate download larger than the chosen cap. The responsibility to pick a safe ceiling for untrusted sources rests with the application.

## Other security-sensitive options

The following request-config options have direct security implications. They are documented in full alongside the rest of the [request config](/pages/advanced/request-config), and summarised here so they show up in one place.

| Option | Risk | Mitigation |
| --- | --- | --- |
| [`withXSRFToken`](/pages/advanced/request-config#withxsrftoken) | Setting `true` forces the XSRF header on cross-origin requests. Older faxios versions implicitly enabled this with `withCredentials: true`; newer versions require both flags. | Leave at `undefined` (same-origin only) unless your backend explicitly validates XSRF on cross-origin requests. |
| [`redact`](/pages/advanced/request-config#redact) | `FaxiosError#toJSON()` includes the request config. It masks `authorization`, `proxy-authorization`, `cookie` and `auth` and strips `user:pass@` from URLs, but other secrets (an API key header, a token in `params`) still reach error logs and telemetry. | Pass a `redact` array with the other sensitive config key names. Matching is case-insensitive and recursive. Log `error.toJSON()`, not the error object. |

## Supply-chain hardening: `ignore-scripts` and lifecycle scripts

The repository ships a project-level `.npmrc` that sets `ignore-scripts=true`. This blocks lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`) from any direct or transitive dependency when you run `pnpm install` inside the repo. See [THREATMODEL.md](https://github.com/adrianbrowning/faxios/blob/main/THREATMODEL.md) (threat T-S2) for the rationale.

One consequence: Husky's git hooks are not installed automatically. After your first install, enable them manually:

```bash
pnpm install --frozen-lockfile
pnpm exec husky
```

Run those two commands once per fresh checkout. You do **not** need to re-run them after later installs.

::: danger Do not remove `ignore-scripts=true`
Removing `ignore-scripts=true` from `.npmrc` to "fix" the husky setup re-opens the lifecycle-script attack surface for every other package in the tree. CI installs with the same `.npmrc`, so local behaviour matches CI.
:::

We recommend the same `ignore-scripts=true` setting in any consumer project that pulls faxios (or any other dependency) into a build environment that handles secrets.

## Verifying a Release

Releases of `@gcmdev/faxios` published by the release workflow carry an [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) that cryptographically binds the package to the workflow and commit SHA that produced it. Versions 0.1.0 to 0.2.1 were published by hand and have no attestation.

Consumers can verify provenance locally:

```bash
# Verify every package in your lockfile, including @gcmdev/faxios
npm audit signatures
```

A successful verification proves the tarball was built in the `adrianbrowning/faxios` GitHub Actions environment on a known commit — it was not tampered with between build and registry. It does **not** prove the code in that commit is free of bugs.

If `npm audit signatures` reports a missing or invalid attestation for a `@gcmdev/faxios` version newer than 0.2.1, treat it as a potential supply-chain incident and report via the private channel below.

## Reporting a Vulnerability

If you believe you have found a security vulnerability in the project, please report it to us as described below. We take all security vulnerabilities seriously. If you have found a vulnerability in a third-party library, please report it to the maintainers of that library.

## Reporting Process

Please do not report security vulnerabilities through public GitHub issues. Please use the official security channel on GitHub by logging a [security advisory](https://github.com/adrianbrowning/faxios/security/advisories/new).

## Disclosure Policy

When we receive a security vulnerability report, we assign it a primary handler. The handler confirms the problem, determines affected versions, evaluates severity, develops and ships a fix, and coordinates public disclosure with the reporter.

### 60-day resolution and disclosure commitment

We commit to **resolving and publicly disclosing every valid security advisory within 60 calendar days of the initial report**, measured from the moment a report is received via the [GitHub security advisory channel](https://github.com/adrianbrowning/faxios/security/advisories/new).

The 60-day clock is a commitment to reporters and downstream consumers — a backstop, not an aspiration. If we cannot ship a fix in time, we still publish the advisory at day 60 with the best available mitigation guidance so consumers can act.

**Milestones inside the 60-day window:**

| Day  | Milestone                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Report received. Private advisory opened on GitHub.                                                                                      |
| ≤ 3  | Acknowledgement sent to reporter. Triage decision: in scope / out of scope / duplicate / needs-info.                                     |
| ≤ 10 | Severity assessed (CVSS v4 where applicable). Affected versions confirmed. CVE requested via GitHub if a public identifier is warranted. |
| ≤ 45 | Fix developed, reviewed, tested. Release candidate prepared on a private branch. Reporter offered a preview for validation.              |
| ≤ 60 | Patched release published to npm. Public advisory + CVE published. Reporter credited unless they request otherwise. CHANGELOG updated.   |

**Exceptions and extensions.**

- If a reporter requests a shorter embargo (e.g. they plan to present findings at a conference), we accommodate where possible.
- If a fix requires a breaking change or coordinating with major downstream consumers, we may extend beyond 60 days. Any extension is disclosed publicly at day 60 via the advisory, with a revised ETA and the reason.
- If a report is **out of scope** (e.g. falls under an explicit non-goal documented in the project's [threat model](https://github.com/adrianbrowning/faxios/blob/main/THREATMODEL.md)), we close it with an explanation to the reporter within the triage window (≤ 3 days). Out-of-scope reports do not enter the 60-day queue.
- **Actively exploited vulnerabilities** are treated as incidents: fix and advisory ship as soon as a patch is validated, not on the 60-day schedule.

**Reporter expectations.**

While a report is under embargo, we ask reporters to refrain from public disclosure until the earlier of: (a) the coordinated advisory publication, or (b) day 60. If the 60-day deadline passes without action from us, reporters are free to disclose independently — we will treat that as a failure on our part, not on theirs.

## Security Updates

Security updates are released as soon as possible after the patch has been developed and tested. We notify users of the release via the project's GitHub repository and publish release notes and security advisories on the GitHub releases page. We also deprecate all versions that contain the vulnerability.

## Maintainer-side incident response

For compromise scenarios affecting maintainer accounts, workstations, or release infrastructure (phishing, stolen hardware key, unexpected tag/publish), the project maintains an internal incident-response runbook in [THREATMODEL.md §3.7](https://github.com/adrianbrowning/faxios/blob/main/THREATMODEL.md#37-incident-response-runbook). It covers session revocation, key rotation, downstream notification, and unpublish/deprecate procedures.

## Security Partners and Acknowledgements

We would like to thank the following security researchers for working with us to help make the project safe for everyone:

- [Socket Dev](https://socket.dev/)
- [GitHub Security Lab](https://securitylab.github.com/)
