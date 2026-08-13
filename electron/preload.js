const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopSharedFolder", {
  supported: true,
  select: () => ipcRenderer.invoke("shared-folder:select"),
  createHost: (options) => ipcRenderer.invoke("shared-folder:create-host", options),
  getStatus: () => ipcRenderer.invoke("shared-folder:status"),
  testAccess: () => ipcRenderer.invoke("shared-folder:test"),
  forget: () => ipcRenderer.invoke("shared-folder:forget"),
});
