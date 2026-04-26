# Changelog

## [0.3.0](https://github.com/Arskah/diodedj/compare/v0.2.1...v0.3.0) (2026-04-26)


### Features

* **main:** persist console output to log file ([b05ee72](https://github.com/Arskah/diodedj/commit/b05ee72d36fcf832005babf71935bdc782424ac3))


### Bug Fixes

* **deps:** pin dependency kysely to 0.28.16 ([#31](https://github.com/Arskah/diodedj/issues/31)) ([278fa19](https://github.com/Arskah/diodedj/commit/278fa19f676b6844e3e05587775c23ceb22f30df))
* **deps:** promote ms to direct dependency ([9c7a6bb](https://github.com/Arskah/diodedj/commit/9c7a6bb7c210f75584d2f06adb519111e2593cb7))
* **scanner:** surface readdir and parse errors ([bcd7ea6](https://github.com/Arskah/diodedj/commit/bcd7ea6889b1dbc452a6a9f9d3834cb18e7449f3))


### Code Refactoring

* **db:** migrate to Kysely with file-based migrations ([cc71d23](https://github.com/Arskah/diodedj/commit/cc71d2320b0ae329261419e56bb93e7b484bdd4a))
* split window from main ([ac7d190](https://github.com/Arskah/diodedj/commit/ac7d19050d012e4749a28fc5a14012ec352b622e))


### Tests

* rm unused unit tests ([497c863](https://github.com/Arskah/diodedj/commit/497c863a1cce5a8413364525e8417a948ba258d9))


### Build System

* **mac:** declare TCC usage descriptions for protected dirs ([d545292](https://github.com/Arskah/diodedj/commit/d545292640ca9b55d4c7f5ad43d4e0adcaf288cf))

## [0.2.1](https://github.com/Arskah/diodedj/compare/v0.2.0...v0.2.1) (2026-04-26)


### Bug Fixes

* **scripts:** use node: prefixed imports in copy-assets ([4614c65](https://github.com/Arskah/diodedj/commit/4614c65407d137a368c694e0e3d9775e7dd7f283))


### Miscellaneous Chores

* **pkg:** cross-platform build script and add repo metadata ([0b43bb9](https://github.com/Arskah/diodedj/commit/0b43bb97010b4dd0dc8dfca44facdc1e4a701afa))

## [0.2.0](https://github.com/Arskah/diodedj/compare/v0.1.0...v0.2.0) (2026-04-26)


### Features

* **playback:** add drag-scrub seek with Range support ([ad6fb81](https://github.com/Arskah/diodedj/commit/ad6fb81ad10fe19e07aabe1b06be06c7172f4ab8))
* **release:** package app with electron-builder and bundle ffmpeg ([ab9070b](https://github.com/Arskah/diodedj/commit/ab9070b7f41bd31052d4d1ff5d36e74fd7dd44d8))
* **ui:** move playback controls to top of app ([ed92269](https://github.com/Arskah/diodedj/commit/ed92269404f65257c4124344f8f2333ecd4d3396))


### Bug Fixes

* **ci:** allowlist electron postinstall for pnpm 10 ([d43ad09](https://github.com/Arskah/diodedj/commit/d43ad09e0173c7bf6a540c388c3bfcc0d6174073))
* **deps:** pin dependencies ([#1](https://github.com/Arskah/diodedj/issues/1)) ([d0dff6b](https://github.com/Arskah/diodedj/commit/d0dff6bf96a613b469f0b89d0a8faaadea21869c))
* **deps:** pin dependencies ([#20](https://github.com/Arskah/diodedj/issues/20)) ([75553b4](https://github.com/Arskah/diodedj/commit/75553b4f5d10884615e6e7b0806c43e55348d82c))
* **playback:** force m4a/mp4 through ffmpeg transcode ([4ff23a1](https://github.com/Arskah/diodedj/commit/4ff23a1b46785feeb3f57ee48d7d95bc0b829a46))


### Miscellaneous Chores

* add commitlint to enforce conventional commits ([0a0e736](https://github.com/Arskah/diodedj/commit/0a0e7368095e2953715ba39dcd2e4e3361303e20))
* **deps:** pin dependencies ([#14](https://github.com/Arskah/diodedj/issues/14)) ([b87699c](https://github.com/Arskah/diodedj/commit/b87699c7a2751a426389b545ec0b76002f56b687))
* **deps:** pin dependency @playwright/test to 1.59.1 ([#21](https://github.com/Arskah/diodedj/issues/21)) ([05c3967](https://github.com/Arskah/diodedj/commit/05c39672acf473fd4987241cc5cb938ff7895d4b))
* **deps:** pin pnpm/action-setup action to v4 ([#15](https://github.com/Arskah/diodedj/issues/15)) ([7bbeee8](https://github.com/Arskah/diodedj/commit/7bbeee8d84e1e1e831bd312d316507707c82a504))
* **deps:** update actions/checkout action to v6 ([#9](https://github.com/Arskah/diodedj/issues/9)) ([e1624e1](https://github.com/Arskah/diodedj/commit/e1624e14cc5efc2193237a4b69a460731bdb4725))
* **deps:** update actions/setup-node action to v6 ([#10](https://github.com/Arskah/diodedj/issues/10)) ([6ceb1ec](https://github.com/Arskah/diodedj/commit/6ceb1ec53befd1c857560e047b765e4ed9386590))
* **deps:** update dependency lint-staged to v16 ([#4](https://github.com/Arskah/diodedj/issues/4)) ([d692358](https://github.com/Arskah/diodedj/commit/d692358b30135b66a72b5fed84b0676305841954))
* **deps:** update dependency vitest to v4 ([#5](https://github.com/Arskah/diodedj/issues/5)) ([87e2150](https://github.com/Arskah/diodedj/commit/87e21501fa3566fc035b177e41502d6861929a4a))
* **deps:** update eslint monorepo to v10 ([#6](https://github.com/Arskah/diodedj/issues/6)) ([cc8230d](https://github.com/Arskah/diodedj/commit/cc8230d0a5388ced11237a76bdef31db3eb14507))
* **deps:** update node.js to v24.15.0 ([#3](https://github.com/Arskah/diodedj/issues/3)) ([6d04966](https://github.com/Arskah/diodedj/commit/6d049669968ae97703259ead54905a0b815d9e9b))
* **deps:** update pnpm to v10 ([#7](https://github.com/Arskah/diodedj/issues/7)) ([72260fa](https://github.com/Arskah/diodedj/commit/72260fac55bbce89b6c05896f692b09cc566de03))
* **deps:** update pnpm/action-setup action to v6 ([#12](https://github.com/Arskah/diodedj/issues/12)) ([78cc55a](https://github.com/Arskah/diodedj/commit/78cc55a50e612dbdfba59011c211777f3dea9123))
* semantic commits for renovate ([50cad24](https://github.com/Arskah/diodedj/commit/50cad242bf6e5db3461cd081c008056f3c635a41))
* **tooling:** consolidate tsconfigs and move tests out of src ([0c25724](https://github.com/Arskah/diodedj/commit/0c25724544dd71a108ebcff9d33f8e9767ba6f74))
* update release-please config ([6adf110](https://github.com/Arskah/diodedj/commit/6adf1107a8b15629b90b0ff2e09d6baa7c4e8b6b))


### Code Refactoring

* **db:** type prepared statements, drop result casts ([53677e3](https://github.com/Arskah/diodedj/commit/53677e3aefe9293c837500bb6b9e1602bf1289b3))
* **main:** extract audio formats to shared module ([73cee06](https://github.com/Arskah/diodedj/commit/73cee0623b96aa0a2127239a17b189819f34242d))
* **main:** extract IPC handlers to ipc module ([37ea5a4](https://github.com/Arskah/diodedj/commit/37ea5a458e5bf4c8fa06802b97dd77bc82973c38))


### Tests

* **e2e:** add Playwright suite covering library, playback, and playlist flows ([afc503e](https://github.com/Arskah/diodedj/commit/afc503e2c2a3089a988383e0a6a09c74281de747))


### Continuous Integration

* add CI workflow and release-please ([37b91d0](https://github.com/Arskah/diodedj/commit/37b91d093c7ec631a44a0d856225cbf98e81094d))
* add release-please manifest config ([cc59b59](https://github.com/Arskah/diodedj/commit/cc59b596ca6bf3616853401a54815035d9080203))
* pin action digests and use custom GitHub App token ([8dba70d](https://github.com/Arskah/diodedj/commit/8dba70d35cb429b97232a955a7666cb8561bc8f6))
* rewrite GH actions ([d434477](https://github.com/Arskah/diodedj/commit/d434477871608f63ab9b68c8aad28f4e1b880fa1))
