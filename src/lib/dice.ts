import * as THREE from 'three';
import * as CANNON from 'cannon';
import { copyto } from './utils/copyto';
import { bind } from './utils/bind';
import { get_mouse_coords } from './utils/get_mouse_coords';

type Faces = Array<Array<number>>;

const known_types = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
type DiceTypes = (typeof known_types)[number];

type DiceT = THREE.Mesh & {
	body: any;
	dice_type: DiceTypes;
	geometry: THREE.Geometry;
	dice_stopped?: number | boolean;
};

// TODO random storage
// let random_storage: Array<number> = [];
const use_true_random = true;
const frame_rate = 1 / 60;

const prepare_rnd = (callback: () => void) => {
	// if (!random_storage.length && this.use_true_random) {
	// 	try {
	// 		$t.rpc({ method: 'random', n: 512 }, function (random_responce: any) {
	// 			if (!random_responce.error) random_storage = random_responce.result.random.data;
	// 			else $t.dice.use_true_random = false;
	// 			callback();
	// 		});
	// 		return;
	// 	} catch (e) {
	// 		this.use_true_random = false;
	// 	}
	// }
	callback();
};

function rnd(): number {
	// return random_storage.length ? random_storage.pop()! : Math.random();
	return Math.random();
}

function create_shape(vertices: Array<THREE.Vector3>, faces: Faces, radius: number) {
	const cv = new Array(vertices.length),
		cf = new Array(faces.length);
	for (let i = 0; i < vertices.length; ++i) {
		const v = vertices[i];
		cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
	}
	for (let i = 0; i < faces.length; ++i) {
		cf[i] = faces[i].slice(0, faces[i].length - 1);
	}
	return new CANNON.ConvexPolyhedron(cv, cf);
}

function make_geom(
	vertices: Array<THREE.Vector3>,
	faces: Faces,
	radius: number,
	tab: number,
	af: number
) {
	const geom = new THREE.Geometry();
	for (let i = 0; i < vertices.length; ++i) {
		const vertex = vertices[i].multiplyScalar(radius);
		// TODO CHECK THIS
		(vertex as any).index = geom.vertices.push(vertex) - 1;
	}
	for (let i = 0; i < faces.length; ++i) {
		const ii = faces[i],
			fl = ii.length - 1;
		const aa = (Math.PI * 2) / fl;
		for (let j = 0; j < fl - 2; ++j) {
			geom.faces.push(
				new THREE.Face3(
					ii[0],
					ii[j + 1],
					ii[j + 2],
					[geom.vertices[ii[0]], geom.vertices[ii[j + 1]], geom.vertices[ii[j + 2]]],
					[],
					ii[fl] + 1
				)
			);
			geom.faceVertexUvs[0].push([
				new THREE.Vector2(
					(Math.cos(af) + 1 + tab) / 2 / (1 + tab),
					(Math.sin(af) + 1 + tab) / 2 / (1 + tab)
				),
				new THREE.Vector2(
					(Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
					(Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)
				),
				new THREE.Vector2(
					(Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
					(Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab)
				)
			]);
		}
	}
	geom.computeFaceNormals();
	geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
	return geom;
}

function chamfer_geom(vectors: Array<THREE.Vector3>, faces: Faces, chamfer: number) {
	const chamfer_vectors = [],
		chamfer_faces: Faces = [],
		corner_faces = new Array(vectors.length);
	for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
	for (let i = 0; i < faces.length; ++i) {
		const ii = faces[i],
			fl = ii.length - 1;
		const center_point = new THREE.Vector3();
		const face: Array<number> = new Array(fl);
		for (let j = 0; j < fl; ++j) {
			const vv = vectors[ii[j]].clone();
			center_point.add(vv);
			corner_faces[ii[j]].push((face[j] = chamfer_vectors.push(vv) - 1));
		}
		center_point.divideScalar(fl);
		for (let j = 0; j < fl; ++j) {
			const vv = chamfer_vectors[face[j]];
			vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
		}
		face.push(ii[fl]);
		chamfer_faces.push(face);
	}
	for (let i = 0; i < faces.length - 1; ++i) {
		for (let j = i + 1; j < faces.length; ++j) {
			const pairs = [];
			let lastm = -1;
			for (let m = 0; m < faces[i].length - 1; ++m) {
				const n = faces[j].indexOf(faces[i][m]);
				if (n >= 0 && n < faces[j].length - 1) {
					if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
					else pairs.push([i, m], [j, n]);
					lastm = m;
				}
			}
			if (pairs.length != 4) continue;
			chamfer_faces.push([
				chamfer_faces[pairs[0][0]][pairs[0][1]],
				chamfer_faces[pairs[1][0]][pairs[1][1]],
				chamfer_faces[pairs[3][0]][pairs[3][1]],
				chamfer_faces[pairs[2][0]][pairs[2][1]],
				-1
			]);
		}
	}
	for (let i = 0; i < corner_faces.length; ++i) {
		const cf = corner_faces[i],
			face = [cf[0]];
		let count = cf.length - 1;
		while (count) {
			for (let m = faces.length; m < chamfer_faces.length; ++m) {
				let index = chamfer_faces[m].indexOf(face[face.length - 1]);
				if (index >= 0 && index < 4) {
					if (--index == -1) index = 3;
					const next_vertex = chamfer_faces[m][index];
					if (cf.indexOf(next_vertex) >= 0) {
						face.push(next_vertex);
						break;
					}
				}
			}
			--count;
		}
		face.push(-1);
		chamfer_faces.push(face);
	}
	return { vectors: chamfer_vectors, faces: chamfer_faces };
}

let cannon_shape: CANNON.ConvexPolyhedron;

function create_geom(
	vertices: Faces,
	faces: Faces,
	radius: number,
	tab: number,
	af: number,
	chamfer: number
) {
	const vectors: Array<THREE.Vector3> = new Array(vertices.length);
	for (let i = 0; i < vertices.length; ++i) {
		vectors[i] = new THREE.Vector3().fromArray(vertices[i]).normalize();
	}
	const cg = chamfer_geom(vectors, faces, chamfer);
	const geom = make_geom(cg.vectors, cg.faces, radius, tab, af);
	//let geom = make_geom(vectors, faces, radius, tab, af); // Without chamfer
	// TODO CHECK THIS
	cannon_shape = create_shape(vectors, faces, radius);
	return geom;
}

const standart_d20_dice_face_labels = [
	' ',
	'0',
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'11',
	'12',
	'13',
	'14',
	'15',
	'16',
	'17',
	'18',
	'19',
	'20'
];
const standart_d100_dice_face_labels = [
	' ',
	'00',
	'10',
	'20',
	'30',
	'40',
	'50',
	'60',
	'70',
	'80',
	'90'
];

function calc_texture_size(approx: number) {
	return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
}

function create_dice_materials(face_labels: Array<string>, size: number, margin: number) {
	function create_text_texture(text: string, color: string, back_color: string) {
		if (text == undefined) return null;
		const canvas: HTMLCanvasElement = document.createElement('canvas');
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const context: CanvasRenderingContext2D = canvas.getContext('2d')!;
		const ts = calc_texture_size(size + size * 2 * margin) * 2;
		canvas.width = canvas.height = ts;
		context.font = ts / (1 + 2 * margin) + 'pt Arial';
		context.fillStyle = back_color;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = color;
		context.fillText(text, canvas.width / 2, canvas.height / 2);
		if (text == '6' || text == '9') {
			context.fillText('  .', canvas.width / 2, canvas.height / 2);
		}
		const texture = new THREE.Texture(canvas);
		texture.needsUpdate = true;
		return texture;
	}
	const materials = [];
	for (let i = 0; i < face_labels.length; ++i)
		materials.push(
			new THREE.MeshPhongMaterial(
				copyto(material_options, {
					map: create_text_texture(face_labels[i], label_color, dice_color)
				})
			)
		);
	return materials;
}

const d4_labels = [
	[[], [0, 0, 0], [2, 4, 3], [1, 3, 4], [2, 1, 4], [1, 2, 3]],
	[[], [0, 0, 0], [2, 3, 4], [3, 1, 4], [2, 4, 1], [3, 2, 1]],
	[[], [0, 0, 0], [4, 3, 2], [3, 4, 1], [4, 2, 1], [3, 1, 2]],
	[[], [0, 0, 0], [4, 2, 3], [1, 4, 3], [4, 1, 2], [1, 3, 2]]
];

function create_d4_materials(size: number, margin: number, labels: Array<Array<number>>) {
	function create_d4_text(text: Array<number>, color: string, back_color: string) {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		const ts = calc_texture_size(size + margin) * 2;
		canvas.width = canvas.height = ts;
		context.font = (ts - margin) / 1.5 + 'pt Arial';
		context.fillStyle = back_color;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = color;
		for (const i in text) {
			context.fillText(text[i].toString(), canvas.width / 2, canvas.height / 2 - ts * 0.3);
			context.translate(canvas.width / 2, canvas.height / 2);
			context.rotate((Math.PI * 2) / 3);
			context.translate(-canvas.width / 2, -canvas.height / 2);
		}
		const texture = new THREE.Texture(canvas);
		texture.needsUpdate = true;
		return texture;
	}
	const materials = [];
	for (let i = 0; i < labels.length; ++i)
		materials.push(
			new THREE.MeshPhongMaterial(
				copyto(material_options, {
					map: create_d4_text(labels[i], label_color, dice_color)
				})
			)
		);
	return materials;
}

const create_d4_geometry = function (radius: number) {
	const vertices = [
		[1, 1, 1],
		[-1, -1, 1],
		[-1, 1, -1],
		[1, -1, -1]
	];
	const faces = [
		[1, 0, 2, 1],
		[0, 1, 3, 2],
		[0, 3, 2, 3],
		[1, 2, 3, 4]
	];
	return create_geom(vertices, faces, radius, -0.1, (Math.PI * 7) / 6, 0.96);
};

function create_d6_geometry(radius: number) {
	const vertices: Array<[number, number, number]> = [
		[-1, -1, -1],
		[1, -1, -1],
		[1, 1, -1],
		[-1, 1, -1],
		[-1, -1, 1],
		[1, -1, 1],
		[1, 1, 1],
		[-1, 1, 1]
	];
	const faces: Faces = [
		[0, 3, 2, 1, 1],
		[1, 2, 6, 5, 2],
		[0, 1, 5, 4, 3],
		[3, 7, 6, 2, 4],
		[0, 4, 7, 3, 5],
		[4, 5, 6, 7, 6]
	];
	return create_geom(vertices, faces, radius, 0.1, Math.PI / 4, 0.96);
}

function create_d8_geometry(radius: number) {
	const vertices = [
		[1, 0, 0],
		[-1, 0, 0],
		[0, 1, 0],
		[0, -1, 0],
		[0, 0, 1],
		[0, 0, -1]
	];
	const faces = [
		[0, 2, 4, 1],
		[0, 4, 3, 2],
		[0, 3, 5, 3],
		[0, 5, 2, 4],
		[1, 3, 4, 5],
		[1, 4, 2, 6],
		[1, 2, 5, 7],
		[1, 5, 3, 8]
	];
	return create_geom(vertices, faces, radius, 0, -Math.PI / 4 / 2, 0.965);
}

function create_d10_geometry(radius: number) {
	const a = (Math.PI * 2) / 10,
		k = Math.cos(a),
		h = 0.105,
		v = -1;
	const vertices = [];
	for (let i = 0, b = 0; i < 10; ++i, b += a)
		vertices.push([Math.cos(b), Math.sin(b), h * (i % 2 ? 1 : -1)]);
	vertices.push([0, 0, -1]);
	vertices.push([0, 0, 1]);
	const faces = [
		[5, 7, 11, 0],
		[4, 2, 10, 1],
		[1, 3, 11, 2],
		[0, 8, 10, 3],
		[7, 9, 11, 4],
		[8, 6, 10, 5],
		[9, 1, 11, 6],
		[2, 0, 10, 7],
		[3, 5, 11, 8],
		[6, 4, 10, 9],
		[1, 0, 2, v],
		[1, 2, 3, v],
		[3, 2, 4, v],
		[3, 4, 5, v],
		[5, 4, 6, v],
		[5, 6, 7, v],
		[7, 6, 8, v],
		[7, 8, 9, v],
		[9, 8, 0, v],
		[9, 0, 1, v]
	];
	return create_geom(vertices, faces, radius, 0, (Math.PI * 6) / 5, 0.945);
}

function create_d12_geometry(radius: number) {
	const p = (1 + Math.sqrt(5)) / 2,
		q = 1 / p;
	const vertices = [
		[0, q, p],
		[0, q, -p],
		[0, -q, p],
		[0, -q, -p],
		[p, 0, q],
		[p, 0, -q],
		[-p, 0, q],
		[-p, 0, -q],
		[q, p, 0],
		[q, -p, 0],
		[-q, p, 0],
		[-q, -p, 0],
		[1, 1, 1],
		[1, 1, -1],
		[1, -1, 1],
		[1, -1, -1],
		[-1, 1, 1],
		[-1, 1, -1],
		[-1, -1, 1],
		[-1, -1, -1]
	];
	const faces = [
		[2, 14, 4, 12, 0, 1],
		[15, 9, 11, 19, 3, 2],
		[16, 10, 17, 7, 6, 3],
		[6, 7, 19, 11, 18, 4],
		[6, 18, 2, 0, 16, 5],
		[18, 11, 9, 14, 2, 6],
		[1, 17, 10, 8, 13, 7],
		[1, 13, 5, 15, 3, 8],
		[13, 8, 12, 4, 5, 9],
		[5, 4, 14, 9, 15, 10],
		[0, 12, 8, 10, 16, 11],
		[3, 19, 7, 17, 1, 12]
	];
	return create_geom(vertices, faces, radius, 0.2, -Math.PI / 4 / 2, 0.968);
}

function create_d20_geometry(radius: number) {
	const t = (1 + Math.sqrt(5)) / 2;
	const vertices = [
		[-1, t, 0],
		[1, t, 0],
		[-1, -t, 0],
		[1, -t, 0],
		[0, -1, t],
		[0, 1, t],
		[0, -1, -t],
		[0, 1, -t],
		[t, 0, -1],
		[t, 0, 1],
		[-t, 0, -1],
		[-t, 0, 1]
	];
	const faces = [
		[0, 11, 5, 1],
		[0, 5, 1, 2],
		[0, 1, 7, 3],
		[0, 7, 10, 4],
		[0, 10, 11, 5],
		[1, 5, 9, 6],
		[5, 11, 4, 7],
		[11, 10, 2, 8],
		[10, 7, 6, 9],
		[7, 1, 8, 10],
		[3, 9, 4, 11],
		[3, 4, 2, 12],
		[3, 2, 6, 13],
		[3, 6, 8, 14],
		[3, 8, 9, 15],
		[4, 9, 5, 16],
		[2, 4, 11, 17],
		[6, 2, 10, 18],
		[8, 6, 7, 19],
		[9, 8, 1, 20]
	];
	return create_geom(vertices, faces, radius, -0.2, -Math.PI / 4 / 2, 0.955);
}

const material_options = {
	specular: 0x172022,
	color: 0xf0f0f0,
	shininess: 40,
	// shading: THREE.FlatShading,
	flatShading: true
};
const label_color = '#aaaaaa';
const dice_color = '#202020';
const ambient_light_color = 0xf0f5fb;
const spot_light_color = 0xefdfd5;
const selector_back_colors = { color: 0x404040, shininess: 0, emissive: 0x858787 };
const desk_color = 0xdfdfdf;
const use_shadows = true;

const dice_face_range = {
	d4: [1, 4],
	d6: [1, 6],
	d8: [1, 8],
	d10: [0, 9],
	d12: [1, 12],
	d20: [1, 20],
	d100: [0, 9]
};
const dice_mass: Record<DiceTypes, number> = {
	d4: 300,
	d6: 300,
	d8: 340,
	d10: 350,
	d12: 350,
	d20: 400,
	d100: 350
};
const dice_inertia: Record<DiceTypes, number> = {
	d4: 5,
	d6: 13,
	d8: 10,
	d10: 9,
	d12: 8,
	d20: 6,
	d100: 9
};

let scale = 50;

let d4_geometry: THREE.Geometry,
	d6_geometry: THREE.Geometry,
	d8_geometry: THREE.Geometry,
	d10_geometry: THREE.Geometry,
	d12_geometry: THREE.Geometry,
	d20_geometry: THREE.Geometry,
	d100_geometry: THREE.Geometry,
	d4_material: THREE.Material[],
	dice_material: THREE.Material[],
	d8_material: THREE.Material[],
	d10_material: THREE.Material[],
	d12_material: THREE.Material[],
	d20_material: THREE.Material[],
	d100_material: THREE.Material[];

function create_d4() {
	if (!d4_geometry) d4_geometry = create_d4_geometry(scale * 1.2);
	if (!d4_material) d4_material = create_d4_materials(scale / 2, scale * 2, d4_labels[0]);
	return new THREE.Mesh(d4_geometry, d4_material);
}

function create_d6() {
	if (!d6_geometry) d6_geometry = create_d6_geometry(scale * 0.9);
	if (!dice_material)
		dice_material = create_dice_materials(standart_d20_dice_face_labels, scale / 2, 1.0);
	return new THREE.Mesh(d6_geometry, dice_material);
}

function create_d8() {
	if (!d8_geometry) d8_geometry = create_d8_geometry(scale);
	if (!dice_material)
		dice_material = create_dice_materials(standart_d20_dice_face_labels, scale / 2, 1.2);
	return new THREE.Mesh(d8_geometry, dice_material);
}

function create_d10() {
	if (!d10_geometry) d10_geometry = create_d10_geometry(scale * 0.9);
	if (!dice_material)
		dice_material = create_dice_materials(standart_d20_dice_face_labels, scale / 2, 1.0);
	return new THREE.Mesh(d10_geometry, dice_material);
}

function create_d12() {
	if (!d12_geometry) d12_geometry = create_d12_geometry(scale * 0.9);
	if (!dice_material)
		dice_material = create_dice_materials(standart_d20_dice_face_labels, scale / 2, 1.0);
	return new THREE.Mesh(d12_geometry, dice_material);
}

function create_d20() {
	if (!d20_geometry) d20_geometry = create_d20_geometry(scale);
	if (!dice_material)
		dice_material = create_dice_materials(standart_d20_dice_face_labels, scale / 2, 1.0);
	return new THREE.Mesh(d20_geometry, dice_material);
}

function create_d100() {
	if (!d10_geometry) d10_geometry = create_d10_geometry(scale * 0.9);
	if (!d100_material)
		d100_material = create_dice_materials(standart_d100_dice_face_labels, scale / 2, 1.5);
	return new THREE.Mesh(d10_geometry, d100_material);
}

const createFn = new Map<DiceTypes, () => THREE.Mesh>();
createFn.set('d4', create_d4);
createFn.set('d6', create_d6);
createFn.set('d8', create_d8);
createFn.set('d10', create_d10);
createFn.set('d12', create_d12);
createFn.set('d20', create_d20);
createFn.set('d100', create_d100);

export function parse_notation(notation: string): Notation {
	const no = notation.split('@');
	// eslint-disable-next-line no-useless-escape
	const dr0 = /\s*(\d*)([a-z]+)(\d+)(\s*(\+|\-)\s*(\d+)){0,1}\s*(\+|$)/gi;
	const dr1 = /(\b)*(\d+)(\b)*/gi;
	const ret = { set: [] as string[], constant: 0, result: [] as number[], error: false };
	let res;
	while ((res = dr0.exec(no[0]))) {
		const command = res[2];
		if (command != 'd') {
			ret.error = true;
			continue;
		}
		let count = parseInt(res[1]);
		if (res[1] == '') count = 1;
		const type: DiceTypes = ('d' + res[3]) as DiceTypes;
		if (known_types.indexOf(type) == -1) {
			ret.error = true;
			continue;
		}
		while (count--) ret.set.push(type);
		if (res[5] && res[6]) {
			if (res[5] == '+') ret.constant += parseInt(res[6]);
			else ret.constant -= parseInt(res[6]);
		}
	}
	while ((res = dr1.exec(no[1]))) {
		ret.result.push(parseInt(res[2]));
	}
	return ret as Notation;
}

type Notation = {
	set: DiceTypes[];
	constant: number;
	result: number[];
	error: boolean;
};

type Dimensions = {
	w: number;
	h: number;
};

export function stringify_notation(nn: Notation) {
	const dict: Record<string, number> = {};
	let notation = '';
	for (const i in nn.set)
		if (!dict[nn.set[i]]) dict[nn.set[i]] = 1;
		else ++dict[nn.set[i]];
	for (const i in dict) {
		if (notation.length) notation += ' + ';
		notation += (dict[i] > 1 ? dict[i] : '') + i;
	}
	if (nn.constant) {
		if (nn.constant > 0) notation += ' + ' + nn.constant;
		else notation += ' - ' + Math.abs(nn.constant);
	}
	return notation;
}

// eslint-disable-next-line @typescript-eslint/no-this-alias
export type Vectors = ReturnType<DiceBox['generate_vectors']>;

export class DiceBox {
	public use_adapvite_timestep = true;
	public animate_selector = true;

	private dices: Array<DiceT> = [];
	private scene = new THREE.Scene();
	private world = new CANNON.World();
	private pane = new THREE.Mesh();

	private renderer: THREE.Renderer;
	private dice_body_material = new CANNON.Material('dice');

	private h = 300;
	private w = 500;
	private ch = 300;
	private cw = 500;

	private aspect = 0;
	private wh = 0;

	private last_time = 0;
	private iteration = 0;
	private running: boolean | number = false;

	private camera: THREE.PerspectiveCamera | null = null;
	private light: THREE.SpotLight | null = null;
	private desk: THREE.Mesh | null = null;

	public rolling = false;
	private mouse_start: Vector | undefined = undefined;
	private mouse_time = 0;

	// eslint-disable-next-line @typescript-eslint/ban-types
	private callback: Function | undefined = undefined;

	constructor(container: HTMLCanvasElement, dimensions: Dimensions) {
		this.renderer = window.WebGLRenderingContext
			? new THREE.WebGLRenderer({ antialias: true })
			: new THREE.CanvasRenderer({ antialias: true } as any);
		container.appendChild(this.renderer.domElement);
		(this.renderer as THREE.WebGLRenderer).shadowMap.enabled = true;
		(this.renderer as THREE.WebGLRenderer).shadowMap.type = THREE.PCFShadowMap;
		(this.renderer as THREE.WebGLRenderer).setClearColor(0xffffff, 1);

		this.reinit(container, dimensions);

		this.world.gravity.set(0, 0, -9.8 * 800);
		this.world.broadphase = new CANNON.NaiveBroadphase();
		this.world.solver.iterations = 16;

		const ambientLight = new THREE.AmbientLight(ambient_light_color);
		this.scene.add(ambientLight);

		const desk_body_material = new CANNON.Material('desk');
		const barrier_body_material = new CANNON.Material('barrier');
		this.world.addContactMaterial(
			new CANNON.ContactMaterial(desk_body_material, this.dice_body_material, {
				restitution: 0.01,
				friction: 0.5
			})
		);
		this.world.addContactMaterial(
			new CANNON.ContactMaterial(barrier_body_material, this.dice_body_material, {
				restitution: 0,
				friction: 1.0
			})
		);
		this.world.addContactMaterial(
			new CANNON.ContactMaterial(this.dice_body_material, this.dice_body_material, {
				restitution: 0,
				friction: 0.5
			})
		);

		this.world.addBody(
			new CANNON.Body({ material: desk_body_material, shape: new CANNON.Plane(), mass: 0 })
		);
		let barrier: CANNON.Body;
		barrier = new CANNON.Body({
			material: desk_body_material,
			shape: new CANNON.Plane(),
			mass: 0
		});
		barrier.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
		barrier.position.set(0, this.h * 0.93, 0);
		this.world.addBody(barrier);

		barrier = new CANNON.Body({
			material: desk_body_material,
			shape: new CANNON.Plane(),
			mass: 0
		});
		barrier.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
		barrier.position.set(0, -this.h * 0.93, 0);
		this.world.addBody(barrier);

		barrier = new CANNON.Body({
			material: desk_body_material,
			shape: new CANNON.Plane(),
			mass: 0
		});
		barrier.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
		barrier.position.set(this.w * 0.93, 0, 0);
		this.world.addBody(barrier);

		barrier = new CANNON.Body({
			material: desk_body_material,
			shape: new CANNON.Plane(),
			mass: 0
		});
		barrier.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
		barrier.position.set(-this.w * 0.93, 0, 0);
		this.world.addBody(barrier);

		this.renderer.render(this.scene, this.camera!);
	}

	reinit(container: HTMLElement, dimensions: Dimensions) {
		this.cw = container.clientWidth / 2;
		this.ch = container.clientHeight / 2;
		if (dimensions) {
			this.w = dimensions.w;
			this.h = dimensions.h;
		} else {
			this.w = this.cw;
			this.h = this.ch;
		}
		this.aspect = Math.min(this.cw / this.w, this.ch / this.h);
		scale = Math.sqrt(this.w * this.w + this.h * this.h) / 13;

		this.renderer.setSize(this.cw * 2, this.ch * 2);

		this.wh = this.ch / this.aspect / Math.tan((10 * Math.PI) / 180);
		if (this.camera) this.scene.remove(this.camera);
		this.camera = new THREE.PerspectiveCamera(20, this.cw / this.ch, 1, this.wh * 1.3);
		this.camera.position.z = this.wh;

		const mw = Math.max(this.w, this.h);
		if (this.light) this.scene.remove(this.light);
		this.light = new THREE.SpotLight(spot_light_color, 2.0);
		this.light.position.set(-mw / 2, mw / 2, mw * 2);
		this.light.target.position.set(0, 0, 0);
		this.light.distance = mw * 5;
		this.light.castShadow = true;
		this.light.shadow.camera.near = mw / 10;
		this.light.shadow.camera.far = mw * 5;
		this.light.shadow.camera.fov = 50;
		this.light.shadow.bias = 0.001;
		// (this.light as any).shadowDarkness = 1.1;
		this.light.shadow.mapSize.width = 1024;
		this.light.shadow.mapSize.height = 1024;
		this.scene.add(this.light);

		if (this.desk) this.scene.remove(this.desk);
		this.desk = new THREE.Mesh(
			new THREE.PlaneGeometry(this.w * 2, this.h * 2, 1, 1),
			new THREE.MeshPhongMaterial({ color: desk_color })
		);
		this.desk.receiveShadow = use_shadows;
		this.scene.add(this.desk);

		this.renderer.render(this.scene, this.camera);
	}

	generate_vectors(notation: Notation, vector: Vector, boost: number) {
		const vectors = [];
		for (const i in notation.set) {
			const vec = make_random_vector(vector);
			const pos = {
				x: this.w * (vec.x > 0 ? -1 : 1) * 0.9,
				y: this.h * (vec.y > 0 ? -1 : 1) * 0.9,
				z: rnd() * 200 + 200
			};
			const projector = Math.abs(vec.x / vec.y);
			if (projector > 1.0) pos.y /= projector;
			else pos.x *= projector;
			const velvec = make_random_vector(vector);
			const velocity = { x: velvec.x * boost, y: velvec.y * boost, z: -10 };
			const inertia = dice_inertia[notation.set[i]];
			const angle = {
				x: -(rnd() * vec.y * 5 + inertia * vec.y),
				y: rnd() * vec.x * 5 + inertia * vec.x,
				z: 0
			};
			const axis = { x: rnd(), y: rnd(), z: rnd(), a: rnd() };
			vectors.push({
				set: notation.set[i],
				pos: pos,
				velocity: velocity,
				angle: angle,
				axis: axis
			});
		}
		return vectors;
	}

	check_if_throw_finished() {
		let res = true;
		const e = 6;
		if (this.iteration < 10 / frame_rate) {
			for (let i = 0; i < this.dices.length; ++i) {
				const dice = this.dices[i];
				if (dice.dice_stopped === true) continue;
				const a = dice.body.angularVelocity,
					v = dice.body.velocity;
				if (
					Math.abs(a.x) < e &&
					Math.abs(a.y) < e &&
					Math.abs(a.z) < e &&
					Math.abs(v.x) < e &&
					Math.abs(v.y) < e &&
					Math.abs(v.z) < e
				) {
					if (dice.dice_stopped) {
						if (this.iteration - dice.dice_stopped > 3) {
							dice.dice_stopped = true;
							continue;
						}
					} else dice.dice_stopped = this.iteration;
					res = false;
				} else {
					dice.dice_stopped = undefined;
					res = false;
				}
			}
		}
		return res;
	}

	dice_box() {
		while (!this.check_if_throw_finished()) {
			++this.iteration;
			this.world.step(frame_rate);
		}
		return get_dice_values(this.dices);
	}

	__animate(threadid: number) {
		const time = new Date().getTime();
		let time_diff = (time - this.last_time) / 1000;
		if (time_diff > 3) time_diff = frame_rate;
		++this.iteration;
		if (this.use_adapvite_timestep) {
			while (time_diff > frame_rate * 1.1) {
				this.world.step(frame_rate);
				time_diff -= frame_rate;
			}
			this.world.step(time_diff);
		} else {
			this.world.step(frame_rate);
		}
		for (const i in this.scene.children) {
			const interact = this.scene.children[i] as any; // TODO
			if (interact.body != undefined) {
				interact.position.copy(interact.body.position);
				interact.quaternion.copy(interact.body.quaternion);
			}
		}
		this.renderer.render(this.scene, this.camera!);
		this.last_time = this.last_time ? time : new Date().getTime();
		if (this.running == threadid && this.check_if_throw_finished()) {
			this.running = false;
			if (this.callback) this.callback.call(this, get_dice_values(this.dices));
		}
		if (this.running == threadid) {
			(function (t, tid, uat) {
				if (!uat && time_diff < frame_rate) {
					setTimeout(function () {
						requestAnimationFrame(function () {
							t.__animate(tid);
						});
					}, (frame_rate - time_diff) * 1000);
				} else
					requestAnimationFrame(function () {
						t.__animate(tid);
					});
			})(this, threadid, this.use_adapvite_timestep);
		}
	}

	clear() {
		this.running = false;
		let dice;
		while ((dice = this.dices.pop())) {
			this.scene.remove(dice);
			if (dice.body) this.world.remove(dice.body);
		}
		if (this.pane) this.scene.remove(this.pane);
		this.renderer.render(this.scene, this.camera!);
		setTimeout(() => {
			this.renderer.render(this.scene, this.camera!);
		}, 100);
	}

	prepare_dices_for_roll(vectors: ReturnType<DiceBox['generate_vectors']>) {
		this.clear();
		this.iteration = 0;
		for (const i in vectors) {
			this.create_dice(
				vectors[i].set,
				vectors[i].pos,
				vectors[i].velocity,
				vectors[i].angle,
				vectors[i].axis
			);
		}
	}

	roll(
		vectors: Vectors,
		values: Array<number> | undefined,
		// eslint-disable-next-line @typescript-eslint/ban-types
		callback: Function
	) {
		this.prepare_dices_for_roll(vectors);
		if (values != undefined && values.length) {
			this.use_adapvite_timestep = false;
			const res: Array<number> = this.emulate_throw();
			this.prepare_dices_for_roll(vectors);
			for (const i in res) shift_dice_faces(this.dices[i], values[i], res[i]);
		}
		this.callback = callback;
		this.running = new Date().getTime();
		this.last_time = 0;
		this.__animate(this.running);
	}

	emulate_throw() {
		while (!this.check_if_throw_finished()) {
			++this.iteration;
			this.world.step(frame_rate);
		}
		return get_dice_values(this.dices);
	}

	draw_selector() {
		this.clear();
		const step = this.w / 4.5;
		this.pane = new THREE.Mesh(
			new THREE.PlaneGeometry(this.w * 6, this.h * 6, 1, 1),
			new THREE.MeshPhongMaterial(selector_back_colors)
		);
		this.pane.receiveShadow = true;
		this.pane.position.set(0, 0, 1);
		this.scene.add(this.pane);

		for (let i = 0, pos = -3; i < known_types.length; ++i, ++pos) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const dice = createFn.get(known_types[i])!();
			dice.position.set(pos * step, 0, step * 0.5);
			dice.castShadow = true;
			dice.userData = known_types[i] as any;
			this.dices.push(dice as DiceT);
			this.scene.add(dice);
		}

		this.running = new Date().getTime();
		this.last_time = 0;
		if (this.animate_selector) this.__selector_animate(this.running);
		else this.renderer.render(this.scene, this.camera!);
	}

	bind_mouse(
		container: HTMLElement,
		notation_getter: NotationGetter,
		before_roll?: BeforeRoll,
		after_roll?: AfterRoll
	) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const box = this;
		bind(container, ['mousedown', 'touchstart'], function (ev) {
			ev.preventDefault();
			box.mouse_time = new Date().getTime();
			box.mouse_start = get_mouse_coords(ev as MouseEvent | TouchEvent);
		});
		bind(container, ['mouseup', 'touchend'], function (ev) {
			if (box.rolling) return;
			if (box.mouse_start == undefined) return;
			ev.stopPropagation();
			const m = get_mouse_coords(ev as MouseEvent | TouchEvent);
			const vector = { x: m.x - box.mouse_start.x, y: -(m.y - box.mouse_start.y) };
			box.mouse_start = undefined;
			const dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
			if (dist < Math.sqrt(box.w * box.h * 0.01)) return;
			let time_int = new Date().getTime() - box.mouse_time;
			if (time_int > 2000) time_int = 2000;
			const boost = Math.sqrt((2500 - time_int) / 2500) * dist * 2;
			prepare_rnd(function () {
				throw_dices(box, vector, boost, dist, notation_getter, before_roll, after_roll);
			});
		});
	}

	bind_throw(
		button: HTMLElement,
		notation_getter: NotationGetter,
		before_roll?: BeforeRoll,
		after_roll?: AfterRoll
	) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const box = this;
		bind(button, ['mouseup', 'touchend'], function (ev) {
			ev.stopPropagation();
			box.start_throw(notation_getter, before_roll, after_roll);
		});
	}

	__selector_animate(threadid: number) {
		const time = new Date().getTime();
		let time_diff = (time - this.last_time) / 1000;
		if (time_diff > 3) time_diff = frame_rate;
		const angle_change =
			(0.3 * time_diff * Math.PI * Math.min(24000 + threadid - time, 6000)) / 6000;
		if (angle_change < 0) this.running = false;
		for (const i in this.dices) {
			this.dices[i].rotation.y += angle_change;
			this.dices[i].rotation.x += angle_change / 4;
			this.dices[i].rotation.z += angle_change / 10;
		}
		this.last_time = time;
		this.renderer.render(this.scene, this.camera!);
		if (this.running == threadid) {
			(function (t, tid) {
				requestAnimationFrame(function () {
					t.__selector_animate(tid);
				});
			})(this, threadid);
		}
	}

	search_dice_by_mouse(ev: MouseEvent | TouchEvent) {
		const m = get_mouse_coords(ev);
		const intersects = new THREE.Raycaster(
			this.camera!.position,
			new THREE.Vector3(
				(m.x - this.cw) / this.aspect,
				1 - (m.y - this.ch) / this.aspect,
				this.w / 9
			)
				.sub(this.camera!.position)
				.normalize()
		).intersectObjects(this.dices);
		if (intersects.length) return intersects[0].object.userData;
	}

	start_throw(notation_getter: NotationGetter, before_roll?: BeforeRoll, after_roll?: AfterRoll) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const box = this;
		if (box.rolling) return;
		prepare_rnd(function () {
			const vector = { x: (rnd() * 2 - 1) * box.w, y: -(rnd() * 2 - 1) * box.h };
			const dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
			const boost = (rnd() + 3) * dist;
			throw_dices(box, vector, boost, dist, notation_getter, before_roll, after_roll);
		});
	}

	create_dice = (
		type: DiceTypes,
		pos: { x: number; y: number; z: number },
		velocity: { x: number; y: number; z: number },
		angle: { x: number; y: number; z: number },
		axis: { x: number; y: number; z: number; a: number }
	) => {
		const dice: DiceT = createFn.get(type)!() as any;
		dice.castShadow = true;
		dice.dice_type = type;
		dice.body = new CANNON.Body({
			mass: dice_mass[type],
			shape: cannon_shape,
			material: this.dice_body_material
		});
		dice.body.position.set(pos.x, pos.y, pos.z);
		dice.body.quaternion.setFromAxisAngle(
			new CANNON.Vec3(axis.x, axis.y, axis.z),
			axis.a * Math.PI * 2
		);
		dice.body.angularVelocity.set(angle.x, angle.y, angle.z);
		dice.body.velocity.set(velocity.x, velocity.y, velocity.z);
		dice.body.linearDamping = 0.1;
		dice.body.angularDamping = 0.1;
		this.scene.add(dice);
		this.dices.push(dice);
		this.world.addBody(dice.body);
	};
}

type Vector = {
	x: number;
	y: number;
};

function make_random_vector(vector: Vector) {
	const random_angle = (rnd() * Math.PI) / 5 - Math.PI / 5 / 2;
	const vec = {
		x: vector.x * Math.cos(random_angle) - vector.y * Math.sin(random_angle),
		y: vector.x * Math.sin(random_angle) + vector.y * Math.cos(random_angle)
	};
	if (vec.x == 0) vec.x = 0.01;
	if (vec.y == 0) vec.y = 0.01;
	return vec;
}

function get_dice_value(dice: DiceT) {
	const vector = new THREE.Vector3(0, 0, dice.dice_type == 'd4' ? -1 : 1);
	let closest_face: THREE.Face3,
		closest_angle = Math.PI * 2;
	for (let i = 0, l = dice.geometry.faces.length; i < l; ++i) {
		const face = dice.geometry.faces[i];
		if (face.materialIndex == 0) continue;
		const angle = face.normal.clone().applyQuaternion(dice.body.quaternion).angleTo(vector);
		if (angle < closest_angle) {
			closest_angle = angle;
			closest_face = face;
		}
	}
	let matindex = closest_face!.materialIndex - 1;
	if (dice.dice_type == 'd100') matindex *= 10;
	if (dice.dice_type == 'd10' && matindex == 0) matindex = 10;
	return matindex;
}

function get_dice_values(dices: Array<DiceT>) {
	const values = [];
	for (let i = 0, l = dices.length; i < l; ++i) {
		values.push(get_dice_value(dices[i]));
	}
	return values;
}

function shift_dice_faces(dice: DiceT, value: number, res: number) {
	const r = dice_face_range[dice.dice_type];
	if (dice.dice_type == 'd10' && value == 10) value = 0;
	if (dice.dice_type == 'd10' && res == 10) res = 0;
	if (dice.dice_type == 'd100') res /= 10;
	if (!(value >= r[0] && value <= r[1])) return;
	let num = value - res;
	const geom = dice.geometry.clone();
	for (let i = 0, l = geom.faces.length; i < l; ++i) {
		let matindex = geom.faces[i].materialIndex;
		if (matindex == 0) continue;
		matindex += num - 1;
		while (matindex > r[1]) matindex -= r[1];
		while (matindex < r[0]) matindex += r[1];
		geom.faces[i].materialIndex = matindex + 1;
	}
	if (dice.dice_type == 'd4' && num != 0) {
		if (num < 0) num += 4;
		dice.material = new THREE.MeshFaceMaterial(
			create_d4_materials(scale / 2, scale * 2, d4_labels[num])
		);
	}
	dice.geometry = geom;
}

export type BeforeRoll = (
	this: DiceBox,
	v: ReturnType<DiceBox['generate_vectors']>,
	n: Notation,
	roll: (rr?: boolean) => void
) => void;

export type AfterRoll = (this: DiceBox, n: Notation, r: Array<number>) => void;

export type NotationGetter = () => Notation;

function throw_dices(
	box: DiceBox,
	vector: { x: number; y: number },
	boost: number,
	dist: number,
	notation_getter: NotationGetter,
	before_roll?: BeforeRoll,
	after_roll?: AfterRoll
) {
	const uat = box.use_adapvite_timestep;
	function roll(request_results?: boolean) {
		if (after_roll) {
			box.clear();
			box.roll(
				vectors,
				(request_results || notation.result) as any,
				function (result: Array<number>) {
					if (after_roll) after_roll.call(box, notation, result);
					box.rolling = false;
					box.use_adapvite_timestep = uat;
				}
			);
		}
	}
	vector.x /= dist;
	vector.y /= dist;
	const notation = notation_getter.call(box);
	if (notation.set.length == 0) return;
	const vectors = box.generate_vectors(notation, vector, boost);
	box.rolling = true;
	if (before_roll) before_roll.call(box, vectors, notation, roll);
	else roll();
}
