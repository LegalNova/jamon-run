// Expone al juego una forma segura de cerrar la app (botón SALIR del menú).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jamonDesktop', {
  quit: () => ipcRenderer.send('jamon:quit'),
});
