#requires -Version 5.1
<#
.SYNOPSIS
    Command-level timeout guard: kills the child process tree on timeout.

.DESCRIPTION
    Starts a separate powershell process for -Command and waits with WaitForExit.
    If it is still running after -TimeoutSec, the whole tree is terminated via
    taskkill /T /F (Stop-Process as fallback), then one JSON line is emitted:
        timeout : {"killed":true,"elapsed_s":N}
        normal  : {"killed":false,"elapsed_s":N,"exit_code":N}
    The JSON line is also written to -OutFile as UTF-8 without BOM.

    Exit code: normal = child exit code; timeout = 124 (same convention as Unix timeout).

    Notes: this machine has no pwsh 7, only Windows PowerShell 5.1, so the script
    uses 5.1-compatible syntax. WMI/CIM is denied inside the sandbox, therefore
    taskkill /T is the primary tree-kill mechanism.

.PARAMETER Command
    Command text executed verbatim by the child shell (as if pasted into a shell).

.PARAMETER TimeoutSec
    Wall-clock timeout in seconds; fractions allowed.

.PARAMETER OutFile
    Optional path for the result JSON. Relative paths resolve against the current
    working directory.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\run-with-timeout.ps1 -Command 'node -e "setTimeout(function(){},30000)"' -TimeoutSec 5 -OutFile _evidence\run.json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [ValidateRange(0.001, 86400)]
    [double]$TimeoutSec,

    [string]$OutFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$utf8NoBom = New-Object 'System.Text.UTF8Encoding' -ArgumentList $false
$utf8Bom = New-Object 'System.Text.UTF8Encoding' -ArgumentList $true

# In this sandbox both taskkill /T and WMI/CIM are denied. Toolhelp32 gives the
# parent/child map without WMI; Stop-Process then terminates each PID (verified
# to work on child processes here).
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DshProcessTree
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct PROCESSENTRY32
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    private const uint TH32CS_SNAPPROCESS = 0x00000002;

    public static int[] GetDescendants(int rootPid)
    {
        var result = new List<int>();
        IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return result.ToArray();

        var children = new Dictionary<int, List<int>>();
        var entry = new PROCESSENTRY32();
        entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));

        if (Process32First(snap, ref entry))
        {
            do
            {
                int pid = (int)entry.th32ProcessID;
                int ppid = (int)entry.th32ParentProcessID;
                if (!children.ContainsKey(ppid)) children[ppid] = new List<int>();
                children[ppid].Add(pid);
            }
            while (Process32Next(snap, ref entry));
        }
        CloseHandle(snap);

        var stack = new Stack<int>();
        stack.Push(rootPid);
        while (stack.Count > 0)
        {
            int current = stack.Pop();
            List<int> kids;
            if (children.TryGetValue(current, out kids))
            {
                foreach (int kid in kids)
                {
                    result.Add(kid);
                    stack.Push(kid);
                }
            }
        }
        return result.ToArray();
    }
}
'@

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Stop-ProcessTree {
    param([int]$ProcessId)

    # Snapshot first: after the parent dies its children are orphaned and can no
    # longer be discovered by walking down from the parent.
    $descendants = @([DshProcessTree]::GetDescendants($ProcessId))
    foreach ($childPid in $descendants) {
        Stop-Process -Id $childPid -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$tempRoot = Join-Path $PSScriptRoot '.run-tmp'
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$id = [guid]::NewGuid().ToString('N')
$scriptPath = Join-Path $tempRoot "cmd-$id.ps1"
$stdoutPath = Join-Path $tempRoot "out-$id.log"
$stderrPath = Join-Path $tempRoot "err-$id.log"

$shellPath = (Get-Process -Id $PID).Path
if (-not $shellPath) {
    $shellPath = Join-Path $PSHOME 'powershell.exe'
}

# The command is written to a temporary .ps1 and executed by the child shell,
# so nested quotes are not re-interpreted on a command line.
# The temporary script is written as UTF-8 *with* BOM: Windows PowerShell 5.1
# reads a BOM-less UTF-8 file as ANSI and would mangle non-ASCII paths.
$payload = $Command + "`r`n" + 'exit $LASTEXITCODE' + "`r`n"
[System.IO.File]::WriteAllText($scriptPath, $payload, $utf8Bom)

$killed = $false
$exitCode = 0

$proc = Start-Process -FilePath $shellPath `
    -WorkingDirectory (Get-Location).Path `
    -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru -WindowStyle Hidden

$waitMs = [int][math]::Ceiling($TimeoutSec * 1000)
if (-not $proc.WaitForExit($waitMs)) {
    $killed = $true
    Stop-ProcessTree -ProcessId $proc.Id
    $proc.WaitForExit(5000) | Out-Null
}
else {
    $exitCode = [int]$proc.ExitCode
}

$stopwatch.Stop()

if (Test-Path -LiteralPath $stdoutPath) {
    $text = [System.IO.File]::ReadAllText($stdoutPath, $utf8NoBom)
    if ($text.Length -gt 0) {
        [Console]::Out.Write($text)
        if (-not $text.EndsWith("`n")) { [Console]::Out.Write("`n") }
    }
}
if (Test-Path -LiteralPath $stderrPath) {
    $text = [System.IO.File]::ReadAllText($stderrPath, $utf8NoBom)
    if ($text.Length -gt 0) {
        [Console]::Error.Write($text)
        if (-not $text.EndsWith("`n")) { [Console]::Error.Write("`n") }
    }
}

$invariant = [System.Globalization.CultureInfo]::InvariantCulture
$elapsed = [math]::Round($stopwatch.Elapsed.TotalSeconds, 3)
$json = if ($killed) {
    '{"killed":true,"elapsed_s":' + $elapsed.ToString($invariant) + '}'
}
else {
    '{"killed":false,"elapsed_s":' + $elapsed.ToString($invariant) + ',"exit_code":' + $exitCode + '}'
}

if ($OutFile) {
    $fullPath = if ([System.IO.Path]::IsPathRooted($OutFile)) {
        $OutFile
    }
    else {
        Join-Path (Get-Location).Path $OutFile
    }
    $parent = Split-Path -Parent $fullPath
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [System.IO.File]::WriteAllText($fullPath, $json + "`n", $utf8NoBom)
}

[Console]::Out.WriteLine($json)

Remove-Item -LiteralPath $scriptPath, $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

if ($killed) { exit 124 }
exit $exitCode
