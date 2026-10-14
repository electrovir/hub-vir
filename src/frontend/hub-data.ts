import {type HubConfig} from '../hub-config.js';

/**
 * A single link from a hub-vir config file.
 *
 * @category Internal
 */
export type HubLink = HubConfig['links'][number];

/**
 * Hub contents after the build has resolved each thumbnail path into a deployable asset URL.
 *
 * @category Internal
 */
export type HubData = Omit<HubConfig, 'links'> & {
    links: (
        | Exclude<HubLink, {thumbnailPath: string}>
        | (Omit<Extract<HubLink, {thumbnailPath: string}>, 'thumbnailPath'> & {
              thumbnailUrl: string;
          })
    )[];
};
