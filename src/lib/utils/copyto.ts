export function copyto(obj: object | Array<unknown> | unknown, res: any) {
	if (obj == null || typeof obj !== 'object') return obj;
	if (obj instanceof Array) {
		for (let i = obj.length - 1; i >= 0; --i) res[i] = copy(obj[i]);
	} else {
		for (const i in obj) {
			// eslint-disable-next-line no-prototype-builtins
			if (obj.hasOwnProperty(i)) res[i] = copy((obj as any)[i]);
		}
	}
	return res;
}

function copy(obj: object | Array<unknown> | unknown) {
	if (!obj) return obj;
	return copyto(obj, new (obj as any).constructor());
}
