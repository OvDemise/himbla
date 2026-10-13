// Desktop wrapper: runs the built game (dist/) in its own window, no browser needed.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

// keep the GPU busy rather than throttling when the window loses focus mid-run
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#05030c',
    title: 'Moon-Runner',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // F11 toggles fullscreen (Esc stays with the game: it opens the pause menu)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // never open new windows inside the game; send links to the real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// PlayStation gyro: the game reads the pad's motion sensors over WebHID. Electron shows no device picker, so
// Sony controllers (vendor 0x054c) are allowed up front; the page then finds them with navigator.hid.getDevices().
const SONY = 0x054c;
function allowSonyPads() {
  const ses = session.defaultSession;
  ses.setDevicePermissionHandler((details) => details.deviceType === 'hid' && details.device.vendorId === SONY);
  // (once a check handler exists it answers every permission check, so everything else stays allowed as before)
  ses.setPermissionCheckHandler(() => true);
  // a real navigator.hid.requestDevice() call picks the first Sony pad without a chooser
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const d = details.deviceList.find((x) => x.vendorId === SONY);
    callback(d ? d.deviceId : '');
  });
}

app.whenReady().then(() => { allowSonyPads(); createWindow(); });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
