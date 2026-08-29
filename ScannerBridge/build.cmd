@echo off
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo Microsoft .NET Framework compiler was not found.
  exit /b 1
)
if not exist ..\Downloads mkdir ..\Downloads
"%CSC%" /nologo /target:winexe /optimize+ /platform:x86 /out:..\Downloads\ScannerBridge.exe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:Microsoft.CSharp.dll Program.cs
if errorlevel 1 exit /b 1
echo Built ..\Downloads\ScannerBridge.exe
