Squishy Clay (id clay)
Technique: soft-body claymorphism (pillow radii, light top-left and tinted bottom-right inset shadows, coloured glow) driven by a small rAF spring solver in clay.js.
Touchable because: presses squash with volume preservation, the light flips, a thumb dent follows the finger (--px/--py/--dent), release wobbles like jelly; panels settle with a bounce, fills slosh with a wavy mask edge, switches stretch.
Assets: fingerprint grain tile (128px canvas, seamless, --clay-grain) and two SVG wave mask tiles, all generated at runtime in a few ms; no files. One delegated pointer listener set, removed in dispose.
Performance: loop sleeps at rest, only scale/rotate/custom props move; body.lowfx drops grain, multi-gradient stacks, waves and idle bobbing; reduced motion snaps states and stops animation.
Weaknesses: pastel surfaces sit close to the bright world so HUD pills read softer than saturated styles; grain is visible only at full quality; wave mask needs a modern browser.
