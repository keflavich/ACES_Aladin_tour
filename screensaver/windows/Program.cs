// AladinTourSaver — a Windows screensaver that renders an Aladin Lite tour in
// kiosk mode using WebView2 (the Edge rendering engine, present on Windows 10+).
//
// Screensaver command line contract:
//   /s            show fullscreen on every monitor
//   /p <hwnd>     render a small preview inside the Settings dialog
//   /c[:<hwnd>]   show the configuration dialog
//   (no args)     treated as /c
//
// Build:  dotnet publish -c Release
// Then rename the produced AladinTourSaver.exe to AladinTourSaver.scr.

using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace AladinTourSaver;

internal static class Program
{
    private const string RegistryKey = @"Software\AladinTourSaver";

    internal const string DefaultUrl =
        "https://data.rc.ufl.edu/pub/adamginsburg/ACES_Aladin_tour/" +
        "research_group_tour.html?kiosk=true&random=true&speed=2";

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var mode = args.Length > 0 ? args[0].ToLowerInvariant() : "/c";

        if (mode.StartsWith("/s"))
        {
            ShowFullScreen();
        }
        else if (mode.StartsWith("/p"))
        {
            // Preview: the parent window handle is the second argument.
            if (args.Length > 1 && long.TryParse(args[1], out var handle))
            {
                Application.Run(new PreviewForm(new IntPtr(handle), LoadUrl()));
            }
        }
        else
        {
            Application.Run(new ConfigForm());
        }
    }

    internal static string LoadUrl()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryKey);
        return key?.GetValue("Url") as string ?? DefaultUrl;
    }

    internal static void SaveUrl(string url)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RegistryKey);
        key.SetValue("Url", url);
    }

    // A shared user-data folder keeps the HiPS tile cache between runs, so the
    // tour redraws quickly and puts less load on the server.
    internal static string UserDataFolder =>
        Path.Combine(Path.GetTempPath(), "AladinTourSaver.WebView2");

    private static void ShowFullScreen()
    {
        var url = LoadUrl();
        var forms = new List<Form>();

        foreach (var screen in Screen.AllScreens)
        {
            // Only the primary screen gets the description panel; the others run
            // image-only so a multi-monitor wall is not repeating the same text.
            var screenUrl = screen.Primary ? url : AppendParam(url, "description", "false");
            forms.Add(new SaverForm(screen.Bounds, screenUrl));
        }

        foreach (var form in forms)
        {
            form.FormClosed += (_, _) =>
            {
                foreach (var other in forms.Where(f => !f.IsDisposed && f.Visible))
                {
                    other.Close();
                }
            };
            form.Show();
        }

        Application.Run();
    }

    private static string AppendParam(string url, string name, string value)
    {
        var separator = url.Contains('?') ? "&" : "?";
        return $"{url}{separator}{name}={value}";
    }
}

/// <summary>Borderless, topmost window that exits on any real user input.</summary>
internal sealed class SaverForm : Form
{
    private readonly WebView2 _web = new();
    private readonly string _url;
    private Point _lastMouse = Point.Empty;
    private bool _mouseInitialized;
    private readonly Stopwatch _since = Stopwatch.StartNew();

    public SaverForm(Rectangle bounds, string url)
    {
        _url = url;

        FormBorderStyle = FormBorderStyle.None;
        Bounds = bounds;
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.Black;
        Cursor.Hide();
        DoubleBuffered = true;

        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.Black;
        Controls.Add(_web);

        KeyPreview = true;
        KeyDown += (_, _) => Quit();
        MouseDown += (_, _) => Quit();
        MouseMove += OnMouseMove;

        Load += async (_, _) => await InitializeWebViewAsync();
    }

    private async Task InitializeWebViewAsync()
    {
        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: Program.UserDataFolder);
        await _web.EnsureCoreWebView2Async(env);

        var settings = _web.CoreWebView2.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;

        // Input inside the WebView does not raise WinForms events, so forward it.
        _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
            "document.addEventListener('keydown',()=>window.chrome.webview.postMessage('quit'));" +
            "document.addEventListener('mousedown',()=>window.chrome.webview.postMessage('quit'));" +
            "let lx=null,ly=null;" +
            "document.addEventListener('mousemove',e=>{" +
            "  if(lx!==null&&(Math.abs(e.screenX-lx)>8||Math.abs(e.screenY-ly)>8))" +
            "    window.chrome.webview.postMessage('quit');" +
            "  lx=e.screenX; ly=e.screenY;});");
        _web.CoreWebView2.WebMessageReceived += (_, _) => Quit();

        _web.CoreWebView2.Navigate(_url);
    }

    private void OnMouseMove(object? sender, MouseEventArgs e)
    {
        // Ignore the synthetic move that arrives as the window appears.
        if (!_mouseInitialized)
        {
            _lastMouse = e.Location;
            _mouseInitialized = true;
            return;
        }

        if (Math.Abs(e.X - _lastMouse.X) > 8 || Math.Abs(e.Y - _lastMouse.Y) > 8)
        {
            Quit();
        }
    }

    private void Quit()
    {
        // Swallow input for the first second: Windows often delivers a stray
        // event right after the saver starts, which would close it instantly.
        if (_since.ElapsedMilliseconds < 1000) return;
        Cursor.Show();
        Application.Exit();
    }
}

/// <summary>Small preview rendered inside the Windows screensaver settings dialog.</summary>
internal sealed class PreviewForm : Form
{
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] private static extern int GetClientRect(IntPtr hwnd, out Rect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    private readonly WebView2 _web = new();

    public PreviewForm(IntPtr parent, string url)
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        BackColor = Color.Black;

        SetParent(Handle, parent);
        GetClientRect(parent, out var rect);
        Bounds = new Rectangle(0, 0, rect.Right - rect.Left, rect.Bottom - rect.Top);

        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.Black;
        Controls.Add(_web);

        Load += async (_, _) =>
        {
            var env = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Program.UserDataFolder);
            await _web.EnsureCoreWebView2Async(env);
            // Preview panes are tiny; skip the text panel entirely.
            var previewUrl = url + (url.Contains('?') ? "&" : "?") + "description=false";
            _web.CoreWebView2.Navigate(previewUrl);
        };
    }
}

/// <summary>Configuration dialog: which tour URL to display.</summary>
internal sealed class ConfigForm : Form
{
    private readonly TextBox _urlBox = new();

    public ConfigForm()
    {
        Text = "Aladin Tour Screensaver";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(620, 190);

        var label = new Label
        {
            Text = "Tour URL (kiosk=true hides the controls, random=true varies the opening stop):",
            Location = new Point(12, 15),
            AutoSize = true,
        };

        _urlBox.Location = new Point(12, 42);
        _urlBox.Size = new Size(596, 23);
        _urlBox.Text = Program.LoadUrl();

        var resetButton = new Button
        {
            Text = "Reset to default tour",
            Location = new Point(12, 78),
            Size = new Size(160, 28),
        };
        resetButton.Click += (_, _) => _urlBox.Text = Program.DefaultUrl;

        var note = new Label
        {
            Text = "Needs network access to the tour host. For offline machines use the\n" +
                   "pre-rendered video route described in the repository README.",
            Location = new Point(12, 112),
            AutoSize = true,
            ForeColor = SystemColors.GrayText,
        };

        var ok = new Button { Text = "OK", Location = new Point(452, 150), Size = new Size(75, 28) };
        var cancel = new Button { Text = "Cancel", Location = new Point(533, 150), Size = new Size(75, 28) };
        ok.Click += (_, _) => { Program.SaveUrl(_urlBox.Text.Trim()); Close(); };
        cancel.Click += (_, _) => Close();

        AcceptButton = ok;
        CancelButton = cancel;
        Controls.AddRange(new Control[] { label, _urlBox, resetButton, note, ok, cancel });
    }
}
