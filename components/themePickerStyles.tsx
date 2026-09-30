/* Styles for ThemePicker and ThemeModeSwitch. Inlined (React hoists and dedupes the <style>) so they work in the workspace and on the site without a global import. */
const css = `/* Shared by the landing demo and App Settings. Everything borrows the surrounding text colour, so it is right in light and dark. */
.theme-picker { display: block; width: 100%; min-width: 0; color: inherit; }
.theme-picker__choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px; }
.theme-picker__item { display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 48px; padding: 10px 12px; background: transparent; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; color: inherit; text-align: start; cursor: pointer; font: inherit; -webkit-tap-highlight-color: transparent; }
.theme-picker__item:hover { background: color-mix(in srgb, currentColor 5%, transparent); border-color: color-mix(in srgb, currentColor 45%, transparent); }
.theme-picker__item[aria-checked="true"] { background: color-mix(in srgb, currentColor 7%, transparent); border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; }
.theme-picker__item:focus-visible { outline: 2px solid var(--primary, currentColor); outline-offset: 3px; }
.theme-picker__palette { display: inline-flex; flex-shrink: 0; }
.theme-picker__palette > span { width: 12px; height: 18px; border: 1px solid #8885; }
.theme-picker__palette > span:first-child { border-start-start-radius: 4px; border-end-start-radius: 4px; }
.theme-picker__palette > span:last-child { border-start-end-radius: 4px; border-end-end-radius: 4px; }
.theme-picker__name { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; min-width: 0; text-align: start; }
.theme-picker__item[aria-checked="true"] .theme-picker__name { font-weight: 600; }
.theme-picker__check { margin-inline-start: auto; flex-shrink: 0; }
.theme-picker__expand { display: block; min-height: 44px; margin-top: 6px; padding: 8px 4px; font: inherit; font-size: 13px; color: inherit; background: none; border: 0; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.theme-picker__expand:focus-visible, .theme-picker__search:focus-visible { outline: 2px solid var(--primary, currentColor); outline-offset: 3px; }
.theme-picker__search { width: 100%; min-height: 44px; padding: 10px 12px; margin-bottom: 12px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 14px; }
.theme-picker__search::placeholder { color: inherit; opacity: .65; }
.theme-picker__empty { font-size: 13px; padding-block: 12px; }
@media (max-width: 480px) { .theme-picker__choices { grid-template-columns: repeat(2, minmax(0, 1fr)); } .theme-picker__item { padding: 10px 8px; gap: 7px; } }
@media (max-width: 360px) { .theme-picker__palette > span { width: 8px; height: 14px; } }

/* System / Light / Dark as three small icon buttons. */
.mode-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
.mode-switch button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 44px; min-height: 40px; padding: 0 10px; border-radius: 8px; color: inherit; opacity: .6; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; background: transparent; border: 0; }
.mode-switch button:hover { opacity: 1; background: color-mix(in srgb, currentColor 8%, transparent); }
.mode-switch button[aria-checked="true"] { opacity: 1; background: color-mix(in srgb, currentColor 13%, transparent); }
.mode-switch button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`;

export function ThemePickerStyles() {
  return <style href="chaos-theme-picker" precedence="low">{css}</style>;
}
