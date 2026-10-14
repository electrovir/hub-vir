import {css, defineElement, html} from 'element-vir';
import {ViraImage, ViraLink, viraTheme} from 'vira';
import {type HubData} from '../hub-data.js';

/**
 * A single link tile showing the link's thumbnail and title.
 *
 * @category Internal
 */
export const HubVirLink = defineElement<{
    link: Readonly<HubData['links'][number]>;
}>()({
    tagName: 'hub-vir-link',
    styles: css`
        :host {
            display: flex;
        }

        ${ViraLink} {
            display: flex;
            text-decoration: none;
        }

        .tile {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 12px;
            border-radius: 12px;

            &:hover,
            ${ViraLink}:focus-within & {
                background-color: ${viraTheme.colors['vira-blue-behind-fg-small-body'].background
                    .value};
            }
            &:active {
                background-color: ${viraTheme.colors['vira-blue-behind-fg-body'].background.value};
            }
        }

        ${ViraImage},
        .emoji {
            width: 128px;
            height: 128px;
            border-radius: 8px;
        }

        .emoji {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 80px;
            background-color: ${viraTheme.colors['vira-grey-behind-bg-lowest-contrast'].background
                .value};
        }

        span {
            max-width: 128px;
            text-align: center;
            overflow-wrap: anywhere;
        }
    `,
    render({inputs}) {
        return html`
            <${ViraLink.assign({
                link: {
                    url: inputs.link.url,
                    newTab: false,
                },
                disableLinkStyles: true,
            })}>
                <div class="tile">
                    ${'thumbnailUrl' in inputs.link
                        ? html`
                              <${ViraImage.assign({
                                  imageUrl: inputs.link.thumbnailUrl,
                              })}></${ViraImage}>
                          `
                        : html`
                              <span class="emoji">${inputs.link.thumbnailEmoji}</span>
                          `}
                    <span>${inputs.link.title}</span>
                </div>
            </${ViraLink}>
        `;
    },
});
