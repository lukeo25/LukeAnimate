using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Luke Animate Scanner Bridge")]
[assembly: AssemblyDescription("Connects Luke Animate to Windows WIA scanners.")]
[assembly: AssemblyCompany("Luke Animate")]
[assembly: AssemblyProduct("Luke Animate Scanner Bridge")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace LukeAnimate.ScannerBridge
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool firstInstance;
            using (var mutex = new Mutex(true, "LukeAnimate.ScannerBridge", out firstInstance))
            {
                if (!firstInstance)
                {
                    MessageBox.Show("Luke Animate Scanner Bridge is already running in the notification area.",
                        "Scanner Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.Run(new ScannerBridgeContext(8765));
                GC.KeepAlive(mutex);
            }
        }
    }

    internal sealed class ScannerBridgeContext : ApplicationContext
    {
        private readonly Control dispatcher;
        private readonly NotifyIcon trayIcon;
        private readonly TcpListener listener;
        private volatile bool stopping;

        public ScannerBridgeContext(int port)
        {
            dispatcher = new Control();
            IntPtr dispatcherHandle = dispatcher.Handle;
            WiaScanner.Initialize();
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open Luke Animate", null, delegate { OpenLukeAnimate(); });
            menu.Items.Add("Scanner status", null, delegate { ShowStatus(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, delegate { ExitThread(); });
            trayIcon = new NotifyIcon { Icon = SystemIcons.Application, Text = "Luke Animate Scanner Bridge", ContextMenuStrip = menu, Visible = true };
            trayIcon.DoubleClick += delegate { OpenLukeAnimate(); };
            listener = new TcpListener(IPAddress.Loopback, port);
            try
            {
                listener.Start();
                Task.Run((Func<Task>)AcceptLoopAsync);
                trayIcon.ShowBalloonTip(2500, "Luke Animate Scanner Bridge", "Scanner connection is ready. You can now use Scanner Import in Luke Animate.", ToolTipIcon.Info);
            }
            catch (Exception ex)
            {
                MessageBox.Show("The scanner bridge could not start.\n\n" + FriendlyMessage(ex), "Scanner Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                ExitThread();
            }
        }

        private async Task AcceptLoopAsync()
        {
            while (!stopping)
            {
                try
                {
                    var client = await listener.AcceptTcpClientAsync();
                    Task.Run(() => HandleClientAsync(client));
                }
                catch (ObjectDisposedException) { break; }
                catch (SocketException) { if (stopping) break; }
                catch { }
            }
        }

        private async Task HandleClientAsync(TcpClient client)
        {
            using (client)
            {
                NetworkStream stream = null;
                try
                {
                    client.ReceiveTimeout = 30000;
                    client.SendTimeout = 120000;
                    stream = client.GetStream();
                    string requestLine;
                    using (var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
                    {
                        requestLine = await reader.ReadLineAsync();
                        string line;
                        do { line = await reader.ReadLineAsync(); } while (!String.IsNullOrEmpty(line));
                    }
                    if (String.IsNullOrWhiteSpace(requestLine)) return;
                    var requestParts = requestLine.Split(new[] { ' ' }, 3, StringSplitOptions.RemoveEmptyEntries);
                    if (requestParts.Length < 2) { await SendJsonAsync(stream, 400, new { error = "Invalid request." }); return; }
                    if (String.Equals(requestParts[0], "OPTIONS", StringComparison.OrdinalIgnoreCase)) { await SendJsonAsync(stream, 200, new { ok = true }); return; }
                    if (!String.Equals(requestParts[0], "GET", StringComparison.OrdinalIgnoreCase)) { await SendJsonAsync(stream, 405, new { error = "Only GET is supported." }); return; }
                    var requestUri = new Uri("http://127.0.0.1" + requestParts[1]);
                    var query = ParseQuery(requestUri.Query);
                    object response;
                    switch (requestUri.AbsolutePath)
                    {
                        case "/health": response = new { ok = true, service = "Luke Animate Scanner Bridge", version = "1.0.0" }; break;
                        case "/scanners": response = RunOnUiThread(delegate { return (object)new { scanners = WiaScanner.GetScanners() }; }); break;
                        case "/scan":
                            string id = query.ContainsKey("id") ? query["id"] : "";
                            string colour = query.ContainsKey("colour") ? query["colour"] : "colour";
                            int dpi;
                            if (!query.ContainsKey("dpi") || !Int32.TryParse(query["dpi"], out dpi)) dpi = 300;
                            dpi = Math.Max(75, Math.Min(2400, dpi));
                            response = RunOnUiThread(delegate { return WiaScanner.Scan(id, dpi, colour); });
                            break;
                        default: await SendJsonAsync(stream, 404, new { error = "Not found." }); return;
                    }
                    await SendJsonAsync(stream, 200, response);
                }
                catch (Exception ex)
                {
                    try { if (stream != null) SendJsonAsync(stream, 500, new { error = FriendlyMessage(ex) }).Wait(); } catch { }
                }
            }
        }

        private object RunOnUiThread(Func<object> action)
        {
            if (dispatcher.IsDisposed) throw new InvalidOperationException("Scanner Bridge is closing.");
            return dispatcher.Invoke(action);
        }

        private static Dictionary<string, string> ParseQuery(string query)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var part in query.TrimStart('?').Split(new[] { '&' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var pair = part.Split(new[] { '=' }, 2);
                result[Uri.UnescapeDataString(pair[0].Replace('+', ' '))] = pair.Length > 1 ? Uri.UnescapeDataString(pair[1].Replace('+', ' ')) : "";
            }
            return result;
        }

        private static async Task SendJsonAsync(Stream stream, int status, object value)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = Int32.MaxValue };
            byte[] body = Encoding.UTF8.GetBytes(serializer.Serialize(value));
            string reason = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Internal Server Error";
            byte[] headers = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(headers, 0, headers.Length);
            await stream.WriteAsync(body, 0, body.Length);
        }

        private void ShowStatus()
        {
            try
            {
                var scanners = WiaScanner.GetScanners();
                string message = scanners.Count == 0 ? "The bridge is running, but Windows did not report a connected WIA scanner." : "The bridge is running. Windows found " + scanners.Count + " scanner" + (scanners.Count == 1 ? "." : "s.");
                MessageBox.Show(message, "Scanner Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) { MessageBox.Show(FriendlyMessage(ex), "Scanner Bridge", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }

        private static void OpenLukeAnimate() { try { Process.Start("https://lukeo25.github.io/LukeAnimate/"); } catch { } }

        protected override void ExitThreadCore()
        {
            stopping = true;
            try { listener.Stop(); } catch { }
            trayIcon.Visible = false;
            trayIcon.Dispose();
            WiaScanner.Shutdown();
            dispatcher.Dispose();
            base.ExitThreadCore();
        }

        internal static string FriendlyMessage(Exception exception)
        {
            Exception error = exception is TargetInvocationException && exception.InnerException != null ? exception.InnerException : exception;
            var com = error as COMException;
            if (com != null)
            {
                switch ((uint)com.ErrorCode)
                {
                    case 0x80210064: return "The scan was cancelled.";
                    case 0x80210006: return "The scanner is busy. Wait for it to finish and try again.";
                    case 0x8021000C: return "The scanner is offline or disconnected.";
                    case 0x80210005: return "The scanner could not be found.";
                    default: return "Windows could not complete the scan. " + com.Message;
                }
            }
            return error != null ? error.Message : "Unknown scanner error.";
        }
    }

    internal static class WiaScanner
    {
        private const int ScannerDeviceType = 1;
        private const string PngFormat = "{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}";
        private static dynamic manager;
        private static dynamic dialog;
        internal sealed class ScannerInfo { public string id { get; set; } public string name { get; set; } }

        public static void Initialize()
        {
            manager = CreateCom("WIA.DeviceManager");
            dialog = CreateCom("WIA.CommonDialog");
        }

        public static void Shutdown()
        {
            Release(dialog);
            Release(manager);
            dialog = null;
            manager = null;
        }

        public static List<ScannerInfo> GetScanners()
        {
            var result = new List<ScannerInfo>();
            foreach (dynamic info in (IEnumerable)manager.DeviceInfos)
            {
                try
                {
                    if ((int)info.Type != ScannerDeviceType) continue;
                    string name = Convert.ToString(info.Properties.Item("Name").Value) ?? "Scanner";
                    result.Add(new ScannerInfo { id = Convert.ToString(info.DeviceID) ?? "", name = name });
                }
                finally { Release(info); }
            }
            return result;
        }

        public static object Scan(string deviceId, int dpi, string colour)
        {
            dynamic selectedInfo = null, device = null, item = null, image = null;
            string temporary = Path.Combine(Path.GetTempPath(), "LukeAnimate-Scan-" + Guid.NewGuid().ToString("N") + ".png");
            try
            {
                foreach (dynamic info in (IEnumerable)manager.DeviceInfos)
                {
                    if (Convert.ToString(info.DeviceID) == deviceId) { selectedInfo = info; break; }
                    Release(info);
                }
                if (selectedInfo == null) throw new InvalidOperationException("The selected scanner is no longer available.");
                device = selectedInfo.Connect();
                if ((int)device.Items.Count < 1) throw new InvalidOperationException("The scanner did not expose a scan source.");
                item = device.Items.Item(1);
                SetProperty(item.Properties, 6147, dpi);
                SetProperty(item.Properties, 6148, dpi);
                int intent = colour.ToLowerInvariant() == "grayscale" ? 2 : colour.ToLowerInvariant() == "text" ? 4 : 1;
                SetProperty(item.Properties, 6146, intent);
                image = dialog.ShowTransfer(item, PngFormat, false);
                if (image == null) throw new OperationCanceledException("Scanning was cancelled.");
                image.SaveFile(temporary);
                byte[] bytes = File.ReadAllBytes(temporary);
                return new { name = "Scan-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png", mimeType = "image/png", dataUrl = "data:image/png;base64," + Convert.ToBase64String(bytes) };
            }
            finally
            {
                try { if (File.Exists(temporary)) File.Delete(temporary); } catch { }
                Release(image); Release(item); Release(device); Release(selectedInfo);
            }
        }

        private static void SetProperty(dynamic properties, int id, object value) { try { properties.Item(id).Value = value; } catch { } }
        private static dynamic CreateCom(string progId)
        {
            try
            {
                Type type = Type.GetTypeFromProgID(progId);
                if (type == null) throw new InvalidOperationException("Windows Image Acquisition is not available on this PC.");
                object instance = Activator.CreateInstance(type);
                if (instance == null) throw new InvalidOperationException("Windows could not start Image Acquisition.");
                return instance;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Could not start " + progId + " (" + Thread.CurrentThread.GetApartmentState() + ", " + (Environment.Is64BitProcess ? "64-bit" : "32-bit") + "). " + ex.Message, ex);
            }
        }
        private static void Release(object value) { if (value != null && Marshal.IsComObject(value)) try { Marshal.FinalReleaseComObject(value); } catch { } }
    }
}
