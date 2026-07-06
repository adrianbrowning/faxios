import { createSandbox, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

await using sandbox = await createSandbox({
      // branch: "agent/pr-review",
      sandbox: docker(),
      branch: `review-agent-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${Math.random().toString(36).slice(2, 8)}`,
     copyToWorktree: ["plans"]
    });

await sandbox.run({
  agent: claudeCode("us.anthropic.claude-sonnet-4-6"),
  prompt: `
/do-work 
/tdd
/tdd-integration
/test-validity-review
/testing-best-practice

Plan — @plans/response-schema-validation.md
Issues - @plans/issues.jsonl

Get the first available issue.
Stop once complete, only do 1 issue
Make sure to mark task as done.
 When complete emit <promise>COMPLETE</promise>`,
    maxIterations: 3,
});

const found = await sandbox.exec(`find ${sandbox.worktreePath}/.claude/reviews -name '*.md'`);
const reviewFiles = found.stdout.trim().split('\n').filter(f => /^[\w/._ -]+\.md$/.test(f)).join('\n');

await sandbox.run({
  agent: claudeCode("us.anthropic.claude-opus-4-6-v1"),
  prompt: `Validate this review file: ${reviewFiles}\nCheck completeness, and that findings reference real code.\n output your final review into the .claude/reviews dir.\n When complete emit <promise>COMPLETE</promise>`,
    maxIterations: 2
});
