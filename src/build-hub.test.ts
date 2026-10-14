import {assert, assertWrap, check, waitUntil} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {get} from 'node:https';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildHub, createHubViteConfig, startHubDevServer} from './build-hub.js';

const exampleConfigPath = join(
    dirname(import.meta.dirname),
    'test-files',
    'example-hub',
    'hub-vir.config.yaml',
);

describe(buildHub.name, () => {
    it('builds a deployable site with relative asset paths', async () => {
        const outDir = await mkdtemp(join(tmpdir(), 'hub-vir-test-'));

        try {
            await buildHub({
                configPath: exampleConfigPath,
                outDir,
            });
            /** Rebuilding over a previous build's output is allowed. */
            await buildHub({
                configPath: exampleConfigPath,
                outDir,
            });

            const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
            const assetFiles = await readdir(join(outDir, 'assets'));

            assert.isTrue(indexHtml.includes('src="./assets/'));
            assert.isLengthAtLeast(assetFiles, 1);
        } finally {
            await rm(outDir, {
                recursive: true,
                force: true,
            });
        }
    });
    it('refuses to empty an output directory that contains the config', async () => {
        await assert.throws(
            buildHub({
                configPath: exampleConfigPath,
                outDir: dirname(exampleConfigPath),
            }),
        );
    });
    it('refuses to empty an output directory with unrelated files', async () => {
        const outDir = await mkdtemp(join(tmpdir(), 'hub-vir-test-'));

        try {
            await writeFile(join(outDir, 'keep.txt'), '');

            await assert.throws(
                buildHub({
                    configPath: exampleConfigPath,
                    outDir,
                }),
            );
            assert.deepEquals(await readdir(outDir), [
                'keep.txt',
            ]);
        } finally {
            await rm(outDir, {
                recursive: true,
                force: true,
            });
        }
    });
    it('escapes HTML in the page title', async () => {
        const configDir = await mkdtemp(join(tmpdir(), 'hub-vir-test-'));
        const configPath = join(configDir, 'hub-vir.config.json');
        const outDir = join(configDir, 'dist');

        try {
            await writeFile(
                configPath,
                JSON.stringify({
                    title: 'Tom & Jerry <3',
                    links: [
                        {
                            title: 'Example',
                            url: 'https://example.com',
                            thumbnailEmoji: '🔗',
                        },
                    ],
                }),
            );
            await buildHub({
                configPath,
                outDir,
            });

            assert.isTrue(
                (await readFile(join(outDir, 'index.html'), 'utf8')).includes(
                    '<title>Tom &amp; Jerry &lt;3</title>',
                ),
            );
        } finally {
            await rm(configDir, {
                recursive: true,
                force: true,
            });
        }
    });
    it('defaults the output directory to dist', async () => {
        await assert.throws(
            buildHub({
                configPath: join(process.cwd(), 'dist', 'hub-vir.config.yaml'),
            }),
        );
    });
});

describe(createHubViteConfig.name, () => {
    it('only silences browser externalization warnings', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'hub-vir-test-'));

        try {
            const viteConfig = await createHubViteConfig({
                configPath: exampleConfigPath,
                rootDir,
            });
            const onLog = assertWrap.isDefined(viteConfig.build?.rolldownOptions?.onLog);
            const handledMessages: string[] = [];

            [
                'Module "fs" has been externalized for browser compatibility.',
                'Some other warning.',
            ].forEach((message) => {
                onLog(
                    'warn',
                    {
                        message,
                    },
                    (level, log) => {
                        handledMessages.push(check.isString(log) ? log : log.message);
                    },
                );
            });

            assert.deepEquals(handledMessages, [
                'Some other warning.',
            ]);
        } finally {
            await rm(rootDir, {
                recursive: true,
                force: true,
            });
        }
    });
});

/** The dev server uses a self-signed certificate, which `fetch` rejects. */
function fetchDevServerText(url: string) {
    return new Promise<string>((resolve, reject) => {
        get(
            url,
            {
                rejectUnauthorized: false,
            },
            async (response) => {
                resolve((await response.toArray()).join(''));
            },
        ).on('error', reject);
    });
}

async function findFreePort() {
    const server = createServer();
    await new Promise<void>((resolve) => {
        server.listen(0, resolve);
    });
    const address = server.address();
    await new Promise((resolve) => {
        server.close(resolve);
    });

    return assertWrap.isNumber(check.isString(address) ? undefined : address?.port);
}

describe(startHubDevServer.name, () => {
    it('serves on the given port and refuses to fall back to another one', async () => {
        const port = await findFreePort();
        const server = await startHubDevServer({
            configPath: exampleConfigPath,
            port,
        });

        try {
            assert.isTrue(
                assertWrap.isDefined(server.resolvedUrls?.local[0]).endsWith(`:${port}/`),
            );
            await assert.throws(
                startHubDevServer({
                    configPath: exampleConfigPath,
                    port,
                }),
            );
        } finally {
            await server.close();
            await rm(server.config.root, {
                recursive: true,
                force: true,
            });
        }
    });
    it('reloads hub data when the config file changes', async () => {
        const configDir = await mkdtemp(join(tmpdir(), 'hub-vir-test-'));
        const configPath = join(configDir, 'hub-vir.config.json');

        function writeConfig(title?: string | undefined) {
            return writeFile(
                configPath,
                JSON.stringify({
                    title,
                    links: [
                        {
                            title: 'Example',
                            url: 'https://example.com',
                            thumbnailEmoji: '🔗',
                        },
                    ],
                }),
            );
        }

        await writeConfig();
        const server = await startHubDevServer({
            configPath,
        });

        try {
            const url = assertWrap.isDefined(server.resolvedUrls?.local[0]);

            assert.isFalse((await fetchDevServerText(url)).includes('<title>'));
            assert.isTrue(
                (await fetchDevServerText(new URL('hub-vir-data.js', url).href)).includes('🔗'),
            );

            await writeFile(join(server.config.root, 'unrelated.txt'), '');
            await writeConfig('Changed Hub');

            await waitUntil.isTrue(async () => {
                return (await fetchDevServerText(new URL('hub-vir-data.js', url).href)).includes(
                    'Changed Hub',
                );
            });
            assert.isTrue((await fetchDevServerText(url)).includes('<title>Changed Hub</title>'));
        } finally {
            await server.close();
            await rm(server.config.root, {
                recursive: true,
                force: true,
            });
            await rm(configDir, {
                recursive: true,
                force: true,
            });
        }
    });
});
