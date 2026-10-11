# Cultivation SVG profile effects

The uploaded user banner remains the background image. Independent transparent SVG effects overlay it: celestial dragon, immortal swords, time cicada, smoke ribbons and aura rings. No opaque backdrop or six-pointed star. The raster experiment is no longer used.

Original ChatX artwork inspired by the profile-overlay concept, not a claim of exact Discord asset reproduction. Sources:
- https://support.discord.com/hc/en-us/articles/17828465914263-Profile-Effects
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/linearGradient
- https://web.dev/articles/animations-guide

Motion uses CSS transform and opacity; no animated noise filters, continuous asset downloads or animation library. Economy mode, constrained devices and hidden pages keep static artwork. Reduced-motion stops all inner SVG animations. Artwork stays inside the banner and cannot intercept clicks.

## Additional cultivation domains

- Jade Lotus: seven petals breathe independently around a floating golden pearl. Inspired by the lotus imagery used in Talisman Emperor, rather than copied artwork: https://www.wuxiaworld.com/novel/talisman-emperor/te-book-1-chapter-58
- Heavenly Tribulation: violet qi core, drifting clouds and three slowly glowing lightning traces. Inspired by the glossary's cultivation trial: https://www.wuxiaworld.com/page/general-glossary-of-terms
- SVG pivots use fixed scene coordinates or fill-box as documented: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-box

Original artwork and CSS. The public Discord documentation describes profile effects but is not the source code for their commercial effects. No extracted Discord assets or extra runtime dependencies.

IDs are validated by the browser, server and PostgreSQL constraint (migration 029). Existing cosmetic choices remain valid.
