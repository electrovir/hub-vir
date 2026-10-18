import {colorCss} from '@electrovir/color';
import {css, defineElement, html, listen} from 'element-vir';
import {themeDefaultKey} from 'theme-vir';
import {MagnifyingGlass24Icon, ViraInput, ViraThemeSwitcher, viraTheme} from 'vira';
import {createFrontendState, type FrontendState} from '../frontend-state/create-frontend-state.js';
import {type HubData} from '../hub-data.js';
import {HubVirLink} from './hub-vir-link.element.js';

/**
 * The root element of a hub page: the title, a search input when there are many links, and the link
 * grid.
 *
 * @category Internal
 */
export const HubVirApp = defineElement<{
    hubData: Readonly<HubData>;
}>()({
    tagName: 'hub-vir-app',
    styles: css`
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            box-sizing: border-box;
            min-height: 100dvh;
            /** Keeps content clear of notches and the status bar when installed as an app. */
            padding: calc(8px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
                calc(8px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
            font-family: 'Atkinson Hyperlegible', sans-serif;
            ${colorCss(viraTheme.colors[themeDefaultKey])}
            isolation: isolate;
        }

        .background {
            position: fixed;
            inset: 0;
            z-index: -1;
            pointer-events: none;
            background-image: radial-gradient(
                color-mix(in srgb, currentColor 22%, transparent) 1.2px,
                transparent 1.6px
            );
            background-size: 22px 22px;
            background-position: center bottom;
            mask-image: radial-gradient(ellipse 80% 60% at 50% 100%, black, transparent);
        }

        ${ViraThemeSwitcher} {
            align-self: flex-end;
        }

        h1 {
            margin: 0;
        }

        .links {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 16px;
        }
    `,
    state({inputs}) {
        return {
            frontendState: createFrontendState({
                hubData: inputs.hubData,
            }),
        };
    },
    init({state, updateState}) {
        state.frontendState.listen(false, () => {
            updateState({
                frontendState: state.frontendState,
            });
        });
    },
    cleanup({state}) {
        state.frontendState.destroy();
    },
    render({state}) {
        const frontendState: FrontendState = state.frontendState.value;
        const linkFilter = frontendState.linkFilter.toLowerCase();
        const filteredLinks = frontendState.hubData.links.filter((link) => {
            return link.title.toLowerCase().includes(linkFilter);
        });

        return html`
            <div class="background"></div>
            <${ViraThemeSwitcher.assign({
                themeClient: frontendState.themeClient,
            })}></${ViraThemeSwitcher}>
            ${frontendState.hubData.title
                ? html`
                      <h1>${frontendState.hubData.title}</h1>
                  `
                : ''}
            ${frontendState.hubData.links.length > 5
                ? html`
                      <${ViraInput.assign({
                          value: frontendState.linkFilter,
                          placeholder: 'Search',
                          icon: MagnifyingGlass24Icon,
                          showClearButton: true,
                      })}
                          ${listen(ViraInput.events.valueChange, (event) => {
                              state.frontendState.update({
                                  linkFilter: event.detail,
                              });
                          })}
                      ></${ViraInput}>
                  `
                : ''}
            <div class="links">
                ${filteredLinks.map((link) => {
                    return html`
                        <${HubVirLink.assign({
                            link,
                        })}></${HubVirLink}>
                    `;
                })}
            </div>
        `;
    },
});
