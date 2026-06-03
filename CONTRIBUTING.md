# Contributing

Two kinds of contributions: **packs** (a capability you built) and **the SDK itself**.

## Contributing a pack to the community registry

1. Build your pack with the SDK: `create` → implement → `lint` → `test` → `publish`.
2. `kruxos-pack publish` produces `dist/<pack>.tar.gz` and `dist/<pack>.json`.
3. Open a PR to [`altvale/kruxos`](https://github.com/altvale/kruxos) adding:
   - `packs/<name>/<version>/<name>-<version>.tar.gz` — the tarball
   - `packs/<name>/source/` — your pack source
   - your entry appended to `packs/index.json` (the `tarball_url` is the relative in-repo path emitted by `publish`), and bump the top-level `updated_at`
4. CI validates the submission; a maintainer reviews and merges.

Packs that request network egress, secrets, or filesystem access beyond the
workspace get a closer security review. Please follow the
[Capability Design Guidelines](https://github.com/altvale/kruxos/blob/main/docs/public/docs/pack-authors/capability-design-guidelines.md)
— a `lint`-clean pack with typed errors, recovery hints, and clear
`when_to_use` guidance is much faster to review.

You don't need to host anything: a pack in the registry is hosted in-repo. If
you'd rather distribute it yourself, see the "Share the tarball" and "Your own
registry" options printed by `kruxos-pack publish`.

## Contributing to the SDK

```bash
git clone https://github.com/altvale/kruxos-pack-sdk
cd kruxos-pack-sdk

# Node CLI
cd cli && npm install && npm test

# Python runner + test harness
cd .. && pip install pytest && pytest runner/ testing/
```

- Keep `kruxos-pack <command>` behaviour covered by tests in `cli/tests/`.
- Run both suites green before opening a PR.
- Open PRs against `main`.

## License

By contributing you agree that your contributions are licensed under the MIT
License (see [LICENSE](LICENSE)).
