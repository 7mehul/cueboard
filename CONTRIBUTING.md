# Contributing

Thanks for looking. Issues and pull requests are welcome.

## Getting set up

```bash
npm install
npm run demo                                     # the demo week at localhost:5190, no key needed
npm test                                         # all tests
npm run typecheck
```

Node 26 runs the TypeScript files directly; there's no build step except the app bundle, which
the server rebuilds on every change.

## Adding your notes app

A connector for another notes app (Fireflies, Fathom, tl;dv…) is one file in `connectors/` and
its test. [CONNECTORS.md](CONNECTORS.md) walks through it, and you don't need the app to write it.

## Before you open a pull request

- `npm test` and `npm run typecheck` pass.
- A change to what goes on a board comes with a test, and `node scripts/scale.ts --n 20000 --fuzz-model`
  still reports that every board passed every rule.
- Keep the house style: plain words in anything a user reads, comments that say why rather than what.
- Nothing personal in fixtures: use reserved domains (`example.com`, `*.example`) for made-up people.

## Releasing (maintainers)

`npm version 0.2.0 && git push --follow-tags` sets the version in package.json and tags it. The
Release workflow then runs the tests and:

- publishes the npm package, so `npx cueboard` gets the new version (`scripts/check-package.sh`
  runs it from a fresh install first);
- checks the Docker image on Intel/AMD and ARM (`scripts/check-image.sh`) and publishes it to
  `ghcr.io/7mehul/cueboard`;
- writes the GitHub release from the commits.

Running the workflow by hand builds and checks both images without publishing anything.

Once, before the first release:

1. Publish the first version by hand, from a clean clone of `main`: `npm login`, then
   `npm publish --access public` (it builds the package first).
2. On npmjs.com, in the package's settings, add a trusted publisher: GitHub Actions, repository
   `7mehul/cueboard`, workflow `release.yml`. Releases then publish without a token.
3. After the first tag, make the image public in GitHub (Packages → cueboard → Package settings),
   so servers can pull it without signing in.

## License

Cueboard is licensed under the [GNU AGPL-3.0](LICENSE). By contributing, you agree that your
contribution is licensed under it too.
