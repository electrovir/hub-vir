import {check} from '@augment-vir/assert';
import {Observable} from 'element-vir';
import {ViraThemeClient} from 'vira';
import {type HubData} from '../hub-data.js';

/**
 * State shared across the hub frontend.
 *
 * @category Internal
 */
export type FrontendState = {
    hubData: Readonly<HubData>;
    /** Only links whose titles include this text (ignoring case) are shown. */
    linkFilter: string;
    themeClient: ViraThemeClient;
};

/**
 * Creates the observable frontend state for a hub. Call `destroy` when the hub is removed.
 *
 * @category Internal
 */
export function createFrontendState({hubData}: Readonly<{hubData: Readonly<HubData>}>) {
    const themeClient = new ViraThemeClient();

    const rawFrontendStateObservable = new Observable<FrontendState>({
        equalityCheck: check.strictEquals,
        defaultValue: {
            hubData,
            linkFilter: '',
            themeClient,
        },
    });

    function update(this: void, updateValue: Partial<FrontendState> = {}) {
        rawFrontendStateObservable.setValue({
            ...rawFrontendStateObservable.value,
            ...updateValue,
        });
    }

    return Object.assign(
        rawFrontendStateObservable satisfies Pick<
            typeof rawFrontendStateObservable,
            'listen' | 'value'
        > as Pick<typeof rawFrontendStateObservable, 'listen' | 'value'>,
        {
            /** Shallowly merges the given values into the current state. */
            update,
            /** Destroys the theme client and the observable. */
            destroy() {
                themeClient.destroy();
                rawFrontendStateObservable.destroy();
            },
        },
    );
}

/**
 * Output of {@link createFrontendState}.
 *
 * @category Internal
 */
export type FrontendStateObservable = ReturnType<typeof createFrontendState>;
