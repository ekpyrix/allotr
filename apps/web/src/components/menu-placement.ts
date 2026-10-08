// Menus are popovers from 600 px and bottom sheets below (docs/ui.md §2.4).
// The width is the app frame's, not the viewport's.

export type MenuPresentation = 'popover' | 'sheet';

export function menuPresentation(frameWidth: number): MenuPresentation {
  return frameWidth >= 600 ? 'popover' : 'sheet';
}

/** Row height in rem: 30 design px in popovers, 44 in sheets. */
export function menuRowHeight(presentation: MenuPresentation): number {
  return (presentation === 'popover' ? 30 : 44) / 16;
}
