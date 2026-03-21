using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace WuwaVHLauncher;

public partial class MainWindow : Window
{
    internal static readonly string AppDataFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WuwaVHLauncher");
    internal static readonly string CacheFolder = Path.Combine(AppDataFolder, "Cache");
    internal static readonly string SettingsPath = Path.Combine(AppDataFolder, "settings.json");
    const string AssetsUrl = "https://raw.githubusercontent.com/CallMeDangDev/WuwaVH/refs/heads/main/Web/assets.json";

    volatile bool _pageReady;
    string? _pendingBgm, _pendingVideo;
    SplashWindow? _splash;

    public MainWindow()
    {
        InitializeComponent();
        Directory.CreateDirectory(CacheFolder);
        Loaded += OnLoaded;
        Closing += (_, _) =>
        {
            // Clear WebView2 cache to prevent source extraction from disk cache
            try
            {
                webView.CoreWebView2?.Profile.ClearBrowsingDataAsync();
                webView.Dispose();
            }
            catch { }
            // Delete WebView2 cache folder
            try
            {
                var wv2Dir = Path.Combine(AppDataFolder, "WebView2");
                if (Directory.Exists(wv2Dir))
                    Directory.Delete(wv2Dir, true);
            }
            catch { }
            Environment.Exit(0);
        };
    }

    async void OnLoaded(object sender, RoutedEventArgs e)
    {
        _splash = new SplashWindow();
        _splash.Show();

        try
        {
            // Block remote debugging — ignore any user-set env var
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--remote-debugging-port=0");

            var env = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(AppDataFolder, "WebView2"));
            await webView.EnsureCoreWebView2Async(env);
            App.WebView2BrowserPid = webView.CoreWebView2.BrowserProcessId;

            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
#if DEBUG
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
#else
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
#endif
            webView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;

            webView.CoreWebView2.AddHostObjectToScript("launcher", new LauncherBridge(this));
            webView.CoreWebView2.WebMessageReceived += OnWebMessage;

            // Serve web resources from embedded assembly — never written to disk
            webView.CoreWebView2.AddWebResourceRequestedFilter("https://app.local/*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.WebResourceRequested += OnWebResourceRequested;

            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "cache.local", CacheFolder, CoreWebView2HostResourceAccessKind.Allow);

            webView.CoreWebView2.DOMContentLoaded += OnDOMContentLoaded;
            webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            webView.CoreWebView2.Navigate("https://app.local/index.html");

#if DEBUG
            webView.CoreWebView2.OpenDevToolsWindow();
#endif
            
            _ = Task.Run(CheckAndDownloadMedia);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Lỗi khởi tạo WebView2: " + ex.Message);
            _splash?.FadeOutAndClose();
            _splash = null;
            Application.Current.Shutdown(1);
        }
    }

    void OnDOMContentLoaded(object? sender, CoreWebView2DOMContentLoadedEventArgs e)
    {
        _pageReady = true;
        Dispatcher.Invoke(() =>
        {
            Opacity = 1;
            Activate();
            Focus();
            _splash?.FadeOutAndClose();
            _splash = null;
        });

        // Inject anti-inspection script
        RunScript(@"
            (function(){
                // Disable text selection
                document.addEventListener('selectstart', e => e.preventDefault());
                // Disable drag
                document.addEventListener('dragstart', e => e.preventDefault());
                // Block inspection shortcuts: F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S
                document.addEventListener('keydown', function(e){
                    if(e.key==='F12') { e.preventDefault(); return; }
                    if(e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key.toUpperCase())) { e.preventDefault(); return; }
                    if(e.ctrlKey && 'USus'.includes(e.key)) { e.preventDefault(); return; }
                });
                // Neuter console methods to prevent logging inspection
                ['log','warn','error','info','debug','table','dir','trace'].forEach(function(m){
                    console[m] = function(){};
                });
            })();
        ");

        DetectGamePath();
        FlushPendingMedia();
    }

    void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        var uri = new Uri(e.Uri);
        // Only allow our virtual hosts
        if (uri.Host != "app.local" && uri.Host != "cache.local")
            e.Cancel = true;
    }

    [DllImport("user32.dll")]
    static extern nint SendMessage(nint hWnd, int Msg, nint wParam, nint lParam);
    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();
    const int WM_NCLBUTTONDOWN = 0x00A1;
    const int HT_CAPTION = 0x0002;

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (e.TryGetWebMessageAsString() == "drag")
        {
            Dispatcher.Invoke(() =>
            {
                try
                {
                    var hwnd = new WindowInteropHelper(this).Handle;
                    ReleaseCapture();
                    SendMessage(hwnd, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
                }
                catch { }
            });
        }
    }

    // ── Serve embedded web resources (XOR-encrypted) from memory ──────

    static readonly Assembly Asm = Assembly.GetExecutingAssembly();
    const string ResPrefix = "WuwaVHLauncher.Resources.Web.";
    static readonly byte[] XorKey = "WuwaVH@2026!xK9#mQ"u8.ToArray();

    void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var uri = new Uri(e.Request.Uri);
        var path = uri.AbsolutePath.TrimStart('/');
        var resName = ResPrefix + path.Replace('/', '.');

        var encStream = Asm.GetManifestResourceStream(resName);
        if (encStream == null)
        {
            e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                null, 404, "Not Found", "");
            return;
        }

        // Decrypt XOR-encrypted resource in memory
        var enc = new byte[encStream.Length];
        encStream.ReadExactly(enc);
        encStream.Dispose();
        for (int i = 0; i < enc.Length; i++)
            enc[i] ^= XorKey[i % XorKey.Length];

        var mime = GetMimeType(path);
        var ms = new MemoryStream(enc);
        e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
            ms, 200, "OK",
            $"Content-Type: {mime}\r\n" +
            "Cache-Control: no-store\r\n" +
            "Content-Security-Policy: default-src 'self' https://app.local https://cache.local; " +
            "script-src 'self' https://app.local 'unsafe-inline'; " +
            "style-src 'self' https://app.local 'unsafe-inline'; " +
            "img-src 'self' https://app.local https://cache.local data:; " +
            "media-src 'self' https://cache.local blob:; " +
            "connect-src 'self' https://app.local");
    }

    static string GetMimeType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".css"  => "text/css; charset=utf-8",
        ".js"   => "application/javascript; charset=utf-8",
        ".json" => "application/json",
        ".png"  => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".svg"  => "image/svg+xml",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        ".webp" => "image/webp",
        ".mp4"  => "video/mp4",
        ".mp3"  => "audio/mpeg",
        _       => "application/octet-stream"
    };

    // ── JS helpers ──────────────────────────────────────────────────

    static string JsStr(string s) => JsonSerializer.Serialize(s);

    void RunScript(string js)
    {
        Dispatcher.InvokeAsync(async () =>
        {
            try { await webView.CoreWebView2.ExecuteScriptAsync(js); }
            catch { }
        });
    }

    // ── Game path detection ─────────────────────────────────────────

    void DetectGamePath()
    {
        string[] paths =
        [
            @"C:\Wuthering Waves", @"D:\Wuthering Waves", @"E:\Wuthering Waves",
            @"C:\Program Files\Wuthering Waves", @"D:\Program Files\Wuthering Waves"
        ];
        foreach (var p in paths)
        {
            var full = Path.Combine(p, "Wuthering Waves Game");
            if (Directory.Exists(full))
            {
                RunScript($"window.onGamePathDetected({JsStr(full)})");
                return;
            }
        }
    }

    // ── Installation ────────────────────────────────────────────────

    internal async Task RunInstallation(string gamePath, string vhMode, bool backup)
    {
        try
        {
            var baseDir = Path.Combine(gamePath, @"Client\Binaries\Win64");
            var modDir = Path.Combine(baseDir, "wuwaVietHoa");
            
            if (!Directory.Exists(baseDir))
                throw new Exception("Không tìm thấy thư mục game. Vui lòng kiểm tra lại đường dẫn.");

            // Check write access before doing anything (fixes UAC issues gracefully)
            try
            {
                var testFile = Path.Combine(baseDir, "vh_write_test.tmp");
                File.WriteAllText(testFile, "test");
                File.Delete(testFile);
            }
            catch (UnauthorizedAccessException)
            {
                // Let frontend know it needs admin rights
                RunScript("if(window.onAdminRequired) window.onAdminRequired(); else window.onInstallError('Thư mục game đang bị khóa bởi Windows. Vui lòng chạy Launcher bằng Quyền Admin.');");
                return;
            }
            catch (Exception ex)
            {
                throw new Exception("Không thể ghi file vào thư mục game: " + ex.Message);
            }

            Directory.CreateDirectory(modDir);

            var releaseUrl = "https://api.github.com/repos/CallMeDangDev/WuwaVH/releases/latest";

            using var http = new HttpClient();
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");
            var json = await http.GetStringAsync(releaseUrl);

            using var doc = JsonDocument.Parse(json);

            var tagName = doc.RootElement.TryGetProperty("tag_name", out var tagProp)
                ? tagProp.GetString() ?? "" : "";

            var toDownload = new List<(string Name, string Url, long Size, string Hash)>();

            foreach (var item in doc.RootElement.GetProperty("assets").EnumerateArray())
            {
                var name = item.GetProperty("name").GetString() ?? "";
                if (name == "WuWaVH_99_P.pak" || name == "UTMAlexander_100_P.pak" || name == "version.dll")
                {
                    var url = item.GetProperty("browser_download_url").GetString() ?? "";
                    var size = item.GetProperty("size").GetInt64();
                    
                    var digest = "";
                    if (item.TryGetProperty("digest", out var digestProp) && digestProp.ValueKind == JsonValueKind.String)
                        digest = digestProp.GetString()?.Replace("sha256:", "") ?? "";

                    toDownload.Add((name, url, size, digest));
                }
            }

            if (toDownload.Count == 0)
                throw new Exception("Không tìm thấy file cài đặt trên máy chủ.");

            var versionCachePath = Path.Combine(AppDataFolder, "versions.json");
            var localCache = new Dictionary<string, string>();
            if (File.Exists(versionCachePath))
            {
                try
                {
                    var cacheJson = File.ReadAllText(versionCachePath);
                    localCache = JsonSerializer.Deserialize<Dictionary<string, string>>(cacheJson) ?? new();
                }
                catch { }
            }

            bool allFilesUpToDate = true;
            foreach (var (name, _, _, hash) in toDownload)
            {
                var destPath = name == "version.dll" ? Path.Combine(baseDir, name) : Path.Combine(modDir, name);
                
                if (!File.Exists(destPath))
                {
                    allFilesUpToDate = false;
                    break;
                }
                
                if (!string.IsNullOrEmpty(hash))
                {
                    if (!localCache.TryGetValue(name, out var localHash) || localHash != hash)
                    {
                        allFilesUpToDate = false;
                        break;
                    }
                }
            }

            if (allFilesUpToDate)
            {
                if (!string.IsNullOrEmpty(tagName))
                {
                    localCache["_vhVersion"] = tagName;
                    File.WriteAllText(versionCachePath, JsonSerializer.Serialize(localCache));
                }
                RunScript($"window.onProgressUpdate(100, {JsStr("Bạn đang sử dụng phiên bản mới nhất!")}, '', '')");
                await Task.Delay(1500);
                RunScript("window.onInstallComplete()");
                return;
            }

            // Determine which files actually need downloading, and compute totalBytes from those only
            // so the progress bar doesn't jump when files are skipped.
            var needsUpdateSet = new HashSet<string>();
            long totalBytes = 0;
            foreach (var (name, _, size, hash) in toDownload)
            {
                var destPath = name == "version.dll" ? Path.Combine(baseDir, name) : Path.Combine(modDir, name);
                bool needsUpdate = !File.Exists(destPath) ||
                                   string.IsNullOrEmpty(hash) ||
                                   !localCache.TryGetValue(name, out var cachedHash) ||
                                   cachedHash != hash;
                if (needsUpdate)
                {
                    needsUpdateSet.Add(name);
                    totalBytes += size;
                }
            }

            long totalDownloaded = 0;
            var sw = Stopwatch.StartNew();
            long lastDownloaded = 0;

            foreach (var (name, url, size, hash) in toDownload)
            {
                var destPath = name == "version.dll" ? Path.Combine(baseDir, name) : Path.Combine(modDir, name);

                if (!needsUpdateSet.Contains(name))
                    continue;
                
                var tmpPath = destPath + ".tmp";

                using var resp = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                resp.EnsureSuccessStatusCode();

                await using var netStream = await resp.Content.ReadAsStreamAsync();
                await using var fileStream = new FileStream(tmpPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true);

                var buffer = new byte[65536];
                int bytesRead;

                while ((bytesRead = await netStream.ReadAsync(buffer)) > 0)
                {
                    await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead));
                    totalDownloaded += bytesRead;

                    if (sw.ElapsedMilliseconds >= 350)
                    {
                        var pct = totalBytes > 0 ? (int)((totalDownloaded * 100) / totalBytes) : 0;
                        var speed = (totalDownloaded - lastDownloaded) / sw.Elapsed.TotalSeconds / 1_048_576.0;
                        var progressText = $"{totalDownloaded / 1_048_576.0:F1} / {totalBytes / 1_048_576.0:F1} MB";
                        
                        RunScript($"window.onProgressUpdate({pct}, " +
                                  $"{JsStr($"Đang tải: {name}")}, " +
                                  $"{JsStr($"{speed:F1} MB/s")}, {JsStr(progressText)})");

                        lastDownloaded = totalDownloaded;
                        sw.Restart();
                    }
                }
                
                fileStream.Close(); File.Move(tmpPath, destPath, true);
                if (!string.IsNullOrEmpty(hash))
                    localCache[name] = hash;
            }

            if (!string.IsNullOrEmpty(tagName))
                localCache["_vhVersion"] = tagName;
            File.WriteAllText(versionCachePath, JsonSerializer.Serialize(localCache));

            RunScript($"window.onProgressUpdate(100, {JsStr("Hoàn tất cài đặt!")}, '', '')");
            await Task.Delay(1000);
            RunScript("window.onInstallComplete()");
        }
        catch (Exception ex)
        {
            RunScript($"window.onInstallError({JsStr(ex.Message)})");
        }
    }

    // ── Launch game ─────────────────────────────────────────────────

    internal void LaunchGame(string gamePath, bool dx11)
    {
        try
        {
            var exe = dx11 ? "Client-Win64-Shipping.exe" : "Wuthering Waves.exe";
            var full = Path.Combine(gamePath, exe);
            if (File.Exists(full))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = full,
                    WorkingDirectory = gamePath,
                    UseShellExecute = true
                });
                Dispatcher.Invoke(() => Application.Current.Shutdown());
            }
            else
            {
                RunScript($"window.onInstallError({JsStr("Không tìm thấy file game: " + exe)})");
            }
        }
        catch (Exception ex)
        {
            RunScript($"window.onInstallError({JsStr("Lỗi khởi chạy: " + ex.Message)})");
        }
    }

    // ── Media download & caching ────────────────────────────────────

    async Task CheckAndDownloadMedia()
    {
        SignalMediaReady();

        RunScript("window.onMediaStatus('checking', '')");
        var toDownload = new List<(string Name, string Url, string Hash)>();

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("WuwaVHLauncher/1.0");
            var json = await http.GetStringAsync(AssetsUrl);
            using var doc = JsonDocument.Parse(json);

            foreach (var item in doc.RootElement.GetProperty("assets").EnumerateArray())
            {
                var name = item.GetProperty("name").GetString() ?? "";
                if (name is "bgm.mp3" or "bg-video.mp4")
                {
                    var url = item.GetProperty("url").GetString() ?? "";
                    var hash = item.GetProperty("sha256").GetString() ?? "";
                    var dest = Path.Combine(CacheFolder, name);
                    if (!File.Exists(dest) || !VerifySha256(dest, hash))
                        toDownload.Add((name, url, hash));
                }
            }
        }
        catch { }

        if (toDownload.Count > 0)
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("WuwaVHLauncher/1.0");
            foreach (var (name, url, _) in toDownload)
            {
                try
                {
                    await DownloadWithProgress(http, url, Path.Combine(CacheFolder, name), name);
                }
                catch (Exception ex)
                {
                    RunScript($"window.onMediaStatus('error', " +
                              $"{JsStr("Lỗi tải " + name + ": " + ex.Message)})");
                }
            }
            SignalMediaReady();
        }

        RunScript("window.onMediaStatus('ready', '')");
    }

    async Task DownloadWithProgress(HttpClient http, string url, string dest, string name)
    {
        using var resp = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        resp.EnsureSuccessStatusCode();
        long total = resp.Content.Headers.ContentLength ?? -1;
        var tmp = dest + ".tmp";

        await using (var net = await resp.Content.ReadAsStreamAsync())
        await using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write,
                                             FileShare.None, 65536, useAsync: true))
        {
            var buf = new byte[65536];
            long got = 0, lastGot = 0;
            var sw = Stopwatch.StartNew();
            int read;
            while ((read = await net.ReadAsync(buf)) > 0)
            {
                await fs.WriteAsync(buf.AsMemory(0, read));
                got += read;
                if (sw.ElapsedMilliseconds >= 350)
                {
                    int pct = total > 0 ? (int)(got * 100 / total) : 0;
                    var spd = (got - lastGot) / sw.Elapsed.TotalSeconds / 1_048_576.0;
                    var size = total > 0
                        ? $"{got / 1_048_576.0:F1} / {total / 1_048_576.0:F1} MB"
                        : $"{got / 1_048_576.0:F1} MB";
                    RunScript($"window.onMediaProgress({pct}, " +
                              $"{JsStr("Đang tải " + name + "...")}, " +
                              $"{JsStr($"{spd:F1} MB/s")}, {JsStr(size)})");
                    lastGot = got;
                    sw.Restart();
                }
            }
        }

        if (File.Exists(dest)) File.Delete(dest);
        File.Move(tmp, dest);
    }

    void SignalMediaReady()
    {
        var bgm = File.Exists(Path.Combine(CacheFolder, "bgm.mp3")) ? "https://cache.local/bgm.mp3" : "";
        var video = File.Exists(Path.Combine(CacheFolder, "bg-video.mp4")) ? "https://cache.local/bg-video.mp4" : "";

        if (_pageReady)
            RunScript($"window.onMediaReady({JsStr(bgm)}, {JsStr(video)})");
        else
            (_pendingBgm, _pendingVideo) = (bgm, video);
    }

    void FlushPendingMedia()
    {
        if (_pendingBgm != null || _pendingVideo != null)
        {
            RunScript($"window.onMediaReady({JsStr(_pendingBgm ?? "")}, {JsStr(_pendingVideo ?? "")})");
            _pendingBgm = _pendingVideo = null;
        }
    }

    // ── Utilities ───────────────────────────────────────────────────

    static bool VerifySha256(string path, string expected)
    {
        try
        {
            using var sha = SHA256.Create();
            using var fs = File.OpenRead(path);
            var hash = sha.ComputeHash(fs);
            return Convert.ToHexString(hash).Equals(expected, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }
}

// ── WebView2 Host Object Bridge ─────────────────────────────────────

[ClassInterface(ClassInterfaceType.AutoDual)]
[ComVisible(true)]
public class LauncherBridge
{
    readonly MainWindow _w;
    internal LauncherBridge(MainWindow w) => _w = w;

    public void MinimizeWindow() =>
        _w.Dispatcher.Invoke(() => _w.WindowState = WindowState.Minimized);

    public void CloseWindow() =>
        _w.Dispatcher.Invoke(() => Application.Current.Shutdown());

        public string BrowseGameFolder() =>
        _w.Dispatcher.Invoke(() =>
        {
            var dlg = new OpenFolderDialog
            {
                Title = "Chọn thư mục cài đặt Wuthering Waves"
            };
            
            if (dlg.ShowDialog(_w) == true)
            {
                var path = dlg.FolderName;
                var exe = @"Client\Binaries\Win64\Client-Win64-Shipping.exe";
                
                string Check(string p) => System.IO.File.Exists(Path.Combine(p, exe)) ? p : null;
                
                var valid = Check(path) ?? Check(Path.Combine(path, "Wuthering Waves Game"));
                if (valid == null)
                {
                    var parent = new DirectoryInfo(path).Parent;
                    while (parent != null && valid == null)
                    {
                        valid = Check(parent.FullName) ?? Check(Path.Combine(parent.FullName, "Wuthering Waves Game"));
                        parent = parent.Parent;
                    }
                }
                
                return valid ?? "?INVALID";
            }
            return "";
        });

    public void OpenUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
            (uri.Scheme == "https" || uri.Scheme == "http"))
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
        }
    }

    public void SaveSettings(string json)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(MainWindow.SettingsPath)!);
            File.WriteAllText(MainWindow.SettingsPath, json);
        }
        catch { }
    }

    public string LoadSettings()
    {
        try
        {
            return File.Exists(MainWindow.SettingsPath)
                ? File.ReadAllText(MainWindow.SettingsPath) : "";
        }
        catch { return ""; }
    }

    public bool ShowConfirm(string message) =>
        _w.Dispatcher.Invoke(() =>
        {
            var dlg = new ConfirmDialog(message, _w);
            dlg.ShowDialog();
            return dlg.Confirmed;
        });

    public string GetAppVersion() =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";

    public string GetVhVersion()
    {
        try
        {
            var path = Path.Combine(MainWindow.AppDataFolder, "versions.json");
            if (!File.Exists(path)) return "";
            var json = File.ReadAllText(path);
            var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
            return dict?.TryGetValue("_vhVersion", out var v) == true ? v ?? "" : "";
        }
        catch { return ""; }
    }

    public void StartInstallation(string gamePath, string vhMode, bool backup) =>
        Task.Run(() => _w.RunInstallation(gamePath, vhMode, backup));

    public void LaunchGame(string gamePath, bool dx11) =>
        _w.LaunchGame(gamePath, dx11);

    public void ForceQuitGame()
    {
        var names = new[] { "WutheringWaves", "Client-Win64-Shipping", "Wuthering Waves" };
        foreach (var name in names)
            foreach (var p in Process.GetProcessesByName(name))
                try { p.Kill(true); } catch { }
    }

    public string Uninstall(string gamePath)
    {
        try
        {
            var baseDir = Path.Combine(gamePath, @"Client\Binaries\Win64");
            var modDir  = Path.Combine(baseDir, "wuwaVietHoa");
            var versionDll = Path.Combine(baseDir, "version.dll");

            if (Directory.Exists(modDir))
                Directory.Delete(modDir, true);
            if (File.Exists(versionDll))
                File.Delete(versionDll);

            // Clear cached version hashes
            var versionCache = Path.Combine(MainWindow.AppDataFolder, "versions.json");
            if (File.Exists(versionCache))
                File.Delete(versionCache);

            return "ok";
        }
        catch (UnauthorizedAccessException)
        {
            return "Không có quyền xoá file. Vui lòng chạy bằng Admin.";
        }
        catch (Exception ex)
        {
            return ex.Message;
        }
    }

    public void RestartAsAdmin()
    {
        _w.Dispatcher.Invoke(() =>
        {
            try
            {
                var exe = Process.GetCurrentProcess().MainModule?.FileName;
                if (!string.IsNullOrEmpty(exe))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exe,
                        UseShellExecute = true,
                        Verb = "runas"
                    });
                    Application.Current.Shutdown();
                }
            }
            catch { /* User cancelled UAC prompt */ }
        });
    }
}






