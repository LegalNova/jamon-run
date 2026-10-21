// Envoltorio de escritorio (opcional) para JAMONGUS.
// Uso: npm run desktop   (compila y abre el juego en una ventana nativa)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const SMOKE = process.env.JAMON_SMOKE_TEST === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 480,
    minHeight: 270,
    backgroundColor: '#0d0b14',
    title: 'JAMONGUS',
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  if (SMOKE) {
    // Prueba automática: carga el juego, espera y comprueba que no hay errores.
    let errors = 0;
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) {
        errors++;
        console.error('[renderer]', message);
      }
    });
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const scenes = await win.webContents.executeJavaScript(
          "window.__JAMON__ ? window.__JAMON__.scene.getScenes(true).map(s => s.scene.key).join(',') : 'sin juego'",
        );
        console.log(`[smoke] escenas activas: ${scenes} · errores: ${errors}`);
        app.exit(errors === 0 && scenes.includes('Title') ? 0 : 1);
      }, 2500);
    });
  }
}

ipcMain.on('jamon:quit', () => app.quit());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
