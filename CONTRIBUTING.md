# Contributing

Thanks for looking. Issues and pull requests are welcome.

## Getting set up

```bash
npm install
node scripts/serve.ts 5190 --demo --fake-model   # the demo week, no key needed
npm test                                         # all tests
npm run typecheck
```

Node 26 runs the TypeScript files directly; there's no build step except the app bundle, which
the server rebuilds on every change.

## Before you open a pull request

- `npm test` and `npm run typecheck` pass.
- A change to what goes on a board comes with a test, and `node scripts/scale.ts --n 20000 --fuzz-model`
  still reports that every board passed every rule.
- Keep the house style: plain words in anything a user reads, comments that say why rather than what.
- Nothing personal in fixtures: use reserved domains (`example.com`, `*.example`) for made-up people.

## License

Cueboard is licensed under the [GNU AGPL-3.0](LICENSE). By contributing, you agree that your
contribution is licensed under it too.
