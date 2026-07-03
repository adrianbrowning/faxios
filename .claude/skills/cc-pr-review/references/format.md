# PR Review Comment Format

Post as a **single `gh pr comment`**. Use this exact structure.

## Template

```markdown
<details>
<summary>📖 How to use this review</summary>

- 🔴 **Critical** = Blocking issues, must fix before merge
- 🟡 **High Priority** = Should fix, impacts quality/security
- 💡 **Observations** = Nice to have, consider for future
- ✅ **Positives** = What's working well

Click any section to expand/collapse details.

</details>

---

## 🎯 Executive Summary

**Status**: [✅ Approved | ⚠️ Approved with Suggestions | ❌ Changes Required]
**Critical Issues**: [count] blocking
**High Priority**: [count] issues
**Observations**: [count] suggestions

<details>
<summary>📋 Quick Stats</summary>

| Category | Count |
|----------|-------|
| Critical (blocking) | X |
| High priority | X |
| Observations | X |
| Positive highlights | X |

</details>

---

## 🔴 Critical Issues (Must Fix Before Merge)

<details>
<summary>Issue <N>: [Brief title]</summary>

**File**: `path/to/file.tsx:45`

**Problem**: [Description]

**Code**:
```typescript
// problematic code
```

**Impact**: [Why this is critical]

**Fix**: [Specific solution]

<details>
<summary>🤖 AI Fix Prompt</summary>

```
Fix [specific issue] in [file path].

Problem: [Concise description]

Current code at line [X]:
[Show problematic code snippet]

Required changes:
- [Specific change 1]
- [Specific change 2]

Expected outcome: [What the fixed code should do]
```

</details>

[Repeat for each critical issue]

---

## 🟡 High Priority Issues

<details>
<summary>[Count] issues - click to expand</summary>

<details>
<summary>Issue <N>: [Brief title]</summary>

**File**: `path/to/file.tsx:45`

[Details...]

<details>
<summary>🤖 AI Fix Prompt</summary>

```
Fix [specific issue] in [file path].

Problem: [Concise description]

Current code at line [X]:
[Show problematic code snippet]

Required changes:
- [Specific change 1]
- [Specific change 2]

Expected outcome: [What the fixed code should do]
```

</details>

</details>

[Repeat for each high priority issue]

</details>

---

## 💡 Observations & Suggestions

<details>
<summary>[Count] observations - click to expand</summary>

<details>
<summary>Observation <N>: [Topic]</summary>

**Suggestion**: [Detailed suggestion and explanation]

<details>
<summary>🤖 AI Fix Prompt</summary>

```
Fix [specific issue] in [file path].

Problem: [Concise description]

Current code at line [X]:
[Show problematic code snippet]

Required changes:
- [Specific change 1]
- [Specific change 2]

Expected outcome: [What the fixed code should do]
```

</details>

</details>

[Repeat for each observation]

</details>

---

## ✅ Positive Observations

<details>
<summary>What's working well - click to expand</summary>

1. ✅ [Positive point 1]
2. ✅ [Positive point 2]
3. ✅ [Positive point 3]

</details>

---

## 📝 Required Actions

**Blocking (must fix):**
- [ ] [Action item with file reference]
- [ ] [Action item with file reference]

**High priority (should fix):**
- [ ] [Action item]
- [ ] [Action item]

<details>
<summary>All recommended actions</summary>

**Observations (consider):**
- [ ] [Action item]
- [ ] [Action item]

</details>

---

## Verdict

[✅ **APPROVED** | ⚠️ **APPROVED WITH SUGGESTIONS** | ❌ **CHANGES REQUESTED**]

[1-2 sentence summary of why this verdict was given]

[If changes requested, list the top 3 most important fixes needed]
```

## Rules

- Use collapsible `<details>` sections for lengthy content
- Keep code examples short or collapsed
- Use emoji severity indicators consistently
- Group issues by severity across all domains
- Always include positive observations
- End with clear verdict
- If you use `#<number>` in the review, make it a link. E.g. heading `### 4. Foo Bar` → link `[#4](#4-foo-bar)`
- DO NOT use a claude.ai link. Use summary/details format with a prompt instead
