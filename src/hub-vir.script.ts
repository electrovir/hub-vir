#!/usr/bin/env node

import {FlagRequirement, parseArgs} from 'cli-vir';
import {resolve} from 'node:path';
import {buildHub, startHubDevServer} from './build-hub.js';

const args = parseArgs(
    process.argv,
    {
        configPath: {
            required: true,
            position: 0,
            description: 'Path to a hub-vir config file (JSON, YAML, TOML, JS, or TS).',
        },
        outDir: {
            flag: {
                valueRequirement: FlagRequirement.Required,
            },
            description: 'Directory to write the built site into. Defaults to `dist`.',
        },
        dev: {
            flag: {
                valueRequirement: FlagRequirement.Blocked,
            },
            description: 'Serve the hub with a Vite dev server instead of building it.',
        },
    },
    {
        binName: 'hub-vir',
        packageJsonPath: resolve(import.meta.dirname, '..', 'package.json'),
        importMeta: import.meta,
    },
);

if (args.dev) {
    await startHubDevServer({
        configPath: args.configPath,
    });
} else {
    await buildHub({
        configPath: args.configPath,
        outDir: args.outDir || undefined,
    });
}
