import { Application, TextureStyle } from 'pixi.js';
import { GAME_NAME } from '@godseed/shared';
import { SCREEN } from './ui/layout';
import { fitToWindow } from './render/stage';
import { createDebug } from './ui/debug';

TextureStyle.defaultOptions.scaleMode = 'nearest';

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;
const app = new Application();
await app.init({ width: SCREEN.w, height: SCREEN.h, antialias: false, roundPixels: true, background: '#0b0d12' });
stage.prepend(app.canvas);
fitToWindow(stage);

const title = document.createElement('div');
title.className = 'title';
title.textContent = GAME_NAME;
ui.append(title);

const debug = createDebug(ui);
app.ticker.add(() => debug.set(`fps ${app.ticker.FPS.toFixed(0)}`));
