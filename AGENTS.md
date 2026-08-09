# Agent Notes

This is an Obsidian plugin focused primarily on search.

Read these first:

1. This is a greenfield project, don't carry any backward-compatibility overhead.
2. Do not write unit tests or verify functionality.

## Rules

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate, no scaffolding "for later", later can scaffold for itself.
- Deletion over addition. Boring over clever, clever is what someone decodes at 3am.
- Fewest files possible. Shortest working diff wins — but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
