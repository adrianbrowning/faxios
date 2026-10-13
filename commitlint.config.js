export default {
  "extends": [ "@commitlint/config-conventional" ],
  "rules": {
    // Reject Start Case, PascalCase and UPPER CASE subjects, but allow code identifiers such as
    // FaxiosHeaders or forwardTo inside a lower-case or sentence-case subject.
    "subject-case": [ 2, "never", [ "start-case", "pascal-case", "upper-case" ]],
  },
};