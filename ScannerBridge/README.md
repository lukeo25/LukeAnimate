# Luke Animate Scanner Bridge

`ScannerBridge.exe` lets Luke Animate's Scanner Import panel talk to scanners exposed through Windows Image Acquisition (WIA).

Download: <https://github.com/lukeo25/LukeAnimate/raw/main/Downloads/ScannerBridge.exe>

Run the app once, leave its icon in the Windows notification area, then use **Scanner Import** in Luke Animate. Right-click the notification icon to check scanner status, open Luke Animate, or exit.

The bridge listens only on `127.0.0.1:8765`; it is not accessible from other computers.
