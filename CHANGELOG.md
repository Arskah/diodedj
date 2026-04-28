# Changelog

## [0.5.0](https://github.com/Arskah/diodedj/compare/v0.4.0...v0.5.0) (2026-04-28)


### Features

* **library:** sortable columns in track search ([#34](https://github.com/Arskah/diodedj/issues/34)) ([193782e](https://github.com/Arskah/diodedj/commit/193782e7170e3444a0dd2197dce4c3e63ab8a14c))
* **library:** sortable columns in track search ([#52](https://github.com/Arskah/diodedj/issues/52)) ([193782e](https://github.com/Arskah/diodedj/commit/193782e7170e3444a0dd2197dce4c3e63ab8a14c))
* **main:** modern native window chrome ([#50](https://github.com/Arskah/diodedj/issues/50)) ([f64bed6](https://github.com/Arskah/diodedj/commit/f64bed6a985799c4d34a71772fae3215cabca308)), closes [#49](https://github.com/Arskah/diodedj/issues/49)
* **playlist:** history-aware prev navigation ([#45](https://github.com/Arskah/diodedj/issues/45)) ([0dbf72f](https://github.com/Arskah/diodedj/commit/0dbf72fec0be688c74c79e66046f8353d6b21aa7))
* **session:** persist playlist and history across restarts ([#53](https://github.com/Arskah/diodedj/issues/53)) ([12e61bd](https://github.com/Arskah/diodedj/commit/12e61bd6862f67f6d8ba9755dc9d6c9a5b7254e6))
* **ui:** reserve traffic light space, move search to library header ([#51](https://github.com/Arskah/diodedj/issues/51)) ([7d49ce6](https://github.com/Arskah/diodedj/commit/7d49ce609888e1a2c0ce8f48955f25bb51841558))


### Bug Fixes

* append history on stop ([94dd403](https://github.com/Arskah/diodedj/commit/94dd4034eed0a97701b0e0bbbfcc9aa93ae0d2be))
* bigger autoplaylist with distinct threshold for generation ([f23892f](https://github.com/Arskah/diodedj/commit/f23892fab5ddd1aeff0eb317240f8fa83fe38dd7))
* **ipc:** correct Handler type to accept varied return types ([34e02f6](https://github.com/Arskah/diodedj/commit/34e02f60bbad4d0d20d309897f51f1b982c09cc4))


### Code Refactoring

* add appendHistory fn ([14f68a5](https://github.com/Arskah/diodedj/commit/14f68a5cba85726da76d63071508e1ee42469c00))
* **playlist:** split current track from queue ([#44](https://github.com/Arskah/diodedj/issues/44)) ([982d5ec](https://github.com/Arskah/diodedj/commit/982d5ec46270fc129abf50a6bd118b95496f77ca))


### Continuous Integration

* add missing permissions for lint job ([#48](https://github.com/Arskah/diodedj/issues/48)) ([a638918](https://github.com/Arskah/diodedj/commit/a6389181dee0e199bbf4bd25f12f68f42e704fad))

## [0.4.0](https://github.com/Arskah/diodedj/compare/v0.3.1...v0.4.0) (2026-04-27)


### Features

* **logging:** adopt electron-log + ffmpeg capture ([2144b5e](https://github.com/Arskah/diodedj/commit/2144b5e4f445669ec58cbdf13d3aca285e56fc2d))
* **media:** seekable transcode + broader format support ([#41](https://github.com/Arskah/diodedj/issues/41)) ([827b50c](https://github.com/Arskah/diodedj/commit/827b50c9c11d85d94346cb88e273cee3436bf9a2))
* **renderer:** show track metadata tooltip on hover ([#42](https://github.com/Arskah/diodedj/issues/42)) ([0db40be](https://github.com/Arskah/diodedj/commit/0db40be31740d8e2c5ce810cc41e13d103fee707))


### Miscellaneous Chores

* migrate prettier config to prettier.config.mjs ([dba4f11](https://github.com/Arskah/diodedj/commit/dba4f11656f52adb7b2891e0f4b386279c19175e))


### Code Refactoring

* **renderer:** convert to Svelte 5 with runes ([#39](https://github.com/Arskah/diodedj/issues/39)) ([9606c2e](https://github.com/Arskah/diodedj/commit/9606c2e8acec0a115b8fb8113f2f061cd175f619))


### Tests

* **main:** cover transcodeToWav across all supported formats ([89e6521](https://github.com/Arskah/diodedj/commit/89e6521a9446397e249c0f45b005bb7d685c5621))

## [0.3.1](https://github.com/Arskah/diodedj/compare/v0.3.0...v0.3.1) (2026-04-26)


### Miscellaneous Chores

* **deps:** update dependency vite to v8 ([#37](https://github.com/Arskah/diodedj/issues/37)) ([5a6cf50](https://github.com/Arskah/diodedj/commit/5a6cf507bfc78f8d492a932aab14e7f8b78586da))
* update pnpm-workspace ([4f3818c](https://github.com/Arskah/diodedj/commit/4f3818c46bee58bb84103735398c7ee844d49402))


### Build System

* migrate to electron-vite ([#35](https://github.com/Arskah/diodedj/issues/35)) ([2f3955d](https://github.com/Arskah/diodedj/commit/2f3955de1256337d23fc43cac1bf2d21e391e82c))

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
