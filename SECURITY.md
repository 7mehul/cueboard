# Security

Cueboard handles meeting notes, emails and calendar data, so security reports matter here.

## Reporting a problem

Please don't open a public issue. Use **Report a vulnerability** on this repository's
[Security tab](https://github.com/7mehul/cueboard/security/advisories/new), which reaches the
maintainer privately. Expect a reply within a week.

Useful to include: what you found, how to reproduce it, and what someone could do with it.

## What's in scope

- The local server (`scripts/serve.ts`): it should only answer the page it serves, and keys
  (Anthropic, Google, Granola) should never reach the browser.
- The hosted mode (`--hosted`): invite codes, session cookies, rate limits, the sealed Google grant.
- Anything that lets one person's memory, boards or documents reach another person or a model
  call they didn't make.

## How data is handled

- Boards and memory live in the browser (or a Claude artifact's own storage), not on the server.
- Keys stay in the server's environment. Text you paste is sent to Anthropic to be read.
- `deploy/local.env` holds public sample values for trying the hosted mode on your own machine;
  the server refuses them anywhere else.
