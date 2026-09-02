const conventionalCommitTypes = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "license",
  "meta",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", conventionalCommitTypes],
    "header-max-length": [2, "always", 100],
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
