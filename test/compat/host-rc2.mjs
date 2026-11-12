/** Run the installed-package gate against the official DSH 0.2.2-rc.2 source build. */
process.env.DSH_OPS_TEST_HOST_VERSION = '0.2.2-rc.2'
await import('./host-rc1.mjs')
