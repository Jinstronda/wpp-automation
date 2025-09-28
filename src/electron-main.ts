import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

// Handle ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppAutomationApp {
  private mainWindow: BrowserWindow | null = null;
  private serverProcess: ChildProcess | null = null;
  private readonly SERVER_PORT = 4000;
  private readonly SERVER_URL = `http://localhost:${this.SERVER_PORT}`;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Handle app ready event
    app.whenReady().then(() => {
      this.createWindow();
      this.startInternalServer();
      this.setupAppMenu();

      // macOS specific behavior
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    // Handle all windows closed
    app.on('window-all-closed', () => {
      this.cleanup();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle app quit
    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private createWindow(): void {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true
      },
      icon: this.getAppIcon(),
      title: 'WhatsApp Automation Desktop',
      show: false // Don't show until ready
    });

    // Load the app URL once server is ready
    this.loadAppWhenReady();

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();

      // Focus on the window
      if (this.mainWindow) {
        this.mainWindow.focus();
      }
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Development tools in development mode
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }
  }

  private async loadAppWhenReady(): Promise<void> {
    if (!this.mainWindow) return;

    // Wait for server to be ready
    let retries = 0;
    const maxRetries = 30; // 30 seconds timeout

    const checkServerReady = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${this.SERVER_URL}/api/status`);
        return response.ok;
      } catch {
        return false;
      }
    };

    while (retries < maxRetries) {
      if (await checkServerReady()) {
        console.log('✅ Server is ready, loading application...');
        await this.mainWindow.loadURL(this.SERVER_URL);
        return;
      }

      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If server failed to start, show error page
    console.error('❌ Server failed to start within timeout period');
    await this.showErrorPage();
  }

  private async showErrorPage(): Promise<void> {
    if (!this.mainWindow) return;

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Automation - Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .error-container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 500px;
            margin: 0 auto;
          }
          h1 { color: #e74c3c; }
          button {
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
          }
          button:hover { background: #2980b9; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>⚠️ Server Failed to Start</h1>
          <p>The WhatsApp Automation server could not be started.</p>
          <p>Please check if port ${this.SERVER_PORT} is available and try restarting the application.</p>
          <button onclick="location.reload()">🔄 Retry</button>
          <button onclick="require('electron').ipcRenderer.send('quit-app')">❌ Quit</button>
        </div>
      </body>
      </html>
    `;

    await this.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
  }

  private startInternalServer(): void {
    try {
      console.log('🚀 Starting internal Express server...');

      // Path to the compiled server file
      const serverPath = path.join(__dirname, 'server.js');

      // Check if server file exists
      if (!fs.existsSync(serverPath)) {
        console.error(`❌ Server file not found: ${serverPath}`);
        console.log('🔧 Please run "npm run build" first to compile TypeScript files');
        return;
      }

      // Start the server process
      this.serverProcess = spawn('node', [serverPath], {
        cwd: path.dirname(__dirname), // Project root directory
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
          PORT: this.SERVER_PORT.toString()
        }
      });

      // Handle server output
      this.serverProcess.stdout?.on('data', (data) => {
        console.log(`[Server] ${data.toString().trim()}`);
      });

      this.serverProcess.stderr?.on('data', (data) => {
        console.error(`[Server Error] ${data.toString().trim()}`);
      });

      // Handle server process exit
      this.serverProcess.on('exit', (code, signal) => {
        console.log(`[Server] Process exited with code ${code} and signal ${signal}`);
        this.serverProcess = null;
      });

      // Handle server process errors
      this.serverProcess.on('error', (error) => {
        console.error('[Server] Failed to start process:', error);
        this.showServerErrorDialog(error.message);
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      this.showServerErrorDialog(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private showServerErrorDialog(errorMessage: string): void {
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the WhatsApp Automation server:\n\n${errorMessage}\n\nPlease check the console for more details.`
    );
  }

  private setupAppMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Open WhatsApp Web',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              shell.openExternal('https://web.whatsapp.com');
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About WhatsApp Automation',
            click: () => {
              this.showAboutDialog();
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private showAboutDialog(): void {
    dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: 'About WhatsApp Automation',
      message: 'WhatsApp Automation Desktop',
      detail: 'A powerful desktop application for automating WhatsApp contact creation and messaging.\n\nVersion: 1.0.0\nBuilt with Electron and Express.js',
      buttons: ['OK']
    });
  }

  private getAppIcon(): string | undefined {
    // Try to find an icon file in the resources directory
    const iconPaths = [
      path.join(__dirname, '..', 'assets', 'icon.png'),
      path.join(__dirname, '..', 'assets', 'icon.ico'),
      path.join(process.cwd(), 'assets', 'icon.png'),
      path.join(process.cwd(), 'assets', 'icon.ico')
    ];

    for (const iconPath of iconPaths) {
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }

    return undefined;
  }

  private cleanup(): void {
    console.log('🧹 Cleaning up application resources...');

    // Terminate server process
    if (this.serverProcess) {
      console.log('🛑 Stopping internal server...');
      this.serverProcess.kill('SIGTERM');

      // Force kill after 5 seconds if it doesn't respond
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('🔪 Force killing server process...');
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);

      this.serverProcess = null;
    }
  }
}

// Initialize the application
new WhatsAppAutomationApp();