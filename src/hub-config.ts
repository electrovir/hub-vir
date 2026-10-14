import {defineShape, nonEmptyStringShape, optionalShape, unionShape} from 'object-shape-tester';

/**
 * Shape for an individual link.
 *
 * @category Internal
 */
export const hubLinkShape = unionShape(
    {
        title: nonEmptyStringShape(),
        url: nonEmptyStringShape(),
        thumbnailPath: nonEmptyStringShape(),
    },
    {
        title: nonEmptyStringShape(),
        url: nonEmptyStringShape(),
        thumbnailEmoji: nonEmptyStringShape(),
    },
);

/**
 * Shape of a hub-vir config file. Each link needs either a `thumbnailPath`, resolved relative to
 * the config file's directory, or a `thumbnailEmoji`.
 *
 * @category Internal
 */
export const hubConfigShape = defineShape({
    /** Shown as the page title and heading. */
    title: optionalShape(nonEmptyStringShape(), {
        alsoUndefined: true,
    }),
    links: [
        hubLinkShape,
    ],
});

/**
 * A parsed hub-vir config file.
 *
 * @category Internal
 */
export type HubConfig = typeof hubConfigShape.runtimeType;
