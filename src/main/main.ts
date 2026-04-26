import { app, BrowserWindow, ipcMain, protocol, net, dialog } from 'electron';
import { pathToFileURL } from 'url';
import path from 'path';
import * as db from './db';
import * as scanner from './scanner';
import * as playlist from './playlist';

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true } }
]);

let mainWindow: BrowserWindow;

app.whenReady().then(() => {
  db.init();

  protocol.handle('media', (request) => {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.replace(/^\/+/, ''));
    const track = db.getTrack(id);
    if (!track) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(track.path).href);
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DiodeDJ',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  setupIPC();
});

function setupIPC(): void {
  ipcMain.handle('search', (_event, query: string) => {
    return db.search(query);
  });

  ipcMain.handle('get-track', (_event, id: number) => {
    return db.getTrack(id);
  });

  ipcMain.handle('generate-playlist', (_event, count: number) => {
    return playlist.generate(count);
  });

  ipcMain.handle('get-stats', () => {
    return db.getStats();
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Music Library Folder'
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('scan-library', async (_event, dirPath: string) => {
    let lastReport = 0;
    const result = await scanner.scanDirectory(dirPath, (processed, total) => {
      const now = Date.now();
      if (now - lastReport > 200) {
        lastReport = now;
        mainWindow.webContents.send('scan-progress', { processed, total });
      }
    });
    return result;
  });
}

app.on('window-all-closed', () => {
  db.close();
  app.quit();
});
