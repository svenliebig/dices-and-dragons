export function get_mouse_coords(ev: TouchEvent | MouseEvent) {
	const touches = (ev as TouchEvent).changedTouches;
	if (touches) return { x: touches[0].clientX, y: touches[0].clientY };
	return { x: (ev as MouseEvent).clientX, y: (ev as MouseEvent).clientY };
}
