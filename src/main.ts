import Phaser from 'phaser';
import { saveSettings, settings } from './config/settings';
import { input } from './core/input';
import { net } from './net/NetClient';
import { BootScene } from './scenes/BootScene';
import { CharacterScene } from './scenes/CharacterScene';
import { LobbyScene } from './scenes/LobbyScene';
import { OnlineScene } from './scenes/OnlineScene';
import { ByeScene } from './scenes/ByeScene';
import { toggleFullscreen } from './scenes/common';
import { ControlsScene } from './scenes/ControlsScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameScene } from './scenes/GameScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { ModeSelectScene } from './scenes/ModeSelectScene';
import { TutorialScene } from './scenes/TutorialScene';
import { RecordsScene } from './scenes/RecordsScene';
import { ShopScene } from './scenes/ShopScene';
import { MissionsScene } from './scenes/MissionsScene';
import { ToastScene } from './scenes/ToastScene';
import { MinigameScene } from './scenes/MinigameScene';
import { MinigameHubScene } from './scenes/MinigameHubScene';
import { MenuScene } from './scenes/MenuScene';
import { OptionsScene } from './scenes/OptionsScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultsScene } from './scenes/ResultsScene';
import { RoleRevealScene } from './scenes/RoleRevealScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Nunca 0x0 (p. ej. pestaña oculta al cargar): WebGL no podría crear el lienzo.
  width: Math.max(320, window.innerWidth),
  height: Math.max(180, window.innerHeight),
  backgroundColor: '#0d0b14',
  pixelArt: true,
  roundPixels: true,
  // El lienzo ocupa toda la ventana; cada escena usa un zoom de cámara entero (ver scenes/common.ts).
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
    min: { width: 320, height: 180 },
  },
  audio: { noAudio: true },
  input: { keyboard: false, gamepad: false },
  fps: { target: 60, smoothStep: true },
  disableContextMenu: true,
  banner: false,
  scene: [
    BootScene,
    TitleScene,
    MenuScene,
    ModeSelectScene,
    TutorialScene,
    RecordsScene,
    MapSelectScene,
    RoleRevealScene,
    GameScene,
    UIScene,
    PauseScene,
    OptionsScene,
    ControlsScene,
    CreditsScene,
    ResultsScene,
    ByeScene,
    CharacterScene,
    OnlineScene,
    LobbyScene,
    ShopScene,
    MissionsScene,
    MinigameHubScene,
    MinigameScene,
    // siempre la última: va encima de todo
    ToastScene,
  ],
});

input.attach(game);

document.addEventListener('fullscreenchange', () => {
  settings.fullscreen = !!document.fullscreenElement;
  saveSettings();
});

// Tecla F: pantalla completa (salvo mientras se escribe un nombre o se reasigna una tecla).
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat && !input.isTyping() && !input.isCapturing()) toggleFullscreen();
});

// Acceso para depurar desde la consola.
(window as unknown as { __JAMON__: Phaser.Game; __JAMON_NET__: typeof net }).__JAMON__ = game;
(window as unknown as { __JAMON_NET__: typeof net }).__JAMON_NET__ = net;
