<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DiceBox,
		parse_notation,
		type AfterRoll,
		type BeforeRoll,
		stringify_notation
	} from '../lib/dice';
	import { bind } from '../lib/utils/bind';

	onMount(async () => {
		const container: HTMLElement = document.querySelector('#dice-box')!;
		document.getElementById('loading_text')?.remove();

		var canvas: HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
		canvas.style.width = window.innerWidth - 1 + 'px';
		canvas.style.height = window.innerHeight - 1 + 'px';
		var label = document.getElementById('label')!;
		var set = document.getElementById('set') as HTMLInputElement;
		var selector_div = document.getElementById('selector_div')!;
		var info_div = document.getElementById('info_div')!;

		on_set_change();

		// $t.dice.use_true_random = false;

		function on_set_change() {
			set.style.width = set.value.length + 3 + 'ex';
		}

		bind(set, 'keyup', on_set_change);
		bind(set, 'mousedown', function (ev) {
			ev.stopPropagation();
		});
		bind(set, 'mouseup', function (ev) {
			ev.stopPropagation();
		});
		bind(set, 'focus', function (ev) {
			container.classList.remove('noselect');
		});
		bind(set, 'blur', function (ev) {
			container.classList.add('noselect');
		});

		bind(document.getElementById('clear')!, ['mouseup', 'touchend'], function (ev) {
			ev.stopPropagation();
			set.value = '0';
			on_set_change();
		});

		// var params = $t.get_url_params();

		// if (params.chromakey) {
		// 	dice.desk_color = 0x00ff00;
		// 	info_div.style.display = 'none';
		// 	$t.id('control_panel').style.display = 'none';
		// }
		// if (params.shadows == 0) {
		// 	dice.use_shadows = false;
		// }
		// if (params.color == 'white') {
		// 	dice.dice_color = '#808080';
		// 	dice.label_color = '#202020';
		// }

		const box = new DiceBox(canvas, { w: 500, h: 300 });
		box.animate_selector = false;

		window.addEventListener('resize', function () {
			canvas.style.width = window.innerWidth - 1 + 'px';
			canvas.style.height = window.innerHeight - 1 + 'px';
			box.reinit(canvas, { w: 500, h: 300 });
		});

		function show_selector() {
			info_div.style.display = 'none';
			selector_div.style.display = 'inline-block';
			box.draw_selector();
		}

		const before_roll: BeforeRoll = (vectors, notation, callback) => {
			info_div.style.display = 'none';
			selector_div.style.display = 'none';
			// do here rpc call or whatever to get your own result of throw.
			// then callback with array of your result, example:
			// callback([2, 2, 2, 2]); // for 4d6 where all dice values are 2.
			callback();
		};

		function notation_getter() {
			return parse_notation(set.value);
		}

		const after_roll: AfterRoll = (notation, result) => {
			// if (params.chromakey || params.noresult) return;
			var res = result.join(' ');
			if (notation.constant) {
				if (notation.constant > 0) res += ' +' + notation.constant;
				else res += ' -' + Math.abs(notation.constant);
			}
			if (result.length >= 1)
				res +=
					' = ' +
					(result.reduce(function (s, a) {
						return s + a;
					}) +
						notation.constant);
			label.innerHTML = res;
			info_div.style.display = 'inline-block';
		};

		box.bind_mouse(container, notation_getter, before_roll, after_roll);
		box.bind_throw(document.getElementById('throw')!, notation_getter, before_roll, after_roll);

		bind(container, ['mouseup', 'touchend'], function (ev) {
			ev.stopPropagation();
			if (selector_div.style.display == 'none') {
				if (!box.rolling) show_selector();
				box.rolling = false;
				return;
			}
			var name = box.search_dice_by_mouse(ev as any);
			if (name != undefined) {
				var notation = parse_notation(set.value);
				notation.set.push(name as any);
				set.value = stringify_notation(notation);
				on_set_change();
			}
		});

		// if (params.notation) {
		// 	set.value = params.notation;
		// }
		// if (params.roll) {
		// 	$t.raise_event($t.id('throw'), 'mouseup');
		// } else {
		show_selector();
		// }
	});
</script>

<div id="dice-box">
	<div id="info_div" style="display: none">
		<div class="center_field">
			<span id="label" />
		</div>
		<div class="center_field">
			<div class="bottom_field">
				<span id="labelhelp">click to continue or tap and drag again</span>
			</div>
		</div>
	</div>
	<div id="selector_div" style="display: inline-block;">
		<div class="center_field">
			<div id="sethelp">
				choose your dice set by clicking the dices or by direct input of notation,<br />
				tap and drag on free space of screen or hit throw button to roll
			</div>
		</div>
		<div class="center_field">
			<input type="text" id="set" value="4d6" style="width: 6ex;" /><br />
			<button id="clear">clear</button>
			<button style="margin-left: 0.6em" id="throw">throw</button><br />
			<span style="font-size: 12pt; color: rgba(21, 26, 26, 0.5); background: none;">
				please consider to <a
					style="padding: 0px;"
					href="https://paypal.me/teal/5?locale.x=en_EN&amp;country.x=US">donate</a
				> to keep the dice roller running
			</span>
		</div>
	</div>

	<div id="label" />
	<div id="canvas" style="" />
	<input type="text" id="set" />
	<button id="throw">throw</button>
	<button id="clear">clear</button>
</div>

<style>
	.center_field {
		position: absolute;
		text-align: center;
		height: 100%;
		width: 100%;
	}

	.center_field * {
		position: relative;
		font-family: Trebuchet MS;
		background-color: rgba(255, 255, 255, 0.6);
		padding: 5px 15px;
	}

	.center_field br {
		background-color: rgba(0, 0, 0, 0);
	}

	.bottom_field {
		position: absolute;
		text-align: center;
		bottom: 5px;
		width: inherit;
		padding: 0px;
	}

	#label {
		font-size: 32pt;
		word-spacing: 0.5em;
		padding: 5px 15px;
		color: rgba(21, 26, 26, 0.6);
		top: 45%;
	}

	#labelhelp {
		font-size: 12pt;
		padding: 5px 15px;
		color: rgba(21, 26, 26, 0.5);
		bottom: 50px;
	}

	#set {
		text-align: center;
		font-size: 26pt;
		border: none;
		color: rgba(0, 0, 0, 0.8);
		background-color: rgba(255, 255, 255, 0);
		top: 60%;
	}

	#sethelp {
		font-size: 12pt;
		color: rgba(21, 26, 26, 0.5);
		background: none;
		top: 25%;
	}

	#selector_div button {
		font-size: 20pt;
		color: rgb(255, 255, 255);
		background-color: rgba(0, 0, 0, 0.6);
		cursor: pointer;
		border: none;
		width: 5em;
		top: 62%;
	}

	.dice_place {
		position: absolute;
		border: solid black 1px;
	}
</style>
