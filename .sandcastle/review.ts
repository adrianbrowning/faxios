import { createSandbox, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

await using sandbox = await createSandbox({
      // branch: "agent/pr-review",
      sandbox: docker(),
      branch: `review-agent-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${Math.random().toString(36).slice(2, 8)}`
    });

await sandbox.run({
  agent: claudeCode("us.anthropic.claude-opus-4-6-v1"),
  prompt: `Use the skill /cc-pr-review Review the changes in this pull request. Write to a .md file and .html file under the local ./.claude/reviews folder.
Ignore .sandcastle & plan dirs
When complete emit <promise>COMPLETE</promise>`,
    maxIterations: 3,
});

const found = await sandbox.exec(`find ${sandbox.worktreePath}/.claude/reviews -name '*.md'`);

await sandbox.run({
  agent: claudeCode("us.anthropic.claude-opus-4-6-v1"),
  prompt: `Validate this review file: ${found.stdout}
Check completeness, and that findings reference real code.
Output your final review into the .claude/reviews dir.
Ignore .sandcastle & plan dirs
When complete emit <promise>COMPLETE</promise>`,
    maxIterations: 2
});
