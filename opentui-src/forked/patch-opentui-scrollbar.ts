// @ts-nocheck
/**
 * Scrollbar thumb minimum-size patch.
 *
 * OpenTUI's Slider computes thumb length as `viewportSize / contentSize`
 * (Slider.ts → getVirtualThumbSize). On long conversations this can
 * shrink the thumb to a single half-block, which is hard to grab and
 * hard to read at a glance.
 *
 * We keep the proportional behaviour (thumb length still conveys
 * "how much of the content am I seeing") but clamp it to a minimum
 * floor so the thumb never disappears into a sliver. The maximum is
 * still the full track height — no change for short content.
 *
 * Imported once at app startup for its side effect; no exports.
 */

import { SliderRenderable } from "@opentui/core";

// Virtual units — Slider draws at half-block precision so 1 real cell
// = 2 virtual cells. MIN_THUMB_VIRTUAL_CELLS = 8 → at least 4 real
// cells of thumb. Adjust here if the floor feels too tall or too
// short.
const MIN_THUMB_VIRTUAL_CELLS = 8;

const proto = SliderRenderable.prototype as any;
const origGetVirtualThumbSize = proto.getVirtualThumbSize;

if (typeof origGetVirtualThumbSize === "function" && !proto.__fermiMinThumbPatched) {
  proto.getVirtualThumbSize = function () {
    const calculated = origGetVirtualThumbSize.call(this);
    const trackSize = this.orientation === "vertical" ? this.height * 2 : this.width * 2;
    // Clamp to [MIN_THUMB_VIRTUAL_CELLS, trackSize] so:
    //   - very long content can't shrink the thumb below the floor
    //   - very short tracks (smaller than the floor) just show a
    //     full-track thumb, not an oversized one bleeding outside
    return Math.min(Math.max(calculated, MIN_THUMB_VIRTUAL_CELLS), trackSize);
  };
  proto.__fermiMinThumbPatched = true;
}
