#!/usr/bin/env node

import {ArgValueType, FlagRequirement, parseArgs} from 'cli-vir';
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
        port: {
            flag: {
                valueRequirement: FlagRequirement.Required,
            },
            type: ArgValueType.Number,
            description:
                'Port for the dev server. Requires `--dev`. Fails if the port is taken. Without this, the first free port starting at 5173 is used.',
        },
    },
    {
        binName: 'hub-vir',
        packageJsonPath: resolve(import.meta.dirname, '..', 'package.json'),
        importMeta: import.meta,
    },
);

if (args.port !== false && !args.dev) {
    throw new Error('The --port flag only applies to the dev server. Add --dev or remove --port.');
} else if (args.dev) {
    await startHubDevServer({
        configPath: args.configPath,
        port: args.port === false ? undefined : args.port,
    });
} else {
    await buildHub({
        configPath: args.configPath,
        outDir: args.outDir || undefined,
    });
}
