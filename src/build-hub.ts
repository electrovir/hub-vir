import {assertWrap, check} from '@augment-vir/assert';
import {
    getObjectTypedEntries,
    log,
    type PartialWithUndefined,
    wrapInTry,
} from '@augment-vir/common';
import {loadConfig} from 'config-vir';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, extname, join, relative, resolve} from 'node:path';
import {themeDefaultKey} from 'theme-vir';
import {tsImport} from 'tsx/esm/api';
import {viraTheme} from 'vira';
import {
    build,
    createServer,
    type InlineConfig,
    mergeConfig,
    type Plugin,
    type UserConfig,
} from 'vite';
import {type HubConfig, hubConfigShape} from './hub-config.js';

const hubDataModuleId = '/hub-vir-data.js';
const resolvedHubDataModuleId = '\0hub-vir-data.js';

/** Everything a previous hub build leaves in its output directory, plus macOS Finder metadata. */
const hubBuildOutputEntries = [
    'index.html',
    'assets',
    'manifest.webmanifest',
    'icon-192.png',
    'icon-512.png',
    '.DS_Store',
];

/** Vite inserts `<title>` children into the HTML without escaping them. */
function escapeHtmlText(text: string) {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Lets the hub be installed as a full screen app on mobile home screens and desktops. */
function createWebAppManifest(hubConfig: Readonly<HubConfig>) {
    return JSON.stringify({
        name: hubConfig.title || 'Hub',
        start_url: './',
        /**
         * Covers the whole origin so iOS keeps same-origin links (like sibling GitHub Pages sites)
         * inside the app instead of opening them in a browser view with Safari controls.
         */
        scope: '/',
        display: 'standalone',
        icons: [
            {
                src: 'icon-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: 'icon-512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    });
}

const iconsDir = join(dirname(import.meta.dirname), 'assets', 'icons');

/** Files that the hub plugin writes into the build output and serves from the dev server. */
const webAppFileContentTypes = {
    'manifest.webmanifest': 'application/manifest+json',
    'icon-192.png': 'image/png',
    'icon-512.png': 'image/png',
};

async function createWebAppFiles(
    hubConfig: Readonly<HubConfig>,
): Promise<Record<keyof typeof webAppFileContentTypes, string | Buffer>> {
    return {
        'manifest.webmanifest': createWebAppManifest(hubConfig),
        'icon-192.png': await readFile(join(iconsDir, 'icon-192.png')),
        'icon-512.png': await readFile(join(iconsDir, 'icon-512.png')),
    };
}

/**
 * Uses the same extension as this file so that the frontend resolves to `.ts` sources when running
 * from `src` and to compiled `.js` files when running from `dist`.
 */
const hubVirAppPath = join(
    import.meta.dirname,
    'frontend',
    'elements',
    `hub-vir-app.element${extname(import.meta.filename)}`,
);

const fontCssPath = join(
    dirname(import.meta.dirname),
    'assets',
    'fonts',
    'atkinson-hyperlegible.css',
);

/** The standard virmator frontend Vite config, which hub settings are merged on top of. */
const virmatorViteConfigPath = join(dirname(import.meta.dirname), 'configs', 'vite.config.ts');

function createHubDataModule({
    hubConfig,
    configDir,
}: Readonly<{hubConfig: HubConfig; configDir: string}>) {
    const thumbnailImports = hubConfig.links.map((link, index) => {
        return 'thumbnailPath' in link
            ? `import thumbnail${index} from ${JSON.stringify(resolve(configDir, link.thumbnailPath))};`
            : '';
    });
    const links = hubConfig.links.map((link, index) => {
        return [
            '{',
            `title: ${JSON.stringify(link.title)},`,
            `url: ${JSON.stringify(link.url)},`,
            'thumbnailPath' in link
                ? `thumbnailUrl: thumbnail${index},`
                : 'thumbnailUrl' in link
                  ? `thumbnailUrl: ${JSON.stringify(link.thumbnailUrl)},`
                  : `thumbnailEmoji: ${JSON.stringify(link.thumbnailEmoji)},`,
            '}',
        ].join('');
    });

    return [
        ...thumbnailImports,
        `export const hubData = {title: ${JSON.stringify(hubConfig.title)}, links: [${links.join(',')}]};`,
    ].join('\n');
}

/**
 * Loads a hub-vir config file and creates a Vite config that builds the hub frontend for it. Writes
 * an `index.html` file into `rootDir`, which becomes the Vite root.
 *
 * @category Internal
 */
export async function createHubViteConfig({
    configPath,
    rootDir,
    outDir,
}: Readonly<
    {
        configPath: string;
        rootDir: string;
    } & PartialWithUndefined<{
        /** Only needed for builds. */
        outDir: string;
    }>
>): Promise<UserConfig> {
    const configDir = dirname(resolve(configPath));

    await mkdir(rootDir, {
        recursive: true,
    });
    await writeFile(
        join(rootDir, 'index.html'),
        [
            '<!doctype html>',
            '<html lang="en">',
            '<head>',
            '<meta charset="UTF-8" />',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
            '<meta name="mobile-web-app-capable" content="yes" />',
            '<meta name="apple-mobile-web-app-capable" content="yes" />',
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
            /**
             * The page background shows wherever the app element doesn't reach, like behind the iOS
             * home indicator in home screen apps, so it gets the theme background too.
             */
            `<style>html {background-color: var(${String(viraTheme.colors[themeDefaultKey].background.name)});} body {margin: 0;}</style>`,
            '</head>',
            '<body>',
            '<script type="module">',
            `import ${JSON.stringify(fontCssPath)};`,
            `import {HubVirApp} from ${JSON.stringify(hubVirAppPath)};`,
            `import {hubData} from ${JSON.stringify(hubDataModuleId)};`,
            'const app = new HubVirApp();',
            'app.assignInputs({hubData});',
            'document.body.append(app);',
            '</script>',
            '</body>',
            '</html>',
        ].join('\n'),
    );

    async function loadHubConfig() {
        return await loadConfig({
            configPath,
            configShape: hubConfigShape,
        });
    }

    const hubPlugin: Plugin = {
        name: 'hub-vir',
        resolveId(id) {
            return id === hubDataModuleId ? resolvedHubDataModuleId : undefined;
        },
        async load(id) {
            if (id !== resolvedHubDataModuleId) {
                return undefined;
            }

            return createHubDataModule({
                hubConfig: await loadHubConfig(),
                configDir,
            });
        },
        async transformIndexHtml() {
            const hubConfig = await loadHubConfig();

            return [
                ...(hubConfig.title
                    ? [
                          {
                              tag: 'title',
                              children: escapeHtmlText(hubConfig.title),
                              injectTo: 'head' as const,
                          },
                          {
                              tag: 'meta',
                              attrs: {
                                  name: 'apple-mobile-web-app-title',
                                  content: hubConfig.title,
                              },
                              injectTo: 'head' as const,
                          },
                      ]
                    : []),
                {
                    tag: 'link',
                    attrs: {
                        rel: 'manifest',
                        href: 'manifest.webmanifest',
                    },
                    injectTo: 'head',
                },
                {
                    tag: 'link',
                    attrs: {
                        rel: 'icon',
                        href: 'icon-192.png',
                        type: 'image/png',
                    },
                    injectTo: 'head',
                },
                {
                    tag: 'link',
                    attrs: {
                        rel: 'apple-touch-icon',
                        href: 'icon-192.png',
                    },
                    injectTo: 'head',
                },
            ];
        },
        async generateBundle() {
            getObjectTypedEntries(await createWebAppFiles(await loadHubConfig())).forEach(
                ([
                    fileName,
                    source,
                ]) => {
                    this.emitFile({
                        type: 'asset',
                        fileName,
                        source,
                    });
                },
            );
        },
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const fileName = new URL(
                    assertWrap.isDefined(request.url),
                    'http://localhost',
                ).pathname.slice(1);
                if (!check.isKeyOf(fileName, webAppFileContentTypes)) {
                    next();
                    return;
                }

                response.setHeader('Content-Type', webAppFileContentTypes[fileName]);
                response.end((await createWebAppFiles(await loadHubConfig()))[fileName]);
            });

            /** The config file lives outside the Vite root, so Vite does not watch it by default. */
            server.watcher.add(resolve(configPath));
            server.watcher.on('change', (changedPath) => {
                if (changedPath !== resolve(configPath)) {
                    return;
                }

                const hubDataModule = server.moduleGraph.getModuleById(resolvedHubDataModuleId);
                if (hubDataModule) {
                    server.moduleGraph.invalidateModule(hubDataModule);
                }
                server.ws.send({
                    type: 'full-reload',
                });
            });
        },
    };

    /** The virmator config is TypeScript, even in the published package, so it needs tsx to load. */
    const virmatorViteConfig: UserConfig = await (
        await tsImport(virmatorViteConfigPath, import.meta.url)
    ).default;

    return mergeConfig(virmatorViteConfig, {
        root: rootDir,
        /** A relative base lets the output be deployed at any path. */
        base: './',
        publicDir: false,
        clearScreen: false,
        plugins: [
            hubPlugin,
        ],
        optimizeDeps: {
            entries: [
                hubVirAppPath,
            ],
        },
        server: {
            fs: {
                allow: [
                    rootDir,
                    configDir,
                    dirname(import.meta.dirname),
                ],
            },
        },
        build: {
            ...(outDir
                ? {
                      outDir: resolve(outDir),
                  }
                : {}),
            emptyOutDir: true,
            rolldownOptions: {
                onLog(level, rollupLog, defaultHandler) {
                    /**
                     * Some dependencies import Node.js builtins in code paths that never run in a
                     * browser. Vite already stubs them out, so the warning is only noise.
                     */
                    if (rollupLog.message.includes('externalized for browser compatibility')) {
                        return;
                    }
                    defaultHandler(level, rollupLog);
                },
            },
        },
    } satisfies UserConfig);
}

/**
 * Params for {@link buildHub}.
 *
 * @category Internal
 */
export type BuildHubParams = {
    /** Path to a hub-vir config file (JSON, YAML, TOML, JS, or TS). */
    configPath: string;
} & PartialWithUndefined<{
    /**
     * Directory to write the built site into. It is emptied first. Relative paths resolve from the
     * current working directory.
     *
     * @default 'dist'
     */
    outDir: string;
}>;

/**
 * Builds a deployable static hub site from a hub-vir config file. This is what the `hub-vir` CLI
 * runs by default.
 *
 * @category Main
 * @returns The absolute path of the output directory.
 */
export async function buildHub({configPath, outDir: rawOutDir}: Readonly<BuildHubParams>) {
    const outDir = resolve(rawOutDir || 'dist');
    const relativeConfigPath = relative(resolve(outDir), resolve(configPath));
    if (!relativeConfigPath.startsWith('..')) {
        throw new Error(
            `Output directory '${outDir}' contains the config file '${configPath}'. Pick an output directory that can be safely emptied.`,
        );
    }

    const unexpectedOutDirEntries = (
        await wrapInTry(() => readdir(outDir), {
            fallbackValue: [],
        })
    ).filter((entry) => !hubBuildOutputEntries.includes(entry));
    if (unexpectedOutDirEntries.length) {
        throw new Error(
            `Output directory '${outDir}' contains files that a hub build did not create (${unexpectedOutDirEntries.join(', ')}). Pick an empty or nonexistent output directory.`,
        );
    }

    const rootDir = await mkdtemp(join(tmpdir(), 'hub-vir-'));

    try {
        await build({
            configFile: false,
            logLevel: 'warn',
            ...(await createHubViteConfig({
                configPath,
                rootDir,
                outDir,
            })),
        });
    } finally {
        await rm(rootDir, {
            recursive: true,
            force: true,
        });
    }

    log.success(`Hub built into ${outDir}`);

    return outDir;
}

/**
 * Params for {@link startHubDevServer}.
 *
 * @category Internal
 */
export type StartHubDevServerParams = {
    /** Path to a hub-vir config file (JSON, YAML, TOML, JS, or TS). */
    configPath: string;
} & PartialWithUndefined<{
    /**
     * Port to serve on. Startup fails if the port is taken.
     *
     * @default The first free port starting at Vite's default
     */
    port: number;
}>;

/**
 * Serves a hub from a hub-vir config file with a Vite dev server. This is what the `hub-vir` CLI
 * runs with `--dev`. Changes to the config file, its thumbnails, or the frontend reload the page.
 * Stopping the process with Ctrl+C closes the server.
 *
 * @category Main
 * @returns The running Vite dev server.
 */
export async function startHubDevServer({configPath, port}: Readonly<StartHubDevServerParams>) {
    const rootDir = await mkdtemp(join(tmpdir(), 'hub-vir-'));

    const server = await createServer(
        mergeConfig(
            await createHubViteConfig({
                configPath,
                rootDir,
            }),
            {
                configFile: false,
                server:
                    port == undefined
                        ? {}
                        : {
                              port,
                              strictPort: true,
                          },
            } satisfies InlineConfig,
        ),
    );

    async function closeServer() {
        await server.close();
        await rm(rootDir, {
            recursive: true,
            force: true,
        });
    }

    try {
        await server.listen();
    } catch (error) {
        /** The file watcher is already running and would otherwise keep the process alive. */
        await closeServer();
        throw error;
    }

    process.once('SIGINT', async () => {
        /* c8 ignore start: exits the process, so tests can't trigger it */
        await closeServer();
        process.exit();
        /* c8 ignore stop */
    });

    server.printUrls();

    return server;
}
