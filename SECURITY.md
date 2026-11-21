# Security

Cueboard handles meeting notes, emails and calendar data, so security reports matter here.

## Reporting a problem

Please don't open a public issue. Use **Report a vulnerability** on this repository's
[Security tab](https://github.com/7mehul/cueboard/security/advisories/new), which reaches the
maintainer privately. Expect a reply within a week.

Useful to include: what you found, how to reproduce it, and what someone could do with it.

## What's in scope

- The server (`scripts/serve.ts`): it should only answer the page it serves, and keys
  (Anthropic, Google, Granola) should never reach the browser. Without a password it should answer
  only its own machine.
- The password for self-hosted servers (`CUE_PASSWORD`, `scripts/auth.ts`): sessions, the limit on
  guesses, and that nothing but `/healthz` and the sign-in page is reachable without it.
- Calendar links: the server fetches the link a user gives it, so it must never reach a private or
  internal address (`scripts/calendar-link.ts`).
- Anything that lets one person's memory, boards or documents reach another person or a model
  call they didn't make.

## How data is handled

- Boards and memory live in the browser (or a Claude artifact's own storage), not on the server.
- Keys stay in the server's environment. Text you paste is sent to Anthropic to be read. With
  research on, the names and companies of the people you meet go to Claude's web search.
- A calendar's private link and a Google grant are sealed into a cookie with a key the server keeps
  in its data folder (`local.key`), and never logged.
