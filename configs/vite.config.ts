import {defineConfig} from '@virmator/frontend/configs/vite.config.base.js';
import {resolve} from 'node:path';

export default defineConfig(
    {
        forGitHubPages: false,
        packageDirPath: resolve(import.meta.dirname, '..'),
        /** The hub-vir CLI overrides the base paths that these logs would print. */
        disableStartupLogs: true,
    },
    (baseConfig) => {
        return {
            ...baseConfig,
        };
    },
);
