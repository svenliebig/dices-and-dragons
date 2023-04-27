export function bind(
	sel: HTMLElement,
	eventname: Array<string> | string,
	func: EventListenerOrEventListenerObject,
	bubble?: boolean
) {
	if (!sel) return;
	if (Array.isArray(eventname)) {
		for (const i in eventname) sel.addEventListener(eventname[i], func, bubble ? bubble : false);
	} else {
		sel.addEventListener(eventname, func, bubble ? bubble : false);
	}
}
