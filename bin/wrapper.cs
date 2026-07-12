using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class AgntspceWrapper {
    static void Main(string[] a) {
        string exePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
        string exeName = Path.GetFileNameWithoutExtension(exePath).ToLowerInvariant();
        string dir = Path.GetDirectoryName(exePath);
        string mjs = Path.Combine(dir, "agntspce.mjs");
        string node = Environment.GetEnvironmentVariable("AGNTSPCE_NODE_PATH");
        if (string.IsNullOrEmpty(node)) node = "node";

        var cmdLine = new StringBuilder();
        cmdLine.Append('"');
        cmdLine.Append(mjs);
        cmdLine.Append('"');

        if (exeName == "agntspce") {
            for (int i = 0; i < a.Length; i++) {
                cmdLine.Append(' ');
                string arg = a[i];
                if (arg.Contains(" ")) {
                    cmdLine.Append('"');
                    cmdLine.Append(arg.Replace("\"", "\\\""));
                    cmdLine.Append('"');
                } else {
                    cmdLine.Append(arg);
                }
            }
        } else {
            cmdLine.Append(" run ");
            cmdLine.Append(exeName);
            for (int i = 0; i < a.Length; i++) {
                cmdLine.Append(' ');
                string arg = a[i];
                if (arg.Contains(" ")) {
                    cmdLine.Append('"');
                    cmdLine.Append(arg.Replace("\"", "\\\""));
                    cmdLine.Append('"');
                } else {
                    cmdLine.Append(arg);
                }
            }
        }

        try {
            var psi = new ProcessStartInfo(node, cmdLine.ToString());
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            using (var p = Process.Start(psi)) {
                string stdout = p.StandardOutput.ReadToEnd();
                string stderr = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (stdout.Length > 0) Console.Out.Write(stdout);
                if (stderr.Length > 0) Console.Error.Write(stderr);
                Environment.Exit(p.ExitCode);
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("agntspce wrapper error: " + ex.Message);
            Environment.Exit(1);
        }
    }
}
