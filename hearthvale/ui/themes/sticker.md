Paper Sticker (id sticker), CSS only.
Technique: die-cut vinyl stickers: fill + thick white border + thin coloured contour (box-shadow spread), hard-stop diagonal gloss streak, per-element tilt via nth-child 'rotate', stroked sticker lettering, kraft paper from an inline SVG feTurbulence data URI, washi tape and peeled-corner pseudo-elements.
Touchable because: every button is a glossy, tilted, lifted sticker with a long soft shadow; pressed flattens it (tilt to 0, scale down, shadow collapses to a line, gloss streak slides, gradient flips darker).
Performance: no JS, no backdrop-filter, no animated shadows; the only extra costs are a 240px tiling SVG noise on 3 surfaces and stacked drop-shadow filters on small icons (dropped under body.lowfx).
Reduced motion / data-reduce=1 shorten transitions; no decorative animation is added beyond the base style's.
Weaknesses: heading font depends on system cursive/italic fallbacks, text stroke makes tiny button text a bit heavy, rotated cards soften text slightly, the peel corner can sit over the last pixels of a card's bottom-right content.
